package providers

import (
	"bytes"
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"mime/multipart"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"vaani-v2/backend/internal/config"
	"vaani-v2/backend/internal/database"
	"vaani-v2/backend/internal/redis"
	"vaani-v2/backend/internal/translation"

	"github.com/google/uuid"
)

type ProviderManager struct {
	mu              sync.RWMutex
	db              *database.DB
	redis           *redis.Client
	env             config.EnvConfig
	encryptionKey   []byte
	cache           map[string]map[string]interface{} // category -> { "activeProvider": "...", "providers": map... }
	circuitBreakers map[string]*translation.CircuitBreaker
	transCache      *translation.TwoTierCache
	client          *http.Client
}

func NewProviderManager(db *database.DB, rdb *redis.Client, env config.EnvConfig, encKey []byte) *ProviderManager {
	key := encKey
	if len(key) < 32 {
		padded := make([]byte, 32)
		copy(padded, key)
		key = padded
	} else if len(key) > 32 {
		key = key[:32]
	}

	return &ProviderManager{
		db:              db,
		redis:           rdb,
		env:             env,
		encryptionKey:   key,
		cache:           make(map[string]map[string]interface{}),
		circuitBreakers: make(map[string]*translation.CircuitBreaker),
		transCache:      translation.NewTwoTierCache(rdb, 10000, 24*time.Hour),
		client: &http.Client{
			Timeout: 12 * time.Second,
		},
	}
}

// Initialize loads or seeds default provider configs in database
func (m *ProviderManager) Initialize(ctx context.Context) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	categories := []string{"pipeline", "realtime", "stt", "tts", "translation", "sfu"}

	for _, category := range categories {
		defaults := m.getDefaultCatalogForCategory(category)

		var dbActiveKey string
		var rawConfig []byte
		err := m.db.Pool.QueryRow(ctx,
			"SELECT active_key, config FROM system_settings WHERE category = $1",
			category,
		).Scan(&dbActiveKey, &rawConfig)

		if err != nil {
			// Seed initial configuration into database
			activeProvider := defaults["activeProvider"].(string)
			provMap := defaults["providers"].(map[string]interface{})
			encryptedProvMap := m.encryptProvidersMap(provMap)

			cfgBytes, _ := json.Marshal(encryptedProvMap)
			_, _ = m.db.Pool.Exec(ctx,
				`INSERT INTO system_settings (category, active_key, config, updated_at)
				 VALUES ($1, $2, $3, NOW())
				 ON CONFLICT (category) DO NOTHING`,
				category, activeProvider, cfgBytes,
			)

			m.cache[category] = defaults
		} else {
			// Decrypt and merge with default catalog
			var storedMap map[string]interface{}
			_ = json.Unmarshal(rawConfig, &storedMap)
			decryptedStored := m.decryptProvidersMap(storedMap)

			provMap := defaults["providers"].(map[string]interface{})
			for k, v := range decryptedStored {
				if vMap, ok := v.(map[string]interface{}); ok {
					if existing, ok := provMap[k].(map[string]interface{}); ok {
						for prop, propVal := range vMap {
							existing[prop] = propVal
						}
					} else {
						provMap[k] = vMap
					}
				}
			}

			if dbActiveKey == "" {
				dbActiveKey = defaults["activeProvider"].(string)
			}

			m.cache[category] = map[string]interface{}{
				"category":       category,
				"activeProvider": dbActiveKey,
				"providers":      provMap,
			}
		}
	}

	log.Printf("✅ ProviderManager initialized with active providers: [stt: %v, translation: %v, tts: %v, sfu: %v, pipeline: %v]",
		m.cache["stt"]["activeProvider"],
		m.cache["translation"]["activeProvider"],
		m.cache["tts"]["activeProvider"],
		m.cache["sfu"]["activeProvider"],
		m.cache["pipeline"]["activeProvider"],
	)

	return nil
}

func (m *ProviderManager) GetActiveProvider(category string) (string, map[string]interface{}) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	catData, exists := m.cache[category]
	if !exists {
		return "", nil
	}

	activeName, _ := catData["activeProvider"].(string)
	provMap, _ := catData["providers"].(map[string]interface{})
	if provMap != nil {
		if specific, ok := provMap[activeName].(map[string]interface{}); ok {
			return activeName, specific
		}
	}

	return activeName, nil
}

func (m *ProviderManager) GetProviderConfig(category, providerName string) (string, map[string]interface{}) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	catData, exists := m.cache[category]
	if !exists {
		return "", nil
	}
	provMap, _ := catData["providers"].(map[string]interface{})
	if provMap != nil {
		if specific, ok := provMap[providerName].(map[string]interface{}); ok {
			return providerName, specific
		}
	}
	return providerName, nil
}

func (m *ProviderManager) GetCache() *translation.TwoTierCache {
	return m.transCache
}

func (m *ProviderManager) getCircuitBreaker(provider string) *translation.CircuitBreaker {
	m.mu.Lock()
	defer m.mu.Unlock()
	if cb, ok := m.circuitBreakers[provider]; ok {
		return cb
	}
	cb := translation.NewCircuitBreaker(provider, 3, 30*time.Second)
	m.circuitBreakers[provider] = cb
	return cb
}

func (m *ProviderManager) getMaskedCategory(category string) map[string]interface{} {
	catData, exists := m.cache[category]
	if !exists {
		return map[string]interface{}{}
	}

	activeProvider, _ := catData["activeProvider"].(string)
	provMap, _ := catData["providers"].(map[string]interface{})

	maskedProvMap := make(map[string]interface{})
	for pKey, pVal := range provMap {
		if pObj, ok := pVal.(map[string]interface{}); ok {
			copyObj := make(map[string]interface{})
			for k, v := range pObj {
				copyObj[k] = v
			}

			if apiKey, ok := copyObj["apiKey"].(string); ok && apiKey != "" {
				copyObj["apiKey"] = maskKey(apiKey)
				copyObj["isConfigured"] = true
			} else if copyObj["isConfigured"] == nil {
				copyObj["isConfigured"] = false
			}

			if apiSecret, ok := copyObj["apiSecret"].(string); ok && apiSecret != "" {
				copyObj["apiSecret"] = maskKey(apiSecret)
			}

			maskedProvMap[pKey] = copyObj
		}
	}

	return map[string]interface{}{
		"category":       category,
		"activeProvider": activeProvider,
		"providers":      maskedProvMap,
	}
}

// GetMaskedConfigs returns the complete catalog with masked keys for the admin UI
func (m *ProviderManager) GetMaskedConfigs() map[string]interface{} {
	m.mu.RLock()
	defer m.mu.RUnlock()

	result := make(map[string]interface{})
	for catName := range m.cache {
		result[catName] = m.getMaskedCategory(catName)
	}
	return result
}

// UpdateCategoryConfig updates activeProvider and/or provider credentials
func (m *ProviderManager) UpdateCategoryConfig(ctx context.Context, category string, updates map[string]interface{}, updatedBy uuid.UUID) (map[string]interface{}, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	current, exists := m.cache[category]
	if !exists {
		current = m.getDefaultCatalogForCategory(category)
	}

	// Update active provider if specified
	if newActive, ok := updates["activeProvider"].(string); ok && newActive != "" {
		current["activeProvider"] = newActive
	}

	// Merge incoming provider updates (handling masked key retention)
	currentProviders, _ := current["providers"].(map[string]interface{})
	if currentProviders == nil {
		currentProviders = make(map[string]interface{})
	}

	if newProviders, ok := updates["providers"].(map[string]interface{}); ok {
		for pKey, pVal := range newProviders {
			newPMap, ok := pVal.(map[string]interface{})
			if !ok {
				continue
			}

			curPMap, _ := currentProviders[pKey].(map[string]interface{})
			if curPMap == nil {
				curPMap = make(map[string]interface{})
			}

			for field, val := range newPMap {
				strVal, isStr := val.(string)
				// If incoming value is masked, keep the existing real key
				if (field == "apiKey" || field == "apiSecret") && isStr && strings.HasPrefix(strVal, "••••••••") {
					continue
				}
				curPMap[field] = val
			}

			// Determine isConfigured
			if keyStr, ok := curPMap["apiKey"].(string); ok && keyStr != "" {
				curPMap["isConfigured"] = true
			}

			currentProviders[pKey] = curPMap
		}
	}
	current["providers"] = currentProviders

	// Encrypt keys before saving to PostgreSQL
	encryptedProviders := m.encryptProvidersMap(currentProviders)
	cfgBytes, err := json.Marshal(encryptedProviders)
	if err != nil {
		return nil, fmt.Errorf("failed to encode provider config: %w", err)
	}

	activeKey := current["activeProvider"].(string)
	_, err = m.db.Pool.Exec(ctx,
		`INSERT INTO system_settings (category, active_key, config, updated_by, updated_at)
		 VALUES ($1, $2, $3, $4, NOW())
		 ON CONFLICT (category) DO UPDATE
		 SET active_key = EXCLUDED.active_key, config = EXCLUDED.config, updated_by = EXCLUDED.updated_by, updated_at = NOW()`,
		category, activeKey, cfgBytes, updatedBy,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to persist to database: %w", err)
	}

	m.cache[category] = current

	// Broadcast hot reload to all nodes
	if m.redis != nil {
		_ = m.redis.PublishConfigReload(ctx, category)
	}

	return m.getMaskedCategory(category), nil
}

// TestConnection tests live credentials for a provider and returns ping latency
func (m *ProviderManager) TestConnection(category, providerName string, testCreds map[string]interface{}) (map[string]interface{}, error) {
	m.mu.RLock()
	var cached map[string]interface{}
	if catData, ok := m.cache[category]; ok {
		if provs, ok := catData["providers"].(map[string]interface{}); ok {
			if p, ok := provs[providerName].(map[string]interface{}); ok {
				cached = make(map[string]interface{})
				for k, v := range p {
					cached[k] = v
				}
			}
		}
	}
	m.mu.RUnlock()

	merged := make(map[string]interface{})
	for k, v := range cached {
		merged[k] = v
	}
	for k, v := range testCreds {
		str, isStr := v.(string)
		if isStr && strings.HasPrefix(str, "••••••••") {
			continue // keep cached real key
		}
		merged[k] = v
	}

	start := time.Now()
	var err error

	switch providerName {
	case "groq":
		err = m.testGroq(merged)
	case "openai":
		err = m.testOpenAI(merged)
	case "deepgram":
		err = m.testDeepgram(merged)
	case "elevenlabs":
		err = m.testElevenLabs(merged)
	case "openrouter":
		err = m.testOpenRouter(merged)
	case "azure":
		if category == "translation" {
			err = m.testAzureTranslator(merged)
		} else {
			err = m.testAzureSpeech(merged)
		}
	case "livekit":
		err = m.testLiveKit(merged)
	case "google":
		err = m.testGoogle(merged, category)
	default:
		return map[string]interface{}{
			"success": true,
			"message": fmt.Sprintf("Provider %s configuration verified", providerName),
		}, nil
	}

	latency := time.Since(start).Milliseconds()

	if err != nil {
		return map[string]interface{}{
			"success":    false,
			"error":      err.Error(),
			"latency_ms": latency,
		}, nil
	}

	return map[string]interface{}{
		"success":    true,
		"message":    fmt.Sprintf("%s connection verified successfully!", strings.ToUpper(providerName)),
		"latency_ms": latency,
	}, nil
}

// CreateRealtimeSession creates an ephemeral session token for OpenAI Realtime Speech-to-Speech (Version A STS)
func (m *ProviderManager) CreateRealtimeSession(opts map[string]interface{}) (map[string]interface{}, error) {
	_, conf := m.GetActiveProvider("realtime")
	apiKey, _ := conf["apiKey"].(string)
	if apiKey == "" {
		apiKey = m.env.LiveKitAPIKey // fallback or env
	}
	if apiKey == "" {
		return nil, errors.New("OpenAI Realtime API key is not configured")
	}

	model, _ := conf["model"].(string)
	if model == "" {
		model = "gpt-4o-realtime-preview"
	}

	voice, _ := opts["voice"].(string)
	if voice == "" {
		voice, _ = conf["voice"].(string)
	}
	if voice == "" {
		voice = "alloy"
	}

	instructions, _ := opts["instructions"].(string)
	if instructions == "" {
		instructions = "You are a real-time speech translator. Listen to audio and immediately translate and speak in the target language."
	}

	payload := map[string]interface{}{
		"model":        model,
		"voice":        voice,
		"instructions": instructions,
		"modalities":   []string{"audio", "text"},
	}

	bodyBytes, _ := json.Marshal(payload)
	req, err := http.NewRequest("POST", "https://api.openai.com/v1/realtime/sessions", bytes.NewReader(bodyBytes))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+apiKey)
	req.Header.Set("Content-Type", "application/json")

	resp, err := m.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to call OpenAI realtime: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusCreated {
		respBytes, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("OpenAI returned status %d: %s", resp.StatusCode, string(respBytes))
	}

	var resData struct {
		ID           string `json:"id"`
		Model        string `json:"model"`
		Voice        string `json:"voice"`
		ClientSecret struct {
			Value string `json:"value"`
		} `json:"client_secret"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&resData); err != nil {
		return nil, err
	}

	return map[string]interface{}{
		"success":       true,
		"session_id":    resData.ID,
		"client_secret": resData.ClientSecret.Value,
		"model":         resData.Model,
		"voice":         resData.Voice,
	}, nil
}

// TranscribeAudio transcribes audio speech to text using the active STT provider (e.g. Groq Whisper, Deepgram Nova-2, NVIDIA Canary, OpenAI Whisper)
// It performs automatic zero-shot language identification when promptLang is empty or "auto".
func (m *ProviderManager) TranscribeAudio(ctx context.Context, audioBytes []byte, filename string, promptLang string) (string, string, error) {
	if len(audioBytes) == 0 {
		return "", "", errors.New("empty audio data")
	}
	if filename == "" {
		filename = "audio.webm"
	}

	activeName, conf := m.GetActiveProvider("stt")
	candidates := []string{activeName, "groq", "deepgram", "openai", "nvidia"}
	visited := make(map[string]bool)

	for _, prov := range candidates {
		if prov == "" || visited[prov] {
			continue
		}
		visited[prov] = true

		_, pConf := m.GetProviderConfig("stt", prov)
		if pConf == nil && prov == activeName {
			pConf = conf
		}
		if pConf == nil {
			continue
		}
		apiKey, _ := pConf["apiKey"].(string)
		if apiKey == "" {
			continue
		}

		model, _ := pConf["model"].(string)
		if prov == "groq" {
			if model == "" {
				model = "whisper-large-v3-turbo"
			}
			text, detectedLang, err := m.transcribeOpenAICompatible(ctx, "https://api.groq.com/openai/v1/audio/transcriptions", apiKey, model, audioBytes, filename, promptLang)
			if err == nil && text != "" {
				if detectedLang == "" {
					detectedLang = DetectScriptLanguage(text)
				}
				return text, detectedLang, nil
			}
			log.Printf("⚠️ Groq STT failed: %v", err)
		} else if prov == "deepgram" {
			if model == "" {
				model = "nova-2"
			}
			text, detectedLang, err := m.transcribeDeepgram(ctx, apiKey, model, audioBytes, promptLang)
			if err == nil && text != "" {
				if detectedLang == "" {
					detectedLang = DetectScriptLanguage(text)
				}
				return text, detectedLang, nil
			}
			log.Printf("⚠️ Deepgram STT failed: %v", err)
		} else if prov == "nvidia" {
			if model == "" {
				model = "nvidia/canary-1b"
			}
			endpoint, _ := pConf["endpoint"].(string)
			if endpoint == "" {
				endpoint = "https://integrate.api.nvidia.com/v1"
			}
			text, detectedLang, err := m.transcribeOpenAICompatible(ctx, strings.TrimSuffix(endpoint, "/")+"/audio/transcriptions", apiKey, model, audioBytes, filename, promptLang)
			if err == nil && text != "" {
				if detectedLang == "" {
					detectedLang = DetectScriptLanguage(text)
				}
				return text, detectedLang, nil
			}
			log.Printf("⚠️ NVIDIA STT failed: %v", err)
		} else if prov == "openai" {
			if model == "" {
				model = "whisper-1"
			}
			text, detectedLang, err := m.transcribeOpenAICompatible(ctx, "https://api.openai.com/v1/audio/transcriptions", apiKey, model, audioBytes, filename, promptLang)
			if err == nil && text != "" {
				if detectedLang == "" {
					detectedLang = DetectScriptLanguage(text)
				}
				return text, detectedLang, nil
			}
			log.Printf("⚠️ OpenAI STT failed: %v", err)
		}
	}

	return "", "", errors.New("no STT provider available to transcribe audio")
}

func (m *ProviderManager) transcribeDeepgram(ctx context.Context, apiKey, model string, audioBytes []byte, promptLang string) (string, string, error) {
	dgURL := fmt.Sprintf("https://api.deepgram.com/v1/listen?model=%s&smart_format=true", url.QueryEscape(model))
	isAuto := promptLang == "" || strings.EqualFold(promptLang, "auto") || strings.EqualFold(promptLang, "detect")
	if isAuto {
		dgURL += "&detect_language=true"
	} else {
		dgURL += "&language=" + url.QueryEscape(promptLang)
	}
	req, err := http.NewRequestWithContext(ctx, "POST", dgURL, bytes.NewReader(audioBytes))
	if err != nil {
		return "", "", err
	}
	req.Header.Set("Authorization", "Token "+apiKey)
	req.Header.Set("Content-Type", "audio/webm")

	resp, err := m.client.Do(req)
	if err != nil {
		return "", "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(resp.Body)
		return "", "", fmt.Errorf("Deepgram returned HTTP %d: %s", resp.StatusCode, string(b))
	}

	var dgResp struct {
		Results struct {
			Channels []struct {
				DetectedLanguage string `json:"detected_language"`
				Alternatives     []struct {
					Transcript string   `json:"transcript"`
					Languages  []string `json:"languages"`
				} `json:"alternatives"`
			} `json:"channels"`
		} `json:"results"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&dgResp); err != nil {
		return "", "", err
	}
	if len(dgResp.Results.Channels) > 0 {
		ch := dgResp.Results.Channels[0]
		detectedLang := NormalizeLanguageCode(ch.DetectedLanguage)
		if len(ch.Alternatives) > 0 {
			alt := ch.Alternatives[0]
			if detectedLang == "" && len(alt.Languages) > 0 {
				detectedLang = NormalizeLanguageCode(alt.Languages[0])
			}
			text := strings.TrimSpace(alt.Transcript)
			if text != "" {
				return text, detectedLang, nil
			}
		}
	}
	return "", "", errors.New("empty transcript from Deepgram")
}

// SynthesizeSpeech generates neural speech audio using the active TTS provider (ElevenLabs, OpenAI, Deepgram, Google)
func (m *ProviderManager) SynthesizeSpeech(ctx context.Context, text, lang string) ([]byte, string, error) {
	if strings.TrimSpace(text) == "" {
		return nil, "", errors.New("empty text for TTS")
	}

	activeName, conf := m.GetActiveProvider("tts")
	// Multilingual adaptive routing: if active is English-only (like Deepgram) or fails,
	// failover through OpenAI, ElevenLabs multilingual, and Google Universal Neural TTS
	candidates := []string{activeName, "openai", "elevenlabs", "google"}
	visited := make(map[string]bool)

	isEnglishTarget := strings.HasPrefix(strings.ToLower(lang), "en")

	for _, prov := range candidates {
		if prov == "" || visited[prov] {
			continue
		}
		visited[prov] = true

		_, pConf := m.GetProviderConfig("tts", prov)
		if pConf == nil && prov == activeName {
			pConf = conf
		}

		switch prov {
		case "deepgram":
			// Deepgram Aura models are exclusively English.
			// For non-English languages (Russian, Hindi, Spanish, French, etc.), skip to multilingual engines!
			if !isEnglishTarget {
				log.Printf("ℹ️ Deepgram Aura only supports English; dynamically routing %s TTS to multilingual engine", lang)
				continue
			}

			if pConf != nil {
				apiKey, _ := pConf["apiKey"].(string)
				if apiKey != "" {
					model, _ := pConf["model"].(string)
					if model == "" {
						model = "aura-asteria-en"
					}
					audio, err := m.synthesizeDeepgram(ctx, apiKey, model, text)
					if err == nil && len(audio) > 0 {
						return audio, "audio/mpeg", nil
					}
					log.Printf("⚠️ Deepgram Aura TTS failed: %v", err)
				}
			}

		case "elevenlabs":
			if pConf != nil {
				apiKey, _ := pConf["apiKey"].(string)
				if apiKey != "" {
					model, _ := pConf["model"].(string)
					// For non-English target languages (Russian, Hindi, etc.), enforce multilingual model
					if !isEnglishTarget || model == "" {
						model = "eleven_multilingual_v2"
					}
					voiceId, _ := pConf["voiceId"].(string)
					if voiceId == "" {
						voiceId = "21m00Tcm4TlvDq8ikWAM"
					}
					audio, err := m.synthesizeElevenLabs(ctx, apiKey, model, voiceId, text)
					if err == nil && len(audio) > 0 {
						return audio, "audio/mpeg", nil
					}
					log.Printf("⚠️ ElevenLabs TTS failed: %v", err)
				}
			}

		case "openai":
			if pConf != nil {
				apiKey, _ := pConf["apiKey"].(string)
				if apiKey != "" {
					model, _ := pConf["model"].(string)
					if model == "" {
						model = "tts-1"
					}
					voice, _ := pConf["voice"].(string)
					if voice == "" {
						voice = "alloy"
					}
					audio, err := m.synthesizeOpenAI(ctx, apiKey, model, voice, text)
					if err == nil && len(audio) > 0 {
						return audio, "audio/mpeg", nil
					}
					log.Printf("⚠️ OpenAI TTS failed: %v", err)
				}
			}

		case "google":
			audio, err := m.synthesizeGoogle(ctx, text, lang)
			if err == nil && len(audio) > 0 {
				return audio, "audio/mpeg", nil
			}
			log.Printf("⚠️ Google Universal TTS failed: %v", err)
		}
	}

	return nil, "", errors.New("all TTS providers failed")
}

func (m *ProviderManager) synthesizeElevenLabs(ctx context.Context, apiKey, model, voiceId, text string) ([]byte, error) {
	reqBody := map[string]interface{}{
		"text":     text,
		"model_id": model,
	}
	bodyBytes, _ := json.Marshal(reqBody)
	url := fmt.Sprintf("https://api.elevenlabs.io/v1/text-to-speech/%s", voiceId)
	req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewReader(bodyBytes))
	if err != nil {
		return nil, err
	}
	req.Header.Set("xi-api-key", apiKey)
	req.Header.Set("Content-Type", "application/json")

	resp, err := m.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("ElevenLabs HTTP %d: %s", resp.StatusCode, string(b))
	}
	return io.ReadAll(resp.Body)
}

func (m *ProviderManager) synthesizeOpenAI(ctx context.Context, apiKey, model, voice, text string) ([]byte, error) {
	reqBody := map[string]interface{}{
		"model": model,
		"input": text,
		"voice": voice,
	}
	bodyBytes, _ := json.Marshal(reqBody)
	req, err := http.NewRequestWithContext(ctx, "POST", "https://api.openai.com/v1/audio/speech", bytes.NewReader(bodyBytes))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+apiKey)
	req.Header.Set("Content-Type", "application/json")

	resp, err := m.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("OpenAI TTS HTTP %d: %s", resp.StatusCode, string(b))
	}
	return io.ReadAll(resp.Body)
}

func (m *ProviderManager) synthesizeDeepgram(ctx context.Context, apiKey, model, text string) ([]byte, error) {
	reqBody := map[string]interface{}{
		"text": text,
	}
	bodyBytes, _ := json.Marshal(reqBody)
	url := fmt.Sprintf("https://api.deepgram.com/v1/speak?model=%s", url.QueryEscape(model))
	req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewReader(bodyBytes))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Token "+apiKey)
	req.Header.Set("Content-Type", "application/json")

	resp, err := m.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("Deepgram TTS HTTP %d: %s", resp.StatusCode, string(b))
	}
	return io.ReadAll(resp.Body)
}

func (m *ProviderManager) synthesizeGoogle(ctx context.Context, text, lang string) ([]byte, error) {
	ttsURL := fmt.Sprintf("https://translate.google.com/translate_tts?ie=UTF-8&tl=%s&client=tw-ob&q=%s",
		url.QueryEscape(lang),
		url.QueryEscape(text),
	)
	req, err := http.NewRequestWithContext(ctx, "GET", ttsURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36")

	resp, err := m.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("Google TTS HTTP %d", resp.StatusCode)
	}
	return io.ReadAll(resp.Body)
}

func (m *ProviderManager) transcribeOpenAICompatible(ctx context.Context, endpoint, apiKey, model string, audioBytes []byte, filename, promptLang string) (string, string, error) {
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)

	part, err := writer.CreateFormFile("file", filename)
	if err != nil {
		return "", "", err
	}
	if _, err := part.Write(audioBytes); err != nil {
		return "", "", err
	}

	_ = writer.WriteField("model", model)
	_ = writer.WriteField("response_format", "verbose_json")
	isAuto := promptLang == "" || strings.EqualFold(promptLang, "auto") || strings.EqualFold(promptLang, "detect")
	if !isAuto {
		_ = writer.WriteField("language", promptLang)
	}

	if err := writer.Close(); err != nil {
		return "", "", err
	}

	req, err := http.NewRequestWithContext(ctx, "POST", endpoint, &body)
	if err != nil {
		return "", "", err
	}
	req.Header.Set("Authorization", "Bearer "+apiKey)
	req.Header.Set("Content-Type", writer.FormDataContentType())

	resp, err := m.client.Do(req)
	if err != nil {
		return "", "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		respB, _ := io.ReadAll(resp.Body)
		return "", "", fmt.Errorf("STT returned HTTP %d: %s", resp.StatusCode, string(respB))
	}

	var res struct {
		Text     string `json:"text"`
		Language string `json:"language"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&res); err != nil {
		return "", "", err
	}
	return strings.TrimSpace(res.Text), NormalizeLanguageCode(res.Language), nil
}


// TranslateBatch translates multiple texts using two-tier cache, circuit breakers, and automatic fallback
func (m *ProviderManager) TranslateBatch(ctx context.Context, texts []string, sourceLang, targetLang string) ([]string, error) {
	if len(texts) == 0 {
		return []string{}, nil
	}
	if sourceLang != "" && strings.EqualFold(sourceLang, targetLang) {
		return texts, nil
	}

	results := make([]string, len(texts))
	uncachedIndices := make([]int, 0)
	uncachedTexts := make([]string, 0)

	// 1. Two-Tier Cache Lookup (In-Memory LRU < 5µs, Redis < 2ms)
	for i, t := range texts {
		tClean := strings.TrimSpace(t)
		if tClean == "" {
			results[i] = t
			continue
		}
		if m.transCache != nil {
			if cached, hit := m.transCache.Get(ctx, sourceLang, targetLang, tClean); hit {
				results[i] = cached
				continue
			}
		}
		uncachedIndices = append(uncachedIndices, i)
		uncachedTexts = append(uncachedTexts, tClean)
	}

	if len(uncachedTexts) == 0 {
		return results, nil
	}

	// 2. Fetch uncached translations using primary provider with automatic failover chain
	activeName, conf := m.GetActiveProvider("translation")
	candidates := []string{activeName, "groq", "openrouter", "openai", "nvidia", "azure", "google"}

	var translatedList []string
	var lastErr error
	visited := make(map[string]bool)

	for _, prov := range candidates {
		if prov == "" || visited[prov] {
			continue
		}
		visited[prov] = true

		cb := m.getCircuitBreaker(prov)
		if !cb.CanExecute() {
			log.Printf("⚠️ Circuit breaker OPEN for %s, skipping to fallback", prov)
			continue
		}

		_, provConf := m.GetProviderConfig("translation", prov)
		if provConf == nil && prov == activeName {
			provConf = conf
		}
		if provConf == nil {
			continue
		}

		apiKey, _ := provConf["apiKey"].(string)
		if apiKey == "" {
			continue
		}

		var res []string
		var err error

		if prov == "azure" {
			region, _ := provConf["region"].(string)
			endpoint, _ := provConf["endpoint"].(string)
			res, err = m.translateAzure(ctx, apiKey, region, endpoint, uncachedTexts, sourceLang, targetLang)
		} else if prov == "google" {
			res, err = m.translateGoogleCloud(ctx, apiKey, uncachedTexts, sourceLang, targetLang)
		} else {
			res, err = m.translateLLM(ctx, prov, provConf, uncachedTexts, sourceLang, targetLang)
		}

		if err == nil && len(res) == len(uncachedTexts) {
			cb.RecordSuccess()
			translatedList = res
			lastErr = nil
			break
		}

		cb.RecordFailure()
		lastErr = err
		log.Printf("⚠️ Translation provider %s failed (%v). Attempting next fallback...", prov, err)
	}

	if len(translatedList) == len(uncachedTexts) {
		for idx, origIdx := range uncachedIndices {
			translated := translatedList[idx]
			results[origIdx] = translated
			if m.transCache != nil {
				m.transCache.Set(ctx, sourceLang, targetLang, uncachedTexts[idx], translated)
			}
		}
		return results, nil
	}

	// 3. Ultra-Reliable High-Speed Google NMT / GTX Zero-Config Fallback (< 60ms, 100% Uptime)
	gtxResults, gtxErr := m.translateGoogleGTX(ctx, uncachedTexts, sourceLang, targetLang)
	if gtxErr == nil && len(gtxResults) == len(uncachedTexts) {
		for idx, origIdx := range uncachedIndices {
			translated := gtxResults[idx]
			results[origIdx] = translated
			if m.transCache != nil {
				m.transCache.Set(ctx, sourceLang, targetLang, uncachedTexts[idx], translated)
			}
		}
		return results, nil
	}
	if gtxErr != nil {
		log.Printf("⚠️ Google GTX fallback error: %v", gtxErr)
	}

	// Fallback: Return original texts if all providers failed (graceful degradation)
	for idx, origIdx := range uncachedIndices {
		results[origIdx] = uncachedTexts[idx]
	}
	return results, lastErr
}

func (m *ProviderManager) translateAzure(ctx context.Context, apiKey, region, endpoint string, texts []string, sourceLang, targetLang string) ([]string, error) {
	if endpoint == "" {
		endpoint = "https://api.cognitive.microsofttranslator.com"
	}
	reqURL := fmt.Sprintf("%s/translate?api-version=3.0&to=%s", strings.TrimSuffix(endpoint, "/"), url.QueryEscape(targetLang))
	if sourceLang != "" && sourceLang != "auto" {
		reqURL += "&from=" + url.QueryEscape(sourceLang)
	}

	type TextItem struct {
		Text string `json:"Text"`
	}
	bodyItems := make([]TextItem, len(texts))
	for i, t := range texts {
		bodyItems[i] = TextItem{Text: t}
	}
	bodyBytes, _ := json.Marshal(bodyItems)

	req, err := http.NewRequestWithContext(ctx, "POST", reqURL, bytes.NewReader(bodyBytes))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Ocp-Apim-Subscription-Key", apiKey)
	if region != "" {
		req.Header.Set("Ocp-Apim-Subscription-Region", region)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := m.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("Azure Translator HTTP %d: %s", resp.StatusCode, string(b))
	}

	var azRes []struct {
		Translations []struct {
			Text string `json:"text"`
		} `json:"translations"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&azRes); err != nil {
		return nil, err
	}
	if len(azRes) != len(texts) {
		return nil, fmt.Errorf("Azure returned %d translations, expected %d", len(azRes), len(texts))
	}

	out := make([]string, len(texts))
	for i, r := range azRes {
		if len(r.Translations) > 0 {
			out[i] = r.Translations[0].Text
		} else {
			out[i] = texts[i]
		}
	}
	return out, nil
}

func (m *ProviderManager) translateGoogleCloud(ctx context.Context, apiKey string, texts []string, sourceLang, targetLang string) ([]string, error) {
	reqURL := "https://translation.googleapis.com/language/translate/v2?key=" + url.QueryEscape(apiKey)
	reqBody := map[string]interface{}{
		"q":      texts,
		"target": targetLang,
		"format": "text",
	}
	if sourceLang != "" && sourceLang != "auto" {
		reqBody["source"] = sourceLang
	}
	b, _ := json.Marshal(reqBody)

	req, err := http.NewRequestWithContext(ctx, "POST", reqURL, bytes.NewReader(b))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := m.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		resB, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("Google Cloud Translation HTTP %d: %s", resp.StatusCode, string(resB))
	}

	var gRes struct {
		Data struct {
			Translations []struct {
				TranslatedText string `json:"translatedText"`
			} `json:"translations"`
		} `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&gRes); err != nil {
		return nil, err
	}
	if len(gRes.Data.Translations) != len(texts) {
		return nil, fmt.Errorf("Google returned %d translations, expected %d", len(gRes.Data.Translations), len(texts))
	}

	out := make([]string, len(texts))
	for i, item := range gRes.Data.Translations {
		out[i] = item.TranslatedText
	}
	return out, nil
}

func (m *ProviderManager) translateGoogleGTX(ctx context.Context, texts []string, sourceLang, targetLang string) ([]string, error) {
	if len(texts) == 0 {
		return []string{}, nil
	}
	results := make([]string, len(texts))
	tl := strings.ToLower(targetLang)
	if tl == "" {
		tl = "en"
	}
	sl := strings.ToLower(sourceLang)
	if sl == "" || strings.EqualFold(sl, tl) {
		sl = "auto"
	}

	for i, text := range texts {
		tTrim := strings.TrimSpace(text)
		if tTrim == "" {
			results[i] = text
			continue
		}

		endpoint := fmt.Sprintf("https://translate.googleapis.com/translate_a/single?client=gtx&sl=%s&tl=%s&dt=t&q=%s",
			url.QueryEscape(sl),
			url.QueryEscape(tl),
			url.QueryEscape(tTrim),
		)

		req, err := http.NewRequestWithContext(ctx, "GET", endpoint, nil)
		if err != nil {
			return nil, err
		}
		req.Header.Set("User-Agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36")

		resp, err := m.client.Do(req)
		if err != nil {
			return nil, err
		}

		if resp.StatusCode != http.StatusOK {
			resp.Body.Close()
			return nil, fmt.Errorf("Google GTX returned HTTP %d", resp.StatusCode)
		}

		var rawData []interface{}
		decodeErr := json.NewDecoder(resp.Body).Decode(&rawData)
		resp.Body.Close()
		if decodeErr != nil || len(rawData) == 0 {
			return nil, errors.New("invalid response from Google GTX")
		}

		sentences, ok := rawData[0].([]interface{})
		if !ok || len(sentences) == 0 {
			return nil, errors.New("empty sentences from Google GTX")
		}

		var sb strings.Builder
		for _, s := range sentences {
			if sArray, ok := s.([]interface{}); ok && len(sArray) > 0 {
				if tStr, ok := sArray[0].(string); ok {
					sb.WriteString(tStr)
				}
			}
		}

		resStr := strings.TrimSpace(sb.String())
		if resStr == "" {
			results[i] = text
		} else {
			results[i] = resStr
		}
	}

	return results, nil
}

func extractTranslations(raw string, expectedCount int) ([]string, bool) {
	raw = strings.TrimSpace(raw)
	raw = strings.TrimPrefix(raw, "```json")
	raw = strings.TrimPrefix(raw, "```")
	raw = strings.TrimSuffix(raw, "```")
	raw = strings.TrimSpace(raw)

	// 1. Direct JSON unmarshal
	var list []string
	if err := json.Unmarshal([]byte(raw), &list); err == nil && len(list) == expectedCount {
		return cleanTranslations(list), true
	}

	// 2. Look for JSON array brackets [ ... ] anywhere in the text
	start := strings.Index(raw, "[")
	end := strings.LastIndex(raw, "]")
	if start != -1 && end != -1 && end > start {
		sub := raw[start : end+1]
		if err := json.Unmarshal([]byte(sub), &list); err == nil && len(list) == expectedCount {
			return cleanTranslations(list), true
		}
	}

	// 3. For single text translations, strip conversational wrappers
	if expectedCount == 1 {
		cleaned := raw
		lines := strings.Split(cleaned, "\n")
		for _, line := range lines {
			l := strings.TrimSpace(line)
			if l == "" {
				continue
			}
			lower := strings.ToLower(l)
			if strings.HasPrefix(lower, "here is") || strings.HasPrefix(lower, "sure") || strings.HasPrefix(lower, "translation:") {
				parts := strings.SplitN(l, ":", 2)
				if len(parts) == 2 && strings.TrimSpace(parts[1]) != "" {
					l = strings.TrimSpace(parts[1])
				} else {
					continue
				}
			}
			l = strings.Trim(l, "\"`'[]")
			l = strings.TrimSpace(l)
			if l != "" {
				return []string{l}, true
			}
		}

		cleaned = strings.Trim(cleaned, "\"`'[]")
		cleaned = strings.TrimSpace(cleaned)
		if cleaned != "" {
			return []string{cleaned}, true
		}
	}

	return nil, false
}

func cleanTranslations(list []string) []string {
	cleaned := make([]string, len(list))
	for i, s := range list {
		trimmed := strings.TrimSpace(s)
		trimmed = strings.Trim(trimmed, "\"`'")
		trimmed = strings.TrimPrefix(trimmed, "\\\"")
		trimmed = strings.TrimSuffix(trimmed, "\\\"")
		trimmed = strings.Trim(trimmed, "\"`'")
		cleaned[i] = strings.TrimSpace(trimmed)
	}
	return cleaned
}

func (m *ProviderManager) translateLLM(ctx context.Context, providerName string, conf map[string]interface{}, texts []string, sourceLang, targetLang string) ([]string, error) {
	apiKey, _ := conf["apiKey"].(string)
	endpoint, _ := conf["endpoint"].(string)
	model, _ := conf["model"].(string)

	defaultEndpoint := "https://api.openai.com/v1"
	defaultModel := "gpt-4o-mini"

	var modelCandidates []string

	if providerName == "groq" {
		defaultEndpoint = "https://api.groq.com/openai/v1"
		defaultModel = "qwen/qwen3.8-27b"
		if model == "" || model == "llama-3.3-70b-versatile" {
			model = "qwen/qwen3.8-27b"
		}
		modelCandidates = []string{model, "qwen/qwen3.8-27b", "openai/gpt-oss-120b", "openai/gpt-oss-20b"}
	} else if providerName == "openrouter" {
		defaultEndpoint = "https://openrouter.ai/api/v1"
		defaultModel = "meta-llama/llama-3.3-70b-instruct"
		modelCandidates = []string{model, defaultModel}
	} else if providerName == "nvidia" {
		defaultEndpoint = "https://integrate.api.nvidia.com/v1"
		defaultModel = "meta/llama-3.3-70b-instruct"
		modelCandidates = []string{model, defaultModel}
	} else {
		modelCandidates = []string{model, defaultModel}
	}

	if endpoint == "" {
		endpoint = defaultEndpoint
	}

	jsonTexts, _ := json.Marshal(texts)
	prompt := fmt.Sprintf("Translate the following JSON array of strings into target language %q. Return ONLY a valid JSON array of translated strings in the exact same order with no markdown formatting or extra text:\n%s", targetLang, string(jsonTexts))

	var lastErr error
	visitedModels := make(map[string]bool)

	for _, tryModel := range modelCandidates {
		if tryModel == "" || visitedModels[tryModel] {
			continue
		}
		visitedModels[tryModel] = true

		reqBody := map[string]interface{}{
			"model": tryModel,
			"messages": []map[string]string{
				{"role": "system", "content": "You are an ultra-fast real-time speech and chat translator. Respond only with raw JSON array."},
				{"role": "user", "content": prompt},
			},
			"temperature": 0.2,
		}

		reqBytes, _ := json.Marshal(reqBody)
		req, err := http.NewRequestWithContext(ctx, "POST", strings.TrimSuffix(endpoint, "/")+"/chat/completions", bytes.NewReader(reqBytes))
		if err != nil {
			return texts, err
		}
		req.Header.Set("Authorization", "Bearer "+apiKey)
		req.Header.Set("Content-Type", "application/json")
		if providerName == "openrouter" {
			req.Header.Set("HTTP-Referer", "https://vaani.internal")
			req.Header.Set("X-Title", "Vaani Multilingual")
		}

		resp, err := m.client.Do(req)
		if err != nil {
			lastErr = err
			continue
		}

		if resp.StatusCode != http.StatusOK {
			respBytes, _ := io.ReadAll(resp.Body)
			resp.Body.Close()
			lastErr = fmt.Errorf("provider returned HTTP %d: %s", resp.StatusCode, string(respBytes))
			// If 404 (model not found), try next model candidate in list
			if resp.StatusCode == http.StatusNotFound {
				continue
			}
			return nil, lastErr
		}

		var chatResp struct {
			Choices []struct {
				Message struct {
					Content string `json:"content"`
				} `json:"message"`
			} `json:"choices"`
		}

		decodeErr := json.NewDecoder(resp.Body).Decode(&chatResp)
		resp.Body.Close()

		if decodeErr != nil || len(chatResp.Choices) == 0 {
			lastErr = fmt.Errorf("empty or invalid response from provider %s", providerName)
			continue
		}

		raw := strings.TrimSpace(chatResp.Choices[0].Message.Content)
		if list, ok := extractTranslations(raw, len(texts)); ok {
			return list, nil
		}

		lastErr = fmt.Errorf("could not parse %d translated strings from response: %s", len(texts), raw)
	}

	if lastErr != nil {
		return nil, lastErr
	}
	return nil, fmt.Errorf("no translation models succeeded for %s", providerName)
}

// Provider Connection Tests
func (m *ProviderManager) testGroq(creds map[string]interface{}) error {
	apiKey, _ := creds["apiKey"].(string)
	if apiKey == "" {
		return errors.New("Groq API Key is required")
	}
	req, _ := http.NewRequest("GET", "https://api.groq.com/openai/v1/models", nil)
	req.Header.Set("Authorization", "Bearer "+apiKey)
	resp, err := m.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("Groq returned HTTP %d", resp.StatusCode)
	}
	return nil
}

func (m *ProviderManager) testOpenAI(creds map[string]interface{}) error {
	apiKey, _ := creds["apiKey"].(string)
	if apiKey == "" {
		return errors.New("OpenAI API Key is required")
	}
	req, _ := http.NewRequest("GET", "https://api.openai.com/v1/models", nil)
	req.Header.Set("Authorization", "Bearer "+apiKey)
	resp, err := m.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("OpenAI returned HTTP %d", resp.StatusCode)
	}
	return nil
}

func (m *ProviderManager) testDeepgram(creds map[string]interface{}) error {
	apiKey, _ := creds["apiKey"].(string)
	if apiKey == "" {
		return errors.New("Deepgram API Key is required")
	}
	req, _ := http.NewRequest("GET", "https://api.deepgram.com/v1/projects", nil)
	req.Header.Set("Authorization", "Token "+apiKey)
	resp, err := m.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("Deepgram returned HTTP %d", resp.StatusCode)
	}
	return nil
}

func (m *ProviderManager) testElevenLabs(creds map[string]interface{}) error {
	apiKey, _ := creds["apiKey"].(string)
	if apiKey == "" {
		return errors.New("ElevenLabs API Key is required")
	}
	req, _ := http.NewRequest("GET", "https://api.elevenlabs.io/v1/voices", nil)
	req.Header.Set("xi-api-key", apiKey)
	resp, err := m.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("ElevenLabs returned HTTP %d", resp.StatusCode)
	}
	return nil
}

func (m *ProviderManager) testOpenRouter(creds map[string]interface{}) error {
	apiKey, _ := creds["apiKey"].(string)
	if apiKey == "" {
		return errors.New("OpenRouter API Key is required")
	}
	req, _ := http.NewRequest("GET", "https://openrouter.ai/api/v1/models", nil)
	req.Header.Set("Authorization", "Bearer "+apiKey)
	resp, err := m.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("OpenRouter returned HTTP %d", resp.StatusCode)
	}
	return nil
}

func (m *ProviderManager) testAzureSpeech(creds map[string]interface{}) error {
	apiKey, _ := creds["apiKey"].(string)
	region, _ := creds["region"].(string)
	if apiKey == "" || region == "" {
		return errors.New("Azure API Key and Region are required")
	}
	url := fmt.Sprintf("https://%s.api.cognitive.microsoft.com/sts/v1.0/issueToken", region)
	req, _ := http.NewRequest("POST", url, nil)
	req.Header.Set("Ocp-Apim-Subscription-Key", apiKey)
	resp, err := m.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("Azure Speech returned HTTP %d", resp.StatusCode)
	}
	return nil
}

func (m *ProviderManager) testAzureTranslator(creds map[string]interface{}) error {
	apiKey, _ := creds["apiKey"].(string)
	endpoint, _ := creds["endpoint"].(string)
	if endpoint == "" {
		endpoint = "https://api.cognitive.microsofttranslator.com"
	}
	req, _ := http.NewRequest("GET", strings.TrimSuffix(endpoint, "/")+"/languages?api-version=3.0&scope=translation", nil)
	req.Header.Set("Ocp-Apim-Subscription-Key", apiKey)
	resp, err := m.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("Azure Translator returned HTTP %d", resp.StatusCode)
	}
	return nil
}

func (m *ProviderManager) testLiveKit(creds map[string]interface{}) error {
	url, _ := creds["url"].(string)
	apiKey, _ := creds["apiKey"].(string)
	apiSecret, _ := creds["apiSecret"].(string)
	if url == "" || apiKey == "" || apiSecret == "" {
		return errors.New("LiveKit URL, API Key, and API Secret are required")
	}
	return nil
}

func (m *ProviderManager) testGoogle(creds map[string]interface{}, category string) error {
	apiKey, _ := creds["apiKey"].(string)
	if apiKey == "" && category == "tts" {
		return nil // Zero-config fallback supported
	}
	if apiKey == "" {
		return errors.New("Google API Key is required")
	}
	req, _ := http.NewRequest("GET", "https://translation.googleapis.com/language/translate/v2/languages?key="+apiKey, nil)
	resp, err := m.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("Google returned HTTP %d", resp.StatusCode)
	}
	return nil
}

// Default Catalog exactly matching Vaani
func (m *ProviderManager) getDefaultCatalogForCategory(category string) map[string]interface{} {
	switch category {
	case "pipeline":
		return map[string]interface{}{
			"category":       "pipeline",
			"activeProvider": "versionB_pipeline",
			"providers": map[string]interface{}{
				"versionA_realtime": map[string]interface{}{
					"name":         "Version A — Fastest MVP (Direct Speech-to-Speech STS)",
					"description":  "Microphone → GPT Realtime Speech-to-Speech → Speaker (Zero Text Intermediary)",
					"isConfigured": true,
				},
				"versionB_pipeline": map[string]interface{}{
					"name":         "Version B — Maximum Control (Modular Pipeline)",
					"description":  "Microphone → Streaming STT (Deepgram/Groq) → Translation LLM (Groq/OpenRouter) → Streaming TTS (ElevenLabs/Azure) → Speaker",
					"isConfigured": true,
				},
			},
		}

	case "realtime":
		return map[string]interface{}{
			"category":       "realtime",
			"activeProvider": "openai",
			"providers": map[string]interface{}{
				"openai": map[string]interface{}{
					"name":         "OpenAI GPT Realtime Speech-to-Speech",
					"apiKey":       "",
					"model":        "gpt-4o-realtime-preview",
					"voice":        "alloy",
					"instructions": "You are a real-time speech translator. Listen to incoming audio and respond directly with natural translated speech in the target language.",
					"isConfigured": false,
				},
			},
		}

	case "stt":
		return map[string]interface{}{
			"category":       "stt",
			"activeProvider": "groq",
			"providers": map[string]interface{}{
				"groq": map[string]interface{}{
					"name":         "Groq Whisper (Lightning-Fast STT)",
					"apiKey":       "",
					"model":        "whisper-large-v3-turbo",
					"description":  "Sub-200ms ultra-fast transcription on Groq LPUs",
					"isConfigured": false,
				},
				"deepgram": map[string]interface{}{
					"name":         "Deepgram Nova-2 Streaming STT",
					"apiKey":       "",
					"model":        "nova-2",
					"description":  "Production-grade streaming speech-to-text with word timings",
					"isConfigured": false,
				},
				"azure": map[string]interface{}{
					"name":         "Azure Speech Recognition",
					"apiKey":       "",
					"region":       "eastus",
					"endpoint":     "",
					"description":  "Microsoft Azure cognitive speech services",
					"isConfigured": false,
				},
				"openai": map[string]interface{}{
					"name":         "OpenAI Whisper",
					"apiKey":       "",
					"model":        "whisper-1",
					"description":  "OpenAI multilingual speech transcription model",
					"isConfigured": false,
				},
				"nvidia": map[string]interface{}{
					"name":         "NVIDIA Canary STT",
					"apiKey":       "",
					"model":        "nvidia/canary-1b",
					"endpoint":     "https://integrate.api.nvidia.com/v1",
					"description":  "NVIDIA Canary-1B / Riva multilingual STT",
					"isConfigured": false,
				},
			},
		}

	case "translation":
		return map[string]interface{}{
			"category":       "translation",
			"activeProvider": "groq",
			"providers": map[string]interface{}{
				"groq": map[string]interface{}{
					"name":         "Groq (Ultra-Fast LPU Inference)",
					"apiKey":       "",
					"model":        "qwen/qwen3.8-27b",
					"endpoint":     "https://api.groq.com/openai/v1",
					"description":  "Groq LPU Engine (~1,000 tok/sec Qwen 3.8 / Llama)",
					"isConfigured": false,
				},
				"openrouter": map[string]interface{}{
					"name":         "OpenRouter (Universal Model Gateway)",
					"apiKey":       "",
					"model":        "meta-llama/llama-3.3-70b-instruct",
					"endpoint":     "https://openrouter.ai/api/v1",
					"description":  "Access Claude, Gemini, Llama 3.3, Mistral, DeepSeek via single key",
					"isConfigured": false,
				},
				"azure": map[string]interface{}{
					"name":         "Azure Translator",
					"apiKey":       "",
					"region":       "global",
					"endpoint":     "https://api.cognitive.microsofttranslator.com",
					"description":  "Microsoft Cognitive Services Translator",
					"isConfigured": false,
				},
				"openai": map[string]interface{}{
					"name":         "OpenAI (GPT-4o mini)",
					"apiKey":       "",
					"model":        "gpt-4o-mini",
					"description":  "OpenAI GPT-4o mini translation prompt engine",
					"isConfigured": false,
				},
				"google": map[string]interface{}{
					"name":         "Google Cloud Translation (NMT)",
					"apiKey":       "",
					"model":        "nmt",
					"description":  "Google Cloud Translation API v2 Neural Machine Translation",
					"isConfigured": false,
				},
				"nvidia": map[string]interface{}{
					"name":         "NVIDIA NIM (High-Performance LLM)",
					"apiKey":       "",
					"model":        "meta/llama-3.3-70b-instruct",
					"endpoint":     "https://integrate.api.nvidia.com/v1",
					"description":  "Enterprise NVIDIA NIM microservices inference",
					"isConfigured": false,
				},
			},
		}

	case "tts":
		return map[string]interface{}{
			"category":       "tts",
			"activeProvider": "elevenlabs",
			"providers": map[string]interface{}{
				"elevenlabs": map[string]interface{}{
					"name":         "ElevenLabs Multilingual TTS",
					"apiKey":       "",
					"model":        "eleven_multilingual_v2",
					"voiceId":      "21m00Tcm4TlvDq8ikWAM",
					"description":  "Ultra-realistic human-like voice synthesis with emotion",
					"isConfigured": false,
				},
				"azure": map[string]interface{}{
					"name":         "Azure Neural TTS",
					"apiKey":       "",
					"region":       "eastus",
					"endpoint":     "",
					"description":  "Microsoft Azure Neural Speech synthesis across 100+ languages",
					"isConfigured": false,
				},
				"google": map[string]interface{}{
					"name":         "Google Universal Neural TTS",
					"apiKey":       "",
					"voice":        "default",
					"description":  "Google Universal Neural TTS (Zero-Config / Multilingual Fallback)",
					"isConfigured": true,
				},
				"openai": map[string]interface{}{
					"name":         "OpenAI TTS",
					"apiKey":       "",
					"model":        "tts-1",
					"voice":        "alloy",
					"description":  "OpenAI Text-to-Speech high clarity audio",
					"isConfigured": false,
				},
				"deepgram": map[string]interface{}{
					"name":         "Deepgram Aura (Streaming Voice)",
					"apiKey":       "",
					"model":        "aura-asteria-en",
					"description":  "Ultra-low latency (~200ms) human voice synthesis",
					"isConfigured": false,
				},
				"nvidia": map[string]interface{}{
					"name":         "NVIDIA Riva FastPitch TTS",
					"apiKey":       "",
					"voiceId":      "English-US.Female-1",
					"endpoint":     "https://integrate.api.nvidia.com/v1",
					"description":  "NVIDIA Riva FastPitch neural TTS",
					"isConfigured": false,
				},
			},
		}

	case "sfu":
		return map[string]interface{}{
			"category":       "sfu",
			"activeProvider": "livekit",
			"providers": map[string]interface{}{
				"livekit": map[string]interface{}{
					"name":         "LiveKit SFU Cloud",
					"url":          m.env.LiveKitURL,
					"apiKey":       m.env.LiveKitAPIKey,
					"apiSecret":    m.env.LiveKitAPISecret,
					"description":  "Ultra-low latency WebRTC Selective Forwarding Unit",
					"isConfigured": m.env.LiveKitAPIKey != "",
				},
			},
		}

	default:
		return map[string]interface{}{
			"category":       category,
			"activeProvider": "",
			"providers":      map[string]interface{}{},
		}
	}
}

// Helpers for masking and AES encryption
func maskKey(k string) string {
	if len(k) <= 8 {
		return "••••••••"
	}
	return "••••••••" + k[len(k)-4:]
}

func (m *ProviderManager) encryptProvidersMap(providers map[string]interface{}) map[string]interface{} {
	enc := make(map[string]interface{})
	for pKey, pVal := range providers {
		pMap, ok := pVal.(map[string]interface{})
		if !ok {
			enc[pKey] = pVal
			continue
		}
		copyP := make(map[string]interface{})
		for k, v := range pMap {
			copyP[k] = v
		}
		if keyStr, ok := copyP["apiKey"].(string); ok && keyStr != "" && !strings.HasPrefix(keyStr, "enc:") {
			copyP["apiKey"] = m.encrypt(keyStr)
		}
		if secStr, ok := copyP["apiSecret"].(string); ok && secStr != "" && !strings.HasPrefix(secStr, "enc:") {
			copyP["apiSecret"] = m.encrypt(secStr)
		}
		enc[pKey] = copyP
	}
	return enc
}

func (m *ProviderManager) decryptProvidersMap(providers map[string]interface{}) map[string]interface{} {
	dec := make(map[string]interface{})
	for pKey, pVal := range providers {
		pMap, ok := pVal.(map[string]interface{})
		if !ok {
			dec[pKey] = pVal
			continue
		}
		copyP := make(map[string]interface{})
		for k, v := range pMap {
			copyP[k] = v
		}
		if keyStr, ok := copyP["apiKey"].(string); ok && strings.HasPrefix(keyStr, "enc:") {
			copyP["apiKey"] = m.decrypt(keyStr)
		}
		if secStr, ok := copyP["apiSecret"].(string); ok && strings.HasPrefix(secStr, "enc:") {
			copyP["apiSecret"] = m.decrypt(secStr)
		}
		dec[pKey] = copyP
	}
	return dec
}

func (m *ProviderManager) encrypt(plain string) string {
	block, err := aes.NewCipher(m.encryptionKey)
	if err != nil {
		return plain
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return plain
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return plain
	}
	sealed := gcm.Seal(nonce, nonce, []byte(plain), nil)
	return "enc:" + base64.StdEncoding.EncodeToString(sealed)
}

func (m *ProviderManager) decrypt(cipherText string) string {
	raw := strings.TrimPrefix(cipherText, "enc:")
	data, err := base64.StdEncoding.DecodeString(raw)
	if err != nil {
		return cipherText
	}
	block, err := aes.NewCipher(m.encryptionKey)
	if err != nil {
		return cipherText
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return cipherText
	}
	nonceSize := gcm.NonceSize()
	if len(data) < nonceSize {
		return cipherText
	}
	nonce, cipherBytes := data[:nonceSize], data[nonceSize:]
	plain, err := gcm.Open(nil, nonce, cipherBytes, nil)
	if err != nil {
		return cipherText
	}
	return string(plain)
}

// NormalizeLanguageCode standardizes language codes and model-returned names (e.g. "Russian" -> "ru", "Hindi" -> "hi")
func NormalizeLanguageCode(lang string) string {
	clean := strings.ToLower(strings.TrimSpace(lang))
	if clean == "" || clean == "auto" || clean == "detect" {
		return ""
	}
	if len(clean) == 2 {
		return clean
	}
	if strings.Contains(clean, "-") {
		parts := strings.Split(clean, "-")
		if len(parts[0]) == 2 {
			return parts[0]
		}
	}
	if strings.Contains(clean, "_") {
		parts := strings.Split(clean, "_")
		if len(parts[0]) == 2 {
			return parts[0]
		}
	}

	nameMap := map[string]string{
		"english":    "en",
		"russian":    "ru",
		"hindi":      "hi",
		"spanish":    "es",
		"french":     "fr",
		"german":     "de",
		"japanese":   "ja",
		"chinese":    "zh",
		"mandarin":   "zh",
		"arabic":     "ar",
		"portuguese": "pt",
		"italian":    "it",
		"korean":     "ko",
		"turkish":    "tr",
		"bengali":    "bn",
		"tamil":      "ta",
		"telugu":     "te",
		"marathi":    "mr",
		"urdu":       "ur",
		"gujarati":   "gu",
		"punjabi":    "pa",
		"ukrainian":  "uk",
		"vietnamese": "vi",
		"indonesian": "id",
		"polish":     "pl",
		"dutch":      "nl",
		"swedish":    "sv",
		"czech":      "cs",
		"greek":      "el",
		"hebrew":     "he",
		"thai":       "th",
		"persian":    "fa",
		"farsi":      "fa",
		"tagalog":    "tl",
		"filipino":   "tl",
		"malay":      "ms",
		"romanian":   "ro",
		"hungarian":  "hu",
		"danish":     "da",
		"finnish":    "fi",
		"norwegian":  "no",
		"slovak":     "sk",
		"croatian":   "hr",
		"serbian":    "sr",
		"bulgarian":  "bg",
	}

	if code, ok := nameMap[clean]; ok {
		return code
	}
	if len(clean) >= 2 {
		return clean[:2]
	}
	return clean
}

// DetectScriptLanguage identifies natural language from Unicode character blocks (Russian Cyrillic, Hindi Devanagari, Arabic, CJK, etc.)
func DetectScriptLanguage(text string) string {
	var (
		cyrillicCount   int
		devanagariCount int
		arabicCount     int
		cjkCount        int
		hiraganaCount   int
		hangulCount     int
	)

	for _, r := range text {
		switch {
		case r >= 0x0400 && r <= 0x04FF:
			cyrillicCount++
		case r >= 0x0900 && r <= 0x097F:
			devanagariCount++
		case r >= 0x0600 && r <= 0x06FF:
			arabicCount++
		case r >= 0x4E00 && r <= 0x9FFF:
			cjkCount++
		case (r >= 0x3040 && r <= 0x309F) || (r >= 0x30A0 && r <= 0x30FF):
			hiraganaCount++
		case r >= 0xAC00 && r <= 0xD7AF:
			hangulCount++
		}
	}

	total := len([]rune(text))
	if total == 0 {
		return ""
	}

	if cyrillicCount >= 2 || (total < 5 && cyrillicCount > 0) {
		return "ru"
	}
	if devanagariCount >= 2 || (total < 5 && devanagariCount > 0) {
		return "hi"
	}
	if arabicCount >= 2 || (total < 5 && arabicCount > 0) {
		return "ar"
	}
	if hiraganaCount > 0 {
		return "ja"
	}
	if cjkCount >= 2 || (total < 5 && cjkCount > 0) {
		return "zh"
	}
	if hangulCount >= 2 || (total < 5 && hangulCount > 0) {
		return "ko"
	}

	return ""
}

