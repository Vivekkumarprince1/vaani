const sdk = require("microsoft-cognitiveservices-speech-sdk");

// Azure Speech Service configuration
const SPEECH_KEY = process.env.AZURE_SPEECH_KEY;
const SPEECH_REGION = process.env.AZURE_SPEECH_REGION;

// Language code mapping for Azure Speech Service
// Maps short codes (fr, en) to full locale codes (fr-FR, en-US)
const languageCodeMap = {
  // Major languages
  'en': 'en-US',
  'es': 'es-ES',
  'fr': 'fr-FR',
  'de': 'de-DE',
  'it': 'it-IT',
  'pt': 'pt-BR',
  'pt-pt': 'pt-PT',
  'ru': 'ru-RU',
  'ja': 'ja-JP',
  'ko': 'ko-KR',
  'zh': 'zh-CN',
  'zh-Hans': 'zh-CN',  // Simplified Chinese
  'zh-Hant': 'zh-TW',  // Traditional Chinese
  'ar': 'ar-SA',
  'nl': 'nl-NL',
  'pl': 'pl-PL',
  'tr': 'tr-TR',
  'sv': 'sv-SE',
  'no': 'no-NO',
  'da': 'da-DK',
  'fi': 'fi-FI',
  'el': 'el-GR',
  'cs': 'cs-CZ',
  'hu': 'hu-HU',
  'ro': 'ro-RO',
  'th': 'th-TH',
  'vi': 'vi-VN',
  'id': 'id-ID',
  'ms': 'ms-MY',
  
  // Indian languages
  'hi': 'hi-IN',
  'bn': 'bn-IN',  // Bengali
  'pa': 'pa-IN',  // Punjabi
  'mr': 'mr-IN',  // Marathi
  'gu': 'gu-IN',  // Gujarati
  'ta': 'ta-IN',  // Tamil
  'te': 'te-IN',  // Telugu
  'kn': 'kn-IN',  // Kannada
  'ml': 'ml-IN',  // Malayalam
  'or': 'or-IN',  // Odia/Oriya
  'ur': 'ur-IN',  // Urdu
  'as': 'as-IN',  // Assamese
};

// Cache for validated language codes
const validatedLanguageCache = new Map();

// Normalize language code
const normalizeLanguage = (languageCode) => {
  if (!languageCode) return null; // Don't default to English
  
  // Check cache first
  if (validatedLanguageCache.has(languageCode)) {
    return validatedLanguageCache.get(languageCode);
  }
  
  const mappedCode = languageCodeMap[languageCode] || languageCode;
  validatedLanguageCache.set(languageCode, mappedCode);
  
  return mappedCode;
};

// Validate WAV format
const isValidWavFormat = (buffer) => {
  return buffer.length >= 44 && 
         buffer.slice(0, 4).toString('ascii') === 'RIFF' && 
         buffer.slice(8, 12).toString('ascii') === 'WAVE';
};

// Normalize audio data to Buffer
const normalizeAudioData = (audioData) => {
  if (Buffer.isBuffer(audioData)) {
    return audioData;
  }
  
  if (typeof audioData === 'string') {
    return Buffer.from(audioData, 'base64');
  }
  
  if (audioData instanceof ArrayBuffer) {
    return Buffer.from(audioData);
  }
  
  return null;
};

/**
 * Convert speech to text using Azure Speech SDK
 * @param {Buffer} audioBuffer - WAV audio buffer
 * @param {string} sourceLanguage - Source language code
 * @returns {Promise<{text: string, error: string|null}>}
 */
const speechToText = async (audioBuffer, sourceLanguage) => {
  try {
    if (!audioBuffer || audioBuffer.length < 44) {
      return { text: '', error: 'Invalid audio data' };
    }
    
    if (!isValidWavFormat(audioBuffer)) {
      return { text: '', error: 'Invalid WAV format' };
    }

    const normalizedLang = normalizeLanguage(sourceLanguage);
    
    console.log(`🎤 Speech Recognition Debug:`, {
      sourceLanguage: sourceLanguage,
      normalizedLang: normalizedLang,
      audioBufferSize: audioBuffer.length
    });
    
    const speechConfig = sdk.SpeechConfig.fromSubscription(SPEECH_KEY, SPEECH_REGION);
    speechConfig.speechRecognitionLanguage = normalizedLang;
    speechConfig.enableDictation();
    
    const pushStream = sdk.AudioInputStream.createPushStream();
    const audioConfig = sdk.AudioConfig.fromStreamInput(pushStream);
    
    const recognizer = new sdk.SpeechRecognizer(speechConfig, audioConfig);

    // Write audio data to stream (skip WAV header)
    const chunkSize = 16384;
    let offset = 44;
    
    for (let i = offset; i < audioBuffer.length; i += chunkSize) {
      const chunk = audioBuffer.slice(i, Math.min(i + chunkSize, audioBuffer.length));
      pushStream.write(chunk);
    }
    pushStream.close();

    const result = await new Promise((resolve, reject) => {
      let recognizedText = '';

      recognizer.recognized = (s, e) => {
        if (e.result.reason === sdk.ResultReason.RecognizedSpeech) {
          const text = e.result.text.trim();
          recognizedText += text ? ' ' + text : '';
        }
      };

      recognizer.canceled = (s, e) => {
        if (e.reason === sdk.CancellationReason.Error) {
          reject(new Error(e.errorDetails));
        }
        stopRecognition();
      };

      recognizer.sessionStopped = () => {
        stopRecognition();
      };

      const stopRecognition = () => {
        recognizer.stopContinuousRecognitionAsync(() => {
          recognizer.close();
          resolve(recognizedText.trim());
        });
      };

      // Set timeout for recognition
      setTimeout(() => {
        stopRecognition();
      }, 10000); // 10 second timeout

      recognizer.startContinuousRecognitionAsync();
    });

    return { text: result, error: null };
  } catch (error) {
    console.error('Speech to text error:', error);
    return { text: '', error: error.message };
  }
};

/**
 * Translate text using Azure Translator API
 * @param {string} text - Text to translate
 * @param {string} sourceLanguage - Source language code (short code like 'en', 'hi')
 * @param {string} targetLanguage - Target language code (short code like 'fr', 'es')
 * @returns {Promise<{text: string, error: string|null}>}
 */
const translateText = async (text, sourceLanguage, targetLanguage) => {
  try {
    if (!text || !text.trim()) {
      return { text: '', error: 'No text to translate' };
    }

    // If source and target are the same, return original text
    if (sourceLanguage === targetLanguage) {
      return { text: text, error: null };
    }

    const axios = require('axios');
    const { v4: uuidv4 } = require('uuid');
    
    // Azure Translator configuration
    const TRANSLATOR_KEY = process.env.AZURE_TRANSLATOR_KEY;
    const TRANSLATOR_REGION = process.env.AZURE_TRANSLATOR_REGION;
    const TRANSLATOR_ENDPOINT = process.env.AZURE_TRANSLATOR_ENDPOINT;

    if (!TRANSLATOR_KEY || !TRANSLATOR_ENDPOINT) {
      console.warn('⚠️ Azure Translator credentials not configured, returning original text');
      return { text: text, error: null };
    }

    // Map language codes if needed (remove region codes for translator)
    const sourceCode = sourceLanguage.split('-')[0]; // 'en-US' -> 'en'
    const targetCode = targetLanguage.split('-')[0]; // 'fr-FR' -> 'fr'

    console.log(`🌐 Translation Debug:`, {
      originalText: text,
      sourceLanguage: sourceLanguage,
      targetLanguage: targetLanguage,
      sourceCode: sourceCode,
      targetCode: targetCode,
      areSame: sourceCode === targetCode
    });

    // If source and target codes are the same after normalization, return original
    if (sourceCode === targetCode) {
      console.log(`⚠️ Source and target language are the same (${sourceCode}), returning original text`);
      return { text: text, error: null };
    }

    const url = `${TRANSLATOR_ENDPOINT}/translate`;
    const params = {
      'api-version': '3.0',
      'from': sourceCode,
      'to': targetCode
    };

    console.log(`🌐 Translating: "${text}" from ${sourceCode} to ${targetCode}`);

    const response = await axios({
      method: 'post',
      url: url,
      params: params,
      headers: {
        'Ocp-Apim-Subscription-Key': TRANSLATOR_KEY,
        'Ocp-Apim-Subscription-Region': TRANSLATOR_REGION,
        'Content-Type': 'application/json',
        'X-ClientTraceId': uuidv4()
      },
      data: [{
        text: text
      }]
    });

    const translatedText = response.data[0].translations[0].text;
    console.log(`✅ Translation result: "${translatedText}"`);
    
    return { text: translatedText, error: null };
  } catch (error) {
    console.error('Translation error:', error);
    return { text: '', error: error.message };
  }
};

/**
 * Convert text to speech using Azure Speech SDK
 * @param {string} text - Text to convert
 * @param {string} targetLanguage - Target language code
 * @returns {Promise<{audio: Buffer|null, error: string|null}>}
 */
const textToSpeech = async (text, targetLanguage) => {
  try {
    if (!text || !text.trim()) {
      return { audio: null, error: 'No text to synthesize' };
    }

    const normalizedLang = normalizeLanguage(targetLanguage);
    
    const speechConfig = sdk.SpeechConfig.fromSubscription(SPEECH_KEY, SPEECH_REGION);
    speechConfig.speechSynthesisLanguage = normalizedLang;
    
    // Set voice based on language
    const voiceMap = {
      'en-US': 'en-US-JennyNeural',
      'hi-IN': 'hi-IN-SwaraNeural',
      'es-ES': 'es-ES-ElviraNeural',
      'fr-FR': 'fr-FR-DeniseNeural',
      'de-DE': 'de-DE-KatjaNeural',
      'ja-JP': 'ja-JP-NanamiNeural',
      'zh-CN': 'zh-CN-XiaoxiaoNeural',
      'pa-IN': 'pa-IN-InderNeural',
    };
    
    speechConfig.speechSynthesisVoiceName = voiceMap[normalizedLang] || voiceMap['en-US'];
    
    // Set output format to WAV (16kHz, 16-bit, mono)
    speechConfig.speechSynthesisOutputFormat = sdk.SpeechSynthesisOutputFormat.Riff16Khz16BitMonoPcm;
    
    // Use pull stream to get audio data
    const audioConfig = sdk.AudioConfig.fromDefaultSpeakerOutput();
    const synthesizer = new sdk.SpeechSynthesizer(speechConfig, null);

    const result = await new Promise((resolve, reject) => {
      synthesizer.speakTextAsync(
        text,
        (result) => {
          if (result.reason === sdk.ResultReason.SynthesizingAudioCompleted) {
            const audioData = Buffer.from(result.audioData);
            console.log(`🔊 TTS: Generated audio, size: ${audioData.length} bytes, first 20 bytes: ${audioData.slice(0, 20).toString('hex')}`);
            synthesizer.close();
            resolve(audioData);
          } else {
            synthesizer.close();
            reject(new Error('Speech synthesis failed'));
          }
        },
        (error) => {
          synthesizer.close();
          reject(error);
        }
      );
    });

    return { audio: result, error: null };
  } catch (error) {
    console.error('Text to speech error:', error);
    return { audio: null, error: error.message };
  }
};

/**
 * Complete speech translation pipeline
 * @param {Buffer|ArrayBuffer|string} audioData - Audio data
 * @param {string} sourceLanguage - Source language code
 * @param {string} targetLanguage - Target language code
 * @returns {Promise<{text: {original: string, translated: string}, audio: Buffer|null, error: string|null}>}
 */
const translateSpeech = async (audioData, sourceLanguage, targetLanguage) => {
  try {
    // Normalize audio data
    const audioBuffer = normalizeAudioData(audioData);
    
    if (!audioBuffer) {
      return {
        text: { original: '', translated: '' },
        audio: null,
        error: 'Invalid audio data'
      };
    }

    // Step 1: Speech to text
    const { text: originalText, error: sttError } = await speechToText(audioBuffer, sourceLanguage);
    
    if (sttError || !originalText) {
      return {
        text: { original: '', translated: '' },
        audio: null,
        error: sttError || 'No speech detected'
      };
    }

    console.log('Transcribed text:', originalText);

    // Step 2: Translate text
    const { text: translatedText, error: translateError } = await translateText(
      originalText,
      sourceLanguage,
      targetLanguage
    );
    
    if (translateError) {
      return {
        text: { original: originalText, translated: '' },
        audio: null,
        error: translateError
      };
    }

    console.log('Translated text:', translatedText);

    // Step 3: Text to speech
    const { audio: translatedAudio, error: ttsError } = await textToSpeech(
      translatedText,
      targetLanguage
    );
    
    if (ttsError) {
      return {
        text: { original: originalText, translated: translatedText },
        audio: null,
        error: ttsError
      };
    }

    return {
      text: { original: originalText, translated: translatedText },
      audio: translatedAudio,
      error: null
    };
  } catch (error) {
    console.error('Speech translation error:', error);
    return {
      text: { original: '', translated: '' },
      audio: null,
      error: error.message
    };
  }
};

/**
 * Recognize speech from audio (voice-to-text only)
 * @param {Buffer} audioBuffer - Audio buffer
 * @param {string} sourceLanguage - Source language code
 * @returns {Promise<string>} - Recognized text
 */
const recognizeSpeech = async (audioBuffer, sourceLanguage) => {
  try {
    const result = await speechToText(audioBuffer, sourceLanguage);
    return result.text || '';
  } catch (error) {
    console.error('Speech recognition error:', error);
    return '';
  }
};

/**
 * Translate text only (no audio)
 * @param {string} text - Text to translate
 * @param {string} sourceLanguage - Source language code
 * @param {string} targetLanguage - Target language code
 * @returns {Promise<string>} - Translated text
 */
const translateTextOnly = async (text, sourceLanguage, targetLanguage) => {
  try {
    const result = await translateText(text, sourceLanguage, targetLanguage);
    return result.text || '';
  } catch (error) {
    console.error('Text translation error:', error);
    return '';
  }
};

module.exports = {
  translateSpeech,
  recognizeSpeech,
  translateText: translateTextOnly,
  speechToText,
  textToSpeech,
  synthesizeSpeech: textToSpeech, // Alias for group call handler
  normalizeLanguage
};
