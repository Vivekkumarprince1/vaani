const axios = require('axios');
const sdk = require('microsoft-cognitiveservices-speech-sdk');
const providerManager = require('./providerManager');

const AZURE_VOICE_MAP = {
  'en': 'en-US-JennyNeural',
  'hi': 'hi-IN-SwaraNeural',
  'es': 'es-ES-ElviraNeural',
  'fr': 'fr-FR-DeniseNeural',
  'de': 'de-DE-KatjaNeural',
  'it': 'it-IT-ElsaNeural',
  'ja': 'ja-JP-NanamiNeural',
  'ko': 'ko-KR-SunHiNeural',
  'pt': 'pt-BR-FranciscaNeural',
  'ru': 'ru-RU-SvetlanaNeural',
  'zh': 'zh-CN-XiaoxiaoNeural',
  'ar': 'ar-SA-ZariyahNeural',
  'ta': 'ta-IN-PallaviNeural',
  'te': 'te-IN-ShrutiNeural',
  'bn': 'bn-IN-TanishaaNeural',
  'gu': 'gu-IN-DhwaniNeural',
  'kn': 'kn-IN-SapnaNeural',
  'ml': 'ml-IN-SobhanaNeural',
  'mr': 'mr-IN-AarohiNeural',
  'pa': 'pa-IN-VaaniNeural',
  'ur': 'ur-IN-GulNeural'
};

const getAzureVoiceFromLanguage = (languageCode) => {
  if (!languageCode) return 'en-US-JennyNeural';
  const code = languageCode.toLowerCase().split('-')[0];
  return AZURE_VOICE_MAP[code] || 'en-US-JennyNeural';
};

/**
 * ElevenLabs Multilingual TTS
 */
async function _synthesizeElevenLabs(cleanText, config = {}) {
  const apiKey = config.apiKey || process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error('ElevenLabs API key is not configured');

  const voiceId = config.voiceId || '21m00Tcm4TlvDq8ikWAM'; // Default: Rachel
  const model = config.model || 'eleven_multilingual_v2';

  const response = await axios.post(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
    {
      text: cleanText,
      model_id: model,
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75
      }
    },
    {
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
        'Accept': 'audio/mpeg'
      },
      responseType: 'arraybuffer',
      timeout: 15000
    }
  );

  return Buffer.from(response.data);
}

/**
 * OpenAI Audio Speech TTS
 */
async function _synthesizeOpenAI(cleanText, config = {}) {
  const apiKey = config.apiKey || process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OpenAI API key is not configured for TTS');

  const model = config.model || 'tts-1';
  const voice = config.voice || 'alloy';

  const response = await axios.post(
    'https://api.openai.com/v1/audio/speech',
    {
      model,
      input: cleanText,
      voice,
      response_format: 'mp3'
    },
    {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      responseType: 'arraybuffer',
      timeout: 15000
    }
  );

  return Buffer.from(response.data);
}

/**
 * NVIDIA Riva / NIM Speech (Self-hosted or Container)
 */
async function _synthesizeNvidia(cleanText, config = {}) {
  const apiKey = config.apiKey || process.env.NVIDIA_API_KEY;
  const rawEndpoint = (config.endpoint || process.env.NVIDIA_TTS_ENDPOINT || 'http://localhost:9000/v1').replace(/\/$/, '');

  // integrate.api.nvidia.com is NVIDIA's API catalog for LLMs/chat, which does not host /audio/speech.
  if (rawEndpoint.includes('integrate.api.nvidia.com') || rawEndpoint.includes('ai.api.nvidia.com')) {
    throw new Error('NVIDIA API Catalog (integrate.api.nvidia.com) is for LLMs; Riva TTS requires a dedicated self-hosted NIM or container endpoint (e.g. http://localhost:9000/v1)');
  }

  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

  const url = rawEndpoint.endsWith('/audio/speech') ? rawEndpoint : `${rawEndpoint}/audio/speech`;
  const response = await axios.post(
    url,
    {
      model: config.model || 'nvidia/fastpitch-hifigan',
      input: cleanText,
      voice: config.voiceId || 'English-US.Female-1',
      response_format: 'mp3'
    },
    {
      headers,
      responseType: 'arraybuffer',
      timeout: 15000
    }
  );

  return Buffer.from(response.data);
}

/**
 * Google Universal / Cloud TTS
 */
async function _synthesizeGoogle(cleanText, language, config = {}) {
  const apiKey = config.apiKey || process.env.GOOGLE_TTS_API_KEY;
  if (apiKey) {
    try {
      const response = await axios.post(
        `https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`,
        {
          input: { text: cleanText },
          voice: { languageCode: language || 'en-US' },
          audioConfig: { audioEncoding: 'MP3' }
        },
        { timeout: 10000 }
      );
      if (response.data?.audioContent) {
        return Buffer.from(response.data.audioContent, 'base64');
      }
    } catch (err) {
      console.warn('[TTS] Google Cloud TTS failed, trying Universal Google TTS fallback:', err.message);
    }
  }

  return await _synthesizeGoogleTranslateTTS(cleanText, language);
}

/**
 * Google Translate Universal TTS (High-speed, zero-config multilingual fallback)
 */
async function _synthesizeGoogleTranslateTTS(cleanText, language) {
  const lang = (language || 'en').toLowerCase().split('-')[0];
  const maxLen = 200;
  const chunk = cleanText.length > maxLen ? cleanText.slice(0, maxLen) : cleanText;
  const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(chunk)}&tl=${lang}&client=tw-ob`;

  const response = await axios.get(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      'Referer': 'https://translate.google.com/'
    },
    responseType: 'arraybuffer',
    timeout: 10000
  });

  if (response.status === 200 && response.data) {
    return Buffer.from(response.data);
  }
  throw new Error(`Google Translate TTS returned status ${response.status}`);
}

/**
 * Azure Speech Service (Cognitive Services)
 */
async function _synthesizeAzure(cleanText, language, config = {}) {
  const speechKey = config.apiKey || process.env.AZURE_SPEECH_KEY;
  const speechRegion = config.region || process.env.AZURE_SPEECH_REGION;
  const speechEndpoint = config.endpoint || process.env.AZURE_SPEECH_ENDPOINT;

  if (!speechKey || !speechRegion) {
    throw new Error('Azure Speech Service credentials not configured for TTS');
  }

  const voiceName = getAzureVoiceFromLanguage(language);
  const preferredFormat = process.env.AZURE_TTS_AUDIO_FORMAT || '24k-48k';

  if (!global.__ttsConfigPool) {
    global.__ttsConfigPool = new Map();
  }
  const poolKey = `${speechKey}|${speechRegion}|${speechEndpoint || ''}|${voiceName}|${preferredFormat}`;
  let speechConfig = global.__ttsConfigPool.get(poolKey);

  if (!speechConfig) {
    speechConfig = sdk.SpeechConfig.fromSubscription(speechKey, speechRegion);
    if (speechEndpoint) {
      speechConfig.setServiceProperty('endpoint', speechEndpoint, sdk.ServicePropertyChannel.UriQueryParameter);
    }
    speechConfig.speechSynthesisVoiceName = voiceName;

    if (preferredFormat === '16k-32k') {
      speechConfig.speechSynthesisOutputFormat = sdk.SpeechSynthesisOutputFormat.Audio16Khz32KBitRateMonoMp3;
    } else {
      speechConfig.speechSynthesisOutputFormat = sdk.SpeechSynthesisOutputFormat.Audio24Khz48KBitRateMonoMp3;
    }
    global.__ttsConfigPool.set(poolKey, speechConfig);
  }

  const synthesizer = new sdk.SpeechSynthesizer(speechConfig, null);

  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      try { synthesizer.close(); } catch (e) {}
      reject(new Error('Azure text-to-speech operation timed out'));
    }, 12000);

    const ssmlLangCode = language && language.includes('-')
      ? language
      : (voiceName ? voiceName.split('-').slice(0, 2).join('-') : 'en-US');

    const ssml = `
      <speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${ssmlLangCode}">
        <voice name="${voiceName}">
          ${cleanText.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}
        </voice>
      </speak>
    `;

    synthesizer.speakSsmlAsync(
      ssml,
      result => {
        clearTimeout(timeoutId);
        try { synthesizer.close(); } catch (e) {}

        if (result && result.reason === sdk.ResultReason.SynthesizingAudioCompleted) {
          const audioData = Buffer.from(result.audioData || []);
          if (audioData.length === 0) {
            reject(new Error('Generated audio is empty'));
          } else {
            resolve(audioData);
          }
        } else {
          const details = result && result.errorDetails ? result.errorDetails : 'Unknown Azure TTS error';
          reject(new Error(`Azure TTS failed: ${details}`));
        }
      },
      error => {
        clearTimeout(timeoutId);
        try { synthesizer.close(); } catch (e) {}
        reject(error);
      }
    );
  });
}

/**
 * Internal single-provider dispatcher
 */
async function _dispatchProvider(providerName, cleanText, language, config) {
  switch (providerName) {
    case 'elevenlabs':
      return await _synthesizeElevenLabs(cleanText, config);
    case 'openai':
      return await _synthesizeOpenAI(cleanText, config);
    case 'nvidia':
      return await _synthesizeNvidia(cleanText, config);
    case 'google':
      return await _synthesizeGoogle(cleanText, language, config);
    case 'azure':
      return await _synthesizeAzure(cleanText, language, config);
    default:
      throw new Error(`Unsupported TTS provider: ${providerName}`);
  }
}

const failedProviderCooldowns = new Map();

function isProviderCoolingDown(name) {
  const expiry = failedProviderCooldowns.get(name);
  if (!expiry) return false;
  if (Date.now() > expiry) {
    failedProviderCooldowns.delete(name);
    return false;
  }
  return true;
}

function markProviderCooldown(name, durationMs = 120000) {
  failedProviderCooldowns.set(name, Date.now() + durationMs);
}

/**
 * Universal TTS synthesis dispatcher supporting active provider with automatic fallback
 * @param {Object} params
 * @param {string} params.text - Text to synthesize into speech
 * @param {string} params.language - Language code (e.g. 'en', 'hi', 'fr')
 * @returns {Promise<Buffer>} Audio buffer (MP3 format)
 */
async function synthesizeSpeech({ text, language }) {
  if (!text || typeof text !== 'string') {
    throw new Error('Invalid or empty text input for TTS');
  }

  const cleanText = text.trim();
  if (cleanText.length === 0) {
    throw new Error('Empty text input for TTS');
  }

  const { providerName, config } = providerManager.getActiveProvider('tts') || { providerName: 'google', config: {} };

  // 1. Primary target is the user-configured active provider
  const queue = [{ name: providerName, config }];

  // 2. Add other configured providers as candidates
  const ttsCategory = providerManager.getCategoryConfig ? providerManager.getCategoryConfig('tts') : null;
  const allProviders = ttsCategory?.providers || {};

  for (const [pName, pDef] of Object.entries(allProviders)) {
    if (pName !== providerName && (pDef.apiKey || pName === 'google')) {
      queue.push({ name: pName, config: pDef });
    }
  }

  // 3. Ensure Google Universal fallback is present
  if (!queue.some(p => p.name === 'google')) {
    queue.push({ name: 'google', config: {} });
  }

  let lastError = null;
  for (const item of queue) {
    if (isProviderCoolingDown(item.name)) {
      continue;
    }

    try {
      const audio = await _dispatchProvider(item.name, cleanText, language, item.config);
      if (audio && audio.length > 0) {
        return audio;
      }
    } catch (err) {
      lastError = err;
      if (
        err.message.includes('401') ||
        err.message.includes('403') ||
        err.message.includes('NVIDIA API Catalog') ||
        err.message.includes('not configured')
      ) {
        markProviderCooldown(item.name, 120000);
      }
      console.warn(`⚠️ [TTS] '${item.name}' failed: ${err.message}. Cascading to fallback...`);
    }
  }

  throw lastError || new Error('All TTS providers failed to synthesize speech');
}

module.exports = {
  synthesizeSpeech,
  AZURE_VOICE_MAP,
  getAzureVoiceFromLanguage
};
