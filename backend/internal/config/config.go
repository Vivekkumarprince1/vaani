package config

import (
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
	"os"
	"strings"
	"sync"

	"vaani-v2/backend/internal/database"
	"vaani-v2/backend/internal/redis"

	"github.com/joho/godotenv"
)

// EnvConfig holds immutable boot-time environment variables
type EnvConfig struct {
	Port                  string
	Env                   string
	AllowedOrigins        string
	AllowedOriginSuffixes string
	MetricsToken          string
	DatabaseURL           string
	RedisURL              string
	JWTSecret             string
	ConfigEncryptionKey   string
	SuperadminEmail       string
	SuperadminPassword    string
	SuperadminUsername    string
	LiveKitURL            string
	LiveKitAPIKey         string
	LiveKitAPISecret      string
	CloudinaryCloudName   string
	CloudinaryAPIKey      string
	CloudinaryAPISecret   string
}

// DynamicConfig holds admin-controlled settings that hot-reload in memory
type DynamicConfig struct {
	Providers    ProvidersConfig    `json:"providers"`
	AudioDSP     AudioDSPConfig     `json:"audio_dsp"`
	FeatureFlags FeatureFlagsConfig `json:"feature_flags"`
	Languages    LanguagesConfig    `json:"languages"`
}

type ProvidersConfig struct {
	ActiveSTT         string                            `json:"active_stt"`         // azure, deepgram, groq, openai, nvidia
	ActiveTranslation string                            `json:"active_translation"` // azure, groq, openai, openrouter, google
	ActiveTTS         string                            `json:"active_tts"`         // azure, elevenlabs, openai, nvidia
	ActiveRealtime    string                            `json:"active_realtime"`    // openai_realtime
	ActiveSFU         string                            `json:"active_sfu"`         // livekit
	ProvidersData     map[string]map[string]interface{} `json:"providers_data"`     // encrypted keys & options
}

type AudioDSPConfig struct {
	VADEnergyThreshold   int     `json:"vad_energy_threshold"`    // e.g. 150
	SilenceDurationMs    int     `json:"silence_duration_ms"`     // e.g. 400ms
	DuckingRatio         float64 `json:"ducking_ratio"`           // e.g. 0.15 (15% volume when translated audio plays)
	PreferredSampleRate  int     `json:"preferred_sample_rate"`   // 16000
	ChunkFrameDurationMs int     `json:"chunk_frame_duration_ms"` // 20
}

type FeatureFlagsConfig struct {
	EnableDirectCalls    bool `json:"enable_direct_calls"`
	EnableGroupCalls     bool `json:"enable_group_calls"`
	EnableLiveCaptions   bool `json:"enable_live_captions"`
	EnableAudioTranslate bool `json:"enable_audio_translate"`
	EnableMediaUploads   bool `json:"enable_media_uploads"`
	RegistrationOpen     bool `json:"registration_open"`
}

type LanguagesConfig struct {
	SupportedLanguages []LanguageInfo    `json:"supported_languages"`
	DefaultVoices      map[string]string `json:"default_voices"` // langCode -> voiceId
}

type LanguageInfo struct {
	Code       string `json:"code"`
	Name       string `json:"name"`
	NativeName string `json:"native_name"`
	Dir        string `json:"dir"` // ltr, rtl
}

// ConfigEngine manages dynamic configuration with live hot-reloading
type ConfigEngine struct {
	mu            sync.RWMutex
	Env           EnvConfig
	Dynamic       DynamicConfig
	db            *database.DB
	redis         *redis.Client
	encryptionKey []byte
}

func LoadEnv() EnvConfig {
	_ = godotenv.Load()
	envName := os.Getenv("ENV")
	if envName == "" {
		envName = "development"
	}

	getEnv := func(key, fallback string) string {
		if val := os.Getenv(key); val != "" {
			return val
		}
		return fallback
	}

	return EnvConfig{
		Port:                  getEnv("PORT", "8080"),
		Env:                   envName,
		AllowedOrigins:        getEnv("ALLOWED_ORIGINS", ""),
		AllowedOriginSuffixes: getEnv("ALLOWED_ORIGIN_SUFFIXES", ""),
		MetricsToken:          getEnv("METRICS_TOKEN", ""),
		DatabaseURL:           getEnv("DATABASE_URL", "postgres://vivekkumar@localhost:5432/vaani_v2?sslmode=disable"),
		RedisURL:              getEnv("REDIS_URL", "redis://localhost:6379"),
		JWTSecret:             getEnv("JWT_SECRET", ""),
		ConfigEncryptionKey:   getEnv("CONFIG_ENCRYPTION_KEY", ""),
		SuperadminEmail:       getEnv("SUPERADMIN_EMAIL", "admin@vaani.internal"),
		SuperadminPassword:    getEnv("SUPERADMIN_PASSWORD", ""),
		SuperadminUsername:    getEnv("SUPERADMIN_USERNAME", "superadmin"),
		LiveKitURL:            getEnv("LIVEKIT_URL", ""),
		LiveKitAPIKey:         getEnv("LIVEKIT_API_KEY", ""),
		LiveKitAPISecret:      getEnv("LIVEKIT_API_SECRET", ""),
		CloudinaryCloudName:   getEnv("CLOUDINARY_CLOUD_NAME", ""),
		CloudinaryAPIKey:      getEnv("CLOUDINARY_API_KEY", ""),
		CloudinaryAPISecret:   getEnv("CLOUDINARY_API_SECRET", ""),
	}
}

// Validate rejects insecure or incomplete boot configuration before any
// database/provider initialization occurs. Secrets intentionally have no
// development fallback: a deployment must provide them explicitly.
func (e EnvConfig) Validate() error {
	if e.JWTSecret == "" {
		return errors.New("JWT_SECRET is required")
	}
	if len(e.JWTSecret) < 32 {
		return errors.New("JWT_SECRET must be at least 32 characters")
	}
	if e.ConfigEncryptionKey == "" {
		return errors.New("CONFIG_ENCRYPTION_KEY is required")
	}
	if len(e.ConfigEncryptionKey) < 32 {
		return errors.New("CONFIG_ENCRYPTION_KEY must be at least 32 characters")
	}
	if e.SuperadminPassword == "" {
		return errors.New("SUPERADMIN_PASSWORD is required")
	}
	if len(e.SuperadminPassword) < 12 {
		return errors.New("SUPERADMIN_PASSWORD must be at least 12 characters")
	}
	if e.Env == "production" {
		if strings.TrimSpace(e.DatabaseURL) == "" || strings.Contains(strings.ToLower(e.DatabaseURL), "localhost") || strings.Contains(strings.ToLower(e.DatabaseURL), "127.0.0.1") {
			return errors.New("DATABASE_URL must point to a non-local production database")
		}
		if strings.TrimSpace(e.RedisURL) == "" {
			return errors.New("REDIS_URL is required in production")
		}
		if e.AllowedOrigins == "" {
			return errors.New("ALLOWED_ORIGINS is required in production")
		}
		for _, origin := range strings.Split(e.AllowedOrigins, ",") {
			origin = strings.TrimSpace(strings.ToLower(origin))
			if origin == "" || strings.Contains(origin, "localhost") || strings.Contains(origin, "127.0.0.1") || strings.Contains(origin, "0.0.0.0") {
				return errors.New("ALLOWED_ORIGINS must contain only public frontend origins in production")
			}
		}
		if e.LiveKitURL == "" || e.LiveKitAPIKey == "" || e.LiveKitAPISecret == "" {
			return errors.New("LIVEKIT_URL, LIVEKIT_API_KEY and LIVEKIT_API_SECRET are required in production")
		}
	}
	return nil
}

func NewConfigEngine(env EnvConfig, db *database.DB, rdb *redis.Client) *ConfigEngine {
	key := []byte(env.ConfigEncryptionKey)
	if len(key) < 32 {
		padded := make([]byte, 32)
		copy(padded, key)
		key = padded
	} else if len(key) > 32 {
		key = key[:32]
	}

	engine := &ConfigEngine{
		Env:           env,
		db:            db,
		redis:         rdb,
		encryptionKey: key,
		Dynamic:       getDefaultDynamicConfig(),
	}

	return engine
}

func getDefaultDynamicConfig() DynamicConfig {
	return DynamicConfig{
		Providers: ProvidersConfig{
			ActiveSTT:         "groq",
			ActiveTranslation: "groq",
			ActiveTTS:         "elevenlabs",
			ActiveRealtime:    "openai_realtime",
			ActiveSFU:         "livekit",
			ProvidersData:     make(map[string]map[string]interface{}),
		},
		AudioDSP: AudioDSPConfig{
			VADEnergyThreshold:   150,
			SilenceDurationMs:    400,
			DuckingRatio:         0.15,
			PreferredSampleRate:  16000,
			ChunkFrameDurationMs: 20,
		},
		FeatureFlags: FeatureFlagsConfig{
			EnableDirectCalls:    true,
			EnableGroupCalls:     true,
			EnableLiveCaptions:   true,
			EnableAudioTranslate: true,
			EnableMediaUploads:   true,
			RegistrationOpen:     true,
		},
		Languages: LanguagesConfig{
			SupportedLanguages: []LanguageInfo{
				{Code: "en", Name: "English", NativeName: "English", Dir: "ltr"},
				{Code: "hi", Name: "Hindi", NativeName: "हिन्दी", Dir: "ltr"},
				{Code: "es", Name: "Spanish", NativeName: "Español", Dir: "ltr"},
				{Code: "fr", Name: "French", NativeName: "Français", Dir: "ltr"},
				{Code: "de", Name: "German", NativeName: "Deutsch", Dir: "ltr"},
				{Code: "ja", Name: "Japanese", NativeName: "日本語", Dir: "ltr"},
				{Code: "ar", Name: "Arabic", NativeName: "العربية", Dir: "rtl"},
			},
			DefaultVoices: map[string]string{
				"en": "21m00Tcm4TlvDq8ikWAM",
				"hi": "Rachel",
			},
		},
	}
}

// LoadFromDB loads settings from system_settings table into memory
func (e *ConfigEngine) LoadFromDB(ctx context.Context) error {
	e.mu.Lock()
	defer e.mu.Unlock()

	rows, err := e.db.Pool.Query(ctx, "SELECT category, active_key, config FROM system_settings")
	if err != nil {
		return fmt.Errorf("failed to load system_settings: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var category, activeKey string
		var rawConfig []byte
		if err := rows.Scan(&category, &activeKey, &rawConfig); err != nil {
			continue
		}

		switch category {
		case "providers":
			// ProviderManager is the single source of truth for provider
			// catalogs, credentials, and active provider selection. Keep this
			// legacy category ignored so its generic catalog cannot overwrite
			// the typed dynamic settings in this engine.
			continue
		case "audio_dsp":
			var dsp AudioDSPConfig
			if err := json.Unmarshal(rawConfig, &dsp); err == nil {
				e.Dynamic.AudioDSP = dsp
			}
		case "feature_flags":
			var feat FeatureFlagsConfig
			if err := json.Unmarshal(rawConfig, &feat); err == nil {
				e.Dynamic.FeatureFlags = feat
			}
		case "languages":
			var lang LanguagesConfig
			if err := json.Unmarshal(rawConfig, &lang); err == nil {
				e.Dynamic.Languages = lang
			}
		}
	}

	log.Println("✅ Dynamic admin configuration loaded into memory")
	return nil
}

// StartHotReloadListener listens for Redis pub/sub events to hot-reload configs on the fly
func (e *ConfigEngine) StartHotReloadListener(ctx context.Context) {
	if e.redis == nil {
		return
	}
	pubsub := e.redis.Rdb.Subscribe(ctx, "vaani:config:reload")
	go func() {
		ch := pubsub.Channel()
		for msg := range ch {
			log.Printf("🔄 Received config hot-reload signal for category: %s", msg.Payload)
			_ = e.LoadFromDB(context.Background())
		}
	}()
}

// GetDynamic returns thread-safe copy of dynamic configuration
func (e *ConfigEngine) GetDynamic() DynamicConfig {
	e.mu.RLock()
	defer e.mu.RUnlock()
	return e.Dynamic
}

// Encrypt encrypts sensitive strings (API keys) using AES-256-GCM
func (e *ConfigEngine) Encrypt(plaintext string) (string, error) {
	block, err := aes.NewCipher(e.encryptionKey)
	if err != nil {
		return "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", err
	}
	ciphertext := gcm.Seal(nonce, nonce, []byte(plaintext), nil)
	return base64.StdEncoding.EncodeToString(ciphertext), nil
}

// Decrypt decrypts AES-256-GCM ciphertext
func (e *ConfigEngine) Decrypt(cipherTextBase64 string) (string, error) {
	data, err := base64.StdEncoding.DecodeString(cipherTextBase64)
	if err != nil {
		return "", err
	}
	block, err := aes.NewCipher(e.encryptionKey)
	if err != nil {
		return "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	nonceSize := gcm.NonceSize()
	if len(data) < nonceSize {
		return "", errors.New("ciphertext too short")
	}
	nonce, ciphertext := data[:nonceSize], data[nonceSize:]
	plaintext, err := gcm.Open(nil, nonce, ciphertext, nil)
	if err != nil {
		return "", err
	}
	return string(plaintext), nil
}
