const axios = require('axios');
const providerManager = require('./providerManager');
const { translateSpeechDirect } = require('../utils/speechTranslationSDK');

/**
 * Universal Speech-to-Text dispatcher supporting active provider
 * @param {Object} params
 * @param {Buffer} params.audioBuffer - Audio buffer to transcribe
 * @param {string} [params.language] - Optional source language code (e.g. 'en', 'hi')
 * @returns {Promise<string>} Recognized text
 */
async function recognizeSpeech({ audioBuffer, language }) {
  if (!audioBuffer || audioBuffer.length === 0) {
    return '';
  }

  const { providerName, config } = providerManager.getActiveProvider('stt');
  const lang = language ? language.split('-')[0] : 'en';

  // 1. Groq Whisper (Ultra-fast LPU inference)
  if (providerName === 'groq') {
    const apiKey = config.apiKey || process.env.GROQ_API_KEY;
    if (!apiKey) {
      throw new Error('Groq API key is not configured for STT');
    }
    const model = config.model || 'whisper-large-v3-turbo';

    const form = new FormData();
    form.append('file', new Blob([audioBuffer], { type: 'audio/wav' }), 'audio.wav');
    form.append('model', model);
    if (lang) form.append('language', lang);

    const response = await axios.post('https://api.groq.com/openai/v1/audio/transcriptions', form, {
      headers: {
        'Authorization': `Bearer ${apiKey}`
      },
      timeout: 15000
    });

    return (response.data?.text || '').trim();
  }

  // 2. OpenAI Whisper
  if (providerName === 'openai') {
    const apiKey = config.apiKey || process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OpenAI API key is not configured for STT');
    }
    const model = config.model || 'whisper-1';

    const form = new FormData();
    form.append('file', new Blob([audioBuffer], { type: 'audio/wav' }), 'audio.wav');
    form.append('model', model);
    if (lang) form.append('language', lang);

    const response = await axios.post('https://api.openai.com/v1/audio/transcriptions', form, {
      headers: {
        'Authorization': `Bearer ${apiKey}`
      },
      timeout: 15000
    });

    return (response.data?.text || '').trim();
  }

  // 3. Deepgram Nova-2
  if (providerName === 'deepgram') {
    const apiKey = config.apiKey || process.env.DEEPGRAM_API_KEY;
    if (!apiKey) {
      throw new Error('Deepgram API key is not configured for STT');
    }
    const model = config.model || 'nova-2';

    const response = await axios.post(
      `https://api.deepgram.com/v1/listen?model=${model}&smart_format=true&language=${lang}`,
      audioBuffer,
      {
        headers: {
          'Authorization': `Token ${apiKey}`,
          'Content-Type': 'audio/wav'
        },
        timeout: 15000
      }
    );

    const transcript = response.data?.results?.channels?.[0]?.alternatives?.[0]?.transcript || '';
    return transcript.trim();
  }

  // 4. NVIDIA Riva / NIM Canary STT
  if (providerName === 'nvidia') {
    const apiKey = config.apiKey || process.env.NVIDIA_API_KEY;
    const endpoint = (config.endpoint || 'https://integrate.api.nvidia.com/v1').replace(/\/$/, '');
    if (apiKey) {
      try {
        const form = new FormData();
        form.append('file', new Blob([audioBuffer], { type: 'audio/wav' }), 'audio.wav');
        form.append('model', config.model || 'nvidia/canary-1b');
        if (lang) form.append('language', lang);

        const response = await axios.post(`${endpoint}/audio/transcriptions`, form, {
          headers: {
            'Authorization': `Bearer ${apiKey}`
          },
          timeout: 15000
        });
        return (response.data?.text || '').trim();
      } catch (err) {
        console.warn('⚠️ NVIDIA STT failed, falling back to Azure Speech Recognition:', err.message);
      }
    }
  }

  // 5. Default: Azure Speech Recognition
  try {
    const result = await translateSpeechDirect(audioBuffer, lang, lang);
    return (result && result.original) ? result.original.trim() : '';
  } catch (err) {
    console.error('Azure STT direct translation failed:', err.message);
    return '';
  }
}

module.exports = {
  recognizeSpeech
};
