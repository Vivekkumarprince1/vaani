/**
 * TranslationAudioService
 * Handles decoding of translated audio chunks and injection into WebRTC.
 * Uses AudioContext and MediaStreamDestination to create a track for RTCPeerConnection.
 */
class TranslationAudioService {
  constructor() {
    this.audioContext = null;
    this.destination = null;
    this.playbackQueue = [];
    this.isPlaying = false;
    this.onPlaybackStateChange = null;
  }

  initialize() {
    this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
      sampleRate: 48000, // Higher quality for playback
    });
    this.destination = this.audioContext.createMediaStreamDestination();
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
      const decodedBuffer = await this.audioContext.decodeAudioData(this._toArrayBuffer(audioBuffer));
      this.playbackQueue.push(decodedBuffer);
      
      if (!this.isPlaying) {
        this.playNext();
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
    const buffer = this.playbackQueue.shift();
    const source = this.audioContext.createBufferSource();
    source.buffer = buffer;
    
    // Play translated audio locally so the current user can hear the translation.
    // Also route into the MediaStreamDestination so callers who want a
    // translated MediaStreamTrack (e.g. for recording) can obtain it via
    // getTranslatedTrack(). Do NOT inject this into the outgoing RTCPeerConnection
    // sender — the outgoing track should remain the raw microphone input.
    source.connect(this.destination);
    source.connect(this.audioContext.destination);

    source.onended = () => {
      this.playNext();
    };

    source.start();
  }

  cleanup() {
    this.playbackQueue = [];
    this._notifyPlaybackState(false);
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
  }

  setPlaybackStateCallback(callback) {
    this.onPlaybackStateChange = callback;
  }

  _notifyPlaybackState(isPlaying) {
    if (this.onPlaybackStateChange) {
      this.onPlaybackStateChange(isPlaying);
    }
  }

  _toArrayBuffer(audioBuffer) {
    if (audioBuffer instanceof ArrayBuffer) return audioBuffer.slice(0);
    if (ArrayBuffer.isView(audioBuffer)) {
      return audioBuffer.buffer.slice(audioBuffer.byteOffset, audioBuffer.byteOffset + audioBuffer.byteLength);
    }
    return audioBuffer;
  }
}

const translationAudioService = new TranslationAudioService();
export default translationAudioService;
