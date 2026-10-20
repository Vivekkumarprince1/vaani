<script lang="ts">
	import { callStore } from '$lib/stores/call.svelte';
	import { authStore } from '$lib/stores/auth.svelte';
	import { chatStore } from '$lib/stores/chat.svelte';
	import { settingsStore } from '$lib/stores/settings.svelte';
	import { callSpeechService } from '$lib/services/callSpeech';
	import ParticipantTile from './ParticipantTile.svelte';
	import LiveSubtitlesOverlay from './LiveSubtitlesOverlay.svelte';
	import { api } from '$lib/api/client';
	import {
		Mic,
		MicOff,
		Video,
		VideoOff,
		ScreenShare,
		PhoneOff,
		Users,
		Zap,
		Globe,
		Radio,
		Phone,
		Share2,
		Check,
		ChevronUp
	} from 'lucide-svelte';

	let copiedLink = $state(false);

	function copyMeetingLink() {
		if (!callStore.currentCallRoomId || typeof window === 'undefined') return;
		const link = `${window.location.origin}/join/${callStore.currentCallRoomId}`;
		navigator.clipboard.writeText(link);
		copiedLink = true;
		setTimeout(() => {
			copiedLink = false;
		}, 2000);
	}

	const SUPPORTED_LANGUAGES = [
		{ code: 'auto', name: 'Auto-Detect', flag: '✨', native: 'Zero Selection (Any Lang)' },
		{ code: 'en', name: 'English', flag: '🇺🇸', native: 'English' },
		{ code: 'ru', name: 'Russian', flag: '🇷🇺', native: 'Русский' },
		{ code: 'hi', name: 'Hindi', flag: '🇮🇳', native: 'हिन्दी' },
		{ code: 'es', name: 'Spanish', flag: '🇪🇸', native: 'Español' },
		{ code: 'fr', name: 'French', flag: '🇫🇷', native: 'Français' },
		{ code: 'de', name: 'German', flag: '🇩🇪', native: 'Deutsch' },
		{ code: 'ja', name: 'Japanese', flag: '🇯🇵', native: '日本語' },
		{ code: 'zh', name: 'Chinese', flag: '🇨🇳', native: '中文' },
		{ code: 'ar', name: 'Arabic', flag: '🇸🇦', native: 'العربية' },
		{ code: 'pt', name: 'Portuguese', flag: '🇧🇷', native: 'Português' },
		{ code: 'it', name: 'Italian', flag: '🇮🇹', native: 'Italiano' },
		{ code: 'bn', name: 'Bengali', flag: '🇮🇳', native: 'বাংলা' },
		{ code: 'ta', name: 'Tamil', flag: '🇮🇳', native: 'தமிழ்' },
		{ code: 'te', name: 'Telugu', flag: '🇮🇳', native: 'తెలుగు' },
		{ code: 'mr', name: 'Marathi', flag: '🇮🇳', native: 'मराठी' },
		{ code: 'ur', name: 'Urdu', flag: '🇵🇰', native: 'اردو' },
		{ code: 'tr', name: 'Turkish', flag: '🇹🇷', native: 'Türkçe' },
		{ code: 'ko', name: 'Korean', flag: '🇰🇷', native: '한국어' }
	];

	let showLanguageMenu = $state(false);
	let speakLanguage = $state('auto');
	let myLanguage = $derived(
		speakLanguage === 'auto'
			? authStore.user?.preferred_language || 'en'
			: speakLanguage
	);

	function selectLanguage(code: string) {
		speakLanguage = code;
		if (code !== 'auto' && authStore.user) {
			authStore.user = { ...(authStore.user as any), preferred_language: code };
			api.put('/auth/language', { language: code }).catch(() => {});
		}
		callSpeechService.setLanguage(code);
		if (callStore.room?.localParticipant) {
			callStore.room.localParticipant
				.setMetadata(
					JSON.stringify({
						preferred_language: code === 'auto' ? (authStore.user?.preferred_language || 'en') : code,
						username: authStore.user?.username || ''
					})
				)
				.catch(() => {});
		}
		showLanguageMenu = false;
	}

	let currentLangObj = $derived(
		SUPPORTED_LANGUAGES.find((l) => l.code === speakLanguage) || {
			code: speakLanguage,
			name: speakLanguage.toUpperCase(),
			flag: '🌐',
			native: speakLanguage.toUpperCase()
		}
	);

	let otherLanguage = $derived(
		chatStore.activeRoom?.type === 'direct'
			? chatStore.activeRoom.other_user?.preferred_language || (speakLanguage === 'en' ? 'hi' : 'en')
			: 'multi'
	);

	let isLanguageMatch = $derived.by(() => {
		if (chatStore.activeRoom?.type === 'direct') {
			const other = chatStore.activeRoom.other_user?.preferred_language;
			return Boolean(other && other.toLowerCase() === myLanguage.toLowerCase());
		}
		if (chatStore.activeMembers.length > 1) {
			return chatStore.activeMembers.every(
				(m) => (m.preferred_language || 'en').toLowerCase() === myLanguage.toLowerCase()
			);
		}
		return false;
	});

	// Only bypass if the user explicitly chose 'disabled' in preferences
	let isTranslationBypassed = $derived(settingsStore.preferences.callTranslationMode === 'disabled');

	$effect(() => {
		if (
			callStore.isInCall &&
			callStore.currentCallRoomId &&
			!isTranslationBypassed &&
			!callStore.isMuted
		) {
			callSpeechService.start(
				callStore.currentCallRoomId,
				speakLanguage,
				callStore.localStream
			);
		} else {
			callSpeechService.stop();
		}

		return () => {
			callSpeechService.stop();
		};
	});
</script>

{#if callStore.isInCall}
	<div class="fixed inset-0 z-40 flex flex-col bg-neutral-950 text-white animate-fade-in">
		<!-- Top Bar -->
		<div class="flex items-center justify-between px-6 py-4 bg-neutral-900/60 backdrop-blur-md border-b border-white/5">
			<div class="flex items-center gap-3">
				<div class="h-3 w-3 rounded-full bg-emerald-500 animate-pulse"></div>
				<span class="font-semibold text-sm tracking-wide">
					{chatStore.activeRoom?.name || 'Call Room'}
				</span>
				<span class="rounded-full bg-neutral-800 px-2.5 py-0.5 text-xs text-neutral-400 font-mono">
					{callStore.currentCallRoomId}
				</span>
			</div>

			<!-- Dynamic Translation / Direct Bypass Status Badge -->
			<div class="hidden sm:flex items-center">
				{#if isTranslationBypassed}
					<div
						class="flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs font-semibold shadow-xs"
						title="Audio is routed directly without AI transcription or synthesis for zero latency"
					>
						<Zap class="w-3.5 h-3.5 shrink-0" />
						<span>
							⚡ Direct Call {isLanguageMatch ? `(Language Match: ${myLanguage.toUpperCase()})` : ''} • AI Translation Bypassed (0ms Latency)
						</span>
					</div>
				{:else}
					<div
						class="flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/15 border border-indigo-500/30 text-indigo-300 text-xs font-semibold shadow-xs"
						title="Real-time speech-to-speech translation engine active"
					>
						<Globe class="w-3.5 h-3.5 shrink-0 text-indigo-400" />
						<span>
							🌐 Multilingual Translation Active ({myLanguage.toUpperCase()} ⇄ {otherLanguage.toUpperCase()})
						</span>
					</div>
				{/if}
			</div>

			<div class="flex items-center gap-3">
				<button
					onclick={copyMeetingLink}
					class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-xs font-medium text-neutral-200 transition active:scale-95 border border-white/5 cursor-pointer"
					title="Copy shareable meeting link to invite others"
				>
					{#if copiedLink}
						<Check class="w-3.5 h-3.5 text-emerald-400" />
						<span class="text-emerald-400 font-medium">Copied!</span>
					{:else}
						<Share2 class="w-3.5 h-3.5 text-neutral-400" />
						<span>Share Link</span>
					{/if}
				</button>

				<div class="flex items-center gap-1.5 text-xs text-neutral-400">
					<Users class="w-4 h-4" />
					<span>{callStore.participants.length + 1} participant(s)</span>
				</div>
			</div>
		</div>

		<!-- Outgoing Call "Ringing..." Overlay -->
		{#if callStore.isCallingOut}
			<div class="absolute inset-0 z-50 flex items-center justify-center bg-neutral-950/90 backdrop-blur-md animate-fade-in p-6">
				<div class="text-center space-y-6 max-w-sm">
					<div class="relative mx-auto flex h-24 w-24 items-center justify-center">
						<div class="absolute inset-0 rounded-full bg-emerald-500/20 animate-ping"></div>
						<div class="relative flex h-20 w-20 items-center justify-center rounded-full bg-emerald-600 text-white shadow-xl shadow-emerald-600/40">
							<Phone class="w-8 h-8 animate-pulse" />
						</div>
					</div>

					<div>
						<div class="text-xs font-bold uppercase tracking-wider text-emerald-400 mb-1">Outgoing Call</div>
						<h3 class="text-xl font-bold text-white">{callStore.callingRecipientName || 'Participant'}</h3>
						<p class="text-xs text-neutral-400 mt-1">Ringing... waiting for receiver to connect</p>
					</div>

					<button
						onclick={() => callStore.cancelOutgoingCall()}
						class="flex items-center justify-center gap-2 mx-auto px-6 py-2.5 rounded-2xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition shadow-lg shadow-rose-600/30 active:scale-95"
					>
						<PhoneOff class="w-4 h-4" />
						<span>Cancel Call</span>
					</button>
				</div>
			</div>
		{/if}

		<!-- Video Grid Area -->
		<div class="relative flex-1 p-6 flex items-center justify-center overflow-hidden">
			<div
				class="grid w-full h-full max-w-6xl gap-4 auto-rows-fr {callStore.participants.length === 0
					? 'grid-cols-1'
					: callStore.participants.length === 1
						? 'grid-cols-1 sm:grid-cols-2'
						: 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3'}"
			>
				<!-- Local Participant Tile (Live Video + Avatar Fallback) -->
				<ParticipantTile
					isLocal={true}
					name={authStore.user?.username || 'You'}
					language={myLanguage}
				/>

				<!-- Remote Participants (Live SFU Video + Audio Stream) -->
				{#each callStore.participants as participant (participant.identity)}
					<ParticipantTile
						participant={participant}
						isLocal={false}
						name={participant.name || participant.identity}
						language={otherLanguage}
					/>
				{/each}
			</div>

			<!-- Live Subtitles Overlay Component (Only when translation is active) -->
			{#if !isTranslationBypassed}
				<LiveSubtitlesOverlay />
			{/if}
		</div>

		<!-- Bottom Control Dock -->
		<div class="flex items-center justify-center gap-4 py-6 bg-neutral-900/60 backdrop-blur-lg border-t border-white/5">
			<!-- Mute Toggle -->
			<button
				onclick={() => callStore.toggleMute()}
				class="flex h-12 w-12 items-center justify-center rounded-2xl {callStore.isMuted
					? 'bg-rose-600/20 text-rose-400 border border-rose-500/30'
					: 'bg-neutral-800 text-white hover:bg-neutral-700'} transition-all active:scale-95 shadow-md"
				title={callStore.isMuted ? 'Unmute' : 'Mute'}
			>
				{#if callStore.isMuted}
					<MicOff class="w-5 h-5" />
				{:else}
					<Mic class="w-5 h-5" />
				{/if}
			</button>

			<!-- Camera Toggle -->
			<button
				onclick={() => callStore.toggleCamera()}
				class="flex h-12 w-12 items-center justify-center rounded-2xl {callStore.isCameraOff
					? 'bg-rose-600/20 text-rose-400 border border-rose-500/30'
					: 'bg-neutral-800 text-white hover:bg-neutral-700'} transition-all active:scale-95 shadow-md"
				title={callStore.isCameraOff ? 'Turn Camera On' : 'Turn Camera Off'}
			>
				{#if callStore.isCameraOff}
					<VideoOff class="w-5 h-5" />
				{:else}
					<Video class="w-5 h-5" />
				{/if}
			</button>

			<!-- Screen Share -->
			<button
				onclick={() => callStore.toggleScreenShare()}
				class="flex h-12 w-12 items-center justify-center rounded-2xl {callStore.isScreenSharing
					? 'bg-teal-600/20 text-teal-400 border border-teal-500/30'
					: 'bg-neutral-800 text-white hover:bg-neutral-700'} transition-all active:scale-95 shadow-md"
				title="Share Screen"
			>
				<ScreenShare class="w-5 h-5" />
			</button>

			<!-- Speech Language Switcher with Popover Menu -->
			<div class="relative">
				<button
					onclick={() => (showLanguageMenu = !showLanguageMenu)}
					class="flex h-12 px-3.5 items-center gap-2 rounded-2xl bg-neutral-800 text-neutral-200 hover:bg-neutral-700 hover:text-white border border-white/10 transition-all active:scale-95 text-xs font-semibold shadow-md cursor-pointer"
					title="Click to select spoken language (Russian, Hindi, English, Spanish, etc.)"
				>
					<span class="text-base">{currentLangObj.flag}</span>
					<div class="flex flex-col text-left">
						<span class="text-[10px] text-neutral-400 font-normal leading-none">Speak</span>
						<span class="font-bold text-emerald-400 leading-tight">
							{currentLangObj.name} <span class="text-[10px] text-neutral-400">({currentLangObj.native})</span>
						</span>
					</div>
					<ChevronUp class="w-3.5 h-3.5 text-neutral-400 transition-transform {showLanguageMenu ? 'rotate-180' : ''}" />
				</button>

				{#if showLanguageMenu}
					<div
						class="absolute bottom-16 left-1/2 -translate-x-1/2 z-50 w-64 max-h-72 overflow-y-auto rounded-2xl bg-neutral-900 border border-neutral-700 shadow-2xl p-2 animate-fade-in backdrop-blur-xl"
					>
						<div class="px-2 py-1.5 text-[11px] font-bold uppercase tracking-wider text-neutral-400 border-b border-neutral-800 mb-1">
							Select Spoken Language
						</div>
						<div class="space-y-0.5">
							{#each SUPPORTED_LANGUAGES as lang}
								<button
									onclick={() => selectLanguage(lang.code)}
									class="flex w-full items-center justify-between px-3 py-2 rounded-xl text-xs transition cursor-pointer {speakLanguage === lang.code
										? 'bg-emerald-500/15 text-emerald-300 font-bold border border-emerald-500/20'
										: 'text-neutral-300 hover:bg-neutral-800 hover:text-white'}"
								>
									<div class="flex items-center gap-2.5">
										<span class="text-base">{lang.flag}</span>
										<span class="font-medium">{lang.name}</span>
										<span class="text-[11px] text-neutral-400">({lang.native})</span>
									</div>
									{#if speakLanguage === lang.code}
										<Check class="w-3.5 h-3.5 text-emerald-400" />
									{/if}
								</button>
							{/each}
						</div>
					</div>
				{/if}
			</div>

			<!-- End Call Button -->
			<button
				onclick={() => callStore.leaveCall()}
				class="flex h-12 px-6 items-center justify-center gap-2 rounded-2xl bg-rose-600 text-white hover:bg-rose-500 transition-all active:scale-95 shadow-lg shadow-rose-600/30 font-semibold text-sm"
			>
				<PhoneOff class="w-5 h-5" />
				<span>Leave Call</span>
			</button>
		</div>
	</div>
{/if}
