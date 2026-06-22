/**
 * TranslationAudioService
 * Handles decoding of translated audio chunks and injection into WebRTC.
 * Uses AudioContext and MediaStreamDestination to create a track for RTCPeerConnection.
 */
const MAX_PLAYBACK_QUEUE = Number.parseInt(
  import.meta.env.VITE_TRANSLATION_AUDIO_QUEUE_LIMIT || '3',
  10
);

class TranslationAudioService {
  constructor() {
    this.audioContext = null;
    this.destination = null;
    this.playbackQueue = [];
    this.isPlaying = false;
    this.onPlaybackStateChange = null;
    this.currentSource = null;
  }

  initialize() {
    if (this.audioContext && this.audioContext.state !== 'closed') return;

    this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
      sampleRate: 48000, // Higher quality for playback
    });
    this.destination = this.audioContext.createMediaStreamDestination();
  }

  async resume() {
    if (!this.audioContext || this.audioContext.state === 'closed') this.initialize();
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }
  }

  /**
   * Returns the MediaStreamTrack that will carry the translated audio.
   */
  getTranslatedTrack() {
    if (!this.destination) this.initialize();
    return this.destination.stream.getAudioTracks()[0];
  }

  /**
   * Enqueues a translated audio chunk (ArrayBuffer) for playback into the RTC stream.
   * @param {ArrayBuffer} audioBuffer - The encoded audio data (e.g., MP3/WAV from TTS)
   */
  async enqueueAudio(audioBuffer) {
    if (!this.audioContext) this.initialize();

    try {
      await this.resume();
      const normalizedBuffer = await this._toArrayBuffer(audioBuffer);
      if (!normalizedBuffer || normalizedBuffer.byteLength === 0) return;

      const decodedBuffer = await this.audioContext.decodeAudioData(normalizedBuffer);
      while (this.playbackQueue.length >= MAX_PLAYBACK_QUEUE) {
        this.playbackQueue.shift();
      }
      this.playbackQueue.push(decodedBuffer);
      
      if (!this.isPlaying) {
        this.playNext().catch((err) => {
          console.error('TranslationAudioService: Playback failed', err);
        });
      }
    } catch (e) {
      console.error('TranslationAudioService: Error decoding audio', e);
    }
  }

  async playNext() {
    if (this.playbackQueue.length === 0) {
      this.isPlaying = false;
      this._notifyPlaybackState(false);
      return;
    }

    this.isPlaying = true;
    this._notifyPlaybackState(true);
    await this.resume();

    if (!this.audioContext || this.audioContext.state === 'closed') {
      this.isPlaying = false;
      this._notifyPlaybackState(false);
      return;
    }

    const buffer = this.playbackQueue.shift();
    const source = this.audioContext.createBufferSource();
    this.currentSource = source;
    source.buffer = buffer;
    
    // Play translated audio locally so the current user can hear the translation.
    // Also route into the MediaStreamDestination so callers who want a
    // translated MediaStreamTrack (e.g. for recording) can obtain it via
    // getTranslatedTrack(). Do NOT inject this into the outgoing RTCPeerConnection
    // sender — the outgoing track should remain the raw microphone input.
    source.connect(this.destination);
    source.connect(this.audioContext.destination);

    source.onended = () => {
      if (this.currentSource === source) this.currentSource = null;
      this.playNext().catch((err) => {
        console.error('TranslationAudioService: Playback queue failed', err);
      });
    };

    source.start();
  }

  cleanup() {
    this.playbackQueue = [];
    this._notifyPlaybackState(false);
    if (this.currentSource) {
      try {
        this.currentSource.stop();
      } catch (err) {
        console.warn('TranslationAudioService: Source stop skipped', err?.message || err);
      }
      this.currentSource = null;
    }
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
    this.destination = null;
    this.isPlaying = false;
  }

  setPlaybackStateCallback(callback) {
    this.onPlaybackStateChange = callback;
  }

  _notifyPlaybackState(isPlaying) {
    if (this.onPlaybackStateChange) {
      this.onPlaybackStateChange(isPlaying);
    }
  }

  async _toArrayBuffer(audioBuffer) {
    if (audioBuffer instanceof ArrayBuffer) return audioBuffer.slice(0);
    if (ArrayBuffer.isView(audioBuffer)) {
      return audioBuffer.buffer.slice(audioBuffer.byteOffset, audioBuffer.byteOffset + audioBuffer.byteLength);
    }
    if (typeof Blob !== 'undefined' && audioBuffer instanceof Blob) {
      return audioBuffer.arrayBuffer();
    }
    if (audioBuffer?.type === 'Buffer' && Array.isArray(audioBuffer.data)) {
      return new Uint8Array(audioBuffer.data).buffer;
    }
    return null;
  }
}

const translationAudioService = new TranslationAudioService();
export default translationAudioService;
