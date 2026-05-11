/**
 * VaaniProcessor
 * AudioWorkletProcessor for high-performance PCM capture.
 * Captures 16kHz mono PCM frames and sends them to the main thread.
 */
class VaaniProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    // 320 samples at 16 kHz = 20 ms per chunk — matches Azure SDK's preferred
    // input granularity and keeps end-to-end translation latency low.
    this.bufferSize = 320;
    this.buffer = new Float32Array(this.bufferSize);
    this.bufferIndex = 0;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    if (input.length > 0) {
      const channelData = input[0]; // Mono capture

      for (let i = 0; i < channelData.length; i++) {
        this.buffer[this.bufferIndex++] = channelData[i];

        if (this.bufferIndex >= this.bufferSize) {
          // Send PCM buffer to main thread
          this.port.postMessage(this.buffer);
          
          // Reset buffer
          this.buffer = new Float32Array(this.bufferSize);
          this.bufferIndex = 0;
        }
      }
    }
    return true;
  }
}

registerProcessor('vaani-processor', VaaniProcessor);
