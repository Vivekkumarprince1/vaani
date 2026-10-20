<script lang="ts">
	import { onMount } from 'svelte';
	import { api } from '$lib/api/client';
	import {
		Zap,
		Layers,
		CheckCircle2,
		AlertCircle,
		ExternalLink,
		Key,
		Eye,
		EyeOff,
		RefreshCw,
		Check,
		Radio,
		Activity,
		HelpCircle,
		Sparkles,
		ShieldAlert
	} from 'lucide-svelte';

	interface Props {
		isSuperAdmin?: boolean;
		onConfigUpdated?: () => void;
	}

	let { isSuperAdmin = true, onConfigUpdated }: Props = $props();

	interface ProviderPreset {
		id: string;
		label: string;
		tag?: string;
		desc?: string;
	}

	interface ProviderGuide {
		portalName: string;
		portalUrl: string;
		docUrl?: string;
		overviewUrl?: string;
		howToGetKey: string[];
		models?: ProviderPreset[] | { [stage: string]: ProviderPreset[] };
	}

	const PROVIDER_GUIDES: Record<string, ProviderGuide> = {
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
			models: {
				translation: [
					{ id: 'nmt', label: 'Neural Machine Translation (NMT)', tag: 'Recommended', desc: 'Google Cloud NMT deep-learning translation model across 100+ languages' },
					{ id: 'gtx', label: 'Google Universal (Zero-Config)', tag: 'Free Fallback', desc: 'Zero-config ultra-fast translation engine (<60ms)' },
					{ id: 'base', label: 'Standard Phrase-Based (PBMT)', tag: 'Legacy', desc: 'Legacy statistical phrase-based translation model' }
				],
				tts: [
					{ id: 'default', label: 'Universal Neural Hindi & English', tag: 'Zero-Config', desc: 'Ultra-low latency streaming voice synthesis (Zero API key required)' },
					{ id: 'en-US-Neural2-F', label: 'US English Neural2 Female', tag: 'High Fidelity', desc: 'Google Cloud Text-to-Speech high quality female voice' },
					{ id: 'hi-IN-Neural2-A', label: 'Hindi Neural2 Female', tag: 'Natural Hindi', desc: 'Google Cloud Text-to-Speech natural Hindi female voice' },
					{ id: 'hi-IN-Wavenet-B', label: 'Hindi Wavenet Male', tag: 'Deep Tone', desc: 'Google Cloud Text-to-Speech Hindi male voice' }
				]
			}
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
					{ id: 'qwen/qwen3.8-27b', label: 'Qwen 3.8 27B', tag: 'Fastest (~30ms)', desc: 'Ultra-fast high-accuracy multilingual translation running on Groq LPUs' },
					{ id: 'openai/gpt-oss-120b', label: 'GPT-OSS 120B', tag: 'Deep Context', desc: 'Powerful 120B multilingual reasoning model on Groq' },
					{ id: 'openai/gpt-oss-20b', label: 'GPT-OSS 20B', tag: 'Lightweight', desc: 'Fast open-source 20B translation model' },
					{ id: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B Versatile', tag: 'Standard', desc: 'State-of-the-art multilingual reasoning at blazing speed' },
					{ id: 'llama-3.1-8b-instant', label: 'Llama 3.1 8B Instant', tag: 'Ultra-Fast', desc: 'Extremely lightweight and instant response translation' }
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
				{ id: 'google/gemini-2.0-flash-001', label: 'Google Gemini 2.0 Flash', tag: 'Low Latency', desc: 'Google next-gen high-speed multimodal LLM' },
				{ id: 'anthropic/claude-3.5-sonnet', label: 'Claude 3.5 Sonnet', tag: 'Best Nuance', desc: 'Exceptional contextual translation and colloquial nuance' },
				{ id: 'deepseek/deepseek-chat', label: 'DeepSeek V3', tag: 'Cost Effective', desc: 'Ultra-low cost high-performance open model' },
				{ id: 'mistralai/mistral-large-2411', label: 'Mistral Large', tag: 'European Master', desc: 'Specialized high-precision European translations' },
				{ id: 'qwen/qwen-2.5-72b-instruct', label: 'Qwen 2.5 72B Instruct', tag: 'Multilingual Lead', desc: 'Outstanding Asian and Indic language translation capabilities' }
			]
		},
		nvidia: {
			portalName: 'NVIDIA API Catalog',
			portalUrl: 'https://build.nvidia.com',
			docUrl: 'https://docs.nvidia.com/nim/',
			howToGetKey: [
				'Go to build.nvidia.com and sign in with your NVIDIA Developer account.',
				'Select any NIM model (e.g. Llama 3.3 70B or Canary-1B).',
				'Click "Get API Key" to generate a personal API key (nvapi-...) with free credits.',
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
					{ id: 'gpt-4o-realtime-preview', label: 'GPT-4o Realtime Preview', tag: 'Flagship STS', desc: 'Direct speech-to-speech low-latency voice model' },
					{ id: 'gpt-4o-mini-realtime-preview', label: 'GPT-4o Mini Realtime', tag: 'Lower Cost', desc: 'Faster and more economical real-time voice translation' }
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
			],
			models: {
				translation: [
					{ id: 'standard', label: 'Azure Translator v3', tag: 'Standard', desc: 'Microsoft Cognitive Services Neural Translator across 100+ languages' }
				],
				stt: [
					{ id: 'default', label: 'Azure Speech Recognition', tag: 'Continuous', desc: 'Azure Cognitive Speech continuous speech-to-text' }
				],
				tts: [
					{ id: 'hi-IN-SwaraNeural', label: 'Swara (Hindi Female)', tag: 'Natural Hindi', desc: 'Azure Neural Hindi female voice with authentic inflection' },
					{ id: 'hi-IN-MadhurNeural', label: 'Madhur (Hindi Male)', tag: 'Clear Hindi', desc: 'Azure Neural Hindi male voice' },
					{ id: 'en-US-JennyNeural', label: 'Jenny (US Female)', tag: 'Natural US', desc: 'Azure Neural English (US) conversational female voice' },
					{ id: 'en-US-GuyNeural', label: 'Guy (US Male)', tag: 'Warm US', desc: 'Azure Neural English (US) conversational male voice' }
				]
			}
		},
		deepgram: {
			portalName: 'Deepgram Console',
			portalUrl: 'https://console.deepgram.com',
			docUrl: 'https://developers.deepgram.com/docs/models-languages-overview',
			howToGetKey: [
				'Log in to console.deepgram.com.',
				'Navigate to API Keys in your project.',
				'Click "Create a New API Key" with Member or Admin scope.',
				'Copy the token and paste it below. (New accounts receive free starter credits).'
			],
			models: {
				stt: [
					{ id: 'nova-2', label: 'Nova-2', tag: 'Flagship STT', desc: 'Deepgram fastest and most accurate streaming STT model (~250ms)' },
					{ id: 'nova-2-general', label: 'Nova-2 General', tag: 'Conversational', desc: 'Tuned for multi-speaker phone and meeting audio' },
					{ id: 'nova-2-meeting', label: 'Nova-2 Meeting', tag: 'Conference', desc: 'Optimized for video call rooms and overlapping speakers' },
					{ id: 'nova-2-phonecall', label: 'Nova-2 Phone Call', tag: 'Telephony', desc: 'Tuned for telephone audio quality' }
				],
				tts: [
					{ id: 'aura-asteria-en', label: 'Aura Asteria (Female)', tag: 'Warm & Natural', desc: 'Deepgram Aura natural conversational female voice (~200ms latency)' },
					{ id: 'aura-luna-en', label: 'Aura Luna (Female)', tag: 'Soft Female', desc: 'Calm, gentle conversational female tone' },
					{ id: 'aura-stella-en', label: 'Aura Stella (Female)', tag: 'Clear & Crisp', desc: 'Professional, articulate female voice' },
					{ id: 'aura-arcus-en', label: 'Aura Arcus (Male)', tag: 'Warm Male', desc: 'Deep, pleasant conversational male voice' },
					{ id: 'aura-angus-en', label: 'Aura Angus (Male)', tag: 'Deep Tone', desc: 'Authoritative, resonant male voice' },
					{ id: 'aura-orpheus-en', label: 'Aura Orpheus (Male)', tag: 'Dynamic Male', desc: 'Energetic, modern male voice' }
				]
			}
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
				{ id: 'eleven_turbo_v2_5', label: 'Eleven Turbo v2.5', tag: 'Ultra Low Latency', desc: 'Sub-400ms synthesis for real-time conversation' },
				{ id: 'eleven_flash_v2_5', label: 'Eleven Flash v2.5', tag: 'Fastest (~75ms)', desc: 'Lowest latency synthesis built for speed' }
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

	let configs = $state<any>(null);
	let pipelineMode = $state<'versionA_realtime' | 'versionB_pipeline'>('versionB_pipeline');
	let activeStage = $state<'stt' | 'translation' | 'tts' | 'sfu'>('stt');

	// Local edits buffer
	let formEdits = $state<Record<string, { activeProvider?: string; providers?: Record<string, any> }>>({});
	let showKeys = $state<Record<string, boolean>>({});
	let testStatus = $state<Record<string, { loading?: boolean; success?: boolean; message?: string; error?: string; latency?: number }>>({});
	let saveStatus = $state<{ loading: boolean; message: string; error: string }>({ loading: false, message: '', error: '' });

	const stageLabels = {
		stt: '1. Streaming STT',
		translation: '2. Translation LLM',
		tts: '3. Streaming TTS',
		sfu: '4. Transport (SFU)'
	};

	let currentProviders = $derived(configs?.[activeStage]?.providers || {});
	let selectedPKey = $derived(getSelectedProviderKey());

	onMount(async () => {
		await loadProviderConfigs();
	});

	async function loadProviderConfigs() {
		try {
			const res = await api.get('/admin/providers');
			configs = res.data;
			if (configs?.pipeline?.activeProvider) {
				pipelineMode = configs.pipeline.activeProvider;
			}
		} catch (err) {
			console.error('Failed to load provider configs:', err);
		}
	}

	function getStageModels(providerKey: string, stage: string): ProviderPreset[] {
		const guide = PROVIDER_GUIDES[providerKey];
		if (!guide || !guide.models) return [];
		if (Array.isArray(guide.models)) return guide.models;
		return (guide.models as any)[stage] || [];
	}

	function getCurrentCategory(): string {
		return pipelineMode === 'versionA_realtime' ? 'realtime' : activeStage;
	}

	function getSelectedProviderKey(): string {
		const cat = getCurrentCategory();
		if (formEdits[cat]?.activeProvider) return formEdits[cat].activeProvider!;
		if (configs?.[cat]?.activeProvider) return configs[cat].activeProvider;
		const provs = configs?.[cat]?.providers;
		return provs ? Object.keys(provs)[0] : '';
	}

	function handleSelectProvider(pKey: string) {
		if (!isSuperAdmin) return;
		const cat = getCurrentCategory();
		if (!formEdits[cat]) formEdits[cat] = {};
		formEdits[cat].activeProvider = pKey;
	}

	function handleFieldChange(pKey: string, field: string, value: any) {
		if (!isSuperAdmin) return;
		const cat = getCurrentCategory();
		if (!formEdits[cat]) formEdits[cat] = {};
		if (!formEdits[cat].providers) formEdits[cat].providers = {};
		if (!formEdits[cat].providers![pKey]) formEdits[cat].providers![pKey] = {};
		formEdits[cat].providers![pKey][field] = value;
	}

	function getFieldValue(pKey: string, field: string): string {
		const cat = getCurrentCategory();
		const fromEdit = formEdits[cat]?.providers?.[pKey]?.[field];
		if (fromEdit !== undefined) return fromEdit;
		const fromConfig = configs?.[cat]?.providers?.[pKey]?.[field];
		if (fromConfig !== undefined) return fromConfig;
		return '';
	}

	async function handleSwitchPipeline(mode: 'versionA_realtime' | 'versionB_pipeline') {
		if (!isSuperAdmin) return;
		pipelineMode = mode;
		saveStatus = { loading: true, message: '', error: '' };
		try {
			await api.put('/admin/providers/pipeline', { activeProvider: mode });
			saveStatus = {
				loading: false,
				message: `Architecture switched to ${mode === 'versionA_realtime' ? 'Version A (Direct Speech-to-Speech STS)' : 'Version B (Modular Pipeline)'}!`,
				error: ''
			};
			await loadProviderConfigs();
			if (onConfigUpdated) onConfigUpdated();
		} catch (err: any) {
			saveStatus = {
				loading: false,
				message: '',
				error: err.response?.data?.error || 'Failed to switch architecture pipeline'
			};
		}
	}

	async function handleTestConnection(category: string, providerName: string) {
		testStatus[providerName] = { loading: true };
		try {
			const creds = formEdits[category]?.providers?.[providerName] || {};
			const res = await api.post('/admin/providers/test', {
				category,
				providerName,
				credentials: creds
			});
			testStatus[providerName] = {
				loading: false,
				success: true,
				message: res.data.message || 'Connection verified successfully!',
				latency: res.data.latency_ms
			};
		} catch (err: any) {
			testStatus[providerName] = {
				loading: false,
				success: false,
				error: err.response?.data?.error || err.message || 'Connection test failed'
			};
		}
	}

	async function handleSaveCategory(category: string) {
		if (!isSuperAdmin) return;
		saveStatus = { loading: true, message: '', error: '' };
		try {
			const catData = formEdits[category] || {};
			const activeProvider = catData.activeProvider || configs?.[category]?.activeProvider;
			const providers = catData.providers || {};

			await api.put(`/admin/providers/${category}`, {
				activeProvider,
				providers
			});

			saveStatus = {
				loading: false,
				message: `Settings for ${category.toUpperCase()} saved & hot-reloaded!`,
				error: ''
			};

			// Clear edits for this category
			delete formEdits[category];
			await loadProviderConfigs();
			if (onConfigUpdated) onConfigUpdated();
		} catch (err: any) {
			saveStatus = {
				loading: false,
				message: '',
				error: err.response?.data?.error || 'Failed to save provider settings'
			};
		}
	}
</script>

<div class="space-y-6">
	<!-- Superadmin Warning Banner -->
	{#if !isSuperAdmin}
		<div class="p-4 bg-amber-500/10 border border-amber-500/20 rounded-2xl flex items-center gap-3 text-amber-700 dark:text-amber-300 text-xs shadow-xs">
			<ShieldAlert class="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0" />
			<div>
				<span class="font-bold">Superadmin Access Required:</span> You can inspect current configurations, but only <span class="underline font-bold">superadmin</span> accounts can modify API keys, change model settings, and toggle architecture pipelines.
			</div>
		</div>
	{/if}

	<!-- Global Status Notification -->
	{#if saveStatus.message}
		<div class="p-4 bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-400 rounded-2xl text-xs font-semibold flex items-center gap-2 animate-fade-in shadow-xs">
			<CheckCircle2 class="w-4 h-4 shrink-0" />
			<span>{saveStatus.message}</span>
		</div>
	{/if}
	{#if saveStatus.error}
		<div class="p-4 bg-rose-500/10 border border-rose-500/30 text-rose-700 dark:text-rose-400 rounded-2xl text-xs font-semibold flex items-center gap-2 animate-fade-in shadow-xs">
			<AlertCircle class="w-4 h-4 shrink-0" />
			<span>{saveStatus.error}</span>
		</div>
	{/if}

	<!-- ─────────────────────────────────────────────────────────────
	     1. ARCHITECTURE PIPELINE SWITCHER
	   ───────────────────────────────────────────────────────────── -->
	<div class="rounded-3xl bg-white dark:bg-neutral-900/60 border border-neutral-200 dark:border-neutral-800 p-6 backdrop-blur-md shadow-xs dark:shadow-xl space-y-6">
		<div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-6 border-b border-neutral-200 dark:border-neutral-800">
			<div>
				<div class="flex items-center gap-2">
					<span class="text-[10px] font-extrabold uppercase tracking-widest text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-0.5 rounded-full">
						Architecture Engine
					</span>
					<span class="text-xs text-neutral-500 font-mono">hot-reloadable</span>
				</div>
				<h2 class="text-lg sm:text-xl font-black text-neutral-900 dark:text-white mt-1.5">Select Multilingual Speech Pipeline</h2>
				<p class="text-xs text-neutral-600 dark:text-neutral-400 mt-0.5">
					Switch the entire real-time speech translation architecture dynamically with instant server synchronization.
				</p>
			</div>

			<div class="inline-flex p-1 bg-neutral-100 dark:bg-neutral-950/80 rounded-2xl border border-neutral-200 dark:border-neutral-800">
				<button
					onclick={() => handleSwitchPipeline('versionA_realtime')}
					disabled={!isSuperAdmin}
					class="px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer {pipelineMode === 'versionA_realtime' ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30' : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'}"
				>
					<Zap class="w-3.5 h-3.5" />
					<span>Version A: Fastest MVP (STS)</span>
				</button>
				<button
					onclick={() => handleSwitchPipeline('versionB_pipeline')}
					disabled={!isSuperAdmin}
					class="px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer {pipelineMode === 'versionB_pipeline' ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30' : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'}"
				>
					<Layers class="w-3.5 h-3.5" />
					<span>Version B: Maximum Control</span>
				</button>
			</div>
		</div>

		<!-- Architecture Interactive Flow Diagram -->
		<div class="pt-2">
			{#if pipelineMode === 'versionA_realtime'}
				<div class="bg-emerald-50/40 dark:bg-neutral-950/70 rounded-2xl p-5 border border-emerald-500/20 space-y-4">
					<div class="flex items-center justify-between text-xs font-mono">
						<span class="font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
							<Zap class="w-3.5 h-3.5" /> Direct Speech-to-Speech Flow
						</span>
						<span class="bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-400 px-2 py-0.5 rounded-md text-[10px] font-bold">
							ULTRA-LOW LATENCY (Zero Text Intermediary)
						</span>
					</div>

					<div class="flex flex-wrap items-center justify-center gap-3 py-3 text-center font-mono text-xs">
						<div class="px-4 py-3 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl font-bold text-neutral-800 dark:text-neutral-200 shadow-xs">
							🎙️ Microphone PCM
						</div>
						<div class="text-emerald-600 dark:text-emerald-400 font-bold hidden sm:block">─── WebRTC/WebSocket ───▶</div>
						<div class="text-emerald-600 dark:text-emerald-400 font-bold sm:hidden">▼</div>
						<div class="px-5 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 rounded-xl font-black text-white shadow-md shadow-emerald-600/30">
							🧠 OpenAI GPT Realtime STS
						</div>
						<div class="text-emerald-600 dark:text-emerald-400 font-bold hidden sm:block">─── Audio Stream ───▶</div>
						<div class="text-emerald-600 dark:text-emerald-400 font-bold sm:hidden">▼</div>
						<div class="px-4 py-3 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl font-bold text-neutral-800 dark:text-neutral-200 shadow-xs">
							🔊 Speaker Opus
						</div>
					</div>

					<p class="text-[11px] text-neutral-600 dark:text-neutral-400 text-center">
						Uses OpenAI Realtime API (<code class="text-emerald-600 dark:text-emerald-400 font-mono">gpt-4o-realtime-preview</code>) for direct voice-to-voice bidirectional translation with ephemeral session minting.
					</p>
				</div>
			{:else}
				<div class="bg-neutral-50 dark:bg-neutral-950/70 rounded-2xl p-5 border border-neutral-200 dark:border-neutral-800 space-y-4">
					<div class="flex items-center justify-between text-xs font-mono">
						<span class="font-bold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider flex items-center gap-1.5">
							<Layers class="w-3.5 h-3.5 text-emerald-500" /> Modular Multi-Stage Pipeline
						</span>
						<span class="bg-neutral-200 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 px-2 py-0.5 rounded-md text-[10px] font-bold">
							MAXIMUM CONTROL & FLEXIBILITY
						</span>
					</div>

					<div class="flex flex-wrap items-center justify-center gap-2 py-2 text-center font-mono text-xs">
						<div class="px-3 py-2 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg font-bold text-neutral-800 dark:text-neutral-200 shadow-xs">🎙️ Mic</div>
						<span class="text-neutral-400 dark:text-neutral-600">▶</span>
						<div class="px-3 py-2 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-500/30 text-blue-700 dark:text-blue-300 rounded-lg font-bold text-left shadow-xs">
							<div>1. Streaming STT</div>
							<div class="text-[10px] text-neutral-500 dark:text-neutral-400 font-normal">Groq / Deepgram / NVIDIA / Azure</div>
						</div>
						<span class="text-neutral-400 dark:text-neutral-600">▶</span>
						<div class="px-3 py-2 bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-500/30 text-indigo-700 dark:text-indigo-300 rounded-lg font-bold text-left shadow-xs">
							<div>2. Translation LLM</div>
							<div class="text-[10px] text-neutral-500 dark:text-neutral-400 font-normal">Groq / OpenRouter / NVIDIA / GPT / Azure</div>
						</div>
						<span class="text-neutral-400 dark:text-neutral-600">▶</span>
						<div class="px-3 py-2 bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-500/30 text-purple-700 dark:text-purple-300 rounded-lg font-bold text-left shadow-xs">
							<div>3. Streaming TTS</div>
							<div class="text-[10px] text-neutral-500 dark:text-neutral-400 font-normal">ElevenLabs / Azure / NVIDIA / OpenAI</div>
						</div>
						<span class="text-neutral-400 dark:text-neutral-600">▶</span>
						<div class="px-3 py-2 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg font-bold text-neutral-800 dark:text-neutral-200 shadow-xs">🔊 Speaker</div>
					</div>

					<p class="text-[11px] text-neutral-600 dark:text-neutral-400 text-center">
						Swap individual layers independently: configure ultra-fast STT on Groq LPU, high-nuance translation on OpenRouter/Llama 3.3, and natural voice synthesis on ElevenLabs.
					</p>
				</div>
			{/if}
		</div>
	</div>

	<!-- ─────────────────────────────────────────────────────────────
	     2. VERSION A CONFIGURATION PANEL
	   ───────────────────────────────────────────────────────────── -->
	{#if pipelineMode === 'versionA_realtime'}
		<div class="rounded-3xl bg-white dark:bg-neutral-900/60 border border-neutral-200 dark:border-neutral-800 p-6 space-y-6 backdrop-blur-md shadow-xs dark:shadow-xl">
			<div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
				<div>
					<h3 class="text-base font-bold text-neutral-900 dark:text-white flex items-center gap-2">
						<span>OpenAI GPT Realtime Speech-to-Speech Engine</span>
						<span class="text-[10px] px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 rounded-full font-bold">Version A</span>
					</h3>
					<p class="text-xs text-neutral-600 dark:text-neutral-400 mt-0.5">
						Configure OpenAI Realtime credentials and speech synthesis voice parameters.
					</p>
				</div>

				{#if isSuperAdmin}
					<button
						type="button"
						onclick={() => handleTestConnection('realtime', 'openai')}
						disabled={testStatus['openai']?.loading}
						class="px-3.5 py-2 bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-200 border border-neutral-200 dark:border-neutral-700 rounded-xl text-xs font-semibold flex items-center gap-2 transition disabled:opacity-50 cursor-pointer shadow-xs"
					>
						{#if testStatus['openai']?.loading}
							<RefreshCw class="w-3.5 h-3.5 animate-spin text-emerald-500" />
							<span>Testing Ping...</span>
						{:else}
							<Activity class="w-3.5 h-3.5 text-emerald-500" />
							<span>Test OpenAI Realtime</span>
						{/if}
					</button>
				{/if}
			</div>

			<!-- Test Result Notification -->
			{#if testStatus['openai']?.message}
				<div class="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-300 text-xs rounded-xl flex items-center gap-2 shadow-xs">
					<CheckCircle2 class="w-4 h-4 text-emerald-500 shrink-0" />
					<span>{testStatus['openai'].message}</span>
					{#if testStatus['openai'].latency !== undefined}
						<span class="ml-auto font-mono text-[11px] bg-emerald-500/20 px-2 py-0.5 rounded text-emerald-700 dark:text-emerald-300 font-bold">
							{testStatus['openai'].latency} ms
						</span>
					{/if}
				</div>
			{/if}
			{#if testStatus['openai']?.error}
				<div class="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-700 dark:text-rose-300 text-xs rounded-xl flex items-center gap-2 shadow-xs">
					<AlertCircle class="w-4 h-4 text-rose-500 shrink-0" />
					<span>{testStatus['openai'].error}</span>
				</div>
			{/if}

			<!-- OpenAI Realtime Guide Card -->
			<div class="p-4 bg-neutral-50 dark:bg-neutral-950/70 border border-neutral-200 dark:border-neutral-800/80 rounded-2xl text-xs space-y-3">
				<div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
					<div class="flex items-center gap-2">
						<Sparkles class="w-4 h-4 text-emerald-500" />
						<span class="font-extrabold text-neutral-800 dark:text-neutral-200 uppercase tracking-wide">
							OpenAI Realtime Credentials & Presets
						</span>
					</div>
					<a
						href="https://platform.openai.com/api-keys"
						target="_blank"
						rel="noopener noreferrer"
						class="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-bold text-xs shadow-xs transition"
					>
						<span>OpenAI API Keys Portal</span>
						<ExternalLink class="w-3.5 h-3.5" />
					</a>
				</div>
				<ol class="list-decimal list-inside space-y-1 text-neutral-600 dark:text-neutral-400 pl-1 font-medium">
					<li>Sign in to platform.openai.com and navigate to <strong>API Keys</strong> in the left menu.</li>
					<li>Click <strong>+ Create new secret key</strong>, copy the generated <code class="text-emerald-600 dark:text-emerald-400 font-mono">sk-proj-...</code> key, and paste it below.</li>
					<li>Ensure your OpenAI account has credits added in <strong>Settings &gt; Billing</strong>.</li>
				</ol>

				<!-- Clickable Model Presets -->
				<div class="pt-2 border-t border-neutral-200 dark:border-neutral-800/80">
					<span class="font-bold text-neutral-700 dark:text-neutral-300 block mb-1.5">Clickable Model Presets (click to select):</span>
					<div class="flex flex-wrap gap-2">
						{#each [
							{ id: 'gpt-4o-realtime-preview', label: 'GPT-4o Realtime Preview', tag: 'Flagship' },
							{ id: 'gpt-4o-mini-realtime-preview', label: 'GPT-4o Mini Realtime', tag: 'Lower Cost' }
						] as m}
							{@const isActive = (getFieldValue('openai', 'model') || 'gpt-4o-realtime-preview') === m.id}
							<button
								type="button"
								onclick={() => handleFieldChange('openai', 'model', m.id)}
								class="px-2.5 py-1 rounded-lg text-xs font-semibold border transition text-left flex items-center gap-1.5 cursor-pointer {isActive ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs' : 'bg-white dark:bg-neutral-900 text-neutral-700 dark:text-neutral-300 border-neutral-200 dark:border-neutral-800 hover:border-neutral-300 dark:hover:border-neutral-700 shadow-xs'}"
							>
								<span>{m.label}</span>
								<span class="text-[10px] px-1.5 py-0.2 rounded font-mono {isActive ? 'bg-emerald-700 text-white' : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400'}">{m.id}</span>
								<span class="text-[9px] px-1 rounded uppercase tracking-wider font-extrabold {isActive ? 'bg-white text-emerald-800' : 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400'}">{m.tag}</span>
							</button>
						{/each}
					</div>
				</div>
			</div>

			<!-- Credential Inputs Grid -->
			<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
				<div class="space-y-1.5 md:col-span-2">
					<label for="rtKey" class="text-xs font-bold text-neutral-700 dark:text-neutral-400 uppercase tracking-wide">OpenAI API Key</label>
					<div class="relative">
						<input
							id="rtKey"
							type={showKeys['realtime-key'] ? 'text' : 'password'}
							disabled={!isSuperAdmin}
							value={getFieldValue('openai', 'apiKey')}
							oninput={(e) => handleFieldChange('openai', 'apiKey', (e.target as HTMLInputElement).value)}
							placeholder="sk-proj-... (or leave masked to keep existing key)"
							class="w-full px-3.5 py-2 text-xs bg-white dark:bg-neutral-950 border border-neutral-300 dark:border-neutral-800 rounded-xl text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 dark:placeholder:text-neutral-600 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 disabled:opacity-60 pr-16 shadow-xs"
						/>
						<button
							type="button"
							onclick={() => (showKeys['realtime-key'] = !showKeys['realtime-key'])}
							class="absolute right-3 top-2 text-xs text-neutral-400 dark:text-neutral-500 hover:text-neutral-600 dark:hover:text-neutral-300 font-semibold cursor-pointer"
						>
							{#if showKeys['realtime-key']}
								<EyeOff class="w-4 h-4" />
							{:else}
								<Eye class="w-4 h-4" />
							{/if}
						</button>
					</div>
				</div>

				<div class="space-y-1.5">
					<label for="rtModel" class="text-xs font-bold text-neutral-700 dark:text-neutral-400 uppercase tracking-wide">Realtime Model</label>
					<input
						id="rtModel"
						type="text"
						disabled={!isSuperAdmin}
						value={getFieldValue('openai', 'model') || 'gpt-4o-realtime-preview'}
						oninput={(e) => handleFieldChange('openai', 'model', (e.target as HTMLInputElement).value)}
						placeholder="gpt-4o-realtime-preview"
						class="w-full px-3.5 py-2 text-xs bg-white dark:bg-neutral-950 border border-neutral-300 dark:border-neutral-800 rounded-xl text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 dark:placeholder:text-neutral-600 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 disabled:opacity-60 shadow-xs"
					/>
				</div>

				<div class="space-y-1.5">
					<label for="rtVoice" class="text-xs font-bold text-neutral-700 dark:text-neutral-400 uppercase tracking-wide">Synthesized Voice</label>
					<select
						id="rtVoice"
						disabled={!isSuperAdmin}
						value={getFieldValue('openai', 'voice') || 'alloy'}
						onchange={(e) => handleFieldChange('openai', 'voice', (e.target as HTMLSelectElement).value)}
						class="w-full px-3.5 py-2 text-xs bg-white dark:bg-neutral-950 border border-neutral-300 dark:border-neutral-800 rounded-xl text-neutral-900 dark:text-neutral-100 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 disabled:opacity-60 shadow-xs cursor-pointer"
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

				<div class="space-y-1.5 md:col-span-2">
					<label for="rtInst" class="text-xs font-bold text-neutral-700 dark:text-neutral-400 uppercase tracking-wide">System Prompt Instructions</label>
					<textarea
						id="rtInst"
						rows={3}
						disabled={!isSuperAdmin}
						value={getFieldValue('openai', 'instructions') || 'You are an ultra-low-latency real-time multilingual speech translator. Listen to incoming audio and respond directly with natural translated speech in the target language.'}
						oninput={(e) => handleFieldChange('openai', 'instructions', (e.target as HTMLTextAreaElement).value)}
						class="w-full px-3.5 py-2 text-xs bg-white dark:bg-neutral-950 border border-neutral-300 dark:border-neutral-800 rounded-xl text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 dark:placeholder:text-neutral-600 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 disabled:opacity-60 shadow-xs"
					></textarea>
				</div>
			</div>

			{#if isSuperAdmin}
				<div class="flex justify-end pt-2">
					<button
						type="button"
						onclick={() => handleSaveCategory('realtime')}
						disabled={saveStatus.loading}
						class="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-600/20 transition flex items-center gap-2 disabled:opacity-50 cursor-pointer"
					>
						{#if saveStatus.loading}
							<RefreshCw class="w-3.5 h-3.5 animate-spin" />
						{/if}
						<span>Save Version A Settings</span>
					</button>
				</div>
			{/if}
		</div>
	{:else}
		<!-- ─────────────────────────────────────────────────────────────
		     3. VERSION B CONFIGURATION PANEL (MODULAR PIPELINE)
		   ───────────────────────────────────────────────────────────── -->
		<div class="space-y-6">
			<!-- Sub-Category Stage Tabs -->
			<div class="flex border-b border-neutral-200 dark:border-neutral-800/80 gap-2 overflow-x-auto pb-2">
				{#each Object.entries(stageLabels) as [catKey, label]}
					<button
						type="button"
						onclick={() => {
							activeStage = catKey as any;
							testStatus = {};
						}}
						class="px-4 py-2 rounded-xl font-bold text-xs whitespace-nowrap transition-all cursor-pointer {activeStage === catKey ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/20' : 'bg-white dark:bg-neutral-900/60 border border-neutral-200 dark:border-neutral-800 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-neutral-900 dark:hover:text-white'}"
					>
						{label}
					</button>
				{/each}
			</div>

			<!-- Provider Selection Card -->
			<div class="rounded-3xl bg-white dark:bg-neutral-900/60 border border-neutral-200 dark:border-neutral-800 p-6 space-y-6 backdrop-blur-md shadow-xs dark:shadow-xl">
				<div>
					<h3 class="text-base font-bold text-neutral-900 dark:text-white flex items-center gap-2">
						<Radio class="w-4 h-4 text-emerald-500" />
						<span>{stageLabels[activeStage]} Engine</span>
					</h3>
					<p class="text-xs text-neutral-600 dark:text-neutral-400 mt-0.5">
						Choose the active provider for this pipeline stage and configure its credentials.
					</p>
				</div>

				<!-- Provider Cards Grid -->
				<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
					{#each Object.entries(currentProviders) as [pKey, pValRaw]}
						{@const pVal = pValRaw as any}
						{@const isSelected = selectedPKey === pKey}
						{@const hasKey = pVal.isConfigured || Boolean(formEdits[activeStage]?.providers?.[pKey]?.apiKey) || Boolean(pVal.apiKey)}

						<div
							role="button"
							tabindex="0"
							onclick={() => handleSelectProvider(pKey)}
							onkeydown={(e) => { if (e.key === 'Enter') handleSelectProvider(pKey); }}
							class="p-4 rounded-2xl border-2 transition-all cursor-pointer flex items-start justify-between {isSelected ? 'border-emerald-500 bg-emerald-500/10 shadow-xs' : 'border-neutral-200 dark:border-neutral-800 hover:border-neutral-300 dark:hover:border-neutral-700 bg-neutral-50/70 dark:bg-neutral-950/60'}"
						>
							<div class="flex items-start gap-3">
								<div class="mt-0.5">
									<input
										type="radio"
										name="active-{activeStage}"
										checked={isSelected}
										disabled={!isSuperAdmin}
										class="text-emerald-500 focus:ring-emerald-500 h-4 w-4 bg-white dark:bg-neutral-900 border-neutral-300 dark:border-neutral-700"
									/>
								</div>
								<div>
									<h4 class="font-bold text-neutral-900 dark:text-white text-xs">{pVal.name || pKey}</h4>
									<p class="text-[11px] text-neutral-600 dark:text-neutral-400 mt-0.5">{pVal.description || 'Configured provider engine'}</p>
								</div>
							</div>

							<span class="text-[10px] px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider shrink-0 {hasKey ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20' : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400 border border-neutral-200 dark:border-neutral-700'}">
								{hasKey ? 'Ready' : 'Unconfigured'}
							</span>
						</div>
					{/each}
				</div>

				<!-- Configuration Form for the Selected Provider -->
				{#if selectedPKey}
					<div class="border-t border-neutral-200 dark:border-neutral-800/80 pt-6 space-y-5">
						<div class="flex items-center justify-between">
							<h4 class="text-xs font-extrabold text-neutral-800 dark:text-neutral-300 uppercase tracking-wider flex items-center gap-1.5">
								<Key class="w-3.5 h-3.5 text-emerald-500" />
								<span>Configure: <span class="text-emerald-600 dark:text-emerald-400 capitalize">{selectedPKey}</span></span>
							</h4>

							{#if isSuperAdmin}
								<button
									type="button"
									onclick={() => handleTestConnection(activeStage, selectedPKey)}
									disabled={testStatus[selectedPKey]?.loading}
									class="px-3.5 py-1.5 bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-200 border border-neutral-200 dark:border-neutral-700 rounded-xl text-xs font-bold flex items-center gap-1.5 transition disabled:opacity-50 cursor-pointer shadow-xs"
								>
									{#if testStatus[selectedPKey]?.loading}
										<RefreshCw class="w-3.5 h-3.5 animate-spin text-emerald-500" />
										<span>Testing...</span>
									{:else}
										<Activity class="w-3.5 h-3.5 text-emerald-500" />
										<span>Test Connection</span>
									{/if}
								</button>
							{/if}
						</div>

						<!-- Test Notification -->
						{#if testStatus[selectedPKey]?.message}
							<div class="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-300 text-xs rounded-xl flex items-center gap-2 shadow-xs">
								<CheckCircle2 class="w-4 h-4 text-emerald-500 shrink-0" />
								<span>{testStatus[selectedPKey].message}</span>
								{#if testStatus[selectedPKey].latency !== undefined}
									<span class="ml-auto font-mono text-[11px] bg-emerald-500/20 px-2 py-0.5 rounded text-emerald-700 dark:text-emerald-300 font-bold">
										{testStatus[selectedPKey].latency} ms
									</span>
								{/if}
							</div>
						{/if}
						{#if testStatus[selectedPKey]?.error}
							<div class="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-700 dark:text-rose-300 text-xs rounded-xl flex items-center gap-2 shadow-xs">
								<AlertCircle class="w-4 h-4 text-rose-500 shrink-0" />
								<span>{testStatus[selectedPKey].error}</span>
							</div>
						{/if}

						<!-- Provider Helper Guide & Documentation Link -->
						{#if PROVIDER_GUIDES[selectedPKey]}
							{@const guide = PROVIDER_GUIDES[selectedPKey]}
							<div class="p-4 bg-neutral-50 dark:bg-neutral-950/70 border border-neutral-200 dark:border-neutral-800/80 rounded-2xl text-xs space-y-3">
								<div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
									<div class="flex items-center gap-2">
										<Sparkles class="w-4 h-4 text-emerald-500" />
										<span class="font-extrabold text-neutral-800 dark:text-neutral-200 uppercase tracking-wide">
											How to get {selectedPKey.toUpperCase()} credentials & models
										</span>
									</div>
									<div class="flex items-center gap-2">
										{#if guide.portalUrl}
											<a
												href={guide.portalUrl}
												target="_blank"
												rel="noopener noreferrer"
												class="inline-flex items-center gap-1 px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-bold text-xs shadow-xs transition"
											>
												<span>Open {guide.portalName}</span>
												<ExternalLink class="w-3.5 h-3.5" />
											</a>
										{/if}
										{#if guide.docUrl}
											<a
												href={guide.docUrl}
												target="_blank"
												rel="noopener noreferrer"
												class="inline-flex items-center gap-1 px-2.5 py-1 bg-neutral-200 hover:bg-neutral-300 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-300 rounded-lg font-medium text-xs transition"
											>
												<span>Docs</span>
												<ExternalLink class="w-3 h-3 text-neutral-500 dark:text-neutral-400" />
											</a>
										{/if}
									</div>
								</div>

								<ol class="list-decimal list-inside space-y-1 text-neutral-600 dark:text-neutral-400 pl-1 font-medium">
									{#each guide.howToGetKey as step}
										<li>{step}</li>
									{/each}
								</ol>

								<!-- Stage-Specific Model Presets -->
								{#if getStageModels(selectedPKey, activeStage).length > 0}
									<div class="pt-2 border-t border-neutral-200 dark:border-neutral-800/80">
										<span class="font-bold text-neutral-700 dark:text-neutral-300 block mb-1.5">
											Available / Recommended Models (click to select):
										</span>
										<div class="flex flex-wrap gap-2">
											{#each getStageModels(selectedPKey, activeStage) as m}
												{@const isVoice = activeStage === 'tts' && (selectedPKey === 'nvidia' || selectedPKey === 'elevenlabs' || selectedPKey === 'azure' || selectedPKey === 'google')}
												{@const targetField = isVoice ? (selectedPKey === 'google' || selectedPKey === 'azure' ? 'voice' : 'voiceId') : 'model'}
												{@const currentVal = getFieldValue(selectedPKey, targetField) || (isVoice && selectedPKey === 'azure' ? getFieldValue(selectedPKey, 'voiceId') : '')}
												{@const isActive = currentVal === m.id || (m.id === 'default' && !currentVal)}

												<button
													type="button"
													onclick={() => {
														handleFieldChange(selectedPKey, targetField, m.id);
														if (isVoice && selectedPKey === 'azure') {
															handleFieldChange(selectedPKey, 'voiceId', m.id);
														}
													}}
													title={m.desc}
													class="px-2.5 py-1 rounded-lg text-xs font-semibold border transition text-left flex items-center gap-1.5 cursor-pointer {isActive ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs' : 'bg-white dark:bg-neutral-900 text-neutral-700 dark:text-neutral-300 border-neutral-200 dark:border-neutral-800 hover:border-neutral-300 dark:hover:border-neutral-700 shadow-xs'}"
												>
													<span>{m.label}</span>
													<span class="text-[10px] px-1.5 py-0.2 rounded font-mono {isActive ? 'bg-emerald-700 text-white' : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400'}">{m.id}</span>
													{#if m.tag}
														<span class="text-[9px] px-1 rounded uppercase tracking-wider font-extrabold {isActive ? 'bg-white text-emerald-800' : 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400'}">{m.tag}</span>
													{/if}
												</button>
											{/each}
										</div>
									</div>
								{/if}
							</div>
						{/if}

						<!-- Provider Fields Inputs -->
						<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
							<!-- API Key -->
							<div class="space-y-1.5 md:col-span-2">
								<label for="pKeyInput" class="text-xs font-bold text-neutral-700 dark:text-neutral-400 uppercase tracking-wide">
									{selectedPKey.toUpperCase()} API Key / Secret Token
								</label>
								<div class="relative">
									<input
										id="pKeyInput"
										type={showKeys[selectedPKey] ? 'text' : 'password'}
										disabled={!isSuperAdmin}
										value={getFieldValue(selectedPKey, 'apiKey')}
										oninput={(e) => handleFieldChange(selectedPKey, 'apiKey', (e.target as HTMLInputElement).value)}
										placeholder="Enter API key or leave masked to preserve existing"
										class="w-full px-3.5 py-2 text-xs bg-white dark:bg-neutral-950 border border-neutral-300 dark:border-neutral-800 rounded-xl text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 dark:placeholder:text-neutral-600 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 disabled:opacity-60 pr-16 shadow-xs"
									/>
									<button
										type="button"
										onclick={() => (showKeys[selectedPKey] = !showKeys[selectedPKey])}
										class="absolute right-3 top-2 text-xs text-neutral-400 dark:text-neutral-500 hover:text-neutral-600 dark:hover:text-neutral-300 font-semibold cursor-pointer"
									>
										{#if showKeys[selectedPKey]}
											<EyeOff class="w-4 h-4" />
										{:else}
											<Eye class="w-4 h-4" />
										{/if}
									</button>
								</div>
							</div>

							<!-- Deepgram Specific -->
							{#if selectedPKey === 'deepgram'}
								<div class="space-y-1.5">
									<label for="dgModel" class="text-xs font-bold text-neutral-700 dark:text-neutral-400 uppercase tracking-wide">
										{activeStage === 'tts' ? 'Deepgram Aura Voice Model' : 'Deepgram STT Model'}
									</label>
									<input
										id="dgModel"
										type="text"
										disabled={!isSuperAdmin}
										value={getFieldValue('deepgram', 'model') || (activeStage === 'tts' ? 'aura-asteria-en' : 'nova-2')}
										oninput={(e) => handleFieldChange('deepgram', 'model', (e.target as HTMLInputElement).value)}
										placeholder={activeStage === 'tts' ? 'aura-asteria-en' : 'nova-2'}
										class="w-full px-3.5 py-2 text-xs bg-white dark:bg-neutral-950 border border-neutral-300 dark:border-neutral-800 rounded-xl text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 dark:placeholder:text-neutral-600 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 disabled:opacity-60 shadow-xs"
									/>
								</div>
							{/if}

							<!-- ElevenLabs Specific -->
							{#if selectedPKey === 'elevenlabs'}
								<div class="space-y-1.5">
									<label for="elVoice" class="text-xs font-bold text-neutral-700 dark:text-neutral-400 uppercase tracking-wide">Voice ID</label>
									<input
										id="elVoice"
										type="text"
										disabled={!isSuperAdmin}
										value={getFieldValue('elevenlabs', 'voiceId') || '21m00Tcm4TlvDq8ikWAM'}
										oninput={(e) => handleFieldChange('elevenlabs', 'voiceId', (e.target as HTMLInputElement).value)}
										placeholder="e.g. 21m00Tcm4TlvDq8ikWAM (Rachel)"
										class="w-full px-3.5 py-2 text-xs bg-white dark:bg-neutral-950 border border-neutral-300 dark:border-neutral-800 rounded-xl text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 dark:placeholder:text-neutral-600 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 disabled:opacity-60 shadow-xs"
									/>
								</div>
								<div class="space-y-1.5">
									<label for="elModel" class="text-xs font-bold text-neutral-700 dark:text-neutral-400 uppercase tracking-wide">TTS Model</label>
									<input
										id="elModel"
										type="text"
										disabled={!isSuperAdmin}
										value={getFieldValue('elevenlabs', 'model') || 'eleven_multilingual_v2'}
										oninput={(e) => handleFieldChange('elevenlabs', 'model', (e.target as HTMLInputElement).value)}
										placeholder="eleven_multilingual_v2"
										class="w-full px-3.5 py-2 text-xs bg-white dark:bg-neutral-950 border border-neutral-300 dark:border-neutral-800 rounded-xl text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 dark:placeholder:text-neutral-600 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 disabled:opacity-60 shadow-xs"
									/>
								</div>
							{/if}

							<!-- Azure Specific -->
							{#if selectedPKey === 'azure'}
								<div class="space-y-1.5">
									<label for="azRegion" class="text-xs font-bold text-neutral-700 dark:text-neutral-400 uppercase tracking-wide">Azure Region</label>
									<input
										id="azRegion"
										type="text"
										disabled={!isSuperAdmin}
										value={getFieldValue('azure', 'region') || 'eastus'}
										oninput={(e) => handleFieldChange('azure', 'region', (e.target as HTMLInputElement).value)}
										placeholder="e.g. eastus, centralindia"
										class="w-full px-3.5 py-2 text-xs bg-white dark:bg-neutral-950 border border-neutral-300 dark:border-neutral-800 rounded-xl text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 dark:placeholder:text-neutral-600 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 disabled:opacity-60 shadow-xs"
									/>
								</div>
								<div class="space-y-1.5">
									<label for="azEnd" class="text-xs font-bold text-neutral-700 dark:text-neutral-400 uppercase tracking-wide">Custom Endpoint (Optional)</label>
									<input
										id="azEnd"
										type="text"
										disabled={!isSuperAdmin}
										value={getFieldValue('azure', 'endpoint')}
										oninput={(e) => handleFieldChange('azure', 'endpoint', (e.target as HTMLInputElement).value)}
										placeholder="Default Azure endpoint"
										class="w-full px-3.5 py-2 text-xs bg-white dark:bg-neutral-950 border border-neutral-300 dark:border-neutral-800 rounded-xl text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 dark:placeholder:text-neutral-600 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 disabled:opacity-60 shadow-xs"
									/>
								</div>
								{#if activeStage === 'tts'}
									<div class="space-y-1.5">
										<label for="azVoice" class="text-xs font-bold text-neutral-700 dark:text-neutral-400 uppercase tracking-wide">Azure Neural Voice</label>
										<input
											id="azVoice"
											type="text"
											disabled={!isSuperAdmin}
											value={getFieldValue('azure', 'voice') || getFieldValue('azure', 'voiceId') || 'hi-IN-SwaraNeural'}
											oninput={(e) => {
												handleFieldChange('azure', 'voice', (e.target as HTMLInputElement).value);
												handleFieldChange('azure', 'voiceId', (e.target as HTMLInputElement).value);
											}}
											placeholder="e.g. hi-IN-SwaraNeural or en-US-JennyNeural"
											class="w-full px-3.5 py-2 text-xs bg-white dark:bg-neutral-950 border border-neutral-300 dark:border-neutral-800 rounded-xl text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 dark:placeholder:text-neutral-600 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 disabled:opacity-60 shadow-xs"
										/>
									</div>
								{:else}
									<div class="space-y-1.5">
										<label for="azModel" class="text-xs font-bold text-neutral-700 dark:text-neutral-400 uppercase tracking-wide">
											{activeStage === 'translation' ? 'Azure Translator Model' : 'Azure STT Model'}
										</label>
										<input
											id="azModel"
											type="text"
											disabled={!isSuperAdmin}
											value={getFieldValue('azure', 'model') || (activeStage === 'translation' ? 'standard' : 'default')}
											oninput={(e) => handleFieldChange('azure', 'model', (e.target as HTMLInputElement).value)}
											placeholder={activeStage === 'translation' ? 'standard' : 'default'}
											class="w-full px-3.5 py-2 text-xs bg-white dark:bg-neutral-950 border border-neutral-300 dark:border-neutral-800 rounded-xl text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 dark:placeholder:text-neutral-600 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 disabled:opacity-60 shadow-xs"
										/>
									</div>
								{/if}
							{/if}

							<!-- LiveKit SFU Specific -->
							{#if selectedPKey === 'livekit'}
								<div class="space-y-1.5 md:col-span-2">
									<label for="lkUrl" class="text-xs font-bold text-neutral-700 dark:text-neutral-400 uppercase tracking-wide">LiveKit SFU Server URL</label>
									<input
										id="lkUrl"
										type="text"
										disabled={!isSuperAdmin}
										value={getFieldValue('livekit', 'url')}
										oninput={(e) => handleFieldChange('livekit', 'url', (e.target as HTMLInputElement).value)}
										placeholder="wss://your-project.livekit.cloud"
										class="w-full px-3.5 py-2 text-xs bg-white dark:bg-neutral-950 border border-neutral-300 dark:border-neutral-800 rounded-xl text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 dark:placeholder:text-neutral-600 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 disabled:opacity-60 shadow-xs"
									/>
								</div>
								<div class="space-y-1.5 md:col-span-2">
									<label for="lkSecret" class="text-xs font-bold text-neutral-700 dark:text-neutral-400 uppercase tracking-wide">LiveKit API Secret</label>
									<input
										id="lkSecret"
										type={showKeys['lk-secret'] ? 'text' : 'password'}
										disabled={!isSuperAdmin}
										value={getFieldValue('livekit', 'apiSecret')}
										oninput={(e) => handleFieldChange('livekit', 'apiSecret', (e.target as HTMLInputElement).value)}
										placeholder="LiveKit API Secret (leave masked to keep)"
										class="w-full px-3.5 py-2 text-xs bg-white dark:bg-neutral-950 border border-neutral-300 dark:border-neutral-800 rounded-xl text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 dark:placeholder:text-neutral-600 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 disabled:opacity-60 shadow-xs"
									/>
								</div>
							{/if}

							<!-- OpenAI Specific -->
							{#if selectedPKey === 'openai'}
								<div class="space-y-1.5">
									<label for="oaModel" class="text-xs font-bold text-neutral-700 dark:text-neutral-400 uppercase tracking-wide">
										{activeStage === 'tts' ? 'TTS Model' : activeStage === 'stt' ? 'Whisper STT Model' : 'OpenAI Model'}
									</label>
									<input
										id="oaModel"
										type="text"
										disabled={!isSuperAdmin}
										value={getFieldValue('openai', 'model') || (activeStage === 'tts' ? 'tts-1' : activeStage === 'stt' ? 'whisper-1' : 'gpt-4o-mini')}
										oninput={(e) => handleFieldChange('openai', 'model', (e.target as HTMLInputElement).value)}
										class="w-full px-3.5 py-2 text-xs bg-white dark:bg-neutral-950 border border-neutral-300 dark:border-neutral-800 rounded-xl text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 dark:placeholder:text-neutral-600 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 disabled:opacity-60 shadow-xs"
									/>
								</div>
								{#if activeStage === 'tts'}
									<div class="space-y-1.5">
										<label for="oaVoice" class="text-xs font-bold text-neutral-700 dark:text-neutral-400 uppercase tracking-wide">OpenAI Voice</label>
										<select
											id="oaVoice"
											disabled={!isSuperAdmin}
											value={getFieldValue('openai', 'voice') || 'alloy'}
											onchange={(e) => handleFieldChange('openai', 'voice', (e.target as HTMLSelectElement).value)}
											class="w-full px-3.5 py-2 text-xs bg-white dark:bg-neutral-950 border border-neutral-300 dark:border-neutral-800 rounded-xl text-neutral-900 dark:text-neutral-100 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 disabled:opacity-60 shadow-xs cursor-pointer"
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
								{/if}
							{/if}

							<!-- Groq Specific -->
							{#if selectedPKey === 'groq'}
								<div class="space-y-1.5">
									<label for="gqModel" class="text-xs font-bold text-neutral-700 dark:text-neutral-400 uppercase tracking-wide">
										{activeStage === 'stt' ? 'Groq Whisper Model' : 'Groq Translation Model'}
									</label>
									<input
										id="gqModel"
										type="text"
										disabled={!isSuperAdmin}
										value={getFieldValue('groq', 'model') || (activeStage === 'stt' ? 'whisper-large-v3-turbo' : 'qwen/qwen3.8-27b')}
										oninput={(e) => handleFieldChange('groq', 'model', (e.target as HTMLInputElement).value)}
										placeholder={activeStage === 'stt' ? 'whisper-large-v3-turbo' : 'qwen/qwen3.8-27b'}
										class="w-full px-3.5 py-2 text-xs bg-white dark:bg-neutral-950 border border-neutral-300 dark:border-neutral-800 rounded-xl text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 dark:placeholder:text-neutral-600 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 disabled:opacity-60 shadow-xs"
									/>
								</div>
								<div class="space-y-1.5">
									<label for="gqEnd" class="text-xs font-bold text-neutral-700 dark:text-neutral-400 uppercase tracking-wide">Custom Endpoint (Optional)</label>
									<input
										id="gqEnd"
										type="text"
										disabled={!isSuperAdmin}
										value={getFieldValue('groq', 'endpoint')}
										oninput={(e) => handleFieldChange('groq', 'endpoint', (e.target as HTMLInputElement).value)}
										placeholder="https://api.groq.com/openai/v1"
										class="w-full px-3.5 py-2 text-xs bg-white dark:bg-neutral-950 border border-neutral-300 dark:border-neutral-800 rounded-xl text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 dark:placeholder:text-neutral-600 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 disabled:opacity-60 shadow-xs"
									/>
								</div>
							{/if}

							<!-- OpenRouter Specific -->
							{#if selectedPKey === 'openrouter'}
								<div class="space-y-1.5">
									<label for="orModel" class="text-xs font-bold text-neutral-700 dark:text-neutral-400 uppercase tracking-wide">Model Identifier</label>
									<input
										id="orModel"
										type="text"
										disabled={!isSuperAdmin}
										value={getFieldValue('openrouter', 'model') || 'meta-llama/llama-3.3-70b-instruct'}
										oninput={(e) => handleFieldChange('openrouter', 'model', (e.target as HTMLInputElement).value)}
										placeholder="meta-llama/llama-3.3-70b-instruct"
										class="w-full px-3.5 py-2 text-xs bg-white dark:bg-neutral-950 border border-neutral-300 dark:border-neutral-800 rounded-xl text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 dark:placeholder:text-neutral-600 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 disabled:opacity-60 shadow-xs"
									/>
								</div>
								<div class="space-y-1.5">
									<label for="orEnd" class="text-xs font-bold text-neutral-700 dark:text-neutral-400 uppercase tracking-wide">Base URL (Optional)</label>
									<input
										id="orEnd"
										type="text"
										disabled={!isSuperAdmin}
										value={getFieldValue('openrouter', 'endpoint')}
										oninput={(e) => handleFieldChange('openrouter', 'endpoint', (e.target as HTMLInputElement).value)}
										placeholder="https://openrouter.ai/api/v1"
										class="w-full px-3.5 py-2 text-xs bg-white dark:bg-neutral-950 border border-neutral-300 dark:border-neutral-800 rounded-xl text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 dark:placeholder:text-neutral-600 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 disabled:opacity-60 shadow-xs"
									/>
								</div>
							{/if}

							<!-- NVIDIA Specific -->
							{#if selectedPKey === 'nvidia'}
								<div class="space-y-1.5">
									<label for="nvModel" class="text-xs font-bold text-neutral-700 dark:text-neutral-400 uppercase tracking-wide">
										{activeStage === 'tts' ? 'Voice Identifier' : 'NVIDIA NIM Model'}
									</label>
									<input
										id="nvModel"
										type="text"
										disabled={!isSuperAdmin}
										value={activeStage === 'tts'
											? (getFieldValue('nvidia', 'voiceId') || 'English-US.Female-1')
											: (getFieldValue('nvidia', 'model') || (activeStage === 'stt' ? 'nvidia/canary-1b' : 'meta/llama-3.3-70b-instruct'))
										}
										oninput={(e) => {
											const val = (e.target as HTMLInputElement).value;
											if (activeStage === 'tts') {
												handleFieldChange('nvidia', 'voiceId', val);
											} else {
												handleFieldChange('nvidia', 'model', val);
											}
										}}
										placeholder={activeStage === 'tts' ? 'English-US.Female-1' : activeStage === 'stt' ? 'nvidia/canary-1b' : 'meta/llama-3.3-70b-instruct'}
										class="w-full px-3.5 py-2 text-xs bg-white dark:bg-neutral-950 border border-neutral-300 dark:border-neutral-800 rounded-xl text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 dark:placeholder:text-neutral-600 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 disabled:opacity-60 shadow-xs"
									/>
								</div>
								<div class="space-y-1.5">
									<label for="nvEnd" class="text-xs font-bold text-neutral-700 dark:text-neutral-400 uppercase tracking-wide">NIM Endpoint (Optional)</label>
									<input
										id="nvEnd"
										type="text"
										disabled={!isSuperAdmin}
										value={getFieldValue('nvidia', 'endpoint')}
										oninput={(e) => handleFieldChange('nvidia', 'endpoint', (e.target as HTMLInputElement).value)}
										placeholder="https://integrate.api.nvidia.com/v1"
										class="w-full px-3.5 py-2 text-xs bg-white dark:bg-neutral-950 border border-neutral-300 dark:border-neutral-800 rounded-xl text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 dark:placeholder:text-neutral-600 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 disabled:opacity-60 shadow-xs"
									/>
								</div>
							{/if}

							<!-- Google Specific -->
							{#if selectedPKey === 'google'}
								{#if activeStage === 'tts'}
									<div class="space-y-1.5">
										<label for="gVoice" class="text-xs font-bold text-neutral-700 dark:text-neutral-400 uppercase tracking-wide">Voice Preset</label>
										<input
											id="gVoice"
											type="text"
											disabled={!isSuperAdmin}
											value={getFieldValue('google', 'voice') || 'default'}
											oninput={(e) => handleFieldChange('google', 'voice', (e.target as HTMLInputElement).value)}
											placeholder="default (Universal Neural Hindi & English)"
											class="w-full px-3.5 py-2 text-xs bg-white dark:bg-neutral-950 border border-neutral-300 dark:border-neutral-800 rounded-xl text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 dark:placeholder:text-neutral-600 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 disabled:opacity-60 shadow-xs"
										/>
									</div>
								{:else}
									<div class="space-y-1.5">
										<label for="gModel" class="text-xs font-bold text-neutral-700 dark:text-neutral-400 uppercase tracking-wide">Translation Model</label>
										<input
											id="gModel"
											type="text"
											disabled={!isSuperAdmin}
											value={getFieldValue('google', 'model') || 'nmt'}
											oninput={(e) => handleFieldChange('google', 'model', (e.target as HTMLInputElement).value)}
											placeholder="nmt or gtx"
											class="w-full px-3.5 py-2 text-xs bg-white dark:bg-neutral-950 border border-neutral-300 dark:border-neutral-800 rounded-xl text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 dark:placeholder:text-neutral-600 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 disabled:opacity-60 shadow-xs"
										/>
									</div>
								{/if}
							{/if}
						</div>

						<!-- Save Category Settings Button -->
						{#if isSuperAdmin}
							<div class="flex justify-end pt-3">
								<button
									type="button"
									onclick={() => handleSaveCategory(activeStage)}
									disabled={saveStatus.loading}
									class="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-600/20 transition flex items-center gap-2 disabled:opacity-50 cursor-pointer"
								>
									{#if saveStatus.loading}
										<RefreshCw class="w-3.5 h-3.5 animate-spin" />
									{/if}
									<span>Save {stageLabels[activeStage]} Settings</span>
								</button>
							</div>
						{/if}
					</div>
				{/if}
			</div>
		</div>
	{/if}
</div>
