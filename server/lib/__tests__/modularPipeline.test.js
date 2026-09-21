jest.mock('p-limit', () => () => (fn) => fn());
jest.mock('axios');

const providerManager = require('../../server/providers/providerManager');
const translationService = require('../../server/providers/translationService');
const ttsService = require('../../server/providers/ttsService');
const sttService = require('../../server/providers/sttService');
const { translateText } = require('../../server/utils/speechTranslator');
const { textToSpeech, getCachedOrSynthesize } = require('../../server/utils/textToSpeechModule');
const axios = require('axios');

describe('Modular Multi-Stage Pipeline Dispatchers', () => {
  beforeAll(() => {
    providerManager._initializeFallbackFromEnv();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Stage 1: Speech-to-Text (sttService)', () => {
    test('dispatches to Groq Whisper when active provider is groq', async () => {
      providerManager.cache.set('stt', {
        category: 'stt',
        activeProvider: 'groq',
        providers: {
          groq: { apiKey: 'test-groq-key', model: 'whisper-large-v3-turbo' }
        }
      });

      axios.post.mockResolvedValueOnce({
        data: { text: 'Hello, how are you?' }
      });

      const audioBuffer = Buffer.from('fake-audio-bytes');
      const result = await sttService.recognizeSpeech({ audioBuffer, language: 'en' });

      expect(axios.post).toHaveBeenCalledWith(
        'https://api.groq.com/openai/v1/audio/transcriptions',
        expect.any(FormData),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test-groq-key'
          })
        })
      );
      expect(result).toBe('Hello, how are you?');
    });

    test('dispatches to Deepgram when active provider is deepgram', async () => {
      providerManager.cache.set('stt', {
        category: 'stt',
        activeProvider: 'deepgram',
        providers: {
          deepgram: { apiKey: 'test-dg-key', model: 'nova-2' }
        }
      });

      axios.post.mockResolvedValueOnce({
        data: {
          results: {
            channels: [{ alternatives: [{ transcript: 'Testing deepgram audio' }] }]
          }
        }
      });

      const audioBuffer = Buffer.from('fake-audio-bytes');
      const result = await sttService.recognizeSpeech({ audioBuffer, language: 'en' });

      expect(axios.post).toHaveBeenCalledWith(
        expect.stringContaining('api.deepgram.com/v1/listen?model=nova-2'),
        audioBuffer,
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Token test-dg-key'
          })
        })
      );
      expect(result).toBe('Testing deepgram audio');
    });

    test('returns empty string for empty audio buffer without errors', async () => {
      const result = await sttService.recognizeSpeech({ audioBuffer: null });
      expect(result).toBe('');
    });
  });

  describe('Stage 2: Translation LLM (translationService & speechTranslator)', () => {
    test('dispatches to Groq LLM when active translation provider is groq', async () => {
      providerManager.cache.set('translation', {
        category: 'translation',
        activeProvider: 'groq',
        providers: {
          groq: {
            apiKey: 'test-groq-key',
            model: 'llama-3.3-70b-versatile',
            endpoint: 'https://api.groq.com/openai/v1'
          }
        }
      });

      axios.post.mockResolvedValueOnce({
        data: {
          choices: [
            {
              message: {
                content: JSON.stringify(['Bonjour tout le monde'])
              }
            }
          ]
        }
      });

      const results = await translationService.translateBatch({
        texts: ['Hello everyone'],
        sourceLang: 'en',
        targetLang: 'fr'
      });

      expect(results).toHaveLength(1);
      expect(results[0].text).toBe('Bonjour tout le monde');
      expect(axios.post).toHaveBeenCalledWith(
        'https://api.groq.com/openai/v1/chat/completions',
        expect.objectContaining({
          model: 'llama-3.3-70b-versatile',
          messages: expect.any(Array)
        }),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test-groq-key'
          })
        })
      );
    });

    test('dispatches to Google NMT when active translation provider is google', async () => {
      providerManager.cache.set('translation', {
        category: 'translation',
        activeProvider: 'google',
        providers: {
          google: {
            apiKey: 'test-google-key',
            model: 'nmt'
          }
        }
      });

      axios.post.mockResolvedValueOnce({
        data: {
          data: {
            translations: [{ translatedText: 'Hola mundo' }]
          }
        }
      });

      const results = await translationService.translateBatch({
        texts: ['Hello world'],
        sourceLang: 'en',
        targetLang: 'es'
      });

      expect(results[0].text).toBe('Hola mundo');
      expect(axios.post).toHaveBeenCalledWith(
        expect.stringContaining('https://translation.googleapis.com/language/translate/v2?key=test-google-key'),
        expect.objectContaining({
          target: 'es',
          model: 'nmt'
        }),
        expect.any(Object)
      );
    });

    test('speechTranslator.translateText correctly calls active provider', async () => {
      providerManager.cache.set('translation', {
        category: 'translation',
        activeProvider: 'openai',
        providers: {
          openai: {
            apiKey: 'test-openai-key',
            model: 'gpt-4o-mini'
          }
        }
      });

      axios.post.mockResolvedValueOnce({
        data: {
          choices: [
            {
              message: {
                content: JSON.stringify(['Namaste'])
              }
            }
          ]
        }
      });

      const translated = await translateText('Hello', 'en', 'hi');
      expect(translated).toBe('Namaste');
    });
  });

  describe('Stage 3: Text-to-Speech (ttsService & textToSpeechModule)', () => {
    test('dispatches to ElevenLabs when active TTS provider is elevenlabs', async () => {
      providerManager.cache.set('tts', {
        category: 'tts',
        activeProvider: 'elevenlabs',
        providers: {
          elevenlabs: {
            apiKey: 'test-el-key',
            voiceId: '21m00Tcm4TlvDq8ikWAM',
            model: 'eleven_multilingual_v2'
          }
        }
      });

      const fakeAudio = Buffer.from('mp3-audio-bytes');
      axios.post.mockResolvedValueOnce({
        data: fakeAudio
      });

      const audioResult = await ttsService.synthesizeSpeech({ text: 'Welcome to Vaani', language: 'en' });
      expect(audioResult).toBeInstanceOf(Buffer);
      expect(axios.post).toHaveBeenCalledWith(
        'https://api.elevenlabs.io/v1/text-to-speech/21m00Tcm4TlvDq8ikWAM',
        expect.objectContaining({
          text: 'Welcome to Vaani',
          model_id: 'eleven_multilingual_v2'
        }),
        expect.objectContaining({
          headers: expect.objectContaining({
            'xi-api-key': 'test-el-key'
          })
        })
      );
    });

    test('dispatches to OpenAI TTS when active TTS provider is openai', async () => {
      providerManager.cache.set('tts', {
        category: 'tts',
        activeProvider: 'openai',
        providers: {
          openai: {
            apiKey: 'test-oa-key',
            model: 'tts-1',
            voice: 'alloy'
          }
        }
      });

      const fakeAudio = Buffer.from('openai-mp3-bytes');
      axios.post.mockResolvedValueOnce({
        data: fakeAudio
      });

      const audioResult = await ttsService.synthesizeSpeech({ text: 'Hello from OpenAI TTS', language: 'en' });
      expect(audioResult).toBeInstanceOf(Buffer);
      expect(axios.post).toHaveBeenCalledWith(
        'https://api.openai.com/v1/audio/speech',
        expect.objectContaining({
          input: 'Hello from OpenAI TTS',
          model: 'tts-1',
          voice: 'alloy'
        }),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test-oa-key'
          })
        })
      );
    });

    test('textToSpeechModule.getCachedOrSynthesize caches audio and reuses it', async () => {
      providerManager.cache.set('tts', {
        category: 'tts',
        activeProvider: 'openai',
        providers: {
          openai: {
            apiKey: 'test-oa-key',
            model: 'tts-1',
            voice: 'alloy'
          }
        }
      });

      const fakeAudio = Buffer.from('cached-audio-bytes');
      axios.post.mockResolvedValueOnce({
        data: fakeAudio
      });

      const firstCall = await getCachedOrSynthesize('Unique phrase to cache', 'en');
      expect(firstCall).toBeInstanceOf(Buffer);
      expect(axios.post).toHaveBeenCalledTimes(1);

      // Second call should hit the LRU cache and NOT invoke axios again
      const secondCall = await getCachedOrSynthesize('Unique phrase to cache', 'en');
      expect(secondCall).toBeInstanceOf(Buffer);
      expect(axios.post).toHaveBeenCalledTimes(1);
    });

    test('cascades gracefully to Google Universal TTS fallback when primary provider fails', async () => {
      providerManager.cache.set('tts', {
        category: 'tts',
        activeProvider: 'nvidia',
        providers: {
          nvidia: {
            endpoint: 'https://integrate.api.nvidia.com/v1',
            apiKey: 'test-nv-key'
          }
        }
      });

      const fallbackAudio = Buffer.from('google-tts-audio-bytes');
      axios.get.mockResolvedValueOnce({
        status: 200,
        data: fallbackAudio
      });

      const audio = await ttsService.synthesizeSpeech({ text: 'Namaste', language: 'hi' });
      expect(audio).toBeInstanceOf(Buffer);
      expect(axios.get).toHaveBeenCalledWith(
        expect.stringContaining('translate.google.com/translate_tts'),
        expect.any(Object)
      );
    });
  });
});
