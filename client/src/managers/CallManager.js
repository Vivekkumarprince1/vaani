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
  }

  initialize(callbacks = {}) {
    this.onRemoteTrack = callbacks.onRemoteTrack;
    this.onConnectionStateChange = callbacks.onConnectionStateChange;
    this.onTranslatedSpeech = callbacks.onTranslatedSpeech;

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

    const pc = this.pcManager.createPeerConnection();
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
    
    // Start streaming to server
    signalingService.socket.emit('startTranslationStream', {
      sourceLanguage: sourceLang || 'en',
      targetLanguage: targetLang || 'hi',
      userId: targetUserId,
      requestId: `stream_${Date.now()}`
    });

    audioCaptureService.startStreaming((pcmBuffer) => {
      signalingService.socket.emit('audioChunk', pcmBuffer);
    });


    // The server sends two payloads per utterance:
    // 1. text-only (data.audiocoming === true) — display subtitles immediately
    // 2. audio-only (data.audioonly === true) — play TTS when ready
    // This decoupling removes TTS latency from subtitle display.
    signalingService.socket.on('translatedSpeech', async (data) => {
      if (data.audio) {
        await translationAudioService.enqueueAudio(data.audio);
      }

      // Only surface to UI if this payload carries text (avoids duplicate subtitle updates)
      if (this.onTranslatedSpeech && !data.audioonly) {
        this.onTranslatedSpeech(data);
      }
    });
  }

  handleCallEnded() {
    this.cleanup();
  }

  handleUserBusy(data) {
    console.log('CallManager: Remote user is busy');
    if (this.deliveryTimer) {
      clearTimeout(this.deliveryTimer);
      this.deliveryTimer = null;
    }
    this.cleanup();
  }

  cleanup() {
    if (this.pcManager) this.pcManager.cleanup();
    mediaTrackManager.stopAllTracks();
    audioCaptureService.cleanup();
    translationAudioService.cleanup();
    this.currentCallSession = null;
  }
}

const callManager = new CallManager();
export default callManager;
