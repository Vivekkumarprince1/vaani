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
        if (this.isStreaming && this.onPCMData) {
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
  }

  float32ToInt16(float32Array) {
    const int16Array = new Int16Array(float32Array.length);
    for (let i = 0; i < float32Array.length; i++) {
      const s = Math.max(-1, Math.min(1, float32Array[i]));
      int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    return int16Array.buffer;
  }

  async cleanup() {
    this.stopStreaming();
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
