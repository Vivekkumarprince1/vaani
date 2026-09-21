import React, { useState } from 'react';
import axios from 'axios';

const DEFAULT_PROVIDERS = {
  realtime: {
    openai: {
      name: 'OpenAI GPT Realtime Speech-to-Speech',
      model: 'gpt-4o-realtime-preview',
      voice: 'alloy',
      description: 'Direct speech-to-speech voice agent'
    }
  },
  stt: {
    groq: {
      name: 'Groq Whisper (Lightning-Fast STT)',
      model: 'whisper-large-v3-turbo',
      description: 'Sub-200ms ultra-fast transcription on Groq LPU'
    },
    deepgram: {
      name: 'Deepgram Nova-2 Streaming STT',
      model: 'nova-2',
      description: 'Production-grade streaming speech-to-text'
    },
    nvidia: {
      name: 'NVIDIA Riva / Canary STT',
      model: 'nvidia/canary-1b',
      endpoint: 'https://integrate.api.nvidia.com/v1',
      description: 'NVIDIA Canary-1B / Riva multilingual STT'
    },
    azure: {
      name: 'Azure Speech Recognition',
      description: 'Microsoft Azure cognitive speech services'
    },
    openai: {
      name: 'OpenAI Whisper',
      model: 'whisper-1',
      description: 'OpenAI Whisper model'
    }
  },
  translation: {
    groq: {
      name: 'Groq (Ultra-Fast LPU Inference)',
      model: 'llama-3.3-70b-versatile',
      endpoint: 'https://api.groq.com/openai/v1',
      description: 'Groq LPU Engine (~1,000 tok/sec Llama 3.3)'
    },
    openrouter: {
      name: 'OpenRouter (Universal Model Gateway)',
      model: 'meta-llama/llama-3.3-70b-instruct',
      endpoint: 'https://openrouter.ai/api/v1',
      description: 'Access Claude, Gemini, Llama 3.3, Mistral, DeepSeek via single key'
    },
    nvidia: {
      name: 'NVIDIA NIM (High-Performance LLM)',
      model: 'meta/llama-3.3-70b-instruct',
      endpoint: 'https://integrate.api.nvidia.com/v1',
      description: 'Enterprise NVIDIA NIM microservices inference'
    },
    azure: {
      name: 'Azure Translator',
      description: 'Microsoft Cognitive Services Translator'
    },
    openai: {
      name: 'OpenAI (GPT-4o mini)',
      model: 'gpt-4o-mini',
      description: 'OpenAI GPT-4o mini translation prompt engine'
    },
    google: {
      name: 'Google Cloud Translation (NMT)',
      model: 'nmt',
      description: 'Google Cloud Translation API v2 Neural Machine Translation'
    }
  },
  tts: {
    elevenlabs: {
      name: 'ElevenLabs Multilingual TTS',
      model: 'eleven_multilingual_v2',
      voiceId: '21m00Tcm4TlvDq8ikWAM',
      description: 'Ultra-realistic human-like voice synthesis'
    },
    nvidia: {
      name: 'NVIDIA Riva FastPitch TTS',
      voiceId: 'English-US.Female-1',
      endpoint: 'https://integrate.api.nvidia.com/v1',
      description: 'NVIDIA Riva FastPitch neural TTS'
    },
    azure: {
      name: 'Azure Neural TTS',
      description: 'Microsoft Azure Neural Speech synthesis'
    },
    openai: {
      name: 'OpenAI TTS',
      model: 'tts-1',
      voice: 'alloy',
      description: 'OpenAI Text-to-Speech'
    }
  },
  sfu: {
    livekit: {
      name: 'LiveKit SFU',
      url: 'ws://localhost:7880',
      description: 'LiveKit WebRTC SFU Media Router'
    }
  }
};

const PROVIDER_GUIDES = {
  google: {
    portalName: 'Google Cloud Console',
    portalUrl: 'https://console.cloud.google.com/apis/credentials',
    docUrl: 'https://docs.cloud.google.com/translate/docs/advanced/nmt-model',
    overviewUrl: 'https://docs.cloud.google.com/translate/docs/api-overview',
    howToGetKey: [
      'Open Google Cloud Console (console.cloud.google.com) and select or create your project.',
      'Go to APIs & Services > Library and search for "Cloud Translation API", then click Enable.',
      'Navigate to APIs & Services > Credentials, click "+ CREATE CREDENTIALS", and select "API key".',
      'Copy your generated API Key and paste it into the field below.'
    ],
    models: [
      { id: 'nmt', label: 'Neural Machine Translation (NMT)', tag: 'Recommended', desc: 'Google Cloud NMT deep-learning translation model across 100+ languages' },
      { id: 'base', label: 'Standard Phrase-Based (PBMT)', tag: 'Legacy', desc: 'Legacy statistical phrase-based translation model' }
    ]
  },
  groq: {
    portalName: 'Groq Cloud Console',
    portalUrl: 'https://console.groq.com/keys',
    docUrl: 'https://console.groq.com/docs/models',
    howToGetKey: [
      'Sign in to Groq Console (console.groq.com).',
      'Navigate to "API Keys" in the left sidebar menu.',
      'Click "Create API Key", provide a name (e.g. "Vaani"), and copy the gsk_... key.',
      'Groq provides ultra-low latency LPU inference with thousands of free tokens/day.'
    ],
    models: {
      stt: [
        { id: 'whisper-large-v3-turbo', label: 'Whisper Large v3 Turbo', tag: 'Fastest (~150ms)', desc: 'Optimized Whisper model running on Groq LPUs with sub-second turnaround' },
        { id: 'whisper-large-v3', label: 'Whisper Large v3', tag: 'High Accuracy', desc: 'Full multilingual Whisper v3 model' },
        { id: 'distil-whisper-large-v3-en', label: 'Distil-Whisper English', tag: 'English Only', desc: 'Lightweight distilled English speech recognition' }
      ],
      translation: [
        { id: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B Versatile', tag: 'Recommended (~1000 tps)', desc: 'State-of-the-art multilingual reasoning at blazing speed' },
        { id: 'llama-3.1-8b-instant', label: 'Llama 3.1 8B Instant', tag: 'Ultra-Fast', desc: 'Extremely lightweight and instant response translation' },
        { id: 'mixtral-8x7b-32768', label: 'Mixtral 8x7B', tag: 'MOE Architecture', desc: 'High accuracy European and Asian language translation' }
      ]
    }
  },
  openrouter: {
    portalName: 'OpenRouter Dashboard',
    portalUrl: 'https://openrouter.ai/keys',
    docUrl: 'https://openrouter.ai/models',
    howToGetKey: [
      'Sign in to openrouter.ai and go to Account > Keys.',
      'Click "Create Key", name it (e.g. "Vaani"), and set a credit limit if desired.',
      'OpenRouter allows calling Claude, GPT-4, Llama 3.3, Gemini 2.0, DeepSeek, and Mistral through a single unified API.'
    ],
    models: [
      { id: 'meta-llama/llama-3.3-70b-instruct', label: 'Meta Llama 3.3 70B Instruct', tag: 'Recommended', desc: 'High quality multilingual translation at very low cost' },
      { id: 'anthropic/claude-3.5-sonnet', label: 'Claude 3.5 Sonnet', tag: 'Best Nuance', desc: 'Exceptional contextual translation and colloquial nuance' },
      { id: 'google/gemini-2.0-flash-001', label: 'Google Gemini 2.0 Flash', tag: 'Low Latency', desc: 'Google next-gen high-speed multimodal LLM' },
      { id: 'deepseek/deepseek-chat', label: 'DeepSeek V3', tag: 'Cost Effective', desc: 'Ultra-low cost high-performance open model' },
      { id: 'mistralai/mistral-large-2411', label: 'Mistral Large', tag: 'European Master', desc: 'Specialized high-precision European translations' }
    ]
  },
  nvidia: {
    portalName: 'NVIDIA API Catalog (build.nvidia.com)',
    portalUrl: 'https://build.nvidia.com',
    docUrl: 'https://docs.nvidia.com/nim/',
    howToGetKey: [
      'Go to build.nvidia.com and sign in with your NVIDIA Developer account.',
      'Select any NIM model (e.g. Llama 3.3 70B or Canary-1B).',
      'Click "Get API Key" to generate a free personal API key (nvapi-...) with 1,000 free inference credits.',
      'Paste your nvapi-... key below.'
    ],
    models: {
      translation: [
        { id: 'meta/llama-3.3-70b-instruct', label: 'Llama 3.3 70B NIM', tag: 'Recommended', desc: 'Hosted on NVIDIA DGX Cloud with TensorRT-LLM acceleration' },
        { id: 'mistralai/mixtral-8x22b-instruct-v0.1', label: 'Mixtral 8x22B NIM', tag: 'High Context', desc: 'High capacity multi-expert model' }
      ],
      stt: [
        { id: 'nvidia/canary-1b', label: 'NVIDIA Canary-1B', tag: 'Top Accuracy', desc: 'Multi-lingual ASR and translation speech model' },
        { id: 'nvidia/parakeet-ctc-1.1b-asr', label: 'NVIDIA Parakeet 1.1B', tag: 'Fast ASR', desc: 'High-throughput English & multilingual transcription' }
      ],
      tts: [
        { id: 'English-US.Female-1', label: 'FastPitch Female-1', tag: 'Natural', desc: 'NVIDIA Riva FastPitch US Female neural voice' },
        { id: 'English-US.Male-1', label: 'FastPitch Male-1', tag: 'Deep Tone', desc: 'NVIDIA Riva FastPitch US Male neural voice' }
      ]
    }
  },
  openai: {
    portalName: 'OpenAI Developer Platform',
    portalUrl: 'https://platform.openai.com/api-keys',
    docUrl: 'https://platform.openai.com/docs/models',
    howToGetKey: [
      'Go to platform.openai.com and sign in.',
      'Go to "API Keys" in the dashboard left menu.',
      'Click "+ Create new secret key", copy the key (sk-proj-...), and paste it below.',
      'Ensure your OpenAI account has billing credits added in Settings > Billing.'
    ],
    models: {
      realtime: [
        { id: 'gpt-4o-realtime-preview', label: 'GPT-4o Realtime Preview', tag: 'Flagship', desc: 'Direct speech-to-speech low-latency voice model' },
        { id: 'gpt-4o-mini-realtime-preview', label: 'GPT-4o Mini Realtime Preview', tag: 'Lower Cost', desc: 'Faster and more economical real-time voice translation' }
      ],
      translation: [
        { id: 'gpt-4o-mini', label: 'GPT-4o Mini', tag: 'Fast & Cheap', desc: 'High accuracy translation with minimal token cost' },
        { id: 'gpt-4o', label: 'GPT-4o', tag: 'Highest Quality', desc: 'Flagship reasoning and nuance across complex idioms' },
        { id: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo', tag: 'Legacy', desc: 'Standard translation engine' }
      ],
      stt: [
        { id: 'whisper-1', label: 'Whisper 1', tag: 'Default', desc: 'OpenAI multi-lingual speech transcription model' }
      ],
      tts: [
        { id: 'tts-1', label: 'TTS-1 (Standard)', tag: 'Low Latency', desc: 'Optimized for real-time speech generation' },
        { id: 'tts-1-hd', label: 'TTS-1 HD (High Definition)', tag: 'Studio Audio', desc: 'Highest audio quality and fidelity' }
      ]
    }
  },
  azure: {
    portalName: 'Azure Portal',
    portalUrl: 'https://portal.azure.com/#blade/HubsExtension/BrowseResource/resourceType/Microsoft.CognitiveServices%2Faccounts',
    docUrl: 'https://learn.microsoft.com/en-us/azure/ai-services/translator/',
    howToGetKey: [
      'Log in to portal.azure.com and navigate to Azure AI Services.',
      'Create a "Speech Service" or "Translator" resource.',
      'Go to "Keys and Endpoint" under Resource Management in your resource.',
      'Copy Key 1 (or Key 2) and your Region (e.g. eastus, centralindia, eastasia).'
    ]
  },
  deepgram: {
    portalName: 'Deepgram Console',
    portalUrl: 'https://console.deepgram.com',
    docUrl: 'https://developers.deepgram.com/docs/models-languages-overview',
    howToGetKey: [
      'Log in to console.deepgram.com.',
      'Navigate to API Keys in your project.',
      'Click "Create a New API Key" with Member or Admin scope.',
      'Copy the token and paste it below. (New accounts receive $200 free credit).'
    ],
    models: [
      { id: 'nova-2', label: 'Nova-2', tag: 'Flagship', desc: 'Deepgram fastest and most accurate streaming STT model' },
      { id: 'nova-2-general', label: 'Nova-2 General', tag: 'Conversational', desc: 'Tuned for multi-speaker phone and meeting audio' },
      { id: 'nova-2-meeting', label: 'Nova-2 Meeting', tag: 'Conference', desc: 'Optimized for video call rooms and overlapping speakers' }
    ]
  },
  elevenlabs: {
    portalName: 'ElevenLabs Dashboard',
    portalUrl: 'https://elevenlabs.io/app/settings/api-keys',
    docUrl: 'https://elevenlabs.io/docs/overview',
    howToGetKey: [
      'Sign in to elevenlabs.io and click your profile at bottom-left > API Keys.',
      'Click "Create API Key", copy it and paste it below.',
      'To find Voice IDs: Go to Voices Library, select any voice (e.g. Rachel: 21m00Tcm4TlvDq8ikWAM), and copy its Voice ID.'
    ],
    models: [
      { id: 'eleven_multilingual_v2', label: 'Eleven Multilingual v2', tag: 'High Quality', desc: '29 languages with rich human emotion and inflection' },
      { id: 'eleven_turbo_v2_5', label: 'Eleven Turbo v2.5', tag: 'Ultra Low Latency', desc: 'Sub-400ms synthesis for real-time conversation' }
    ]
  },
  livekit: {
    portalName: 'LiveKit Cloud Console',
    portalUrl: 'https://cloud.livekit.io',
    docUrl: 'https://docs.livekit.io',
    howToGetKey: [
      'Sign in to cloud.livekit.io (or your self-hosted LiveKit instance).',
      'Select your project and go to Settings > Keys.',
      'Copy the WebSocket URL (wss://your-project.livekit.cloud), API Key, and API Secret.'
    ]
  }
};

const getProviderModelsForStage = (providerKey, stage) => {
  const guide = PROVIDER_GUIDES[providerKey];
  if (!guide || !guide.models) return [];
  if (Array.isArray(guide.models)) return guide.models;
  return guide.models[stage] || [];
};

const ProvidersTab = ({ configs, isSuperAdmin, onConfigUpdated }) => {
  const currentPipelineMode = configs?.pipeline?.activeProvider || 'versionB_pipeline';
  const [pipelineMode, setPipelineMode] = useState(currentPipelineMode);
  const [activeCategory, setActiveCategory] = useState('stt');
  const [formData, setFormData] = useState({});
  const [testStatus, setTestStatus] = useState({});
  const [saveStatus, setSaveStatus] = useState({ loading: false, message: '', error: '' });
  const [showKeyInputs, setShowKeyInputs] = useState({});

  const API_URL = import.meta.env.VITE_API_URL || '/api';

  const categoryLabels = {
    stt: '1. Streaming STT',
    translation: '2. Translation LLM',
    tts: '3. Streaming TTS',
    sfu: '4. Transport (SFU)'
  };

  const handleSwitchPipelineMode = async (mode) => {
    if (!isSuperAdmin) return;
    setPipelineMode(mode);
    setSaveStatus({ loading: true, message: '', error: '' });
    try {
      await axios.put(`${API_URL}/admin/providers/pipeline`, {
        activeProvider: mode
      });
      setSaveStatus({
        loading: false,
        message: `Architecture switched to ${mode === 'versionA_realtime' ? 'Version A (Fastest MVP - Direct Speech-to-Speech)' : 'Version B (Maximum Control - Modular Pipeline)'}!`,
        error: ''
      });
      if (onConfigUpdated) onConfigUpdated();
    } catch (err) {
      setSaveStatus({
        loading: false,
        message: '',
        error: err.response?.data?.error || 'Failed to switch architecture pipeline'
      });
    }
  };

  const currentCategory = pipelineMode === 'versionA_realtime' ? 'realtime' : activeCategory;
  const currentCategoryConfig = configs?.[currentCategory] || {
    category: currentCategory,
    activeProvider: '',
    providers: {}
  };

  // Merge default provider catalog with configs from backend
  const categoryProviders = {
    ...(DEFAULT_PROVIDERS[currentCategory] || {}),
    ...(currentCategoryConfig.providers || {})
  };

  const selectedProviderKey = formData[currentCategory]?.activeProvider || currentCategoryConfig.activeProvider || Object.keys(categoryProviders)[0];

  const handleProviderSelect = (providerKey) => {
    if (!isSuperAdmin) return;
    setFormData(prev => ({
      ...prev,
      [currentCategory]: {
        ...(prev[currentCategory] || {}),
        activeProvider: providerKey
      }
    }));
  };

  const handleFieldChange = (providerKey, field, value) => {
    if (!isSuperAdmin) return;
    setFormData(prev => {
      const catData = prev[currentCategory] || {};
      const providersData = catData.providers || {};
      const pData = providersData[providerKey] || {};

      return {
        ...prev,
        [currentCategory]: {
          ...catData,
          providers: {
            ...providersData,
            [providerKey]: {
              ...pData,
              [field]: value
            }
          }
        }
      };
    });
  };

  const getFieldValue = (providerKey, field) => {
    const fromForm = formData[currentCategory]?.providers?.[providerKey]?.[field];
    if (fromForm !== undefined) return fromForm;
    const fromConfig = currentCategoryConfig.providers?.[providerKey]?.[field];
    if (fromConfig !== undefined && fromConfig !== '') return fromConfig;
    return DEFAULT_PROVIDERS[currentCategory]?.[providerKey]?.[field] || '';
  };

  const handleTestConnection = async (categoryToTest, providerKey) => {
    setTestStatus({ [providerKey]: { loading: true } });
    try {
      const providerData = formData[categoryToTest]?.providers?.[providerKey] || {};
      const credentials = { ...providerData };

      const res = await axios.post(`${API_URL}/admin/providers/test`, {
        category: categoryToTest,
        providerName: providerKey,
        credentials
      });

      setTestStatus({
        [providerKey]: {
          loading: false,
          success: true,
          message: res.data.message || 'Connection verified successfully!'
        }
      });
    } catch (err) {
      setTestStatus({
        [providerKey]: {
          loading: false,
          success: false,
          error: err.response?.data?.error || err.message || 'Connection failed'
        }
      });
    }
  };

  const handleSaveCategory = async (catToSave) => {
    if (!isSuperAdmin) return;
    setSaveStatus({ loading: true, message: '', error: '' });

    try {
      const targetCat = catToSave || currentCategory;
      const catData = formData[targetCat] || {};
      const updates = {
        activeProvider: catData.activeProvider || configs?.[targetCat]?.activeProvider,
        providers: catData.providers || {}
      };

      await axios.put(`${API_URL}/admin/providers/${targetCat}`, updates);
      setSaveStatus({
        loading: false,
        message: `Provider settings for ${targetCat.toUpperCase()} saved and activated!`,
        error: ''
      });

      setFormData(prev => {
        const copy = { ...prev };
        delete copy[targetCat];
        return copy;
      });

      if (onConfigUpdated) onConfigUpdated();
    } catch (err) {
      setSaveStatus({
        loading: false,
        message: '',
        error: err.response?.data?.error || 'Failed to save settings'
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Superadmin Alert */}
      {!isSuperAdmin && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-center space-x-3 text-amber-800 text-sm">
          <svg className="w-5 h-5 text-amber-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <div>
            <span className="font-semibold">Superadmin Access Required:</span> You can inspect current configurations, but only <span className="underline font-bold">superadmin</span> accounts can modify API keys and toggle architecture pipelines.
          </div>
        </div>
      )}

      {/* Global Status Message */}
      {saveStatus.message && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl text-sm font-semibold flex items-center space-x-2">
          <span>✅</span>
          <span>{saveStatus.message}</span>
        </div>
      )}
      {saveStatus.error && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-800 rounded-2xl text-sm font-semibold flex items-center space-x-2">
          <span>❌</span>
          <span>{saveStatus.error}</span>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          ARCHITECTURE PIPELINE SWITCHER
         ───────────────────────────────────────────────────────────── */}
      <div className="bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 rounded-3xl p-6 text-white shadow-xl border border-gray-700">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-6 border-b border-gray-700">
          <div>
            <span className="text-xs font-extrabold uppercase tracking-widest text-emerald-400">Architecture Engine</span>
            <h2 className="text-xl sm:text-2xl font-black mt-1">Select Translation Pipeline Mode</h2>
            <p className="text-xs sm:text-sm text-gray-400 mt-1">
              Switch the entire real-time speech translation architecture dynamically with instant server synchronization.
            </p>
          </div>

          <div className="inline-flex p-1 bg-gray-800/80 rounded-2xl border border-gray-700">
            <button
              onClick={() => handleSwitchPipelineMode('versionA_realtime')}
              disabled={!isSuperAdmin}
              className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center space-x-2 ${
                pipelineMode === 'versionA_realtime'
                  ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/30'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              <span>⚡</span>
              <span>Version A: Fastest MVP</span>
            </button>
            <button
              onClick={() => handleSwitchPipelineMode('versionB_pipeline')}
              disabled={!isSuperAdmin}
              className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center space-x-2 ${
                pipelineMode === 'versionB_pipeline'
                  ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/30'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              <span>🛠️</span>
              <span>Version B: Maximum Control</span>
            </button>
          </div>
        </div>

        {/* Pipeline Architecture Diagram */}
        <div className="pt-6">
          {pipelineMode === 'versionA_realtime' ? (
            <div className="bg-gray-800/60 rounded-2xl p-5 border border-gray-700/80">
              <div className="flex items-center justify-between text-xs font-mono text-emerald-400 mb-3">
                <span className="font-bold uppercase tracking-wider">Direct Speech-to-Speech Flow</span>
                <span className="bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-md text-[10px]">ULTRA-LOW LATENCY</span>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-3 py-4 text-center font-mono text-xs sm:text-sm">
                <div className="px-4 py-3 bg-gray-900 border border-gray-700 rounded-xl font-bold">🎙️ Microphone</div>
                <div className="text-emerald-400 font-bold">─── WebRTC/WebSocket ───▶</div>
                <div className="px-5 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 rounded-xl font-extrabold text-white shadow-md">
                  🧠 GPT-Realtime-Translate
                </div>
                <div className="text-emerald-400 font-bold">─── Audio Stream ───▶</div>
                <div className="px-4 py-3 bg-gray-900 border border-gray-700 rounded-xl font-bold">🔊 Speaker</div>
              </div>
              <p className="text-[11px] text-gray-400 text-center mt-2">
                Uses OpenAI Realtime API (`gpt-4o-realtime-preview`) for direct voice-to-voice bidirectional translation.
              </p>
            </div>
          ) : (
            <div className="bg-gray-800/60 rounded-2xl p-5 border border-gray-700/80">
              <div className="flex items-center justify-between text-xs font-mono text-emerald-400 mb-3">
                <span className="font-bold uppercase tracking-wider">Modular Multi-Stage Pipeline</span>
                <span className="bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-md text-[10px]">MAXIMUM CONTROL</span>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2 py-3 text-center font-mono text-xs">
                <div className="px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg font-bold">🎙️ Mic</div>
                <span className="text-gray-500">▶</span>
                <div className="px-3 py-2 bg-blue-900/40 border border-blue-600/40 text-blue-300 rounded-lg font-bold">
                  Streaming STT<br/>
                  <span className="text-[10px] text-gray-400 font-normal">Groq / Deepgram / NVIDIA / Azure</span>
                </div>
                <span className="text-gray-500">▶</span>
                <div className="px-3 py-2 bg-indigo-900/40 border border-indigo-600/40 text-indigo-300 rounded-lg font-bold">
                  Translation LLM<br/>
                  <span className="text-[10px] text-gray-400 font-normal">Groq / OpenRouter / NVIDIA / GPT / Azure</span>
                </div>
                <span className="text-gray-500">▶</span>
                <div className="px-3 py-2 bg-purple-900/40 border border-purple-600/40 text-purple-300 rounded-lg font-bold">
                  Streaming TTS<br/>
                  <span className="text-[10px] text-gray-400 font-normal">ElevenLabs / NVIDIA / Azure / OpenAI</span>
                </div>
                <span className="text-gray-500">▶</span>
                <div className="px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg font-bold">🔊 Speaker</div>
              </div>
              <p className="text-[11px] text-gray-400 text-center mt-2">
                Granular control: Swap STT (Groq/Deepgram/NVIDIA/Azure), Translation (Groq/OpenRouter/NVIDIA/GPT/Azure), and TTS (ElevenLabs/NVIDIA/Azure/OpenAI) independently.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          VERSION A CONFIGURATION PANEL
         ───────────────────────────────────────────────────────────── */}
      {pipelineMode === 'versionA_realtime' ? (
        <div className="bg-white rounded-3xl border border-gray-200 shadow-sm p-6 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-gray-900 flex items-center space-x-2">
                <span>OpenAI Realtime Speech-to-Speech Engine</span>
                <span className="text-xs px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-full font-bold">Version A</span>
              </h3>
              <p className="text-xs text-gray-500 mt-0.5">
                Configure OpenAI Realtime credentials and speech synthesis voice parameters.
              </p>
            </div>

            {isSuperAdmin && (
              <button
                type="button"
                onClick={() => handleTestConnection('realtime', 'openai')}
                disabled={testStatus['openai']?.loading}
                className="px-3.5 py-2 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-xl text-xs font-semibold flex items-center space-x-1.5 transition"
              >
                {testStatus['openai']?.loading ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-gray-600 border-t-transparent rounded-full animate-spin"></div>
                    <span>Testing...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-3.5 h-3.5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    <span>Test OpenAI Realtime</span>
                  </>
                )}
              </button>
            )}
          </div>

          {testStatus['openai']?.message && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl flex items-center space-x-2">
              <span>✅</span>
              <span>{testStatus['openai'].message}</span>
            </div>
          )}
          {testStatus['openai']?.error && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-800 text-xs rounded-xl flex items-center space-x-2">
              <span>❌</span>
              <span>{testStatus['openai'].error}</span>
            </div>
          )}

          {/* OpenAI Realtime Guide & Portal Link */}
          <div className="p-4 bg-gradient-to-r from-emerald-50/70 via-teal-50/50 to-blue-50/70 border border-emerald-200/80 rounded-2xl text-xs space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center space-x-2">
                <span className="text-base">💡</span>
                <span className="font-extrabold text-emerald-950 uppercase tracking-wide">
                  OpenAI Realtime Credentials & Recommended Models
                </span>
              </div>
              <a
                href="https://platform.openai.com/api-keys"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center space-x-1 px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold shadow-xs transition"
              >
                <span>Get API Key in OpenAI Dashboard</span>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
            </div>
            <ol className="list-decimal list-inside space-y-1 text-gray-700 font-medium pl-1">
              <li>Sign in to platform.openai.com and navigate to <strong>API Keys</strong> in the left menu.</li>
              <li>Click <strong>+ Create new secret key</strong>, copy the generated <code>sk-proj-...</code> key, and paste it below.</li>
              <li>Ensure your OpenAI account has credits added in <strong>Settings &gt; Billing</strong>.</li>
            </ol>
            <div className="pt-2 border-t border-emerald-200/60">
              <span className="font-bold text-gray-800 block mb-1.5">Clickable Model Presets (click to select):</span>
              <div className="flex flex-wrap gap-2">
                {[
                  { id: 'gpt-4o-realtime-preview', label: 'GPT-4o Realtime Preview', tag: 'Flagship' },
                  { id: 'gpt-4o-mini-realtime-preview', label: 'GPT-4o Mini Realtime', tag: 'Lower Cost' }
                ].map((m) => {
                  const isActive = (getFieldValue('openai', 'model') || 'gpt-4o-realtime-preview') === m.id;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => handleFieldChange('openai', 'model', m.id)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition text-left flex items-center space-x-1.5 ${
                        isActive
                          ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                          : 'bg-white text-gray-700 border-gray-200 hover:border-emerald-400 hover:bg-emerald-50/50'
                      }`}
                    >
                      <span>{m.label}</span>
                      <span className={`text-[10px] px-1.5 py-0.2 rounded font-mono ${isActive ? 'bg-emerald-700 text-white' : 'bg-gray-100 text-gray-600'}`}>
                        {m.id}
                      </span>
                      <span className={`text-[9px] px-1 rounded uppercase tracking-wider font-extrabold ${isActive ? 'bg-white text-emerald-800' : 'bg-emerald-100 text-emerald-800'}`}>
                        {m.tag}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5 md:col-span-2">
              <label className="text-xs font-bold text-gray-700 uppercase tracking-wide">OpenAI API Key</label>
              <div className="relative">
                <input
                  type={showKeyInputs['realtime-key'] ? 'text' : 'password'}
                  disabled={!isSuperAdmin}
                  value={getFieldValue('openai', 'apiKey')}
                  onChange={(e) => handleFieldChange('openai', 'apiKey', e.target.value)}
                  placeholder="sk-proj-... (or leave masked to preserve existing key)"
                  className="w-full px-3.5 py-2 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-60"
                />
                <button
                  type="button"
                  onClick={() => setShowKeyInputs(prev => ({ ...prev, 'realtime-key': !prev['realtime-key'] }))}
                  className="absolute right-3 top-2.5 text-xs text-gray-500 hover:text-gray-700 font-semibold"
                >
                  {showKeyInputs['realtime-key'] ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-gray-700 uppercase tracking-wide">Realtime Model</label>
              <input
                type="text"
                disabled={!isSuperAdmin}
                value={getFieldValue('openai', 'model') || 'gpt-4o-realtime-preview'}
                onChange={(e) => handleFieldChange('openai', 'model', e.target.value)}
                placeholder="gpt-4o-realtime-preview"
                className="w-full px-3.5 py-2 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-60"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-gray-700 uppercase tracking-wide">Synthesized Voice</label>
              <select
                disabled={!isSuperAdmin}
                value={getFieldValue('openai', 'voice') || 'alloy'}
                onChange={(e) => handleFieldChange('openai', 'voice', e.target.value)}
                className="w-full px-3.5 py-2 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-60"
              >
                <option value="alloy">Alloy (Neutral, versatile)</option>
                <option value="echo">Echo (Warm, clear)</option>
                <option value="shimmer">Shimmer (Clear, expressive)</option>
                <option value="verse">Verse (Dynamic, modern)</option>
                <option value="ballad">Ballad (Smooth, storytelling)</option>
                <option value="coral">Coral (Bright, friendly)</option>
                <option value="ash">Ash (Soft, subtle)</option>
                <option value="sage">Sage (Calm, authoritative)</option>
              </select>
            </div>

            <div className="space-y-1.5 md:col-span-2">
              <label className="text-xs font-bold text-gray-700 uppercase tracking-wide">System Instructions</label>
              <textarea
                rows={3}
                disabled={!isSuperAdmin}
                value={getFieldValue('openai', 'instructions') || 'You are an ultra-low-latency real-time multilingual speech translator. Listen to audio and respond directly with natural translated speech in the target language.'}
                onChange={(e) => handleFieldChange('openai', 'instructions', e.target.value)}
                className="w-full px-3.5 py-2 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-60"
              />
            </div>
          </div>

          {isSuperAdmin && (
            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => handleSaveCategory('realtime')}
                disabled={saveStatus.loading}
                className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white rounded-xl text-sm font-bold shadow-md hover:shadow-lg transition flex items-center space-x-2"
              >
                {saveStatus.loading && (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                )}
                <span>Save Version A Settings</span>
              </button>
            </div>
          )}
        </div>
      ) : (
        /* ─────────────────────────────────────────────────────────────
            VERSION B CONFIGURATION PANEL (MODULAR PIPELINE)
           ───────────────────────────────────────────────────────────── */
        <div className="space-y-6">
          {/* Sub-Category Stage Tabs */}
          <div className="flex border-b border-gray-200 space-x-2 overflow-x-auto pb-1">
            {Object.entries(categoryLabels).map(([catKey, label]) => (
              <button
                key={catKey}
                onClick={() => {
                  setActiveCategory(catKey);
                  setTestStatus({});
                  setSaveStatus({ loading: false, message: '', error: '' });
                }}
                className={`px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm whitespace-nowrap transition-all ${
                  activeCategory === catKey
                    ? 'bg-emerald-600 text-white shadow-md'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Provider Selection Card */}
          <div className="bg-white rounded-3xl border border-gray-200 shadow-sm p-6 space-y-6">
            <div>
              <h3 className="text-lg font-bold text-gray-900">
                {categoryLabels[activeCategory]} Stage Engine
              </h3>
              <p className="text-xs text-gray-500">
                Choose the active provider for this pipeline stage and configure its credentials.
              </p>
            </div>

            {/* Provider Radios */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {Object.entries(categoryProviders).map(([pKey, pVal]) => {
                const isSelected = selectedProviderKey === pKey;
                const hasKey = pVal.hasKey || Boolean(formData[activeCategory]?.providers?.[pKey]?.apiKey) || Boolean(currentCategoryConfig.providers?.[pKey]?.apiKey);

                return (
                  <div
                    key={pKey}
                    onClick={() => handleProviderSelect(pKey)}
                    className={`p-4 rounded-2xl border-2 transition-all cursor-pointer flex items-start justify-between ${
                      isSelected
                        ? 'border-emerald-500 bg-emerald-50/40 shadow-xs'
                        : 'border-gray-200 hover:border-gray-300 bg-white'
                    }`}
                  >
                    <div className="flex items-start space-x-3">
                      <div className="mt-1">
                        <input
                          type="radio"
                          name={`active-${activeCategory}`}
                          checked={isSelected}
                          onChange={() => handleProviderSelect(pKey)}
                          disabled={!isSuperAdmin}
                          className="text-emerald-600 focus:ring-emerald-500 h-4 w-4"
                        />
                      </div>
                      <div>
                        <h4 className="font-bold text-gray-900">{pVal.name || pKey}</h4>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {pKey === 'deepgram' && 'Deepgram Nova-2 (Ultra-fast Streaming Speech-to-Text)'}
                          {pKey === 'groq' && activeCategory === 'stt' && 'Groq Whisper Turbo (Sub-200ms Speech Recognition)'}
                          {pKey === 'groq' && activeCategory === 'translation' && 'Groq LPU Engine (Llama 3.3 70B ~1000 tok/sec)'}
                          {pKey === 'openrouter' && 'OpenRouter Universal Gateway (Claude, Llama 3.3, Gemini, Mistral)'}
                          {pKey === 'nvidia' && activeCategory === 'translation' && 'NVIDIA NIM Microservice (Enterprise Llama 3.3)'}
                          {pKey === 'nvidia' && activeCategory === 'stt' && 'NVIDIA Riva / Canary-1B Speech Recognition'}
                          {pKey === 'nvidia' && activeCategory === 'tts' && 'NVIDIA Riva FastPitch Neural Voice Synthesis'}
                          {pKey === 'azure' && activeCategory === 'stt' && 'Azure Speech Recognition (Fast, Multilingual)'}
                          {pKey === 'azure' && activeCategory === 'tts' && 'Azure Speech Neural Synthesis'}
                          {pKey === 'azure' && activeCategory === 'translation' && 'Azure Cognitive Translator'}
                          {pKey === 'elevenlabs' && 'ElevenLabs Multilingual v2 (Human-like AI Voice)'}
                          {pKey === 'openai' && activeCategory === 'stt' && 'OpenAI Whisper Model (whisper-1)'}
                          {pKey === 'openai' && activeCategory === 'tts' && 'OpenAI Text-to-Speech (tts-1)'}
                          {pKey === 'openai' && activeCategory === 'translation' && 'OpenAI GPT-4o-mini Translation Engine'}
                          {pKey === 'google' && activeCategory === 'translation' && 'Google Cloud Translation API v2'}
                          {pKey === 'livekit' && 'LiveKit WebRTC SFU Media Cluster'}
                        </p>
                      </div>
                    </div>

                    <span
                      className={`text-xs px-2.5 py-1 rounded-full font-bold ${
                        hasKey ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {hasKey ? 'Ready' : 'Unconfigured'}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Credential Inputs for Active Stage Provider */}
            {selectedProviderKey && (
              <div className="border-t border-gray-100 pt-6 space-y-5">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-extrabold text-gray-700 uppercase tracking-wider">
                    Configure: <span className="text-emerald-600 capitalize">{selectedProviderKey}</span>
                  </h4>

                  {isSuperAdmin && (
                    <button
                      type="button"
                      onClick={() => handleTestConnection(activeCategory, selectedProviderKey)}
                      disabled={testStatus[selectedProviderKey]?.loading}
                      className="px-3.5 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-bold flex items-center space-x-1.5 transition"
                    >
                      {testStatus[selectedProviderKey]?.loading ? (
                        <>
                          <div className="w-3.5 h-3.5 border-2 border-gray-600 border-t-transparent rounded-full animate-spin"></div>
                          <span>Testing...</span>
                        </>
                      ) : (
                        <>
                          <svg className="w-3.5 h-3.5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                          </svg>
                          <span>Test Connection</span>
                        </>
                      )}
                    </button>
                  )}
                </div>

                {testStatus[selectedProviderKey]?.message && (
                  <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl flex items-center space-x-2">
                    <span>✅</span>
                    <span>{testStatus[selectedProviderKey].message}</span>
                  </div>
                )}
                {testStatus[selectedProviderKey]?.error && (
                  <div className="p-3 bg-red-50 border border-red-200 text-red-800 text-xs rounded-xl flex items-center space-x-2">
                    <span>❌</span>
                    <span>{testStatus[selectedProviderKey].error}</span>
                  </div>
                )}
                {/* Provider Helper Guide & Model Presets */}
                {PROVIDER_GUIDES[selectedProviderKey] && (
                  <div className="p-4 bg-gradient-to-r from-emerald-50/70 via-teal-50/50 to-blue-50/70 border border-emerald-200/80 rounded-2xl text-xs space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-center space-x-2">
                        <span className="text-base">💡</span>
                        <span className="font-extrabold text-emerald-950 uppercase tracking-wide">
                          How to find {selectedProviderKey.toUpperCase()} credentials & models
                        </span>
                      </div>
                      <div className="flex items-center space-x-2">
                        {PROVIDER_GUIDES[selectedProviderKey].portalUrl && (
                          <a
                            href={PROVIDER_GUIDES[selectedProviderKey].portalUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center space-x-1 px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold shadow-xs transition"
                          >
                            <span>Open {PROVIDER_GUIDES[selectedProviderKey].portalName}</span>
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                            </svg>
                          </a>
                        )}
                        {PROVIDER_GUIDES[selectedProviderKey].docUrl && (
                          <a
                            href={PROVIDER_GUIDES[selectedProviderKey].docUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center space-x-1 px-2.5 py-1 bg-white hover:bg-gray-50 border border-gray-200 text-gray-700 rounded-lg font-medium transition"
                          >
                            <span>Docs</span>
                            <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                            </svg>
                          </a>
                        )}
                      </div>
                    </div>

                    <ol className="list-decimal list-inside space-y-1 text-gray-700 font-medium pl-1">
                      {PROVIDER_GUIDES[selectedProviderKey].howToGetKey?.map((step, sIdx) => (
                        <li key={sIdx}>{step}</li>
                      ))}
                    </ol>

                    {/* Clickable Model Presets for this stage */}
                    {getProviderModelsForStage(selectedProviderKey, activeCategory).length > 0 && (
                      <div className="pt-2 border-t border-emerald-200/60">
                        <span className="font-bold text-gray-800 block mb-1.5">
                          Available / Recommended Models (click to select):
                        </span>
                        <div className="flex flex-wrap gap-2">
                          {getProviderModelsForStage(selectedProviderKey, activeCategory).map((m) => {
                            const isVoice = activeCategory === 'tts' && (selectedProviderKey === 'nvidia' || selectedProviderKey === 'elevenlabs');
                            const targetField = isVoice ? 'voiceId' : 'model';
                            const currentVal = getFieldValue(selectedProviderKey, targetField);
                            const isActive = currentVal === m.id;

                            return (
                              <button
                                key={m.id}
                                type="button"
                                onClick={() => handleFieldChange(selectedProviderKey, targetField, m.id)}
                                title={m.desc}
                                className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition text-left flex items-center space-x-1.5 ${
                                  isActive
                                    ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                                    : 'bg-white text-gray-700 border-gray-200 hover:border-emerald-400 hover:bg-emerald-50/50'
                                }`}
                              >
                                <span>{m.label}</span>
                                <span className={`text-[10px] px-1.5 py-0.2 rounded font-mono ${isActive ? 'bg-emerald-700 text-white' : 'bg-gray-100 text-gray-600'}`}>
                                  {m.id}
                                </span>
                                {m.tag && (
                                  <span className={`text-[9px] px-1 rounded uppercase tracking-wider font-extrabold ${isActive ? 'bg-white text-emerald-800' : 'bg-emerald-100 text-emerald-800'}`}>
                                    {m.tag}
                                  </span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* API Key */}
                  <div className="space-y-1.5 md:col-span-2">
                    <label className="text-xs font-bold text-gray-700 uppercase tracking-wide">
                      {selectedProviderKey.toUpperCase()} API Key / Secret Token
                    </label>
                    <div className="relative">
                      <input
                        type={showKeyInputs[selectedProviderKey] ? 'text' : 'password'}
                        disabled={!isSuperAdmin}
                        value={getFieldValue(selectedProviderKey, 'apiKey')}
                        onChange={(e) => handleFieldChange(selectedProviderKey, 'apiKey', e.target.value)}
                        placeholder="Enter API key or leave masked"
                        className="w-full px-3.5 py-2 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-60"
                      />
                      <button
                        type="button"
                        onClick={() => setShowKeyInputs(prev => ({ ...prev, [selectedProviderKey]: !prev[selectedProviderKey] }))}
                        className="absolute right-3 top-2.5 text-xs text-gray-500 hover:text-gray-700 font-semibold"
                      >
                        {showKeyInputs[selectedProviderKey] ? 'Hide' : 'Show'}
                      </button>
                    </div>
                  </div>

                  {/* Deepgram-specific */}
                  {selectedProviderKey === 'deepgram' && (
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-gray-700 uppercase tracking-wide">Deepgram Model</label>
                      <input
                        type="text"
                        disabled={!isSuperAdmin}
                        value={getFieldValue('deepgram', 'model') || 'nova-2'}
                        onChange={(e) => handleFieldChange('deepgram', 'model', e.target.value)}
                        placeholder="nova-2"
                        className="w-full px-3.5 py-2 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-60"
                      />
                    </div>
                  )}

                  {/* ElevenLabs-specific */}
                  {selectedProviderKey === 'elevenlabs' && (
                    <>
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-gray-700 uppercase tracking-wide">Voice ID</label>
                        <input
                          type="text"
                          disabled={!isSuperAdmin}
                          value={getFieldValue('elevenlabs', 'voiceId') || '21m00Tcm4TlvDq8ikWAM'}
                          onChange={(e) => handleFieldChange('elevenlabs', 'voiceId', e.target.value)}
                          placeholder="e.g. 21m00Tcm4TlvDq8ikWAM (Rachel)"
                          className="w-full px-3.5 py-2 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-60"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-gray-700 uppercase tracking-wide">TTS Model</label>
                        <input
                          type="text"
                          disabled={!isSuperAdmin}
                          value={getFieldValue('elevenlabs', 'model') || 'eleven_multilingual_v2'}
                          onChange={(e) => handleFieldChange('elevenlabs', 'model', e.target.value)}
                          placeholder="eleven_multilingual_v2"
                          className="w-full px-3.5 py-2 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-60"
                        />
                      </div>
                    </>
                  )}

                  {/* Azure-specific */}
                  {selectedProviderKey === 'azure' && (
                    <>
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-gray-700 uppercase tracking-wide">Region</label>
                        <input
                          type="text"
                          disabled={!isSuperAdmin}
                          value={getFieldValue('azure', 'region')}
                          onChange={(e) => handleFieldChange('azure', 'region', e.target.value)}
                          placeholder="e.g. eastus, centralindia"
                          className="w-full px-3.5 py-2 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-60"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-gray-700 uppercase tracking-wide">Endpoint (Optional)</label>
                        <input
                          type="text"
                          disabled={!isSuperAdmin}
                          value={getFieldValue('azure', 'endpoint')}
                          onChange={(e) => handleFieldChange('azure', 'endpoint', e.target.value)}
                          placeholder="Default Azure endpoint"
                          className="w-full px-3.5 py-2 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-60"
                        />
                      </div>
                    </>
                  )}

                  {/* LiveKit-specific */}
                  {selectedProviderKey === 'livekit' && (
                    <>
                      <div className="space-y-1.5 md:col-span-2">
                        <label className="text-xs font-bold text-gray-700 uppercase tracking-wide">LiveKit SFU Server URL</label>
                        <input
                          type="text"
                          disabled={!isSuperAdmin}
                          value={getFieldValue('livekit', 'url')}
                          onChange={(e) => handleFieldChange('livekit', 'url', e.target.value)}
                          placeholder="wss://your-livekit-server.cloud"
                          className="w-full px-3.5 py-2 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-60"
                        />
                      </div>
                      <div className="space-y-1.5 md:col-span-2">
                        <label className="text-xs font-bold text-gray-700 uppercase tracking-wide">LiveKit API Secret</label>
                        <input
                          type={showKeyInputs['lk-secret'] ? 'text' : 'password'}
                          disabled={!isSuperAdmin}
                          value={getFieldValue('livekit', 'apiSecret')}
                          onChange={(e) => handleFieldChange('livekit', 'apiSecret', e.target.value)}
                          placeholder="LiveKit API Secret"
                          className="w-full px-3.5 py-2 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-60"
                        />
                      </div>
                    </>
                  )}

                  {/* OpenAI specific */}
                  {selectedProviderKey === 'openai' && (
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-gray-700 uppercase tracking-wide">OpenAI Model</label>
                      <input
                        type="text"
                        disabled={!isSuperAdmin}
                        value={getFieldValue('openai', 'model') || (activeCategory === 'tts' ? 'tts-1' : activeCategory === 'stt' ? 'whisper-1' : 'gpt-4o-mini')}
                        onChange={(e) => handleFieldChange('openai', 'model', e.target.value)}
                        className="w-full px-3.5 py-2 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-60"
                      />
                    </div>
                  )}

                  {/* Groq specific */}
                  {selectedProviderKey === 'groq' && (
                    <>
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-gray-700 uppercase tracking-wide">Groq Model</label>
                        <input
                          type="text"
                          disabled={!isSuperAdmin}
                          value={getFieldValue('groq', 'model') || (activeCategory === 'stt' ? 'whisper-large-v3-turbo' : 'llama-3.3-70b-versatile')}
                          onChange={(e) => handleFieldChange('groq', 'model', e.target.value)}
                          placeholder={activeCategory === 'stt' ? 'whisper-large-v3-turbo' : 'llama-3.3-70b-versatile'}
                          className="w-full px-3.5 py-2 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-60"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-gray-700 uppercase tracking-wide">Custom Endpoint (Optional)</label>
                        <input
                          type="text"
                          disabled={!isSuperAdmin}
                          value={getFieldValue('groq', 'endpoint')}
                          onChange={(e) => handleFieldChange('groq', 'endpoint', e.target.value)}
                          placeholder="https://api.groq.com/openai/v1"
                          className="w-full px-3.5 py-2 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-60"
                        />
                      </div>
                    </>
                  )}

                  {/* OpenRouter specific */}
                  {selectedProviderKey === 'openrouter' && (
                    <>
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-gray-700 uppercase tracking-wide">Model Identifier</label>
                        <input
                          type="text"
                          disabled={!isSuperAdmin}
                          value={getFieldValue('openrouter', 'model') || 'meta-llama/llama-3.3-70b-instruct'}
                          onChange={(e) => handleFieldChange('openrouter', 'model', e.target.value)}
                          placeholder="e.g. meta-llama/llama-3.3-70b-instruct or anthropic/claude-3.5-sonnet"
                          className="w-full px-3.5 py-2 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-60"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-gray-700 uppercase tracking-wide">Base URL (Optional)</label>
                        <input
                          type="text"
                          disabled={!isSuperAdmin}
                          value={getFieldValue('openrouter', 'endpoint')}
                          onChange={(e) => handleFieldChange('openrouter', 'endpoint', e.target.value)}
                          placeholder="https://openrouter.ai/api/v1"
                          className="w-full px-3.5 py-2 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-60"
                        />
                      </div>
                    </>
                  )}

                  {/* NVIDIA specific */}
                  {selectedProviderKey === 'nvidia' && (
                    <>
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-gray-700 uppercase tracking-wide">
                          {activeCategory === 'tts' ? 'Voice Identifier' : 'NVIDIA NIM Model'}
                        </label>
                        <input
                          type="text"
                          disabled={!isSuperAdmin}
                          value={
                            activeCategory === 'tts'
                              ? (getFieldValue('nvidia', 'voiceId') || 'English-US.Female-1')
                              : (getFieldValue('nvidia', 'model') || (activeCategory === 'stt' ? 'nvidia/canary-1b' : 'meta/llama-3.3-70b-instruct'))
                          }
                          onChange={(e) => {
                            if (activeCategory === 'tts') {
                              handleFieldChange('nvidia', 'voiceId', e.target.value);
                            } else {
                              handleFieldChange('nvidia', 'model', e.target.value);
                            }
                          }}
                          placeholder={activeCategory === 'tts' ? 'English-US.Female-1' : activeCategory === 'stt' ? 'nvidia/canary-1b' : 'meta/llama-3.3-70b-instruct'}
                          className="w-full px-3.5 py-2 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-60"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-gray-700 uppercase tracking-wide">NIM Endpoint (Optional)</label>
                        <input
                          type="text"
                          disabled={!isSuperAdmin}
                          value={getFieldValue('nvidia', 'endpoint')}
                          onChange={(e) => handleFieldChange('nvidia', 'endpoint', e.target.value)}
                          placeholder="https://integrate.api.nvidia.com/v1"
                          className="w-full px-3.5 py-2 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-60"
                        />
                      </div>
                    </>
                  )}

                  {/* Google specific */}
                  {selectedProviderKey === 'google' && (
                    <>
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-gray-700 uppercase tracking-wide">
                          Google Translation Model
                        </label>
                        <input
                          type="text"
                          disabled={!isSuperAdmin}
                          value={getFieldValue('google', 'model') || 'nmt'}
                          onChange={(e) => handleFieldChange('google', 'model', e.target.value)}
                          placeholder="nmt"
                          className="w-full px-3.5 py-2 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-60"
                        />
                        <p className="text-[11px] text-gray-500">
                          <code>nmt</code>: Google Neural Machine Translation model (high quality, deep learning).
                        </p>
                      </div>
                      <div className="space-y-1.5 flex flex-col justify-center">
                        <span className="text-xs font-bold text-gray-700 uppercase tracking-wide">
                          Google Cloud Docs
                        </span>
                        <div className="flex flex-wrap items-center gap-3 text-xs pt-1">
                          <a
                            href="https://docs.cloud.google.com/translate/docs/advanced/nmt-model"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-emerald-600 hover:text-emerald-700 font-semibold flex items-center space-x-1"
                          >
                            <span>Google NMT Model Guide</span>
                            <span>↗</span>
                          </a>
                          <span className="text-gray-300">•</span>
                          <a
                            href="https://docs.cloud.google.com/translate/docs/api-overview"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-emerald-600 hover:text-emerald-700 font-semibold flex items-center space-x-1"
                          >
                            <span>API Overview</span>
                            <span>↗</span>
                          </a>
                        </div>
                      </div>
                    </>
                  )}
                </div>

                {isSuperAdmin && (
                  <div className="flex justify-end pt-3">
                    <button
                      type="button"
                      onClick={() => handleSaveCategory(activeCategory)}
                      disabled={saveStatus.loading}
                      className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white rounded-xl text-sm font-bold shadow-md hover:shadow-lg transition flex items-center space-x-2"
                    >
                      {saveStatus.loading && (
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      )}
                      <span>Save {categoryLabels[activeCategory]} Settings</span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ProvidersTab;
