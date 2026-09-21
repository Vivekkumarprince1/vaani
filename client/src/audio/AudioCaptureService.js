/**
 * AudioCaptureService
 * Manages the AudioContext and AudioWorklet lifecycle.
 * Streams PCM chunks to the server for real-time translation.
 */
class AudioCaptureService {
  constructor() {
    this.audioContext = null;
    this.workletNode = null;
    this.source = null;
    this.isStreaming = false;
    this.streamReady = false;
    this.isMuted = false;
    this.onPCMData = null; // Callback for PCM chunks
  }

  async initialize(stream) {
    if (this.audioContext) {
      await this.audioContext.close();
    }

    // Azure/Backend prefers 16kHz
    this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
      sampleRate: 16000, 
      latencyHint: 'interactive'
    });

    try {
      // Use the correct path for the worker. 
      // In Vite/Next.js, this might need special handling. 
      // Assuming it's served from /workers/VaaniProcessor.js or similar.
      await this.audioContext.audioWorklet.addModule('/worklets/VaaniProcessor.js');

      
      this.source = this.audioContext.createMediaStreamSource(stream);
      this.workletNode = new AudioWorkletNode(this.audioContext, 'vaani-processor');

      this.workletNode.port.onmessage = (event) => {
        if (this.isStreaming && this.streamReady && !this.isMuted && this.onPCMData) {
          const float32Data = event.data;
          const int16Data = this.float32ToInt16(float32Data);
          this.onPCMData(int16Data);
        }
      };

      this.source.connect(this.workletNode);
      // We don't connect to destination to avoid echo, unless we want to monitor
    } catch (e) {
      console.error('AudioCaptureService: Failed to initialize Worklet', e);
    }
  }

  startStreaming(callback) {
    this.onPCMData = callback;
    this.isStreaming = true;
    if (this.audioContext && this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }
  }

  stopStreaming() {
    this.isStreaming = false;
    this.streamReady = false;
  }

  setStreamReady(isReady) {
    this.streamReady = Boolean(isReady);
  }

  setMuted(isMuted) {
    this.isMuted = Boolean(isMuted);
  }

  float32ToInt16(float32Array) {
    const len = float32Array.length;
    const int16Array = new Int16Array(len);
    for (let i = 0; i < len; i++) {
      let sample = float32Array[i];
      if (Number.isNaN(sample)) sample = 0;
      const s = Math.max(-1, Math.min(1, sample));
      int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    return int16Array.buffer;
  }

  async cleanup() {
    this.stopStreaming();
    this.streamReady = false;
    this.isMuted = false;
    if (this.source) this.source.disconnect();
    if (this.workletNode) this.workletNode.disconnect();
    if (this.audioContext) {
      await this.audioContext.close();
      this.audioContext = null;
    }
  }
}

const audioCaptureService = new AudioCaptureService();
export default audioCaptureService;
