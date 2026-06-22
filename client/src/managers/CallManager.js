import signalingService from '../services/SignalingService';
import PeerConnectionManager from '../rtc/PeerConnectionManager';
import mediaTrackManager from '../rtc/MediaTrackManager';
import audioCaptureService from '../audio/AudioCaptureService';
import translationAudioService from '../rtc/TranslationAudioService';

/**
 * CallManager
 * The central orchestrator for 1-to-1 calls.
 * Integrates Signaling, RTC, Audio Capture, and Translation Injection.
 */
class CallManager {
  constructor() {
    this.pcManager = null;
    this.currentCallSession = null;
    this.isInitiator = false;
    this.onRemoteTrack = null;
    this.onConnectionStateChange = null;
    this.onTranslatedSpeech = null;
    this.onTranslationStatus = null;
    this.onTranslationLatencyMetric = null;
    this.onTranslationPlaybackStateChange = null;
    this.translationStreamReady = false;
    this.isMuted = false;
    this.activeTargetUserId = null;
    this.activeStreamRequestId = null;
    this.seenTranslationPayloads = new Set();
    this.translationHandlers = null;
  }

  initialize(callbacks = {}) {
    this.onRemoteTrack = callbacks.onRemoteTrack;
    this.onConnectionStateChange = callbacks.onConnectionStateChange;
    this.onTranslatedSpeech = callbacks.onTranslatedSpeech;
    this.onTranslationStatus = callbacks.onTranslationStatus;
    this.onTranslationLatencyMetric = callbacks.onTranslationLatencyMetric;
    this.onTranslationPlaybackStateChange = callbacks.onTranslationPlaybackStateChange;

    translationAudioService.setPlaybackStateCallback((isPlaying) => {
      this.onTranslationPlaybackStateChange?.(isPlaying);
    });

    signalingService.initialize();
    this.setupSignalingListeners();
  }

  setupSignalingListeners() {
    signalingService.onIncomingCall(this.handleIncomingCall.bind(this));
    signalingService.onCallAnswered(this.handleCallAnswered.bind(this));
    signalingService.onIceCandidate(this.handleRemoteIceCandidate.bind(this));
    signalingService.onCallEnded(this.handleCallEnded.bind(this));
    signalingService.onUserBusy(this.handleUserBusy.bind(this));
  }

  async startCall(targetUserId, type, localStream, sourceLang, targetLang) {
    this.isInitiator = true;
    this.currentCallSession = { targetUserId, type };

    this.pcManager = new PeerConnectionManager(
      (candidate) => signalingService.emitIceCandidate({ to: targetUserId, candidate }),
      this.onRemoteTrack,
      this.onConnectionStateChange
    );

    this.pcManager.createPeerConnection();
    mediaTrackManager.setLocalStream(localStream);

    // Add local tracks to PC
    localStream.getTracks().forEach(track => {
      this.pcManager.addTrack(track, localStream);
    });

    const offer = await this.pcManager.createOffer();
    
    // Track delivery
    this.setupDeliveryTimeout(targetUserId);

    signalingService.emitCallUser({
      to: targetUserId,
      offer,
      callType: type,
      callSessionId: `call_${Date.now()}`
    });

    // Start audio capture for translation
    await this.startAudioPipeline(localStream, targetUserId, sourceLang, targetLang);
  }


  setupDeliveryTimeout(targetUserId) {
    const DELIVERY_TIMEOUT_MS = 10000;
    this.deliveryTimer = setTimeout(() => {
      console.warn('CallManager: No delivery ack received');
      this.cleanup();
      // We might need to notify the UI here via a callback
    }, DELIVERY_TIMEOUT_MS);

    const onDelivered = (data) => {
      if (data && data.to === targetUserId) {
        clearTimeout(this.deliveryTimer);
        signalingService.removeListener('incomingCallDelivered', onDelivered);
      }
    };

    signalingService.socket.on('incomingCallDelivered', onDelivered);
  }


  async handleIncomingCall(data) {
    // data: { from, offer, callType, callSessionId, fromName }
    this.currentCallSession = data;
    this.isInitiator = false;
    
    // Notify UI via some mechanism if needed, but here we just store it
    // Actual 'answer' comes from UI calling answerCall()
  }

  async answerCall(localStream, sourceLang, targetLang) {
    const data = this.currentCallSession;
    if (!data || !data.offer) return;

    this.pcManager = new PeerConnectionManager(
      (candidate) => signalingService.emitIceCandidate({ to: data.from, candidate }),
      this.onRemoteTrack,
      this.onConnectionStateChange
    );

    this.pcManager.createPeerConnection();
    mediaTrackManager.setLocalStream(localStream);

    localStream.getTracks().forEach(track => {
      this.pcManager.addTrack(track, localStream);
    });

    const answer = await this.pcManager.createAnswer(data.offer);
    signalingService.emitAnswerCall({
      to: data.from,
      answer,
      callSessionId: data.callSessionId
    });

    // Start audio pipeline
    await this.startAudioPipeline(localStream, data.from, sourceLang, targetLang);
  }


  async handleCallAnswered(data) {
    if (this.pcManager) {
      await this.pcManager.setRemoteDescription(data.answer);
    }
  }

  async handleRemoteIceCandidate(data) {
    if (this.pcManager) {
      await this.pcManager.addIceCandidate(data.candidate);
    }
  }

  async startAudioPipeline(localStream, targetUserId, sourceLang, targetLang) {
    await audioCaptureService.initialize(localStream);
    translationAudioService.initialize();
    await translationAudioService.resume().catch((err) => {
      console.warn('CallManager: Translation audio resume failed:', err?.message || err);
    });

    this.activeTargetUserId = targetUserId;
    this.activeStreamRequestId = `stream_${Date.now()}`;
    this.translationStreamReady = false;
    this.seenTranslationPayloads.clear();
    audioCaptureService.setStreamReady(false);
    audioCaptureService.setMuted(this.isMuted);
    this._registerTranslationSocketListeners();

    // Start streaming to server
    signalingService.socket.emit('startTranslationStream', {
      sourceLanguage: sourceLang || 'en',
      targetLanguage: targetLang || 'hi',
      userId: targetUserId,
      requestId: this.activeStreamRequestId
    });

    audioCaptureService.startStreaming((pcmBuffer) => {
      if (!signalingService.socket?.connected || !this.translationStreamReady || this.isMuted) return;
      const audioEmitter = signalingService.socket.volatile || signalingService.socket;
      audioEmitter.emit('audioChunk', pcmBuffer);
    });
  }

  _registerTranslationSocketListeners() {
    this._removeTranslationSocketListeners();

    const handleTranslatedSpeech = async (data) => {
      const payloadType = data.audioonly || data.audio ? 'audio' : data.partial ? 'partial' : 'text';
      const dedupeKey = `${data.requestId || 'no-id'}:${payloadType}:${data.isLocal ? 'local' : 'remote'}`;
      if (this.seenTranslationPayloads.has(dedupeKey)) return;
      this.seenTranslationPayloads.add(dedupeKey);
      if (this.seenTranslationPayloads.size > 200) {
        this.seenTranslationPayloads = new Set(Array.from(this.seenTranslationPayloads).slice(-100));
      }

      // Only the listener should hear translated TTS. The speaker keeps their
      // live microphone path and local captions, avoiding duplicate self-audio.
      if (data.audio && !data.isLocal) {
        await translationAudioService.enqueueAudio(data.audio);
      }

      // Only surface to UI if this payload carries text (avoids duplicate subtitle updates)
      if (this.onTranslatedSpeech && data.text) {
        this.onTranslatedSpeech(data);
      }
    };

    const handleStatus = (data) => {
      if (data.status === 'live') {
        this.translationStreamReady = true;
        audioCaptureService.setStreamReady(true);
      } else if (data.status === 'connecting' || data.status === 'off') {
        this.translationStreamReady = false;
        audioCaptureService.setStreamReady(false);
      }
      this.onTranslationStatus?.(data);
    };

    const handleError = (data) => {
      this.onTranslationStatus?.({ status: 'degraded', message: data.message, requestId: data.requestId });
    };

    const handleLatencyMetric = (data) => {
      this.onTranslationLatencyMetric?.(data);
    };

    this.translationHandlers = {
      translatedSpeech: handleTranslatedSpeech,
      translationStreamStatus: handleStatus,
      translationStreamError: handleError,
      translationLatencyMetric: handleLatencyMetric,
    };

    signalingService.socket.on('translatedSpeech', handleTranslatedSpeech);
    signalingService.socket.on('translationStreamStatus', handleStatus);
    signalingService.socket.on('translationStreamError', handleError);
    signalingService.socket.on('translationLatencyMetric', handleLatencyMetric);
  }

  _removeTranslationSocketListeners() {
    if (!this.translationHandlers || !signalingService.socket) return;
    Object.entries(this.translationHandlers).forEach(([event, handler]) => {
      signalingService.removeListener(event, handler);
    });
    this.translationHandlers = null;
  }

  setMuted(isMuted) {
    this.isMuted = Boolean(isMuted);
    audioCaptureService.setMuted(this.isMuted);
    if (this.isMuted) {
      audioCaptureService.setStreamReady(false);
    } else if (this.translationStreamReady) {
      audioCaptureService.setStreamReady(true);
    }
  }

  handleCallEnded() {
    this.cleanup();
  }

  handleUserBusy() {
    console.log('CallManager: Remote user is busy');
    if (this.deliveryTimer) {
      clearTimeout(this.deliveryTimer);
      this.deliveryTimer = null;
    }
    this.cleanup();
  }

  cleanup() {
    try {
      signalingService.socket?.emit('stopTranslationStream', {
        requestId: this.activeStreamRequestId,
        userId: this.activeTargetUserId
      });
    } catch {
      // best-effort cleanup
    }
    this._removeTranslationSocketListeners();
    if (this.pcManager) this.pcManager.cleanup();
    mediaTrackManager.stopAllTracks();
    audioCaptureService.cleanup();
    translationAudioService.cleanup();
    this.currentCallSession = null;
    this.translationStreamReady = false;
    this.activeTargetUserId = null;
    this.activeStreamRequestId = null;
    this.seenTranslationPayloads.clear();
    this.onTranslationStatus?.({ status: 'off' });
  }
}

const callManager = new CallManager();
export default callManager;
