<script lang="ts">
	import { authStore } from '$lib/stores/auth.svelte';
	import { themeStore } from '$lib/stores/theme.svelte';
	import { settingsStore } from '$lib/stores/settings.svelte';
	import { callSounds } from '$lib/utils/callSounds';
	import { api } from '$lib/api/client';
	import {
		X,
		User,
		Globe,
		Languages,
		Volume2,
		Sun,
		Moon,
		Zap,
		ShieldCheck,
		Check,
		RefreshCw,
		Sliders
	} from 'lucide-svelte';

	interface Props {
		isOpen: boolean;
		onClose: () => void;
	}

	let { isOpen = false, onClose }: Props = $props();

	const LANGUAGES = [
		{ code: 'en', name: 'English (US/UK)' },
		{ code: 'hi', name: 'हिन्दी (Hindi)' },
		{ code: 'es', name: 'Español (Spanish)' },
		{ code: 'fr', name: 'Français (French)' },
		{ code: 'de', name: 'Deutsch (German)' },
		{ code: 'ja', name: '日本語 (Japanese)' },
		{ code: 'zh', name: '中文 (Chinese)' },
		{ code: 'ar', name: 'العربية (Arabic)' },
		{ code: 'ru', name: 'Русский (Russian)' },
		{ code: 'pt', name: 'Português (Portuguese)' },
		{ code: 'it', name: 'Italiano (Italian)' },
		{ code: 'ko', name: '한국어 (Korean)' },
		{ code: 'bn', name: 'বাংলা (Bengali)' },
		{ code: 'te', name: 'తెలుగు (Telugu)' },
		{ code: 'ta', name: 'தமிழ் (Tamil)' },
		{ code: 'mr', name: 'मराठी (Marathi)' },
		{ code: 'ur', name: 'اردو (Urdu)' },
		{ code: 'gu', name: 'ગુજરાતી (Gujarati)' }
	];

	let selectedLanguage = $state(authStore.user?.preferred_language || 'en');
	let isSavingLanguage = $state(false);
	let saveSuccess = $state(false);
	let playingTone = $state<'ringtone' | 'ringback' | null>(null);

	$effect(() => {
		if (authStore.user?.preferred_language) {
			selectedLanguage = authStore.user.preferred_language;
		}
	});

	async function handleLanguageChange(newLang: string) {
		selectedLanguage = newLang;
		isSavingLanguage = true;
		saveSuccess = false;

		try {
			await api.put('/auth/language', { language: newLang });
			if (authStore.user) {
				authStore.user.preferred_language = newLang;
			}
			saveSuccess = true;
			setTimeout(() => (saveSuccess = false), 2500);
		} catch (err) {
			alert('Failed to update language: ' + err);
		} finally {
			isSavingLanguage = false;
		}
	}

	function testSound(type: 'ringtone' | 'ringback') {
		if (playingTone === type) {
			callSounds.stopAll();
			playingTone = null;
			return;
		}

		playingTone = type;
		if (type === 'ringtone') {
			callSounds.playRingtone();
		} else {
			callSounds.playRingback();
		}

		setTimeout(() => {
			if (playingTone === type) {
				callSounds.stopAll();
				playingTone = null;
			}
		}, 4000);
	}

	function handleClose() {
		callSounds.stopAll();
		playingTone = null;
		onClose();
	}
</script>

{#if isOpen}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fade-in">
		<div
			class="w-full max-w-lg rounded-3xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
		>
			<!-- Header -->
			<div class="flex items-center justify-between px-6 py-5 border-b border-neutral-200 dark:border-neutral-800">
				<div class="flex items-center gap-3">
					<div class="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-50 dark:bg-emerald-600/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400">
						<Sliders class="h-5 w-5" />
					</div>
					<div>
						<h3 class="text-base font-bold text-neutral-900 dark:text-white">User Settings & Preferences</h3>
						<p class="text-xs text-neutral-500 dark:text-neutral-400">Configure language, call translation, and appearance</p>
					</div>
				</div>

				<button
					onclick={handleClose}
					class="flex h-8 w-8 items-center justify-center rounded-xl bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-all"
				>
					<X class="h-4 w-4" />
				</button>
			</div>

			<!-- Body -->
			<div class="p-6 overflow-y-auto space-y-6">
				<!-- Profile Card -->
				<div class="flex items-center gap-4 p-4 rounded-2xl bg-neutral-50 dark:bg-neutral-950/60 border border-neutral-200 dark:border-neutral-800">
					<div class="h-14 w-14 rounded-2xl bg-emerald-100 dark:bg-emerald-950/60 border border-emerald-500/30 flex items-center justify-center font-bold text-xl text-emerald-700 dark:text-emerald-400 uppercase">
						{authStore.user?.username?.[0] || 'U'}
					</div>
					<div class="flex-1 min-w-0">
						<div class="flex items-center gap-2">
							<h4 class="font-bold text-sm text-neutral-900 dark:text-white truncate">{authStore.user?.username}</h4>
							<span class="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
								{authStore.user?.role}
							</span>
						</div>
						<p class="text-xs text-neutral-500 dark:text-neutral-400 truncate mt-0.5">{authStore.user?.email}</p>
					</div>
				</div>

				<!-- 1. Preferred Translation Language -->
				<div class="space-y-3">
					<div class="flex items-center justify-between">
						<label class="text-xs font-bold text-neutral-700 dark:text-neutral-300 uppercase tracking-wide flex items-center gap-1.5">
							<Globe class="w-4 h-4 text-emerald-500 dark:text-emerald-400" />
							<span>My Native / Preferred Language</span>
						</label>
						{#if saveSuccess}
							<span class="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
								<Check class="w-3.5 h-3.5" /> Language Saved!
							</span>
						{/if}
					</div>

					<p class="text-[11px] text-neutral-500 dark:text-neutral-400">
						Incoming voice calls and chat messages from other users will automatically translate into this language for you.
					</p>

					<div class="relative">
						<select
							value={selectedLanguage}
							onchange={(e) => handleLanguageChange((e.target as HTMLSelectElement).value)}
							disabled={isSavingLanguage}
							class="w-full rounded-xl bg-white dark:bg-neutral-950 border border-neutral-300 dark:border-neutral-800 p-3 text-xs text-neutral-900 dark:text-white focus:outline-none focus:border-emerald-500 font-medium"
						>
							{#each LANGUAGES as lang}
								<option value={lang.code}>{lang.name} ({lang.code.toUpperCase()})</option>
							{/each}
						</select>
						{#if isSavingLanguage}
							<div class="absolute right-3 top-3">
								<RefreshCw class="w-4 h-4 animate-spin text-emerald-500" />
							</div>
						{/if}
					</div>
				</div>

				<!-- 2. Call Translation Mode (Auto-Bypass for same language) -->
				<div class="space-y-3 pt-4 border-t border-neutral-200 dark:border-neutral-800/80">
					<label class="text-xs font-bold text-neutral-700 dark:text-neutral-300 uppercase tracking-wide flex items-center gap-1.5">
						<Zap class="w-4 h-4 text-emerald-500 dark:text-emerald-400" />
						<span>Real-Time Call Translation Engine</span>
					</label>

					<div class="space-y-2">
						<!-- Option 1: Auto-Bypass (Smart) -->
						<label
							class="flex items-start gap-3 p-3 rounded-2xl border cursor-pointer transition-all {settingsStore.preferences.callTranslationMode === 'auto'
								? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-500/40 text-neutral-900 dark:text-white'
								: 'bg-neutral-50 dark:bg-neutral-950/40 border-neutral-200 dark:border-neutral-800 text-neutral-600 dark:text-neutral-400'}"
						>
							<input
								type="radio"
								name="callTranslationMode"
								value="auto"
								checked={settingsStore.preferences.callTranslationMode === 'auto'}
								onchange={() => settingsStore.updatePreferences({ callTranslationMode: 'auto' })}
								class="mt-1 text-emerald-600 focus:ring-emerald-500"
							/>
							<div>
								<div class="text-xs font-bold flex items-center gap-2">
									<span>⚡ Smart Auto-Bypass (Recommended)</span>
									<span class="rounded bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 px-1.5 py-0.2 text-[9px] font-extrabold uppercase">
										0ms Latency
									</span>
								</div>
								<p class="text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5">
									If both callers (or all group participants) share the same language, AI translation is automatically bypassed so you speak with 100% natural, direct audio without delays.
								</p>
							</div>
						</label>

						<!-- Option 2: Always Translate -->
						<label
							class="flex items-start gap-3 p-3 rounded-2xl border cursor-pointer transition-all {settingsStore.preferences.callTranslationMode === 'always'
								? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-500/40 text-neutral-900 dark:text-white'
								: 'bg-neutral-50 dark:bg-neutral-950/40 border-neutral-200 dark:border-neutral-800 text-neutral-600 dark:text-neutral-400'}"
						>
							<input
								type="radio"
								name="callTranslationMode"
								value="always"
								checked={settingsStore.preferences.callTranslationMode === 'always'}
								onchange={() => settingsStore.updatePreferences({ callTranslationMode: 'always' })}
								class="mt-1 text-emerald-600 focus:ring-emerald-500"
							/>
							<div>
								<div class="text-xs font-bold">🌐 Always Translate</div>
								<p class="text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5">
									Always transcribes and translates all incoming and outgoing speech regardless of language match.
								</p>
							</div>
						</label>

						<!-- Option 3: Disabled -->
						<label
							class="flex items-start gap-3 p-3 rounded-2xl border cursor-pointer transition-all {settingsStore.preferences.callTranslationMode === 'disabled'
								? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-500/40 text-neutral-900 dark:text-white'
								: 'bg-neutral-50 dark:bg-neutral-950/40 border-neutral-200 dark:border-neutral-800 text-neutral-600 dark:text-neutral-400'}"
						>
							<input
								type="radio"
								name="callTranslationMode"
								value="disabled"
								checked={settingsStore.preferences.callTranslationMode === 'disabled'}
								onchange={() => settingsStore.updatePreferences({ callTranslationMode: 'disabled' })}
								class="mt-1 text-emerald-600 focus:ring-emerald-500"
							/>
							<div>
								<div class="text-xs font-bold">🔇 Off (Direct Calls Only)</div>
								<p class="text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5">
									Disables AI translation completely. Audio and video route purely through LiveKit SFU.
								</p>
							</div>
						</label>
					</div>
				</div>

				<!-- 3. Appearance / Theme Toggle -->
				<div class="space-y-3 pt-4 border-t border-neutral-200 dark:border-neutral-800/80">
					<label class="text-xs font-bold text-neutral-700 dark:text-neutral-300 uppercase tracking-wide flex items-center gap-1.5">
						{#if themeStore.current === 'dark'}
							<Moon class="w-4 h-4 text-emerald-400" />
						{:else}
							<Sun class="w-4 h-4 text-amber-500" />
						{/if}
						<span>Appearance Theme</span>
					</label>

					<div class="grid grid-cols-2 gap-3">
						<button
							type="button"
							onclick={() => themeStore.setTheme('dark')}
							class="flex items-center justify-center gap-2 p-3 rounded-2xl border transition-all {themeStore.current === 'dark'
								? 'bg-emerald-600/20 border-emerald-500 text-neutral-900 dark:text-white font-bold'
								: 'bg-neutral-100 dark:bg-neutral-950/40 border-neutral-200 dark:border-neutral-800 text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'}"
						>
							<Moon class="w-4 h-4 text-emerald-400" />
							<span class="text-xs">Dark Mode</span>
						</button>

						<button
							type="button"
							onclick={() => themeStore.setTheme('light')}
							class="flex items-center justify-center gap-2 p-3 rounded-2xl border transition-all {themeStore.current === 'light'
								? 'bg-emerald-50 border-emerald-500 text-emerald-700 font-bold'
								: 'bg-neutral-100 dark:bg-neutral-950/40 border-neutral-200 dark:border-neutral-800 text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'}"
						>
							<Sun class="w-4 h-4 text-amber-500" />
							<span class="text-xs">Light Mode</span>
						</button>
					</div>
				</div>

				<!-- 4. Ringtone & Callertune Audio Test -->
				<div class="space-y-3 pt-4 border-t border-neutral-200 dark:border-neutral-800/80">
					<label class="text-xs font-bold text-neutral-700 dark:text-neutral-300 uppercase tracking-wide flex items-center gap-1.5">
						<Volume2 class="w-4 h-4 text-emerald-500 dark:text-emerald-400" />
						<span>Calling Tones & Audio Signals</span>
					</label>
					<p class="text-[11px] text-neutral-500 dark:text-neutral-400">
						Test the ringtone (played when you receive a call) and callertune (played while you wait for someone to answer).
					</p>

					<div class="grid grid-cols-2 gap-3">
						<button
							type="button"
							onclick={() => testSound('ringtone')}
							class="flex items-center justify-center gap-2 p-2.5 rounded-xl text-xs font-semibold border transition-all {playingTone === 'ringtone'
								? 'bg-rose-500/20 border-rose-500 text-rose-600 dark:text-rose-300 animate-pulse'
								: 'bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-800 dark:text-neutral-200 border-neutral-200 dark:border-neutral-700'}"
						>
							<Volume2 class="w-3.5 h-3.5" />
							<span>{playingTone === 'ringtone' ? 'Stop Ringtone' : 'Test Ringtone'}</span>
						</button>

						<button
							type="button"
							onclick={() => testSound('ringback')}
							class="flex items-center justify-center gap-2 p-2.5 rounded-xl text-xs font-semibold border transition-all {playingTone === 'ringback'
								? 'bg-rose-500/20 border-rose-500 text-rose-600 dark:text-rose-300 animate-pulse'
								: 'bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-800 dark:text-neutral-200 border-neutral-200 dark:border-neutral-700'}"
						>
							<Volume2 class="w-3.5 h-3.5" />
							<span>{playingTone === 'ringback' ? 'Stop Callertune' : 'Test Callertune'}</span>
						</button>
					</div>
				</div>
			</div>

			<!-- Footer -->
			<div class="flex items-center justify-end px-6 py-4 border-t border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950/40">
				<button
					onclick={handleClose}
					class="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-md shadow-emerald-600/20 transition active:scale-95"
				>
					Done
				</button>
			</div>
		</div>
	</div>
{/if}
