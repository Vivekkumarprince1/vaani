<script lang="ts">
	import { onMount } from 'svelte';
	import { Track, ParticipantEvent, type Participant, type RemoteParticipant } from 'livekit-client';
	import { callStore } from '#lib/stores/call.svelte';
	import { authStore } from '#lib/stores/auth.svelte';
	import { MicOff, VideoOff } from 'lucide-svelte';

	interface Props {
		participant?: Participant | RemoteParticipant | null;
		isLocal?: boolean;
		isActiveSpeaker?: boolean;
		name?: string;
		language?: string;
	}

	let {
		participant = null,
		isLocal = false,
		isActiveSpeaker = false,
		name = '',
		language = 'EN'
	}: Props = $props();

	let videoEl = $state<HTMLVideoElement | null>(null);
	let audioEl = $state<HTMLAudioElement | null>(null);

	let displayName = $derived(
		isLocal
			? `${authStore.user?.username || 'You'} (You)`
			: name || participant?.name || participant?.identity || 'Participant'
	);

	let participantMeta = $derived.by(() => {
		if (!participant?.metadata) return null;
		try {
			return JSON.parse(participant.metadata);
		} catch {
			return null;
		}
	});

	let displayLanguage = $derived(
		isLocal
			? (authStore.user?.preferred_language || language || 'en')
			: (participantMeta?.preferred_language || language || 'en')
	);

	let isCamActive = $state(true);
	let isMicActive = $state(true);

	// Local Video Attachment
	$effect(() => {
		if (!isLocal) return;

		isCamActive = !callStore.isCameraOff;
		isMicActive = !callStore.isMuted;

		if (videoEl) {
			if (callStore.localVideoTrack && !callStore.isCameraOff) {
				callStore.localVideoTrack.attach(videoEl);
				return () => {
					callStore.localVideoTrack?.detach(videoEl!);
				};
			} else if (callStore.localStream && !callStore.isCameraOff) {
				videoEl.srcObject = callStore.localStream;
				videoEl.play().catch(() => {});
				return () => {
					if (videoEl) videoEl.srcObject = null;
				};
			}
		}
	});

	// Remote Participant Track Attachment & Event Listeners
	$effect(() => {
		if (isLocal || !participant) return;

		const updateTrackStates = () => {
			isCamActive = !!participant.isCameraEnabled;
			isMicActive = !!participant.isMicrophoneEnabled;
		};

		updateTrackStates();

		const attachTrack = (publication: any) => {
			if (!publication?.track) return;
			if (publication.track.kind === Track.Kind.Video && videoEl) {
				publication.track.attach(videoEl);
			}
			if (publication.track.kind === Track.Kind.Audio && audioEl) {
				publication.track.attach(audioEl);
			}
		};

		const detachTrack = (publication: any) => {
			if (publication?.track) {
				publication.track.detach();
			}
		};

		// Attach existing subscribed tracks
		if (participant.trackPublications) {
			for (const pub of participant.trackPublications.values()) {
				if (pub.isSubscribed) {
					attachTrack(pub);
				}
			}
		}

		const onTrackSubscribed = (_track: any, pub: any) => {
			attachTrack(pub);
			updateTrackStates();
		};

		const onTrackUnsubscribed = (_track: any, pub: any) => {
			detachTrack(pub);
			updateTrackStates();
		};

		participant.on(ParticipantEvent.TrackSubscribed, onTrackSubscribed);
		participant.on(ParticipantEvent.TrackUnsubscribed, onTrackUnsubscribed);
		participant.on(ParticipantEvent.TrackMuted, updateTrackStates);
		participant.on(ParticipantEvent.TrackUnmuted, updateTrackStates);

		return () => {
			participant.off(ParticipantEvent.TrackSubscribed, onTrackSubscribed);
			participant.off(ParticipantEvent.TrackUnsubscribed, onTrackUnsubscribed);
			participant.off(ParticipantEvent.TrackMuted, updateTrackStates);
			participant.off(ParticipantEvent.TrackUnmuted, updateTrackStates);

			if (participant.trackPublications) {
				for (const pub of participant.trackPublications.values()) {
					detachTrack(pub);
				}
			}
		};
	});
</script>

<div
	class="relative flex items-center justify-center rounded-3xl bg-neutral-900 border overflow-hidden shadow-2xl transition-all aspect-video sm:aspect-auto w-full h-full {isActiveSpeaker
		? 'border-emerald-500 ring-2 ring-emerald-500/30'
		: 'border-neutral-800'}"
>
	<!-- Video Element -->
	<video
		bind:this={videoEl}
		autoplay
		playsinline
		muted={isLocal}
		class="w-full h-full object-cover transition-opacity duration-300 {isLocal ? 'scale-x-[-1]' : ''} {isCamActive ? 'opacity-100' : 'opacity-0 absolute pointer-events-none'}"
	></video>

	<!-- Remote Audio Element -->
	{#if !isLocal}
		<audio bind:this={audioEl} autoplay></audio>
	{/if}

	<!-- Avatar Fallback when Camera is Off -->
	{#if !isCamActive}
		<div class="flex flex-col items-center justify-center gap-3 text-neutral-400 p-6 animate-fade-in">
			<div
				class="flex h-20 w-20 sm:h-24 sm:w-24 items-center justify-center rounded-full bg-gradient-to-tr from-emerald-950/60 to-neutral-800 border border-emerald-500/20 text-2xl font-black text-emerald-400 shadow-xl uppercase tracking-wider"
			>
				{displayName.charAt(0)}
			</div>
			<div class="flex items-center gap-1.5 text-xs text-neutral-500">
				<VideoOff class="w-3.5 h-3.5" />
				<span>Camera Off</span>
			</div>
		</div>
	{/if}

	<!-- Participant Info Pill Overlay -->
	<div
		class="absolute bottom-3 left-3 flex items-center gap-2 rounded-xl bg-black/60 backdrop-blur-md border border-white/10 px-3 py-1.5 text-xs font-semibold text-white shadow-lg pointer-events-none"
	>
		<span class="truncate max-w-[140px] sm:max-w-[200px]">{displayName}</span>

		<span
			class="px-1.5 py-0.2 rounded bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 font-mono text-[10px] uppercase font-bold"
		>
			{displayLanguage.toUpperCase()}
		</span>

		{#if !isMicActive}
			<span class="text-rose-400" title="Microphone Muted">
				<MicOff class="w-3.5 h-3.5" />
			</span>
		{/if}
	</div>
</div>
