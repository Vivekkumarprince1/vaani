const sdk = require('microsoft-cognitiveservices-speech-sdk');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Azure Speech Service configuration
const SPEECH_KEY = process.env.AZURE_SPEECH_KEY;
const SPEECH_REGION = process.env.AZURE_SPEECH_REGION;
const SPEECH_ENDPOINT = process.env.AZURE_SPEECH_ENDPOINT || `https://${SPEECH_REGION}.api.cognitive.microsoft.com/sts/v1.0/issuetoken`;

if (SPEECH_KEY && SPEECH_REGION) {
  console.log('Azure Speech Service Configuration (Text-to-Speech) [next]:');
  console.log('Region:', SPEECH_REGION);
  console.log('Endpoint:', SPEECH_ENDPOINT);
  console.log('Key:', '****' + SPEECH_KEY.slice(-4));
}

const voiceMap = {
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

const getVoiceFromLanguage = (languageCode) => {
  if (!languageCode) return null;
  const code = languageCode.toLowerCase().split('-')[0];
  return voiceMap[code] || null;
};

const testAzureSpeechConnection = async () => {
  try {
    if (!SPEECH_KEY || !SPEECH_REGION) {
      console.error('Azure Speech Service credentials not configured for connection test');
      return false;
    }

    const speechConfig = sdk.SpeechConfig.fromSubscription(SPEECH_KEY, SPEECH_REGION);
    speechConfig.speechSynthesisVoiceName = 'en-US-JennyNeural';
    const synthesizer = new sdk.SpeechSynthesizer(speechConfig);

    const result = await new Promise((resolve, reject) => {
      synthesizer.speakTextAsync('Test',
        result => {
          synthesizer.close();
          resolve(result);
        },
        error => {
          synthesizer.close();
          reject(error);
        }
      );
    });

    return result && result.reason === sdk.ResultReason.SynthesizingAudioCompleted;
  } catch (error) {
    console.error('Azure Speech Service connection test failed:', error);
    return false;
  }
};

const { synthesizeSpeech } = require('../providers/ttsService');

const textToSpeech = async (text, targetLanguage, maxRetries = 2) => {
  if (!text || typeof text !== 'string') {
    throw new Error('Invalid or empty text input');
  }

  text = text.trim();
  if (text.length === 0) throw new Error('Empty text input');
  if (text.length < 3 && !text.endsWith('.')) text = text + '.';

  let attempts = 0;
  let lastError = null;

  while (attempts < maxRetries) {
    try {
      return await synthesizeSpeech({ text, language: targetLanguage });
    } catch (error) {
      lastError = error;
      attempts++;
      if (attempts < maxRetries) {
        await new Promise(r => setTimeout(r, 500));
      } else {
        throw lastError || new Error('Text-to-speech failed after retries');
      }
    }
  }
};

// Simple in-memory cache for TTS results. Uses insertion-order Map as a
// lightweight LRU approximation: when cache exceeds MAX_CACHE_SIZE we
// delete the oldest entry.
const crypto = require('crypto');
const ttsCache = new Map();
const MAX_CACHE_SIZE = parseInt(process.env.AZURE_TTS_CACHE_SIZE || '100', 10);

// Normalize text for cache keys to avoid misses due to small differences.
const normalizeText = (t) => {
  if (!t) return '';
  // trim, collapse whitespace, lowercase, remove trailing punctuation
  return t.trim().replace(/\s+/g, ' ').replace(/[.?!]+$/g, '').toLowerCase();
};

const getCachedOrSynthesize = async (text, language) => {
  if (!text || typeof text !== 'string') throw new Error('Invalid text for TTS');

  const normalized = normalizeText(text);
  const keyPlain = `${language || 'en'}:${normalized}`;
  const key = crypto.createHash('sha1').update(keyPlain).digest('hex');

  if (ttsCache.has(key)) {
    const val = ttsCache.get(key);
    // update recency
    ttsCache.delete(key);
    ttsCache.set(key, val);
    console.log(`✅ TTS cache HIT (key=${key}, text="${normalized}") size=${ttsCache.size}`);
    return val;
  }

  console.log(`❌ TTS cache MISS (text="${normalized}") - synthesizing`);
  const audio = await textToSpeech(text, language);

  if (ttsCache.size >= MAX_CACHE_SIZE) {
    const firstKey = ttsCache.keys().next().value;
    try { ttsCache.delete(firstKey); } catch (e) {}
    console.log('🔁 TTS cache evicted key:', firstKey);
  }

  ttsCache.set(key, audio);
  console.log(`➕ TTS cached (key=${key}) new size=${ttsCache.size}`);
  return audio;
};

module.exports = {
  textToSpeech,
  testAzureSpeechConnection,
  // Cache-related helpers and objects
  getCachedOrSynthesize,
  ttsCache,
  MAX_CACHE_SIZE
};
