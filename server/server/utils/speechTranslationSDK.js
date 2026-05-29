const sdk = require('microsoft-cognitiveservices-speech-sdk');
const { config, requireEnv } = require('./env');
const { retry } = require('./retry');
const cache = require('./translationCache');
const pLimitModule = require('p-limit');
const pLimit = (pLimitModule && pLimitModule.default) ? pLimitModule.default : pLimitModule;

// NOTE: don't require AZURE env vars at module import time. Some environments
// (local dev without credentials, or CI) may not have these set and we don't
// want the whole server to crash just because translation isn't configured.
// Validate lazily when translation is actually invoked.

function getSpeechCredentialsOrThrow() {
  const key = config.AZURE_SPEECH_KEY;
  const region = config.AZURE_SPEECH_REGION;
  if (!key || !region) {
    throw new Error('Azure Speech credentials missing: set AZURE_SPEECH_KEY and AZURE_SPEECH_REGION to use speech translation');
  }
  return { key, region };
}

/**
 * Map language codes to Azure Speech Service locale codes
 * Azure requires locale-specific codes for speech recognition (e.g., 'en-US', 'hi-IN')
 * but only language codes for translation targets (e.g., 'en', 'hi')
 */
const LANGUAGE_LOCALE_MAP = {
  'en': 'en-US',
  'es': 'es-ES',
  'fr': 'fr-FR',
  'de': 'de-DE',
  'it': 'it-IT',
  'pt': 'pt-BR',
  'ru': 'ru-RU',
  'ja': 'ja-JP',
  'ko': 'ko-KR',
  'zh': 'zh-CN',
  'ar': 'ar-SA',
  'hi': 'hi-IN',
  'bn': 'bn-IN',
  'te': 'te-IN',
  'mr': 'mr-IN',
  'ta': 'ta-IN',
  'ur': 'ur-IN',
  'gu': 'gu-IN',
  'kn': 'kn-IN',
  'or': 'or-IN',
  'pa': 'pa-IN',
  'as': 'as-IN',
  'ml': 'ml-IN'
};

/**
 * Convert language code to Azure Speech locale code
 * If already in locale format (e.g., 'en-US'), return as-is
 * Otherwise, map to default locale (e.g., 'en' -> 'en-US')
 */
const toSpeechLocale = (languageCode) => {
  if (!languageCode) return 'en-US';
  if (languageCode.includes('-')) return languageCode;
  return LANGUAGE_LOCALE_MAP[languageCode] || `${languageCode}-${languageCode.toUpperCase()}`;
};

/**
 * Extract language code from locale (e.g., 'en-US' -> 'en')
 */
const toLanguageCode = (locale) => {
  if (!locale) return 'en';
  return locale.split('-')[0];
};

// Simple in-memory pool for SpeechTranslationConfig per (key, region, sourceLocale + targets)
const configPool = new Map();
const CONFIG_POOL_REFRESH_INTERVAL = 5 * 60 * 1000; // 5 minutes

function getTranslationConfig(sourceLocale, targetLangCodes = []) {
  const { key: SPEECH_KEY, region: SPEECH_REGION } = getSpeechCredentialsOrThrow();
  const key = [SPEECH_KEY, SPEECH_REGION, sourceLocale, targetLangCodes.join(',')].join('|');
  if (configPool.has(key)) return configPool.get(key);
  const c = sdk.SpeechTranslationConfig.fromSubscription(SPEECH_KEY, SPEECH_REGION);
  c.speechRecognitionLanguage = sourceLocale;
  targetLangCodes.forEach((t) => c.addTargetLanguage(t));
  // Relaxed timeouts for streaming mode (continuous recognition)
  // InitialSilenceTimeout: wait 8s before giving up on initial audio
  // EndSilenceTimeout: wait 2s after speech ends before finalizing
  c.setProperty(sdk.PropertyId.SpeechServiceConnection_InitialSilenceTimeoutMs, '8000');
  c.setProperty(sdk.PropertyId.SpeechServiceConnection_EndSilenceTimeoutMs, '2000');
  // DO NOT enable dictation - it's incompatible with streaming translation
  // c.enableDictation();
  configPool.set(key, c);
  return c;
}

// Clear stale configs periodically to prevent WebSocket connection issues
setInterval(() => {
  console.log('[speechTranslationSDK] Clearing config pool to refresh Azure connections');
  configPool.clear();
}, CONFIG_POOL_REFRESH_INTERVAL);

// TTS concurrency limiter (batching)
const ttsLimit = pLimit(config.TTS_CONCURRENCY || 4);

// Helper to create a small stable key for cache
function makeCacheKey(prefix, data) {
  try {
    return prefix + '::' + JSON.stringify(data);
  } catch (e) {
    return prefix + '::' + String(data);
  }
}

/**
 * 🔥 OPTIMIZED: Azure Speech Translation SDK (SINGLE API CALL)
 * This combines speech recognition and translation into ONE API call
 * Expected improvement: 200-400ms faster than separate STT + Translation
 * 
 * Previous flow: Audio → STT (400ms) → Translation (300ms) = 700ms
 * New flow: Audio → Speech Translation (450ms) = 450ms
 * Improvement: ~250ms faster (35% reduction)
 */

/**
 * Translate speech directly to target language using Azure Speech Translation SDK
 * This is FASTER than separate speech-to-text + text-translation
 * 
 * @param {Buffer} audioBuffer - WAV audio buffer
 * @param {string} sourceLanguage - Source language code (e.g., 'en-US')
 * @param {string} targetLanguage - Target language code (e.g., 'fr-FR')
 * @param {Function} onPartialResult - Optional callback for partial results
 * @returns {Promise<{original: string, translated: string, error: string|null}>}
 */
const translateSpeechDirect = async (audioBuffer, sourceLanguage, targetLanguage, onPartialResult = null) => {
  // Defensive validation
  if (!audioBuffer || !Buffer.isBuffer(audioBuffer) || audioBuffer.length < 44) {
    return { original: '', translated: '', error: 'Invalid audio data' };
  }
  if (!isValidWavFormat(audioBuffer)) {
    return { original: '', translated: '', error: 'Invalid WAV format' };
  }

  const sourceLocale = toSpeechLocale(sourceLanguage);
  const targetLangCode = toLanguageCode(targetLanguage);

  // Tiny audio guard (very short audio likely silence)
  if (audioBuffer.length < 1024) {
    return { original: '', translated: '', error: 'Audio too short' };
  }

  // Improved cache key: use more data + length to avoid WAV header collisions
  const cacheKey = makeCacheKey('stt_translate', { 
    hash: audioBuffer.slice(44, 108).toString('base64'), 
    len: audioBuffer.length,
    sourceLocale, 
    targetLangCode 
  });
  const cached = cache.get(cacheKey);
  if (cached) return { original: cached.original, translated: cached.translated, error: null };

  const run = async () => {
    // Log audio info for debugging
    const soundDetected = (buf) => {
      // ✅ SAFELY Skip header and check for non-zero PCM samples.
      // Prevent RangeError crash on odd-sized buffers by checking buf.length - 1.
      for (let i = 44; i < Math.min(buf.length - 1, 1000); i += 2) {
        if (Math.abs(buf.readInt16LE(i)) > 150) return true;
      }
      return false;
    };

    const hasSound = soundDetected(audioBuffer);
    console.log(`📡 [SDK] Processing audio: ${audioBuffer.length} bytes for ${sourceLocale} -> ${targetLangCode}, sound: ${hasSound}`);
    
    if (!hasSound) {
      return { original: '', translated: '' };
    }

    // Use a pooled translation config to avoid recreating objects
    const translationConfig = getTranslationConfig(sourceLocale, [targetLangCode]);

    // ✅ SIMPLIFIED: Azure SDK can handle WAV buffers directly
    const audioConfig = sdk.AudioConfig.fromWavFileInput(audioBuffer);
    const recognizer = new sdk.TranslationRecognizer(translationConfig, audioConfig);

    return await new Promise((resolve, reject) => {
      // Safety timeout
      const timer = setTimeout(() => {
        try { recognizer.close(); } catch (e) {}
        resolve({ original: '', translated: '' });
      }, 10000);

      // Start recognition
      recognizer.recognizeOnceAsync(
        result => {
          clearTimeout(timer);
          if (result) {
            if (result.reason === sdk.ResultReason.TranslatedSpeech) {
              const original = (result.text || '').trim();
              const translation = (result.translations && result.translations.get(targetLangCode)) || '';
              console.log(`🎯 Azure Recognized: "${original}" -> "${translation}"`);
              resolve({ original, translated: translation });
            } else if (result.reason === sdk.ResultReason.NoMatch) {
              const details = sdk.NoMatchDetails.fromResult(result);
              console.log(`ℹ️ Azure NoMatch: ${details.reason}`);
              resolve({ original: '', translated: '' });
            } else if (result.reason === sdk.ResultReason.Canceled) {
              const cancellation = sdk.CancellationDetails.fromResult(result);
              console.warn(`⚠️ Azure Canceled: ${cancellation.reason} - ${cancellation.errorDetails}`);
              resolve({ original: '', translated: '' });
            } else {
              resolve({ original: '', translated: '' });
            }
          } else {
            resolve({ original: '', translated: '' });
          }
          try { recognizer.close(); } catch (e) {}
        },
        err => {
          clearTimeout(timer);
          console.error("Recognition error:", err);
          try { recognizer.close(); } catch (e) {}
          reject(err);
        }
      );
    });
  };

  try {
    const result = await retry(run, { retries: 2, minDelay: 300, maxDelay: 2000 });
    // ONLY cache if we actually got text
    if (result && result.original) {
      cache.set(cacheKey, { original: result.original, translated: result.translated });
    }
    return { original: result.original, translated: result.translated, error: null };
  } catch (err) {
    return { original: '', translated: '', error: err && err.message ? err.message : String(err) };
  }
};

/**
 * Batch translate speech to multiple languages simultaneously
 * Useful for group calls with multiple participants speaking different languages
 * 
 * @param {Buffer} audioBuffer - WAV audio buffer
 * @param {string} sourceLanguage - Source language code
 * @param {Array<string>} targetLanguages - Array of target language codes
 * @returns {Promise<{original: string, translations: Object, error: string|null}>}
 */
const translateSpeechToMultipleLanguages = async (audioBuffer, sourceLanguage, targetLanguages = []) => {
  if (!audioBuffer || !Buffer.isBuffer(audioBuffer) || audioBuffer.length < 44) {
    return { original: '', translations: {}, error: 'Invalid audio data' };
  }
  if (!Array.isArray(targetLanguages) || targetLanguages.length === 0) {
    return { original: '', translations: {}, error: 'No target languages provided' };
  }

  const sourceLocale = toSpeechLocale(sourceLanguage);
  const targetCodes = targetLanguages.map((l) => toLanguageCode(l));

  const cacheKey = makeCacheKey('stt_translate_multi', { hash: audioBuffer.toString('base64').slice(0, 64), sourceLocale, targetCodes });
  const cached = cache.get(cacheKey);
  if (cached) return { original: cached.original, translations: cached.translations, error: null };

  const run = async () => {
    const translationConfig = getTranslationConfig(sourceLocale, targetCodes);
    const pushStream = sdk.AudioInputStream.createPushStream();
    const audioConfig = sdk.AudioConfig.fromStreamInput(pushStream);
    const recognizer = new sdk.TranslationRecognizer(translationConfig, audioConfig);

    return await new Promise((resolve, reject) => {
      let recognizedText = '';
      const translations = {};

      recognizer.recognized = (s, e) => {
        if (e.result && e.result.reason === sdk.ResultReason.TranslatedSpeech) {
          recognizedText = (e.result.text || '').trim();
          targetCodes.forEach((c) => {
            translations[c] = (e.result.translations && e.result.translations.get(c)) || '';
          });
        }
      };

      recognizer.canceled = (s, e) => {
        if (e && e.reason === sdk.CancellationReason.Error) reject(new Error(e.errorDetails || 'Canceled'));
        stopRecognition();
      };

      recognizer.sessionStopped = () => stopRecognition();

      const stopRecognition = () => {
        try {
          recognizer.stopContinuousRecognitionAsync(() => {
            try { recognizer.close(); } catch (e) { }
            resolve({ original: recognizedText, translations });
          });
        } catch (e) {
          resolve({ original: recognizedText, translations });
        }
      };

      setTimeout(() => stopRecognition(), 8000);

      recognizer.startContinuousRecognitionAsync(() => {
        try {
          const chunkSize = 32768;
          for (let i = 44; i < audioBuffer.length; i += chunkSize) {
            const chunk = audioBuffer.slice(i, Math.min(i + chunkSize, audioBuffer.length));
            // ✅ OPTIMIZED: Write Node Buffer directly. Azure Speech SDK accepts standard Uint8Array/Buffer
            // without performing slow and redundant ArrayBuffer memory copies (.slice) under the hood.
            pushStream.write(chunk);
          }
          pushStream.close();
        } catch (err) {
          stopRecognition();
        }
      });
    });
  };

  try {
    const result = await retry(run, { retries: 2, minDelay: 300, maxDelay: 2000 });
    cache.set(cacheKey, { original: result.original, translations: result.translations });
    return { original: result.original, translations: result.translations, error: null };
  } catch (err) {
    return { original: '', translations: {}, error: err && err.message ? err.message : String(err) };
  }
};

// Helper function to validate WAV format
const isValidWavFormat = (buffer) => {
  // ✅ OPTIMIZED: Use buffer.toString with indices directly to prevent allocating intermediate buffer slices.
  return buffer.length >= 44 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WAVE';
};

module.exports = {
  translateSpeechDirect,
  translateSpeechToMultipleLanguages,
  toSpeechLocale,
  toLanguageCode,
  getTranslationConfig
};
