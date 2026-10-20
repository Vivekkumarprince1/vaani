<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { authStore } from '$lib/stores/auth.svelte';
	import { callStore } from '$lib/stores/call.svelte';
	import { themeStore } from '$lib/stores/theme.svelte';
	import { api } from '$lib/api/client';
	import {
		Video,
		VideoOff,
		Mic,
		MicOff,
		Phone,
		Users,
		Sparkles,
		Copy,
		Check,
		Sun,
		Moon,
		AlertCircle,
		LogIn,
		ArrowRight
	} from 'lucide-svelte';

	let slug = $derived(page.params.slug);

	let phase = $state<'resolving' | 'lobby' | 'joining' | 'error'>('resolving');
	let error = $state<string | null>(null);
	let meetingData = $state<{
		room_name: string;
		initiator_name: string;
		call_type: string;
		status: string;
		has_active_call: boolean;
	} | null>(null);

	// Preview media controls
	let isMuted = $state(false);
	let isCameraOff = $state(false);
	let previewStream: MediaStream | null = $state(null);
	let videoElement = $state<HTMLVideoElement | null>(null);
	let copiedLink = $state(false);

	onMount(async () => {
		await resolveMeeting();
	});

	onDestroy(() => {
		stopPreviewTracks();
	});

	function stopPreviewTracks() {
		if (previewStream) {
			previewStream.getTracks().forEach((t) => t.stop());
			previewStream = null;
		}
	}

	async function startPreviewCamera() {
		if (typeof navigator === 'undefined' || !navigator.mediaDevices) return;
		try {
			stopPreviewTracks();
			if (!isCameraOff) {
				const stream = await navigator.mediaDevices.getUserMedia({
					video: true,
					audio: true
				});
				previewStream = stream;
				if (videoElement) {
					videoElement.srcObject = stream;
				}
				// Apply current mute state
				stream.getAudioTracks().forEach((t) => (t.enabled = !isMuted));
			} else {
				const audioStream = await navigator.mediaDevices.getUserMedia({
					audio: true
				});
				previewStream = audioStream;
				audioStream.getAudioTracks().forEach((t) => (t.enabled = !isMuted));
			}
		} catch (err) {
			console.warn('Lobby camera preview not accessible:', err);
		}
	}

	async function toggleMute() {
		isMuted = !isMuted;
		if (previewStream) {
			previewStream.getAudioTracks().forEach((t) => (t.enabled = !isMuted));
		}
	}

	async function toggleCamera() {
		isCameraOff = !isCameraOff;
		if (isCameraOff) {
			if (previewStream) {
				previewStream.getVideoTracks().forEach((t) => {
					t.stop();
				});
			}
			if (videoElement) {
				videoElement.srcObject = null;
			}
		} else {
			await startPreviewCamera();
		}
	}

	async function resolveMeeting() {
		phase = 'resolving';
		error = null;

		try {
			const res = await api.get(`/calls/meeting/${slug}`);
			meetingData = res.data;
			phase = 'lobby';
			// Initialize preview after DOM renders
			setTimeout(() => {
				startPreviewCamera();
			}, 100);
		} catch (err: any) {
			console.error('Failed to resolve meeting:', err);
			if (err.response?.status === 404) {
				error = 'This meeting link is invalid, expired, or does not exist.';
			} else {
				error = err.response?.data?.error || 'Unable to join meeting. Please check your network connection.';
			}
			phase = 'error';
		}
	}

	function handleSignInRedirect() {
		if (typeof window !== 'undefined') {
			sessionStorage.setItem('vaani_join_redirect', window.location.pathname);
		}
		goto('/login');
	}

	function copyLink() {
		if (typeof window !== 'undefined') {
			navigator.clipboard.writeText(window.location.href);
			copiedLink = true;
			setTimeout(() => {
				copiedLink = false;
			}, 2000);
		}
	}

	async function joinMeeting(callType: 'audio' | 'video' = 'video') {
		if (!authStore.isAuthenticated) {
			handleSignInRedirect();
			return;
		}

		stopPreviewTracks();
		phase = 'joining';

		try {
			// Call backend JoinMeeting endpoint
			await api.post(`/calls/meeting/${slug}/join`, {
				call_type: callType
			});

			// Configure pre-selected mic and camera state
			callStore.isMuted = isMuted;
			callStore.isCameraOff = isCameraOff || callType === 'audio';

			// Join via callStore
			await callStore.joinCall(slug || '', callType);

			// Navigate to dashboard where unified VideoRoom is active
			goto('/dashboard');
		} catch (err: any) {
			console.error('Failed to join meeting:', err);
			error = err.response?.data?.error || 'Failed to connect to the meeting. Please try again.';
			phase = 'error';
		}
	}
</script>

<svelte:head>
	<title>{meetingData?.room_name || 'Meeting'} — Vaani v2 Lobby</title>
</svelte:head>

<div class="min-h-screen flex flex-col bg-neutral-100 dark:bg-neutral-950 text-neutral-900 dark:text-neutral-100 transition-colors">
	<!-- Top Navigation Bar -->
	<header class="flex items-center justify-between px-6 py-4 border-b border-neutral-200 dark:border-neutral-800/80 bg-white/80 dark:bg-neutral-900/50 backdrop-blur-md">
		<a href="/dashboard" class="flex items-center gap-2.5">
			<div class="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 shadow-md shadow-emerald-500/20 text-white">
				<Sparkles class="h-5 w-5" />
			</div>
			<div>
				<span class="font-bold text-base tracking-tight text-neutral-900 dark:text-white">Vaani <span class="text-emerald-500">v2</span></span>
				<span class="ml-2 rounded-md bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">MEET</span>
			</div>
		</a>

		<div class="flex items-center gap-3">
			<!-- Theme Toggle -->
			<button
				onclick={() => themeStore.toggle()}
				class="p-2 rounded-xl text-neutral-500 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-200 dark:hover:bg-neutral-800 transition cursor-pointer"
				title="Toggle Theme"
			>
				{#if themeStore.current === 'dark'}
					<Sun class="w-4 h-4 text-amber-400" />
				{:else}
					<Moon class="w-4 h-4 text-neutral-600" />
				{/if}
			</button>

			{#if authStore.isAuthenticated}
				<div class="flex items-center gap-2 pl-2 border-l border-neutral-200 dark:border-neutral-800">
					<div class="h-7 w-7 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-xs font-bold text-emerald-600 dark:text-emerald-400">
						{authStore.user?.username[0]?.toUpperCase()}
					</div>
					<span class="text-xs font-medium text-neutral-700 dark:text-neutral-300 hidden sm:inline">{authStore.user?.username}</span>
				</div>
			{:else}
				<button
					onclick={handleSignInRedirect}
					class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-sm transition active:scale-95 cursor-pointer"
				>
					<LogIn class="w-3.5 h-3.5" />
					<span>Sign In</span>
				</button>
			{/if}
		</div>
	</header>

	<!-- Content Area -->
	<main class="flex-1 flex items-center justify-center p-4 sm:p-8">
		<!-- 1. Resolving Phase -->
		{#if phase === 'resolving'}
			<div class="text-center space-y-4 max-w-sm p-8 rounded-3xl bg-white dark:bg-neutral-900/70 border border-neutral-200 dark:border-neutral-800 shadow-xl">
				<div class="relative mx-auto flex h-14 w-14 items-center justify-center">
					<div class="absolute inset-0 rounded-full border-4 border-emerald-500/20 border-t-emerald-500 animate-spin"></div>
					<Video class="h-6 w-6 text-emerald-500" />
				</div>
				<h2 class="text-base font-bold text-neutral-900 dark:text-white">Connecting to Meeting...</h2>
				<p class="text-xs text-neutral-500 dark:text-neutral-400 font-mono">ID: {slug}</p>
			</div>

		<!-- 2. Error Phase -->
		{:else if phase === 'error'}
			<div class="text-center space-y-4 max-w-md p-8 rounded-3xl bg-white dark:bg-neutral-900/70 border border-rose-500/20 shadow-2xl">
				<div class="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-500/10 text-rose-500 border border-rose-500/20">
					<AlertCircle class="h-8 w-8" />
				</div>
				<h2 class="text-lg font-bold text-neutral-900 dark:text-white">Can't Join Meeting</h2>
				<p class="text-xs text-neutral-500 dark:text-neutral-400 leading-relaxed">{error}</p>

				<div class="pt-4 flex flex-col sm:flex-row items-center justify-center gap-3">
					<button
						onclick={resolveMeeting}
						class="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-neutral-200 dark:bg-neutral-800 hover:bg-neutral-300 dark:hover:bg-neutral-700 text-xs font-semibold text-neutral-800 dark:text-neutral-200 transition cursor-pointer"
					>
						Try Again
					</button>
					<a
						href="/dashboard"
						class="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white shadow-md shadow-emerald-600/20 transition cursor-pointer"
					>
						Go to Dashboard
					</a>
				</div>
			</div>

		<!-- 3. Joining Phase -->
		{:else if phase === 'joining'}
			<div class="text-center space-y-4 max-w-sm p-8 rounded-3xl bg-white dark:bg-neutral-900/70 border border-neutral-200 dark:border-neutral-800 shadow-xl">
				<div class="relative mx-auto flex h-14 w-14 items-center justify-center">
					<div class="absolute inset-0 rounded-full border-4 border-emerald-500/20 border-t-emerald-500 animate-spin"></div>
					<Sparkles class="h-6 w-6 text-emerald-500" />
				</div>
				<h2 class="text-base font-bold text-neutral-900 dark:text-white">Entering Room...</h2>
				<p class="text-xs text-neutral-500 dark:text-neutral-400">Initializing multilingual voice & video bridge</p>
			</div>

		<!-- 4. Google Meet Style Lobby -->
		{:else if phase === 'lobby' && meetingData}
			<div class="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
				<!-- Left: Live Preview Box (7 cols) -->
				<div class="lg:col-span-7 flex flex-col items-center">
					<div class="relative w-full aspect-video rounded-3xl overflow-hidden bg-neutral-900 border border-neutral-800 shadow-2xl flex items-center justify-center group">
						<!-- Local Video Preview -->
						<video
							bind:this={videoElement}
							autoplay
							playsinline
							muted
							class="w-full h-full object-cover transform -scale-x-100 {isCameraOff ? 'hidden' : 'block'}"
						></video>

						<!-- Camera Off Avatar Fallback -->
						{#if isCameraOff}
							<div class="flex flex-col items-center justify-center text-center p-6 space-y-3">
								<div class="h-20 w-20 rounded-full bg-emerald-950/60 border border-emerald-500/30 flex items-center justify-center text-2xl font-bold text-emerald-400 shadow-lg">
									{authStore.user?.username[0]?.toUpperCase() || 'U'}
								</div>
								<span class="text-xs font-medium text-neutral-400">Camera is turned off</span>
							</div>
						{/if}

						<!-- Top Status Chips -->
						<div class="absolute top-4 left-4 flex items-center gap-2">
							<span class="rounded-full bg-black/60 backdrop-blur-md px-3 py-1 text-[11px] font-medium text-white border border-white/10 flex items-center gap-1.5">
								<span class="h-2 w-2 rounded-full {isCameraOff ? 'bg-amber-400' : 'bg-emerald-400'}"></span>
								{isCameraOff ? 'Camera Off' : 'Camera Active'}
							</span>
						</div>

						<!-- Bottom Floating Preview Controls (Mute & Camera toggles) -->
						<div class="absolute bottom-5 inset-x-0 flex items-center justify-center gap-4 z-10">
							<button
								onclick={toggleMute}
								class="h-12 w-12 rounded-full flex items-center justify-center text-white transition-all shadow-lg backdrop-blur-md cursor-pointer {isMuted ? 'bg-rose-600 hover:bg-rose-500 ring-4 ring-rose-500/20' : 'bg-neutral-800/80 hover:bg-neutral-700 border border-white/10'}"
								title={isMuted ? 'Unmute Microphone' : 'Mute Microphone'}
							>
								{#if isMuted}
									<MicOff class="w-5 h-5" />
								{:else}
									<Mic class="w-5 h-5 text-emerald-400" />
								{/if}
							</button>

							<button
								onclick={toggleCamera}
								class="h-12 w-12 rounded-full flex items-center justify-center text-white transition-all shadow-lg backdrop-blur-md cursor-pointer {isCameraOff ? 'bg-rose-600 hover:bg-rose-500 ring-4 ring-rose-500/20' : 'bg-neutral-800/80 hover:bg-neutral-700 border border-white/10'}"
								title={isCameraOff ? 'Turn Camera On' : 'Turn Camera Off'}
							>
								{#if isCameraOff}
									<VideoOff class="w-5 h-5" />
								{:else}
									<Video class="w-5 h-5 text-emerald-400" />
								{/if}
							</button>
						</div>
					</div>

					<p class="mt-3 text-xs text-neutral-500 dark:text-neutral-400 text-center">
						Check your audio and video before entering. You can also adjust them inside the meeting.
					</p>
				</div>

				<!-- Right: Meeting Details & Join Actions (5 cols) -->
				<div class="lg:col-span-5 flex flex-col justify-center space-y-6 bg-white dark:bg-neutral-900/60 p-8 rounded-3xl border border-neutral-200 dark:border-neutral-800/80 shadow-2xl backdrop-blur-xl">
					<!-- Meeting Title & Host -->
					<div>
						<div class="flex items-center gap-2 mb-2">
							<span class="rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
								{meetingData.has_active_call ? '● Live Now' : 'Ready to Start'}
							</span>
							<span class="font-mono text-xs text-neutral-400">{slug}</span>
						</div>

						<h1 class="text-2xl font-bold tracking-tight text-neutral-900 dark:text-white mb-1.5">
							{meetingData.room_name}
						</h1>
						<p class="text-xs text-neutral-500 dark:text-neutral-400">
							Organized by <span class="font-semibold text-neutral-700 dark:text-neutral-200">{meetingData.initiator_name || 'Host'}</span>
						</p>
					</div>

					<!-- Feature Badges -->
					<div class="space-y-2 py-3 border-y border-neutral-200 dark:border-neutral-800/80 text-xs text-neutral-600 dark:text-neutral-400">
						<div class="flex items-center gap-2.5">
							<div class="h-2 w-2 rounded-full bg-emerald-500"></div>
							<span>Real-time voice & video with zero-latency language bypass</span>
						</div>
						<div class="flex items-center gap-2.5">
							<div class="h-2 w-2 rounded-full bg-indigo-500"></div>
							<span>Live translated subtitles in your preferred language</span>
						</div>
						<div class="flex items-center gap-2.5">
							<div class="h-2 w-2 rounded-full bg-teal-500"></div>
							<span>Encrypted HD multi-party WebRTC mesh</span>
						</div>
					</div>

					<!-- Action Buttons -->
					{#if authStore.isAuthenticated}
						<div class="space-y-3">
							<button
								onclick={() => joinMeeting('video')}
								class="w-full flex items-center justify-center gap-2 px-6 py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm shadow-lg shadow-emerald-600/30 transition-all active:scale-95 cursor-pointer"
							>
								<Video class="w-4 h-4" />
								<span>Join with Video</span>
							</button>

							<button
								onclick={() => joinMeeting('audio')}
								class="w-full flex items-center justify-center gap-2 px-6 py-3 rounded-2xl bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-800 dark:text-neutral-200 font-semibold text-xs border border-neutral-200 dark:border-neutral-700 transition active:scale-95 cursor-pointer"
							>
								<Phone class="w-3.5 h-3.5 text-emerald-500" />
								<span>Join Audio Only</span>
							</button>
						</div>
					{:else}
						<!-- Guest / Unauthenticated Prompt -->
						<div class="space-y-3">
							<div class="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-700 dark:text-amber-400">
								Sign in to your Vaani account to enter this meeting with your custom language profile.
							</div>

							<button
								onclick={handleSignInRedirect}
								class="w-full flex items-center justify-center gap-2 px-6 py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm shadow-lg shadow-emerald-600/30 transition-all active:scale-95 cursor-pointer"
							>
								<LogIn class="w-4 h-4" />
								<span>Sign In to Join Meeting</span>
								<ArrowRight class="w-4 h-4" />
							</button>

							<a
								href="/register"
								class="w-full flex items-center justify-center gap-1.5 py-2 text-xs font-semibold text-neutral-600 dark:text-neutral-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition"
							>
								Don't have an account? <span class="underline">Register here</span>
							</a>
						</div>
					{/if}

					<!-- Share Link Section -->
					<div class="pt-2 flex items-center justify-between text-xs text-neutral-500 dark:text-neutral-400">
						<span>Share link:</span>
						<button
							onclick={copyLink}
							class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-neutral-100 dark:bg-neutral-800/80 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-800 dark:text-neutral-300 transition active:scale-95 border border-neutral-200 dark:border-neutral-700/50 cursor-pointer"
						>
							{#if copiedLink}
								<Check class="w-3.5 h-3.5 text-emerald-500" />
								<span class="text-emerald-600 dark:text-emerald-400 font-medium">Copied!</span>
							{:else}
								<Copy class="w-3.5 h-3.5 text-neutral-400" />
								<span>Copy Link</span>
							{/if}
						</button>
					</div>
				</div>
			</div>
		{/if}
	</main>
</div>
