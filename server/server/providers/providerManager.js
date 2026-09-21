const axios = require('axios');
const { RoomServiceClient } = require('livekit-server-sdk');
const ProviderConfig = require('../../lib/models/ProviderConfig');
const { encrypt, decrypt, maskKey } = require('../../lib/crypto');
const { config: envConfig } = require('../utils/env');

class ProviderManager {
  constructor() {
    this.initialized = false;
    this.cache = new Map(); // category -> config object
  }

  /**
   * Initializes default provider configs from DB or fallback to environment variables
   */
  async initialize() {
    try {
      const categories = ['pipeline', 'realtime', 'stt', 'tts', 'translation', 'sfu'];
      
      for (const category of categories) {
        const defaultData = this._getDefaultConfigForCategory(category);
        let dbDoc = await ProviderConfig.findOne({ category });
        
        if (!dbDoc) {
          // Create initial configuration seeded from current process.env / envConfig
          const encryptedProviders = this._encryptProvidersMap(defaultData.providers);
          
          dbDoc = await ProviderConfig.create({
            category,
            activeProvider: defaultData.activeProvider,
            providers: encryptedProviders
          });
        } else {
          // If doc exists, merge any new providers that were added to codebase
          const existingDecrypted = this._decryptProvidersMap(dbDoc.providers || {});
          let needsUpdate = false;

          for (const [pKey, pDef] of Object.entries(defaultData.providers || {})) {
            if (!existingDecrypted[pKey]) {
              existingDecrypted[pKey] = pDef;
              needsUpdate = true;
            } else {
              // Ensure name, model, endpoint defaults are present if missing
              for (const [field, val] of Object.entries(pDef)) {
                if (existingDecrypted[pKey][field] === undefined) {
                  existingDecrypted[pKey][field] = val;
                  needsUpdate = true;
                }
              }
            }
          }

          if (needsUpdate) {
            dbDoc.providers = this._encryptProvidersMap(existingDecrypted);
            dbDoc.markModified('providers');
            await dbDoc.save();
          }
        }
        
        // Decrypt and cache in memory, ensuring all default providers are present
        const decryptedProviders = this._decryptProvidersMap(dbDoc.providers || {});
        const mergedProviders = {
          ...(defaultData.providers || {}),
          ...decryptedProviders
        };

        const decryptedDoc = {
          category: dbDoc.category,
          activeProvider: dbDoc.activeProvider || defaultData.activeProvider,
          providers: mergedProviders
        };
        
        this.cache.set(category, decryptedDoc);
      }

      this._syncToRuntimeEnv();
      this.initialized = true;
      console.log('✅ ProviderManager initialized with active providers:', {
        stt: this.cache.get('stt')?.activeProvider,
        tts: this.cache.get('tts')?.activeProvider,
        translation: this.cache.get('translation')?.activeProvider,
        sfu: this.cache.get('sfu')?.activeProvider,
      });
    } catch (err) {
      console.error('⚠️ ProviderManager initialization error (falling back to env):', err.message);
      this._initializeFallbackFromEnv();
    }
  }

  /**
   * Fallback in case DB is unreachable during early startup
   */
  _initializeFallbackFromEnv() {
    const categories = ['pipeline', 'realtime', 'stt', 'tts', 'translation', 'sfu'];
    for (const category of categories) {
      const defaultData = this._getDefaultConfigForCategory(category);
      this.cache.set(category, defaultData);
    }
    this._syncToRuntimeEnv();
    this.initialized = true;
  }

  _getDefaultConfigForCategory(category) {
    switch (category) {
      case 'pipeline':
        return {
          category: 'pipeline',
          activeProvider: 'versionB_pipeline', // 'versionA_realtime' or 'versionB_pipeline'
          providers: {
            versionA_realtime: {
              name: 'Version A — Fastest MVP (Direct Realtime Audio)',
              description: 'Microphone → GPT Realtime Speech-to-Speech → Speaker',
              isConfigured: Boolean(process.env.OPENAI_API_KEY)
            },
            versionB_pipeline: {
              name: 'Version B — Maximum Control (Modular Pipeline)',
              description: 'Microphone → Streaming STT (Deepgram/Azure) → Translation LLM (GPT) → Streaming TTS (ElevenLabs/Azure) → Speaker',
              isConfigured: true
            }
          }
        };

      case 'realtime':
        return {
          category: 'realtime',
          activeProvider: 'openai',
          providers: {
            openai: {
              name: 'OpenAI GPT Realtime Speech-to-Speech',
              apiKey: process.env.OPENAI_API_KEY || '',
              model: 'gpt-4o-realtime-preview',
              voice: 'alloy', // alloy, echo, shimmer, verse, ballad, coral, sage
              instructions: 'You are an ultra-low-latency real-time multilingual speech translator. Listen to audio and respond directly with natural translated speech in the target language.',
              isConfigured: Boolean(process.env.OPENAI_API_KEY)
            }
          }
        };

      case 'translation':
        return {
          category: 'translation',
          activeProvider: 'azure',
          providers: {
            azure: {
              name: 'Azure Translator',
              apiKey: envConfig.AZURE_TRANSLATOR_KEY || process.env.AZURE_TRANSLATOR_KEY || '',
              region: envConfig.AZURE_TRANSLATOR_REGION || process.env.AZURE_TRANSLATOR_REGION || '',
              endpoint: envConfig.AZURE_TRANSLATOR_ENDPOINT || process.env.AZURE_TRANSLATOR_ENDPOINT || 'https://api.cognitive.microsofttranslator.com',
              isConfigured: Boolean(envConfig.AZURE_TRANSLATOR_KEY)
            },
            groq: {
              name: 'Groq (Ultra-Fast LPU Inference)',
              apiKey: process.env.GROQ_API_KEY || '',
              model: 'llama-3.3-70b-versatile',
              endpoint: 'https://api.groq.com/openai/v1',
              isConfigured: Boolean(process.env.GROQ_API_KEY)
            },
            openrouter: {
              name: 'OpenRouter (Universal Model Gateway)',
              apiKey: process.env.OPENROUTER_API_KEY || '',
              model: 'meta-llama/llama-3.3-70b-instruct',
              endpoint: 'https://openrouter.ai/api/v1',
              isConfigured: Boolean(process.env.OPENROUTER_API_KEY)
            },
            nvidia: {
              name: 'NVIDIA NIM (High-Performance LLM)',
              apiKey: process.env.NVIDIA_API_KEY || '',
              model: 'meta/llama-3.3-70b-instruct',
              endpoint: 'https://integrate.api.nvidia.com/v1',
              isConfigured: Boolean(process.env.NVIDIA_API_KEY)
            },
            openai: {
              name: 'OpenAI (GPT-4o mini)',
              apiKey: process.env.OPENAI_API_KEY || '',
              model: 'gpt-4o-mini',
              isConfigured: Boolean(process.env.OPENAI_API_KEY)
            },
            google: {
              name: 'Google Cloud Translation (NMT)',
              apiKey: process.env.GOOGLE_TRANSLATE_API_KEY || '',
              model: 'nmt',
              isConfigured: Boolean(process.env.GOOGLE_TRANSLATE_API_KEY)
            }
          }
        };

      case 'stt':
        return {
          category: 'stt',
          activeProvider: 'azure',
          providers: {
            azure: {
              name: 'Azure Speech Recognition',
              apiKey: envConfig.AZURE_SPEECH_KEY || process.env.AZURE_SPEECH_KEY || '',
              region: envConfig.AZURE_SPEECH_REGION || process.env.AZURE_SPEECH_REGION || '',
              endpoint: envConfig.AZURE_SPEECH_ENDPOINT || process.env.AZURE_SPEECH_ENDPOINT || '',
              isConfigured: Boolean(envConfig.AZURE_SPEECH_KEY)
            },
            groq: {
              name: 'Groq Whisper (Lightning-Fast STT)',
              apiKey: process.env.GROQ_API_KEY || '',
              model: 'whisper-large-v3-turbo',
              isConfigured: Boolean(process.env.GROQ_API_KEY)
            },
            deepgram: {
              name: 'Deepgram Nova-2 Streaming STT',
              apiKey: process.env.DEEPGRAM_API_KEY || '',
              model: 'nova-2',
              isConfigured: Boolean(process.env.DEEPGRAM_API_KEY)
            },
            nvidia: {
              name: 'NVIDIA Riva / Canary STT',
              apiKey: process.env.NVIDIA_API_KEY || '',
              model: 'nvidia/canary-1b',
              endpoint: 'https://integrate.api.nvidia.com/v1',
              isConfigured: Boolean(process.env.NVIDIA_API_KEY)
            },
            openai: {
              name: 'OpenAI Whisper',
              apiKey: process.env.OPENAI_API_KEY || '',
              model: 'whisper-1',
              isConfigured: Boolean(process.env.OPENAI_API_KEY)
            }
          }
        };

      case 'tts':
        return {
          category: 'tts',
          activeProvider: 'azure',
          providers: {
            azure: {
              name: 'Azure Neural TTS',
              apiKey: envConfig.AZURE_SPEECH_KEY || process.env.AZURE_SPEECH_KEY || '',
              region: envConfig.AZURE_SPEECH_REGION || process.env.AZURE_SPEECH_REGION || '',
              endpoint: envConfig.AZURE_SPEECH_ENDPOINT || process.env.AZURE_SPEECH_ENDPOINT || '',
              isConfigured: Boolean(envConfig.AZURE_SPEECH_KEY)
            },
            google: {
              name: 'Google Universal Neural TTS (Zero-Config / Multilingual)',
              apiKey: process.env.GOOGLE_TTS_API_KEY || '',
              voice: 'default',
              isConfigured: true
            },
            elevenlabs: {
              name: 'ElevenLabs Multilingual TTS',
              apiKey: process.env.ELEVENLABS_API_KEY || '',
              voiceId: '21m00Tcm4TlvDq8ikWAM', // Rachel
              model: 'eleven_multilingual_v2',
              isConfigured: Boolean(process.env.ELEVENLABS_API_KEY)
            },
            nvidia: {
              name: 'NVIDIA Riva TTS (Self-Hosted NIM / Riva Container)',
              apiKey: process.env.NVIDIA_API_KEY || '',
              voiceId: 'English-US.Female-1',
              endpoint: 'http://localhost:9000/v1',
              isConfigured: Boolean(process.env.NVIDIA_API_KEY)
            },
            openai: {
              name: 'OpenAI TTS',
              apiKey: process.env.OPENAI_API_KEY || '',
              model: 'tts-1',
              voice: 'alloy',
              isConfigured: Boolean(process.env.OPENAI_API_KEY)
            }
          }
        };

      case 'sfu':
        return {
          category: 'sfu',
          activeProvider: 'livekit',
          providers: {
            livekit: {
              name: 'LiveKit SFU',
              url: envConfig.LIVEKIT_URL || process.env.LIVEKIT_URL || 'ws://localhost:7880',
              apiKey: envConfig.LIVEKIT_API_KEY || process.env.LIVEKIT_API_KEY || '',
              apiSecret: envConfig.LIVEKIT_API_SECRET || process.env.LIVEKIT_API_SECRET || '',
              isConfigured: Boolean(envConfig.LIVEKIT_API_KEY && envConfig.LIVEKIT_API_SECRET)
            }
          }
        };

      default:
        return { category, activeProvider: '', providers: {} };
    }
  }

  _encryptProvidersMap(providers) {
    const encrypted = {};
    for (const [key, val] of Object.entries(providers || {})) {
      encrypted[key] = { ...val };
      if (val.apiKey) {
        encrypted[key].apiKey = encrypt(val.apiKey);
      }
      if (val.apiSecret) {
        encrypted[key].apiSecret = encrypt(val.apiSecret);
      }
    }
    return encrypted;
  }

  _decryptProvidersMap(providers) {
    const decrypted = {};
    for (const [key, val] of Object.entries(providers || {})) {
      decrypted[key] = { ...val };
      if (val.apiKey) {
        decrypted[key].apiKey = decrypt(val.apiKey);
      }
      if (val.apiSecret) {
        decrypted[key].apiSecret = decrypt(val.apiSecret);
      }
    }
    return decrypted;
  }

  /**
   * Sync active provider credentials into envConfig and process.env
   * so all legacy modules pick up changes in real time.
   */
  _syncToRuntimeEnv() {
    const sfu = this.cache.get('sfu');
    if (sfu && sfu.activeProvider === 'livekit') {
      const livekit = sfu.providers?.livekit;
      if (livekit) {
        envConfig.LIVEKIT_URL = livekit.url || envConfig.LIVEKIT_URL;
        envConfig.LIVEKIT_API_KEY = livekit.apiKey || envConfig.LIVEKIT_API_KEY;
        envConfig.LIVEKIT_API_SECRET = livekit.apiSecret || envConfig.LIVEKIT_API_SECRET;
        process.env.LIVEKIT_URL = envConfig.LIVEKIT_URL;
        process.env.LIVEKIT_API_KEY = envConfig.LIVEKIT_API_KEY;
        process.env.LIVEKIT_API_SECRET = envConfig.LIVEKIT_API_SECRET;

        try {
          const livekitManager = require('../sfu/LiveKitManager');
          if (livekitManager && typeof livekitManager.refresh === 'function') {
            livekitManager.refresh();
          }
        } catch (e) {
          // ignore circular load during initial bootstrap
        }
      }
    }

    const stt = this.cache.get('stt');
    if (stt && stt.activeProvider === 'azure') {
      const azure = stt.providers?.azure;
      if (azure) {
        envConfig.AZURE_SPEECH_KEY = azure.apiKey || envConfig.AZURE_SPEECH_KEY;
        envConfig.AZURE_SPEECH_REGION = azure.region || envConfig.AZURE_SPEECH_REGION;
        if (azure.endpoint) envConfig.AZURE_SPEECH_ENDPOINT = azure.endpoint;
        process.env.AZURE_SPEECH_KEY = envConfig.AZURE_SPEECH_KEY;
        process.env.AZURE_SPEECH_REGION = envConfig.AZURE_SPEECH_REGION;
      }
    }

    const tts = this.cache.get('tts');
    if (tts && tts.activeProvider === 'azure') {
      const azure = tts.providers?.azure;
      if (azure) {
        if (!envConfig.AZURE_SPEECH_KEY && azure.apiKey) {
          envConfig.AZURE_SPEECH_KEY = azure.apiKey;
          process.env.AZURE_SPEECH_KEY = azure.apiKey;
        }
        if (!envConfig.AZURE_SPEECH_REGION && azure.region) {
          envConfig.AZURE_SPEECH_REGION = azure.region;
          process.env.AZURE_SPEECH_REGION = azure.region;
        }
      }
    }

    const trans = this.cache.get('translation');
    if (trans && trans.activeProvider === 'azure') {
      const azure = trans.providers?.azure;
      if (azure) {
        envConfig.AZURE_TRANSLATOR_KEY = azure.apiKey || envConfig.AZURE_TRANSLATOR_KEY;
        envConfig.AZURE_TRANSLATOR_REGION = azure.region || envConfig.AZURE_TRANSLATOR_REGION;
        envConfig.AZURE_TRANSLATOR_ENDPOINT = azure.endpoint || envConfig.AZURE_TRANSLATOR_ENDPOINT;
        process.env.AZURE_TRANSLATOR_KEY = envConfig.AZURE_TRANSLATOR_KEY;
        process.env.AZURE_TRANSLATOR_REGION = envConfig.AZURE_TRANSLATOR_REGION;
        process.env.AZURE_TRANSLATOR_ENDPOINT = envConfig.AZURE_TRANSLATOR_ENDPOINT;
      }
    }
  }

  /**
   * Returns category config with secrets decrypted for backend usage
   */
  getCategoryConfig(category) {
    return this.cache.get(category) || this._getDefaultConfigForCategory(category);
  }

  /**
   * Returns active provider data for a category
   */
  getActiveProvider(category) {
    const config = this.getCategoryConfig(category);
    const activeKey = config.activeProvider;
    return {
      providerName: activeKey,
      config: config.providers?.[activeKey] || {}
    };
  }

  /**
   * Returns masked provider configuration safe for Superadmin UI
   */
  getMaskedConfigs() {
    const result = {};
    const categories = ['pipeline', 'realtime', 'stt', 'tts', 'translation', 'sfu'];

    for (const category of categories) {
      const defaultData = this._getDefaultConfigForCategory(category);
      const cached = this.cache.get(category) || defaultData;
      
      const mergedProviders = {
        ...(defaultData.providers || {}),
        ...(cached.providers || {})
      };

      result[category] = {
        category,
        activeProvider: cached.activeProvider || defaultData.activeProvider,
        providers: {}
      };

      for (const [pKey, pVal] of Object.entries(mergedProviders)) {
        result[category].providers[pKey] = {
          ...pVal,
          apiKey: pVal.apiKey ? maskKey(pVal.apiKey) : '',
          apiSecret: pVal.apiSecret ? maskKey(pVal.apiSecret) : '',
          hasKey: Boolean(pVal.apiKey),
          hasSecret: Boolean(pVal.apiSecret)
        };
      }
    }
    return result;
  }

  /**
   * Updates a category configuration and saves to DB
   */
  async updateCategoryConfig(category, updates, userId) {
    const current = this.getCategoryConfig(category);
    
    // Merge providers
    const updatedProviders = { ...(current.providers || {}) };
    
    if (updates.providers) {
      for (const [pKey, pVal] of Object.entries(updates.providers)) {
        const existing = updatedProviders[pKey] || {};
        
        // Don't overwrite key if masked or unchanged
        let apiKey = pVal.apiKey;
        if (!apiKey || apiKey.startsWith('••••••••')) {
          apiKey = existing.apiKey || '';
        }

        let apiSecret = pVal.apiSecret;
        if (!apiSecret || apiSecret.startsWith('••••••••')) {
          apiSecret = existing.apiSecret || '';
        }

        updatedProviders[pKey] = {
          ...existing,
          ...pVal,
          apiKey,
          apiSecret,
          isConfigured: Boolean(apiKey)
        };
      }
    }

    const activeProvider = updates.activeProvider || current.activeProvider;

    // Encrypt secrets for DB
    const dbProviders = this._encryptProvidersMap(updatedProviders);

    await ProviderConfig.findOneAndUpdate(
      { category },
      {
        category,
        activeProvider,
        providers: dbProviders,
        updatedBy: userId
      },
      { upsert: true, new: true }
    );

    // Update in-memory cache with plaintext
    this.cache.set(category, {
      category,
      activeProvider,
      providers: updatedProviders
    });

    this._syncToRuntimeEnv();

    return this.getMaskedConfigs()[category];
  }

  /**
   * Tests connection for a specific provider
   */
  async testConnection(category, providerName, testCredentials = {}) {
    // If testCredentials contains masked keys, pull the real ones from cache
    const cached = this.getCategoryConfig(category)?.providers?.[providerName] || {};
    const creds = {
      ...cached,
      ...testCredentials
    };

    if (creds.apiKey && creds.apiKey.startsWith('••••••••')) {
      creds.apiKey = cached.apiKey;
    }
    if (creds.apiSecret && creds.apiSecret.startsWith('••••••••')) {
      creds.apiSecret = cached.apiSecret;
    }

    try {
      if (providerName === 'azure') {
        if (category === 'translation') {
          return await this._testAzureTranslator(creds);
        } else {
          return await this._testAzureSpeech(creds);
        }
      } else if (providerName === 'livekit') {
        return await this._testLiveKit(creds);
      } else if (providerName === 'openai') {
        return await this._testOpenAI(creds);
      } else if (providerName === 'deepgram') {
        return await this._testDeepgram(creds);
      } else if (providerName === 'elevenlabs') {
        return await this._testElevenLabs(creds);
      } else if (providerName === 'groq') {
        return await this._testGroq(creds);
      } else if (providerName === 'openrouter') {
        return await this._testOpenRouter(creds);
      } else if (providerName === 'nvidia') {
        return await this._testNvidia(creds);
      } else if (providerName === 'google') {
        return await this._testGoogle(creds, category);
      } else {
        throw new Error(`Testing not supported for provider '${providerName}'`);
      }
    } catch (err) {
      return {
        success: false,
        error: err.response?.data?.error?.message || err.response?.data?.message || err.message || 'Connection test failed'
      };
    }
  }

  async _testAzureSpeech(creds) {
    const { apiKey, region } = creds;
    if (!apiKey || !region) {
      throw new Error('API Key and Region are required for Azure Speech');
    }

    const url = `https://${region}.api.cognitive.microsoft.com/sts/v1.0/issueToken`;
    const res = await axios.post(url, null, {
      headers: {
        'Ocp-Apim-Subscription-Key': apiKey,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      timeout: 8000
    });

    if (res.status === 200) {
      return { success: true, message: 'Azure Speech connection verified successfully!' };
    }
    throw new Error(`Azure returned status: ${res.status}`);
  }

  async _testAzureTranslator(creds) {
    const { apiKey, region, endpoint } = creds;
    if (!apiKey) {
      throw new Error('API Key is required for Azure Translator');
    }

    const baseUrl = (endpoint || 'https://api.cognitive.microsofttranslator.com').replace(/\/$/, '');
    const headers = {
      'Ocp-Apim-Subscription-Key': apiKey
    };
    if (region) {
      headers['Ocp-Apim-Subscription-Region'] = region;
    }

    const res = await axios.get(`${baseUrl}/languages?api-version=3.0&scope=translation`, {
      headers,
      timeout: 8000
    });

    if (res.status === 200 && res.data?.translation) {
      return { success: true, message: 'Azure Translator connection verified successfully!' };
    }
    throw new Error(`Azure Translator returned status: ${res.status}`);
  }

  async _testLiveKit(creds) {
    const { url, apiKey, apiSecret } = creds;
    if (!url || !apiKey || !apiSecret) {
      throw new Error('LiveKit URL, API Key, and API Secret are all required');
    }

    const httpUrl = url.replace(/^ws/, 'http');
    const svc = new RoomServiceClient(httpUrl, apiKey, apiSecret);
    await svc.listRooms();

    return { success: true, message: 'LiveKit SFU connection verified successfully!' };
  }

  async _testOpenAI(creds) {
    const { apiKey } = creds;
    if (!apiKey) {
      throw new Error('OpenAI API Key is required');
    }

    const res = await axios.get('https://api.openai.com/v1/models', {
      headers: {
        'Authorization': `Bearer ${apiKey}`
      },
      timeout: 8000
    });

    if (res.status === 200) {
      return { success: true, message: 'OpenAI API key verified successfully!' };
    }
    throw new Error(`OpenAI returned status: ${res.status}`);
  }

  async _testGoogle(creds, category) {
    const { apiKey } = creds;
    if (!apiKey) {
      if (category === 'tts') {
        return { success: true, message: 'Google Universal Neural TTS is ready (zero-config multilingual fallback enabled)!' };
      }
      throw new Error('Google API Key is required');
    }

    const res = await axios.get(`https://translation.googleapis.com/language/translate/v2/languages?key=${apiKey}`, {
      timeout: 8000
    });

    if (res.status === 200) {
      return { success: true, message: 'Google API key verified successfully!' };
    }
    throw new Error(`Google returned status: ${res.status}`);
  }

  async _testDeepgram(creds) {
    const { apiKey } = creds;
    if (!apiKey) {
      throw new Error('Deepgram API Key is required');
    }

    const res = await axios.get('https://api.deepgram.com/v1/projects', {
      headers: {
        'Authorization': `Token ${apiKey}`
      },
      timeout: 8000
    });

    if (res.status === 200) {
      return { success: true, message: 'Deepgram STT connection verified successfully!' };
    }
    throw new Error(`Deepgram returned status: ${res.status}`);
  }

  async _testElevenLabs(creds) {
    const { apiKey } = creds;
    if (!apiKey) {
      throw new Error('ElevenLabs API Key is required');
    }

    const res = await axios.get('https://api.elevenlabs.io/v1/voices', {
      headers: {
        'xi-api-key': apiKey
      },
      timeout: 8000
    });

    if (res.status === 200) {
      return { success: true, message: 'ElevenLabs TTS connection verified successfully!' };
    }
    throw new Error(`ElevenLabs returned status: ${res.status}`);
  }

  async _testGroq(creds) {
    const { apiKey } = creds;
    if (!apiKey) {
      throw new Error('Groq API Key is required');
    }

    const res = await axios.get('https://api.groq.com/openai/v1/models', {
      headers: {
        'Authorization': `Bearer ${apiKey}`
      },
      timeout: 8000
    });

    if (res.status === 200) {
      return { success: true, message: 'Groq connection verified successfully!' };
    }
    throw new Error(`Groq returned status: ${res.status}`);
  }

  async _testOpenRouter(creds) {
    const { apiKey } = creds;
    if (!apiKey) {
      throw new Error('OpenRouter API Key is required');
    }

    const res = await axios.get('https://openrouter.ai/api/v1/models', {
      headers: {
        'Authorization': `Bearer ${apiKey}`
      },
      timeout: 8000
    });

    if (res.status === 200) {
      return { success: true, message: 'OpenRouter connection verified successfully!' };
    }
    throw new Error(`OpenRouter returned status: ${res.status}`);
  }

  async _testNvidia(creds) {
    const { apiKey, endpoint } = creds;
    if (!apiKey) {
      throw new Error('NVIDIA API Key is required');
    }

    const baseUrl = (endpoint || 'https://integrate.api.nvidia.com/v1').replace(/\/$/, '');
    const res = await axios.get(`${baseUrl}/models`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`
      },
      timeout: 8000
    });

    if (res.status === 200) {
      return { success: true, message: 'NVIDIA NIM connection verified successfully!' };
    }
    throw new Error(`NVIDIA returned status: ${res.status}`);
  }
}

const providerManager = new ProviderManager();

module.exports = providerManager;
