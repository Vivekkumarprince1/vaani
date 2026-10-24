import { api, API_BASE } from '#lib/api/client';

const MIC_CAPTURE_OPTIONS = {
	echoCancellation: true,
	noiseSuppression: true,
	autoGainControl: true,
	channelCount: 1
} as const;

interface TTSQueueItem {
	text: string;
	language: string;
	audioUrl?: string;
}

export class CallSpeechService {
	private recognition: any = null;
	private audioContext: AudioContext | null = null;
	private sourceNode: MediaStreamAudioSourceNode | null = null;
	private processorNode: ScriptProcessorNode | null = null;
	private silentGainNode: GainNode | null = null;
	private activeStream: MediaStream | null = null;
	private activeTrackId: string | null = null;

	private isRunning = false;
	private isMuted = false;
	private isRecording = false;
	private isVadActive = false;
	private speechStartTime = 0;
	private silenceStartTime = 0;

	// 16kHz mono Float32 PCM buffers
	private readonly targetSampleRate = 16000;
	private readonly preRollMaxSamples = 5600; // 350ms pre-roll at 16kHz to prevent initial syllable clipping
	private preRollBuffer: Float32Array = new Float32Array(0);
	private recordedChunks: Float32Array[] = [];
	private recordedSampleCount = 0;
	private voicedFrameCount = 0;
	private noiseFloor = 0.003;

	private callRoomId: string | null = null;
	private language = 'en'; // Explicit user-selected spoken language or 'auto'
	private lastSentText = '';
	private lastSentTime = 0;
	private restartTimer: any = null;
	private silenceTimer: any = null;
	private accumulatedText = '';
	private latestInterimText = '';
	private serverSttFailures = 0;

	// Sequential TTS playback queue to prevent overlapping audio & echo loops
	private ttsQueue: TTSQueueItem[] = [];
	private isPlayingTTS = false;
	private currentAudio: HTMLAudioElement | null = null;

	private onSubtitleCallback?: (sub: any) => void;
	private onTTSPlaybackStateChange?: (isPlaying: boolean) => void;

	setOnSubtitle(cb: (sub: any) => void) {
		this.onSubtitleCallback = cb;
	}

	setOnTTSPlaybackStateChange(cb: (isPlaying: boolean) => void) {
		this.onTTSPlaybackStateChange = cb;
	}

	// Map 2-letter language codes to BCP-47 for Web Speech API & TTS fallback
	private getBcp47(code: string): string {
		const map: Record<string, string> = {
			auto: 'en-US',
			en: 'en-US',
			ru: 'ru-RU',
			hi: 'hi-IN',
			es: 'es-ES',
			fr: 'fr-FR',
			de: 'de-DE',
			ja: 'ja-JP',
			zh: 'zh-CN',
			ar: 'ar-SA',
			pt: 'pt-BR',
			it: 'it-IT',
			bn: 'bn-IN',
			ta: 'ta-IN',
			te: 'te-IN',
			mr: 'mr-IN',
			gu: 'gu-IN',
			ur: 'ur-PK',
			tr: 'tr-TR',
			ko: 'ko-KR'
		};
		const clean = (code || 'en').toLowerCase().trim();
		return map[clean] || (clean.length === 2 ? `${clean}-${clean.toUpperCase()}` : clean);
	}

	start(callRoomId: string, language: string, mediaStream?: MediaStream | null) {
		if (typeof window === 'undefined') return;

		const roomChanged = this.callRoomId !== callRoomId;
		this.callRoomId = callRoomId;
		this.language = language || 'en';

		if (mediaStream) {
			this.activeStream = mediaStream;
		}

		if (this.isRunning && !roomChanged) {
			if (mediaStream) {
				this.updateStream(mediaStream);
			}
			return;
		}

		this.isRunning = true;
		this.isMuted = false;
		this.accumulatedText = '';
		this.latestInterimText = '';
		this.serverSttFailures = 0;

		console.log(`🎙️ CallSpeechService started [room: ${callRoomId}, language: ${this.language}]`);

		// 1. Start 16kHz PCM WAV Audio VAD pipeline (primary neural STT via Whisper/Deepgram)
		void this.initAutoVAD();

		// 2. Start Web Speech API in standby/assisted mode
		const SpeechRecognition =
			(window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
		if (SpeechRecognition) {
			this.startWebSpeech(SpeechRecognition);
		}
	}

	setLanguage(newLang: string) {
		if (!newLang || newLang === this.language) return;
		this.language = newLang;
		console.log(`🌐 Spoken language switched to: ${this.language}`);

		if (this.isRunning && !this.isMuted) {
			// Flush any in-progress utterance under the previous language before switching
			if (this.isRecording && this.recordedSampleCount > 3200) {
				this.flushRecordedUtterance();
			}
			const SpeechRecognition =
				(window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
			if (SpeechRecognition) {
				this.startWebSpeech(SpeechRecognition);
			}
		}
	}

	updateStream(mediaStream: MediaStream | null) {
		if (!mediaStream) return;
		const audioTrack = mediaStream.getAudioTracks()[0];
		if (!audioTrack) return;

		this.activeStream = mediaStream;
		const trackChanged = audioTrack.id !== this.activeTrackId || audioTrack.readyState === 'ended';

		if (this.isRunning && !this.isMuted && (!this.isVadActive || trackChanged)) {
			void this.initAutoVAD( true );
		}
	}

	// =========================================================================
	// 🎙️ 16kHz PCM WAV AUDIO VAD PIPELINE (With 350ms Circular Pre-Roll Buffer)
	// =========================================================================

	private async initAutoVAD(forceReconnect = false) {
		if (this.isVadActive && !forceReconnect) return;

		try {
			let stream = this.activeStream;
			const track = stream?.getAudioTracks()[0];
			if (!stream || !track || track.readyState === 'ended') {
				if (navigator.mediaDevices?.getUserMedia) {
					stream = await navigator.mediaDevices.getUserMedia({
						audio: MIC_CAPTURE_OPTIONS
					});
					this.activeStream = stream;
				}
			}

			if (!stream || stream.getAudioTracks().length === 0) {
				console.warn('⚠️ No active audio stream for VAD STT');
				return;
			}

			this.startAudioVAD(stream);
		} catch (err) {
			console.warn('⚠️ Error initializing Audio VAD for neural STT:', err);
		}
	}

	private downsampleTo16kHz(input: Float32Array, inputSampleRate: number): Float32Array {
		if (inputSampleRate === this.targetSampleRate) {
			return new Float32Array(input);
		}
		const ratio = inputSampleRate / this.targetSampleRate;
		const newLength = Math.round(input.length / ratio);
		const result = new Float32Array(newLength);
		let offsetResult = 0;
		let offsetBuffer = 0;
		while (offsetResult < result.length) {
			const nextOffsetBuffer = Math.min(input.length, Math.round((offsetResult + 1) * ratio));
			let accum = 0;
			let count = 0;
			for (let i = offsetBuffer; i < nextOffsetBuffer; i++) {
				accum += input[i];
				count++;
			}
			result[offsetResult] = count > 0 ? accum / count : 0;
			offsetResult++;
			offsetBuffer = nextOffsetBuffer;
		}
		return result;
	}

	private appendToPreRoll(samples: Float32Array) {
		const combinedLen = this.preRollBuffer.length + samples.length;
		if (combinedLen <= this.preRollMaxSamples) {
			const next = new Float32Array(combinedLen);
			next.set(this.preRollBuffer, 0);
			next.set(samples, this.preRollBuffer.length);
			this.preRollBuffer = next;
		} else {
			const next = new Float32Array(this.preRollMaxSamples);
			const keepFromOld = Math.max(0, this.preRollMaxSamples - samples.length);
			if (keepFromOld > 0) {
				next.set(
					this.preRollBuffer.subarray(this.preRollBuffer.length - keepFromOld),
					0
				);
				next.set(samples, keepFromOld);
			} else {
				next.set(samples.subarray(samples.length - this.preRollMaxSamples), 0);
			}
			this.preRollBuffer = next;
		}
	}

	private encodeWAV(samples: Float32Array, sampleRate: number): Blob {
		const buffer = new ArrayBuffer(44 + samples.length * 2);
		const view = new DataView(buffer);

		const writeString = (offset: number, str: string) => {
			for (let i = 0; i < str.length; i++) {
				view.setUint8(offset + i, str.charCodeAt(i));
			}
		};

		writeString(0, 'RIFF');
		view.setUint32(4, 36 + samples.length * 2, true);
		writeString(8, 'WAVE');
		writeString(12, 'fmt ');
		view.setUint32(16, 16, true); // Subchunk1Size (16 for PCM)
		view.setUint16(20, 1, true); // AudioFormat (1 = Linear PCM)
		view.setUint16(22, 1, true); // NumChannels (1 = Mono)
		view.setUint32(24, sampleRate, true); // SampleRate (16000)
		view.setUint32(28, sampleRate * 2, true); // ByteRate (SampleRate * NumChannels * BitsPerSample/8)
		view.setUint16(32, 2, true); // BlockAlign (NumChannels * BitsPerSample/8)
		view.setUint16(34, 16, true); // BitsPerSample (16-bit)
		writeString(36, 'data');
		view.setUint32(40, samples.length * 2, true);

		let offset = 44;
		for (let i = 0; i < samples.length; i++, offset += 2) {
			const s = Math.max(-1, Math.min(1, samples[i]));
			view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
		}

		return new Blob([buffer], { type: 'audio/wav' });
	}

	private startAudioVAD(stream: MediaStream) {
		try {
			this.cleanupAudioNodes();

			const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
			if (!this.audioContext || this.audioContext.state === 'closed') {
				this.audioContext = new AudioCtx();
			}
			if (this.audioContext.state === 'suspended') {
				this.audioContext.resume().catch(() => {});
			}

			const audioTrack = stream.getAudioTracks()[0];
			this.activeTrackId = audioTrack?.id || null;

			const source = this.audioContext.createMediaStreamSource(stream);
			const processor = this.audioContext.createScriptProcessor(2048, 1, 1);
			const silentGain = this.audioContext.createGain();
			silentGain.gain.value = 0;

			source.connect(processor);
			processor.connect(silentGain);
			silentGain.connect(this.audioContext.destination);

			this.sourceNode = source;
			this.processorNode = processor;
			this.silentGainNode = silentGain;
			this.isVadActive = true;

			const BASE_SPEECH_THRESHOLD = 0.008; // Clean conversational voice threshold (~ -42 dBFS)
			const SILENCE_TIMEOUT_MS = 550; // Pause duration to finalize utterance
			const MAX_SPEECH_DURATION_MS = 5500; // Slice continuous speech every 5.5s for low latency

			processor.onaudioprocess = (event: AudioProcessingEvent) => {
				if (!this.isRunning || this.isMuted) return;
				if (this.audioContext?.state === 'suspended') {
					this.audioContext.resume().catch(() => {});
				}

				const inputData = event.inputBuffer.getChannelData(0);
				const downsampled = this.downsampleTo16kHz(
					inputData,
					event.inputBuffer.sampleRate || this.audioContext?.sampleRate || 48000
				);

				let sumSquares = 0;
				for (let i = 0; i < downsampled.length; i++) {
					sumSquares += downsampled[i] * downsampled[i];
				}
				const rms = Math.sqrt(sumSquares / Math.max(1, downsampled.length));

				// Smooth ambient noise floor tracking during silence
				if (!this.isRecording && rms < BASE_SPEECH_THRESHOLD) {
					this.noiseFloor = this.noiseFloor * 0.95 + rms * 0.05;
				}

				// Raise threshold while TTS is playing to prevent speaker-to-mic echo loops
				const dynamicThreshold = Math.max(
					BASE_SPEECH_THRESHOLD,
					this.noiseFloor * 2.5
				) * (this.isPlayingTTS ? 3.2 : 1.0);

				const now = Date.now();

				if (rms > dynamicThreshold) {
					if (!this.isRecording) {
						this.isRecording = true;
						this.speechStartTime = now;
						this.silenceStartTime = 0;
						this.voicedFrameCount = 1;
						this.recordedChunks = [];
						this.recordedSampleCount = 0;

						// Prepend 350ms circular pre-roll buffer so the first syllable is never clipped
						if (this.preRollBuffer.length > 0) {
							const preCopy = new Float32Array(this.preRollBuffer);
							this.recordedChunks.push(preCopy);
							this.recordedSampleCount += preCopy.length;
							this.preRollBuffer = new Float32Array(0);
						}
						this.recordedChunks.push(downsampled);
						this.recordedSampleCount += downsampled.length;
					} else {
						this.silenceStartTime = 0;
						this.voicedFrameCount++;
						this.recordedChunks.push(downsampled);
						this.recordedSampleCount += downsampled.length;

						if (now - this.speechStartTime >= MAX_SPEECH_DURATION_MS) {
							this.flushRecordedUtterance();
						}
					}
				} else {
					if (this.isRecording) {
						this.recordedChunks.push(downsampled);
						this.recordedSampleCount += downsampled.length;

						if (this.silenceStartTime === 0) {
							this.silenceStartTime = now;
						} else if (now - this.silenceStartTime >= SILENCE_TIMEOUT_MS) {
							this.flushRecordedUtterance();
						}
					} else {
						this.appendToPreRoll(downsampled);
					}
				}
			};

			console.log('✅ Real-time 16kHz PCM WAV Voice Activity Detection (VAD) active');
		} catch (err) {
			this.isVadActive = false;
			console.warn('Failed to start Audio VAD pipeline:', err);
		}
	}

	private flushRecordedUtterance() {
		if (!this.isRecording) return;

		const chunks = this.recordedChunks;
		const totalSamples = this.recordedSampleCount;
		const voicedFrames = this.voicedFrameCount;
		const fallbackWebSpeech = (this.accumulatedText || this.latestInterimText).trim();

		this.isRecording = false;
		this.silenceStartTime = 0;
		this.speechStartTime = 0;
		this.recordedChunks = [];
		this.recordedSampleCount = 0;
		this.voicedFrameCount = 0;
		this.accumulatedText = '';
		this.latestInterimText = '';

		// Require at least 3 voiced frames (~130ms of active voice) and >= 250ms total audio (including pre-roll)
		if (voicedFrames < 3 || totalSamples < 4000 || chunks.length === 0) {
			return;
		}

		const merged = new Float32Array(totalSamples);
		let offset = 0;
		for (const chunk of chunks) {
			merged.set(chunk, offset);
			offset += chunk.length;
		}

		const wavBlob = this.encodeWAV(merged, this.targetSampleRate);
		void this.sendAudioChunk(wavBlob, fallbackWebSpeech);
	}

	private async sendAudioChunk(blob: Blob, fallbackWebSpeech = '') {
		if (blob.size < 1000 || !this.callRoomId || this.isMuted) return;

		const formData = new FormData();
		formData.append('file', blob, 'speech.wav');
		formData.append('call_room_id', this.callRoomId);
		formData.append('language', this.language);

		try {
			const token = typeof window !== 'undefined' ? localStorage.getItem('vaani_token') : null;
			const res = await fetch(`${API_BASE}/calls/audio-translate`, {
				method: 'POST',
				headers: token ? { Authorization: `Bearer ${token}` } : {},
				body: formData
			});

			if (!res.ok) {
				this.serverSttFailures++;
				const errText = await res.text().catch(() => '');
				console.warn('⚠️ Audio translate error:', res.status, errText);
				if (fallbackWebSpeech) {
					await this.sendRecognizedSpeech(fallbackWebSpeech);
				}
				return;
			}

			const data = await res.json().catch(() => null);
			this.serverSttFailures = 0;

			if (data?.text) {
				this.lastSentText = String(data.text).trim();
				this.lastSentTime = Date.now();
			}
			if (data?.subtitles && Array.isArray(data.subtitles) && this.onSubtitleCallback) {
				for (const sub of data.subtitles) {
					this.onSubtitleCallback(sub);
				}
			}
		} catch (err) {
			this.serverSttFailures++;
			console.warn('Failed to send audio chunk to STT, using Web Speech fallback:', err);
			if (fallbackWebSpeech) {
				await this.sendRecognizedSpeech(fallbackWebSpeech);
			}
		}
	}

	private cleanupAudioNodes() {
		if (this.processorNode) {
			this.processorNode.onaudioprocess = null;
			try {
				this.processorNode.disconnect();
			} catch {}
			this.processorNode = null;
		}
		if (this.sourceNode) {
			try {
				this.sourceNode.disconnect();
			} catch {}
			this.sourceNode = null;
		}
		if (this.silentGainNode) {
			try {
				this.silentGainNode.disconnect();
			} catch {}
			this.silentGainNode = null;
		}
		this.isVadActive = false;
		this.isRecording = false;
		this.recordedChunks = [];
		this.recordedSampleCount = 0;
		this.voicedFrameCount = 0;
		this.preRollBuffer = new Float32Array(0);
	}

	private stopAudioVAD() {
		this.cleanupAudioNodes();
		if (this.audioContext && this.audioContext.state !== 'closed') {
			try {
				this.audioContext.close().catch(() => {});
			} catch {}
			this.audioContext = null;
		}
		this.activeTrackId = null;
	}

	// =========================================================================
	// 🌐 BROWSER WEB SPEECH API (Fallback & Assisted Recognition)
	// =========================================================================

	private startWebSpeech(SpeechRecognitionClass: any) {
		try {
			if (this.recognition) {
				const oldRec = this.recognition;
				this.recognition = null;
				try {
					oldRec.onend = null;
					oldRec.onerror = null;
					oldRec.onresult = null;
					oldRec.abort();
				} catch {}
			}

			const rec = new SpeechRecognitionClass();
			rec.continuous = true;
			rec.interimResults = true;
			rec.lang = this.getBcp47(this.language);
			rec.maxAlternatives = 1;

			rec.onresult = (event: any) => {
				if (!this.isRunning || this.isMuted || this.isPlayingTTS) return;

				let finalSegment = '';
				let interimSegment = '';

				for (let i = event.resultIndex; i < event.results.length; i++) {
					const res = event.results[i];
					const transcript = (res[0]?.transcript || '').trim();
					if (!transcript) continue;
					if (res.isFinal) {
						finalSegment += (finalSegment ? ' ' : '') + transcript;
					} else {
						interimSegment += (interimSegment ? ' ' : '') + transcript;
					}
				}

				if (finalSegment) {
					this.accumulatedText = (this.accumulatedText + ' ' + finalSegment).trim();
				}
				this.latestInterimText = interimSegment;

				// Only dispatch directly from Web Speech API if AudioVAD is inactive or server STT has failed
				const shouldSendDirectly = !this.isVadActive || this.serverSttFailures >= 1;
				const candidate = (this.accumulatedText || this.latestInterimText).trim();

				if (shouldSendDirectly && candidate.length > 1) {
					if (this.silenceTimer) clearTimeout(this.silenceTimer);
					this.silenceTimer = setTimeout(() => {
						if (this.isRunning && !this.isMuted && !this.isRecording) {
							const textToSend = (this.accumulatedText || this.latestInterimText).trim();
							this.accumulatedText = '';
							this.latestInterimText = '';
							if (textToSend) {
								void this.sendRecognizedSpeech(textToSend);
							}
						}
					}, 650);
				}
			};

			rec.onerror = (event: any) => {
				const errCode = event?.error || '';
				if (errCode === 'not-allowed' || errCode === 'service-not-allowed') {
					console.warn('Browser Web Speech API permission denied:', errCode);
					this.recognition = null;
					return;
				}
				// For transient events like 'no-speech' or 'network', keep recognition alive so onend restarts it
			};

			rec.onend = () => {
				if (this.isRunning && !this.isMuted && this.recognition === rec) {
					this.scheduleRestart(SpeechRecognitionClass, 350);
				}
			};

			rec.start();
			this.recognition = rec;
		} catch (err) {
			console.warn('Web Speech API unavailable, relying on 16kHz PCM VAD:', err);
		}
	}

	private scheduleRestart(SpeechRecognitionClass: any, delayMs: number) {
		if (this.restartTimer) clearTimeout(this.restartTimer);
		this.restartTimer = setTimeout(() => {
			if (this.isRunning && !this.isMuted) {
				this.startWebSpeech(SpeechRecognitionClass);
			}
		}, delayMs);
	}

	private async sendRecognizedSpeech(text: string) {
		const clean = text.trim();
		if (!clean || !this.callRoomId || this.isMuted) return;

		const now = Date.now();
		if (clean.toLowerCase() === this.lastSentText.toLowerCase() && now - this.lastSentTime < 2500) {
			return;
		}

		this.lastSentText = clean;
		this.lastSentTime = now;

		try {
			const res = await api.post('/calls/speech-translate', {
				call_room_id: this.callRoomId,
				text: clean,
				language: this.language
			});
			if (res.data?.subtitles && Array.isArray(res.data.subtitles) && this.onSubtitleCallback) {
				for (const sub of res.data.subtitles) {
					this.onSubtitleCallback(sub);
				}
			}
		} catch (err) {
			console.warn('Failed to translate call speech:', err);
		}
	}

	// =========================================================================
	// 🔊 CONTROLS & SEQUENTIAL SYNTHESIZED SPEECH PLAYBACK
	// =========================================================================

	setMuted(muted: boolean) {
		if (this.isMuted === muted) return;
		this.isMuted = muted;

		if (this.silenceTimer) {
			clearTimeout(this.silenceTimer);
			this.silenceTimer = null;
		}

		if (muted) {
			if (this.recognition) {
				const oldRec = this.recognition;
				this.recognition = null;
				try {
					oldRec.onend = null;
					oldRec.abort();
				} catch {}
			}
			this.isRecording = false;
			this.recordedChunks = [];
			this.recordedSampleCount = 0;
			this.voicedFrameCount = 0;
			this.accumulatedText = '';
			this.latestInterimText = '';
		} else if (this.isRunning) {
			void this.initAutoVAD(true);
			const SpeechRecognition =
				(window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
			if (SpeechRecognition) {
				this.startWebSpeech(SpeechRecognition);
			}
		}
	}

	stop() {
		this.isRunning = false;
		if (this.restartTimer) {
			clearTimeout(this.restartTimer);
			this.restartTimer = null;
		}
		if (this.silenceTimer) {
			clearTimeout(this.silenceTimer);
			this.silenceTimer = null;
		}
		if (this.recognition) {
			const oldRec = this.recognition;
			this.recognition = null;
			try {
				oldRec.onend = null;
				oldRec.abort();
			} catch {}
		}
		this.ttsQueue = [];
		if (this.currentAudio) {
			try {
				this.currentAudio.pause();
				this.currentAudio.src = '';
			} catch {}
			this.currentAudio = null;
		}
		if (typeof window !== 'undefined' && window.speechSynthesis) {
			try {
				window.speechSynthesis.cancel();
			} catch {}
		}
		this.isPlayingTTS = false;
		this.onTTSPlaybackStateChange?.(false);
		this.stopAudioVAD();
		this.lastSentText = '';
		this.accumulatedText = '';
		this.latestInterimText = '';
		this.activeStream = null;
	}

	// Enqueue spoken translated speech for sequential, non-overlapping playback
	speak(text: string, language: string, audioUrl?: string) {
		if (typeof window === 'undefined' || !text?.trim()) return;

		const cleanText = text.trim();
		const lastItem = this.ttsQueue[this.ttsQueue.length - 1];
		if (lastItem && lastItem.text === cleanText && lastItem.language === language) {
			return;
		}

		if (this.ttsQueue.length >= 4) {
			this.ttsQueue.shift();
		}

		this.ttsQueue.push({ text: cleanText, language, audioUrl });
		if (!this.isPlayingTTS) {
			void this.processTTSQueue();
		}
	}

	private async processTTSQueue() {
		if (this.isPlayingTTS) return;
		this.isPlayingTTS = true;
		this.onTTSPlaybackStateChange?.(true);

		try {
			while (this.ttsQueue.length > 0) {
				const item = this.ttsQueue.shift()!;
				await this.playSingleTTS(item);
			}
		} finally {
			this.isPlayingTTS = false;
			this.onTTSPlaybackStateChange?.(false);
		}
	}

	private async playSingleTTS(item: TTSQueueItem): Promise<void> {
		if (item.audioUrl) {
			const played = await this.playServerTTS(item.audioUrl);
			if (played) return;
		}
		await this.speakBrowser(item.text, item.language);
	}

	private async playServerTTS(audioUrl: string): Promise<boolean> {
		try {
			const base = API_BASE.replace(/\/api\/?$/, '');
			const fullUrl = audioUrl.startsWith('http')
				? audioUrl
				: `${base}${audioUrl.startsWith('/') ? '' : '/'}${audioUrl}`;
			const token = typeof window !== 'undefined' ? localStorage.getItem('vaani_token') : null;
			const response = await fetch(fullUrl, {
				headers: token ? { Authorization: `Bearer ${token}` } : {}
			});
			if (!response.ok) return false;

			const blob = await response.blob();
			if (blob.size === 0) return false;

			const objectUrl = URL.createObjectURL(blob);
			return await new Promise<boolean>((resolve) => {
				const audio = new Audio(objectUrl);
				this.currentAudio = audio;
				audio.volume = 1.0;

				const cleanup = (ok: boolean) => {
					if (this.currentAudio === audio) {
						this.currentAudio = null;
					}
					URL.revokeObjectURL(objectUrl);
					resolve(ok);
				};

				audio.onended = () => cleanup(true);
				audio.onerror = () => cleanup(false);
				audio.play().catch(() => cleanup(false));
			});
		} catch (err) {
			console.warn('Server TTS unavailable, using speech synthesis fallback:', err);
			return false;
		}
	}

	private speakBrowser(text: string, language: string): Promise<void> {
		return new Promise<void>((resolve) => {
			if (typeof window === 'undefined' || !window.speechSynthesis || !text) {
				resolve();
				return;
			}

			try {
				window.speechSynthesis.cancel();
				const utterance = new SpeechSynthesisUtterance(text);
				const bcp47 = this.getBcp47(language);
				utterance.lang = bcp47;
				utterance.rate = 1.05;
				utterance.pitch = 1.0;

				const voices = window.speechSynthesis.getVoices();
				if (voices && voices.length > 0) {
					const langPrefix = language.toLowerCase().slice(0, 2);
					const voice =
						voices.find((v) => v.lang.toLowerCase() === bcp47.toLowerCase()) ||
						voices.find((v) => v.lang.toLowerCase().startsWith(langPrefix));
					if (voice) {
						utterance.voice = voice;
					}
				}

				const timeout = setTimeout(() => resolve(), 8000);
				utterance.onend = () => {
					clearTimeout(timeout);
					resolve();
				};
				utterance.onerror = () => {
					clearTimeout(timeout);
					resolve();
				};

				window.speechSynthesis.speak(utterance);
			} catch (err) {
				console.warn('Browser speech synthesis error:', err);
				resolve();
			}
		});
	}
}

export const callSpeechService = new CallSpeechService();
