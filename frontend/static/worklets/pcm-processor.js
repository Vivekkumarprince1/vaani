/**
 * Vaani v2 High-Performance 16kHz AudioWorklet
 * Captures clean mono Float32 audio and packages 20ms frames
 */
class VaaniPCMProcessor extends AudioWorkletProcessor {
	constructor() {
		super();
		this.chunkSize = 320; // 20ms at 16kHz
		this.buffer = new Float32Array(this.chunkSize);
		this.bufferIndex = 0;
	}

	process(inputs, outputs, parameters) {
		const input = inputs[0];
		if (!input || input.length === 0) return true;

		const channelData = input[0]; // Mono input
		for (let i = 0; i < channelData.length; i++) {
			this.buffer[this.bufferIndex++] = channelData[i];

			if (this.bufferIndex >= this.chunkSize) {
				// Convert Float32 (-1.0 to 1.0) to 16-bit signed PCM
				const pcm16 = new Int16Array(this.chunkSize);
				for (let j = 0; j < this.chunkSize; j++) {
					const s = Math.max(-1, Math.min(1, this.buffer[j]));
					pcm16[j] = s < 0 ? s * 0x8000 : s * 0x7fff;
				}

				this.port.postMessage(pcm16.buffer, [pcm16.buffer]);
				this.bufferIndex = 0;
			}
		}

		return true;
	}
}

registerProcessor('vaani-pcm-processor', VaaniPCMProcessor);
