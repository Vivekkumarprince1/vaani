import {
	Room,
	RoomEvent,
	ParticipantEvent,
	Track,
	type RemoteParticipant,
	type LocalParticipant,
	type LocalVideoTrack
} from 'livekit-client';
import { api } from '#lib/api/client';
import { wsClient } from '#lib/api/ws';
import { callSounds } from '#lib/utils/callSounds';
import { callSpeechService } from '#lib/services/callSpeech';
import { authStore } from '#lib/stores/auth.svelte';
import { settingsStore } from '#lib/stores/settings.svelte';

export interface Subtitle {
	id: string;
	speakerName: string;
	speakerId?: string;
	originalText: string;
	translatedText: string;
	sourceLanguage?: string;
	language: string;
	timestamp: number;
	call_room_id?: string;
	audio_url?: string;
}

export interface IncomingCallData {
	call_id: string;
	call_room_id: string;
	initiator_name: string;
	call_type: 'audio' | 'video';
	room_id?: string;
	room_name?: string;
	is_group?: boolean;
}

class CallStore {
	room = $state<Room | null>(null);
	isInCall = $state<boolean>(false);
	isConnecting = $state<boolean>(false);
	isCallingOut = $state<boolean>(false);
	callingRecipientName = $state<string>('');
	currentCallRoomId = $state<string | null>(null);
	callType = $state<'audio' | 'video'>('video');
	isGroupCall = $state<boolean>(false);

	isMuted = $state<boolean>(false);
	isCameraOff = $state<boolean>(false);
	isScreenSharing = $state<boolean>(false);

	localParticipant = $state<LocalParticipant | null>(null);
	localVideoTrack = $state<LocalVideoTrack | null>(null);
	localStream = $state<MediaStream | null>(null);

	incomingCall = $state<IncomingCallData | null>(null);
	subtitles = $state<Subtitle[]>([]);

	// Remote participants state
	participants = $state<RemoteParticipant[]>([]);

	initListeners() {
		wsClient.on('incoming_call', (payload: IncomingCallData) => {
			this.incomingCall = payload;
		});

		wsClient.on('call_ended', (data?: { call_room_id?: string }) => {
			if (!data?.call_room_id || data.call_room_id === this.currentCallRoomId) {
				this.leaveCall();
			}
			if (this.incomingCall && (!data?.call_room_id || data.call_room_id === this.incomingCall.call_room_id)) {
				this.incomingCall = null;
				callSounds.stopAll();
			}
		});

		wsClient.on('call_timeout', (data?: { call_room_id?: string }) => {
			// CRITICAL FIX: Only cancel if we are still ringing/calling out. Never abort active connected calls!
			if (this.isCallingOut && this.currentCallRoomId && data?.call_room_id === this.currentCallRoomId) {
				this.cancelOutgoingCall();
			}
			if (this.incomingCall && data?.call_room_id === this.incomingCall.call_room_id) {
				this.incomingCall = null;
				callSounds.stopAll();
			}
		});

		wsClient.on('subtitle_update', (sub: Subtitle) => {
			this.subtitles = [...this.subtitles.slice(-8), sub];
			if (settingsStore.preferences.callTranslationMode !== 'disabled') {
				const isTestingAlone = this.participants.length === 0;
				const isFromOther = sub.speakerId !== authStore.user?.id;

				if (isTestingAlone || isFromOther) {
					const myLang = (authStore.user?.preferred_language || 'en').toLowerCase();
					if (sub.translatedText && (sub.language.toLowerCase() === myLang || isTestingAlone)) {
						callSpeechService.speak(sub.translatedText, sub.language, sub.audio_url);
					}
				}
			}
		});
	}

	async startOutgoingCall(recipientName: string, callRoomId: string, type: 'audio' | 'video' = 'video', isGroup = false) {
		this.isGroupCall = isGroup;
		this.isCallingOut = true;
		this.callingRecipientName = recipientName;
		callSounds.playRingback();
		await this.joinCall(callRoomId, type, isGroup);
	}

	cancelOutgoingCall() {
		const roomId = this.currentCallRoomId;
		this.isCallingOut = false;
		this.callingRecipientName = '';
		callSounds.stopAll();
		callSounds.playDisconnect();
		if (roomId) {
			api.post('/calls/end', { call_room_id: roomId }).catch(() => {});
		}
		this.leaveCall();
	}

	async joinCall(callRoomId: string, type: 'audio' | 'video' = 'video', isGroup?: boolean) {
		this.isConnecting = true;
		this.currentCallRoomId = callRoomId;
		this.callType = type;
		this.isCameraOff = type === 'audio';
		if (typeof isGroup === 'boolean') {
			this.isGroupCall = isGroup;
		} else if (callRoomId.startsWith('meet-')) {
			this.isGroupCall = true;
		}

		try {
			// 1. Fetch signed LiveKit token from Go backend
			const res = await api.post('/calls/token', { room_slug: callRoomId });
			const { token, url } = res.data;

			const livekitUrl = url || import.meta.env.VITE_LIVEKIT_URL;
			if (!livekitUrl) {
				throw new Error('LiveKit URL is not configured');
			}

			// 2. Connect to LiveKit Room
			const room = new Room({
				adaptiveStream: true,
				dynacast: true
			});

			this.room = room;

			room.on(RoomEvent.ParticipantConnected, () => {
				this.participants = Array.from(room.remoteParticipants.values());
				if (this.isCallingOut) {
					this.isCallingOut = false;
					callSounds.stopAll();
					callSounds.playConnect();
				}
			});

			room.on(RoomEvent.ParticipantDisconnected, () => {
				this.participants = Array.from(room.remoteParticipants.values());
			});

			room.on(RoomEvent.Disconnected, () => {
				this.leaveCall();
			});

			room.on(RoomEvent.AudioPlaybackStatusChanged, () => {
				if (!room.canPlaybackAudio) {
					room.startAudio().catch(() => {});
				}
			});

			// Connect to SFU
			await room.connect(livekitUrl, token);
			await room.startAudio().catch(() => {});

			// If participants already in room, stop ringback
			if (room.remoteParticipants.size > 0 && this.isCallingOut) {
				this.isCallingOut = false;
				callSounds.stopAll();
				callSounds.playConnect();
			}

			// 3. Enable Camera & Mic
			this.localParticipant = room.localParticipant;

			room.localParticipant.on(ParticipantEvent.LocalTrackPublished, (pub) => {
				if (pub.source === Track.Source.Camera && pub.videoTrack) {
					this.localVideoTrack = pub.videoTrack as LocalVideoTrack;
				}
			});

			room.localParticipant.on(ParticipantEvent.LocalTrackUnpublished, (pub) => {
				if (pub.source === Track.Source.Camera) {
					this.localVideoTrack = null;
				}
			});

			if (type === 'video') {
				try {
					await room.localParticipant.enableCameraAndMicrophone();
					const camPub = room.localParticipant.getTrackPublication(Track.Source.Camera);
					if (camPub?.videoTrack) {
						this.localVideoTrack = camPub.videoTrack as LocalVideoTrack;
					}
				} catch (mediaErr) {
					console.warn('Failed to publish camera to LiveKit, using getUserMedia fallback:', mediaErr);
					await this.fallbackLocalCamera(true);
				}
			} else {
				await room.localParticipant.setMicrophoneEnabled(true);
				await room.localParticipant.setCameraEnabled(false);
				this.isCameraOff = true;
			}

			this.participants = Array.from(room.remoteParticipants.values());
			this.isInCall = true;
			this.incomingCall = null;
		} catch (err) {
			console.warn('LiveKit SFU connection error, initializing local fallback:', err);
			// Fallback: If LiveKit server is unreachable, keep call UI alive with local camera
			if (type === 'video') {
				await this.fallbackLocalCamera(true);
			}
			this.isInCall = true;
			this.incomingCall = null;
		} finally {
			this.isConnecting = false;
		}
	}

	private async fallbackLocalCamera(enableVideo: boolean) {
		try {
			if (typeof navigator !== 'undefined' && navigator.mediaDevices) {
				const stream = await navigator.mediaDevices.getUserMedia({
					video: enableVideo,
					audio: true
				});
				this.localStream = stream;
			}
		} catch (e) {
			console.error('Camera fallback access failed:', e);
		}
	}

	async toggleMute() {
		this.isMuted = !this.isMuted;
		callSpeechService.setMuted(this.isMuted);
		if (this.room?.localParticipant) {
			await this.room.localParticipant.setMicrophoneEnabled(!this.isMuted);
		}
		if (this.localStream) {
			this.localStream.getAudioTracks().forEach((t) => (t.enabled = !this.isMuted));
		}
	}

	async toggleCamera() {
		this.isCameraOff = !this.isCameraOff;
		if (this.room?.localParticipant) {
			await this.room.localParticipant.setCameraEnabled(!this.isCameraOff);
			const camPub = this.room.localParticipant.getTrackPublication(Track.Source.Camera);
			if (!this.isCameraOff && camPub?.videoTrack) {
				this.localVideoTrack = camPub.videoTrack as LocalVideoTrack;
			} else {
				this.localVideoTrack = null;
			}
		}
		if (this.localStream) {
			this.localStream.getVideoTracks().forEach((t) => (t.enabled = !this.isCameraOff));
		}
	}

	async toggleScreenShare() {
		if (!this.room?.localParticipant) return;
		this.isScreenSharing = !this.isScreenSharing;
		await this.room.localParticipant.setScreenShareEnabled(this.isScreenSharing);
	}

	leaveCall() {
		callSpeechService.stop();
		callSounds.stopAll();
		this.isCallingOut = false;
		this.callingRecipientName = '';

		if (this.localVideoTrack) {
			this.localVideoTrack.stop();
			this.localVideoTrack = null;
		}
		if (this.localStream) {
			this.localStream.getTracks().forEach((t) => t.stop());
			this.localStream = null;
		}
		if (this.room) {
			this.room.disconnect();
			this.room = null;
		}
		// Only terminate the call on the backend if this was a 1:1 direct call
		// In multi-party or group calls, leaving just disconnects the local participant
		const isDirect = !this.isGroupCall && !this.currentCallRoomId?.startsWith('meet-');
		if (this.currentCallRoomId && isDirect) {
			api.post('/calls/end', { call_room_id: this.currentCallRoomId }).catch(() => {});
		}
		this.localParticipant = null;
		this.isInCall = false;
		this.isGroupCall = false;
		this.currentCallRoomId = null;
		this.incomingCall = null;
		this.subtitles = [];
		this.participants = [];
	}
}

export const callStore = new CallStore();
