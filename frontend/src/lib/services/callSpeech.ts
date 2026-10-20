import { api, API_BASE } from '$lib/api/client';

export class CallSpeechService {
	private recognition: any = null;
	private mediaRecorder: MediaRecorder | null = null;
	private audioContext: AudioContext | null = null;
	private analyserNode: AnalyserNode | null = null;
	private vadInterval: any = null;
	private activeStream: MediaStream | null = null;

	private isRunning = false;
	private isMuted = false;
	private isRecording = false;
	private speechStartTime = 0;
	private silenceStartTime = 0;
	private audioChunks: Blob[] = [];

	private callRoomId: string | null = null;
	private language = 'auto'; // Default: zero selection, automatic language detection
	private lastSentText = '';
	private lastSentTime = 0;
	private restartTimer: any = null;
	private silenceTimer: any = null;
	private accumulatedText = '';

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
		const clean = (code || 'auto').toLowerCase().trim();
		return map[clean] || (clean.length === 2 ? `${clean}-${clean.toUpperCase()}` : clean);
	}

	start(callRoomId: string, language: string, mediaStream?: MediaStream | null) {
		if (typeof window === 'undefined') return;
		this.callRoomId = callRoomId;
		this.language = language || 'auto';
		this.isRunning = true;
		this.isMuted = false;
		this.accumulatedText = '';

		if (mediaStream) {
			this.activeStream = mediaStream;
		}

		console.log(`🎙️ CallSpeechService started [room: ${callRoomId}, mode: ${this.language}]`);

		// When 'auto' is selected, use neural STT via Audio VAD pipeline (Whisper/Deepgram)
		if (this.language === 'auto') {
			this.initAutoVAD();
		} else {
			// If a specific language is chosen (e.g. 'ru' or 'hi')
			const SpeechRecognition =
				(window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
			if (SpeechRecognition) {
				this.startWebSpeech(SpeechRecognition);
			} else {
				this.initAutoVAD();
			}
		}
	}

	setLanguage(newLang: string) {
		if (newLang && newLang !== this.language) {
			this.language = newLang;
			console.log(`🌐 Language switched to: ${this.language}`);
			if (this.isRunning && !this.isMuted) {
				if (this.language === 'auto') {
					if (this.recognition) {
						try {
							this.recognition.abort();
						} catch {}
						this.recognition = null;
					}
					this.initAutoVAD();
				} else {
					this.stopAudioVAD();
					const SpeechRecognition =
						(window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
					if (SpeechRecognition) {
						this.startWebSpeech(SpeechRecognition);
					} else {
						this.initAutoVAD();
					}
				}
			}
		}
	}

	// =========================================================================
	// 🎙️ NEURAL STT AUDIO VAD PIPELINE (Automatic Language Detection)
	// =========================================================================

	private async initAutoVAD() {
		if (this.vadInterval) return; // Already running

		try {
			let stream = this.activeStream;
			if (!stream || stream.getAudioTracks().length === 0 || !stream.getAudioTracks()[0].enabled) {
				if (navigator.mediaDevices?.getUserMedia) {
					stream = await navigator.mediaDevices.getUserMedia({ audio: true });
					this.activeStream = stream;
				}
			}

			if (!stream) {
				console.warn('⚠️ No active audio stream for VAD STT');
				return;
			}

			this.startAudioVAD(stream);
		} catch (err) {
			console.warn('⚠️ Error initializing Audio VAD for neural STT:', err);
		}
	}

	private startAudioVAD(stream: MediaStream) {
		try {
			const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
			if (!this.audioContext || this.audioContext.state === 'closed') {
				this.audioContext = new AudioCtx();
			}
			if (this.audioContext.state === 'suspended') {
				this.audioContext.resume().catch(() => {});
			}

			const source = this.audioContext.createMediaStreamSource(stream);
			const analyser = this.audioContext.createAnalyser();
			analyser.fftSize = 512;
			analyser.smoothingTimeConstant = 0.2;
			source.connect(analyser);
			this.analyserNode = analyser;

			const buffer = new Float32Array(analyser.fftSize);
			const SPEECH_ENERGY_THRESHOLD = 0.014; // Voice presence threshold
			const SILENCE_TIMEOUT_MS = 750; // Pause required to trigger utterance send
			const MAX_SPEECH_DURATION_MS = 7000; // Slice long continuous speech

			if (this.vadInterval) clearInterval(this.vadInterval);

			this.vadInterval = setInterval(() => {
				if (!this.isRunning || this.isMuted || !this.analyserNode) return;

				this.analyserNode.getFloatTimeDomainData(buffer);
				let sumSquares = 0;
				for (let i = 0; i < buffer.length; i++) {
					sumSquares += buffer[i] * buffer[i];
				}
				const rms = Math.sqrt(sumSquares / buffer.length);

				const now = Date.now();

				if (rms > SPEECH_ENERGY_THRESHOLD) {
					// Audio energy above threshold = User is speaking
					if (!this.isRecording) {
						this.isRecording = true;
						this.speechStartTime = now;
						this.silenceStartTime = 0;
						this.startRecorder(stream);
					} else {
						this.silenceStartTime = 0;
						// If user has been speaking continuously for > 7s, flush and continue
						if (now - this.speechStartTime > MAX_SPEECH_DURATION_MS) {
							this.stopRecorderAndSend(stream, true);
						}
					}
				} else {
					// Audio energy below threshold = Silence / Ambient room
					if (this.isRecording) {
						if (this.silenceStartTime === 0) {
							this.silenceStartTime = now;
						} else if (now - this.silenceStartTime > SILENCE_TIMEOUT_MS) {
							// Natural speech pause reached -> complete utterance
							this.stopRecorderAndSend(stream, false);
						}
					}
				}
			}, 60);

			console.log('✅ Real-time Voice Activity Detection (VAD) STT active');
		} catch (err) {
			console.warn('Failed to start Audio VAD pipeline:', err);
		}
	}

	private startRecorder(stream: MediaStream) {
		try {
			const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
				? 'audio/webm;codecs=opus'
				: MediaRecorder.isTypeSupported('audio/webm')
					? 'audio/webm'
					: 'audio/ogg';

			const recorder = new MediaRecorder(stream, { mimeType });
			this.audioChunks = [];

			recorder.ondataavailable = (e) => {
				if (e.data && e.data.size > 0) {
					this.audioChunks.push(e.data);
				}
			};

			recorder.start(100);
			this.mediaRecorder = recorder;
		} catch (err) {
			console.warn('Error creating MediaRecorder for VAD utterance:', err);
		}
	}

	private stopRecorderAndSend(stream: MediaStream, continueRecording: boolean) {
		const recorder = this.mediaRecorder;
		this.isRecording = false;
		this.silenceStartTime = 0;

		if (recorder && recorder.state !== 'inactive') {
			recorder.onstop = () => {
				if (this.audioChunks.length > 0 && this.isRunning && !this.isMuted) {
					const blob = new Blob(this.audioChunks, { type: recorder.mimeType });
					this.audioChunks = [];
					if (blob.size > 1400) {
						this.sendAudioChunk(blob);
					}
				}
			};
			try {
				recorder.stop();
			} catch {}
			this.mediaRecorder = null;
		}

		if (continueRecording && this.isRunning && !this.isMuted) {
			setTimeout(() => {
				if (this.isRunning && !this.isMuted) {
					this.isRecording = true;
					this.speechStartTime = Date.now();
					this.silenceStartTime = 0;
					this.startRecorder(stream);
				}
			}, 50);
		}
	}

	private async sendAudioChunk(blob: Blob) {
		if (blob.size < 1200 || !this.callRoomId || this.isMuted) return;

		const formData = new FormData();
		formData.append('file', blob, 'audio.webm');
		formData.append('call_room_id', this.callRoomId);
		formData.append('language', this.language); // 'auto' triggers zero-shot neural LID

		try {
			await api.post('/calls/audio-translate', formData);
		} catch (err) {
			console.warn('Failed to send audio chunk to Whisper/Deepgram STT:', err);
		}
	}

	private stopAudioVAD() {
		if (this.vadInterval) {
			clearInterval(this.vadInterval);
			this.vadInterval = null;
		}
		if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
			this.mediaRecorder.onstop = null;
			try {
				this.mediaRecorder.stop();
			} catch {}
			this.mediaRecorder = null;
		}
		if (this.audioContext && this.audioContext.state !== 'closed') {
			try {
				this.audioContext.close().catch(() => {});
			} catch {}
			this.audioContext = null;
		}
		this.analyserNode = null;
		this.isRecording = false;
		this.audioChunks = [];
	}

	// =========================================================================
	// 🌐 BROWSER WEB SPEECH API (Used when specific language is manually chosen)
	// =========================================================================

	private startWebSpeech(SpeechRecognitionClass: any) {
		try {
			if (this.recognition) {
				try {
					this.recognition.abort();
				} catch {}
			}

			const rec = new SpeechRecognitionClass();
			rec.continuous = true;
			rec.interimResults = true;
			rec.lang = this.getBcp47(this.language);
			rec.maxAlternatives = 1;

			rec.onresult = (event: any) => {
				if (!this.isRunning || this.isMuted) return;

				let interim = '';
				for (let i = event.resultIndex; i < event.results.length; i++) {
					const res = event.results[i];
					const transcript = (res[0]?.transcript || '').trim();
					if (res.isFinal) {
						this.accumulatedText = transcript;
					} else {
						interim = transcript;
					}
				}

				const candidate = this.accumulatedText || interim;
				if (candidate && candidate.length > 1) {
					if (this.silenceTimer) clearTimeout(this.silenceTimer);
					this.silenceTimer = setTimeout(() => {
						if (this.isRunning && !this.isMuted && candidate) {
							this.sendRecognizedSpeech(candidate);
							this.accumulatedText = '';
						}
					}, 750);
				}
			};

			rec.onerror = (event: any) => {
				if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
					console.warn('Speech recognition permission denied:', event.error);
					this.isRunning = false;
					return;
				}
				if (this.isRunning && !this.isMuted) {
					this.scheduleRestart(SpeechRecognitionClass, 1000);
				}
			};

			rec.onend = () => {
				if (this.isRunning && !this.isMuted) {
					this.scheduleRestart(SpeechRecognitionClass, 300);
				}
			};

			rec.start();
			this.recognition = rec;
			console.log('🎙️ Browser Web Speech API active for lang:', rec.lang);
		} catch (err) {
			console.warn('Failed to start Web Speech API, falling back to VAD:', err);
			this.initAutoVAD();
		}
	}

	private scheduleRestart(SpeechRecognitionClass: any, delayMs: number) {
		if (this.restartTimer) clearTimeout(this.restartTimer);
		this.restartTimer = setTimeout(() => {
			if (this.isRunning && !this.isMuted && this.language !== 'auto') {
				this.startWebSpeech(SpeechRecognitionClass);
			}
		}, delayMs);
	}

	private async sendRecognizedSpeech(text: string) {
		const clean = text.trim();
		if (!clean) return;

		const now = Date.now();
		if (clean.toLowerCase() === this.lastSentText.toLowerCase() && now - this.lastSentTime < 2000) {
			return;
		}

		this.lastSentText = clean;
		this.lastSentTime = now;

		let detectedLang = this.language;
		if (/[\u0400-\u04FF]/.test(clean)) {
			detectedLang = 'ru';
		} else if (/[\u0900-\u097F]/.test(clean)) {
			detectedLang = 'hi';
		} else if (/[\u0600-\u06FF]/.test(clean)) {
			detectedLang = 'ar';
		} else if (/[\u4E00-\u9FFF]/.test(clean)) {
			detectedLang = 'zh';
		} else if (/[\u3040-\u30FF]/.test(clean)) {
			detectedLang = 'ja';
		} else if (/[\uAC00-\uD7AF]/.test(clean)) {
			detectedLang = 'ko';
		}

		try {
			await api.post('/calls/speech-translate', {
				call_room_id: this.callRoomId,
				text: clean,
				language: detectedLang
			});
		} catch (err) {
			console.warn('Failed to translate call speech:', err);
		}
	}

	// =========================================================================
	// 🔊 CONTROLS & SYNTHESIZED SPEECH PLAYBACK
	// =========================================================================

	setMuted(muted: boolean) {
		this.isMuted = muted;
		if (this.silenceTimer) {
			clearTimeout(this.silenceTimer);
			this.silenceTimer = null;
		}
		if (muted) {
			if (this.recognition) {
				try {
					this.recognition.abort();
				} catch {}
			}
			if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
				this.mediaRecorder.onstop = null;
				try {
					this.mediaRecorder.stop();
				} catch {}
			}
			this.isRecording = false;
			this.audioChunks = [];
		} else if (this.isRunning) {
			if (this.language === 'auto') {
				this.initAutoVAD();
			} else {
				const SpeechRecognition =
					(window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
				if (SpeechRecognition) {
					this.startWebSpeech(SpeechRecognition);
				} else {
					this.initAutoVAD();
				}
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
			try {
				this.recognition.abort();
			} catch {}
			this.recognition = null;
		}
		this.stopAudioVAD();
		this.audioChunks = [];
		this.lastSentText = '';
		this.accumulatedText = '';
		this.activeStream = null;
	}

	// Play spoken translated speech: attempts server-side neural TTS first, then browser speech synthesis
	speak(text: string, language: string, audioUrl?: string) {
		if (typeof window === 'undefined' || !text) return;

		// 1. Try authenticated server-side neural TTS. Fetching the bytes explicitly
		// lets us keep the JWT in an Authorization header instead of leaking it in
		// an audio URL/query string.
		if (audioUrl) {
			this.playServerTTS(text, language, audioUrl);
			return;
		}

		// 2. Fallback to browser SpeechSynthesis
		this.speakBrowser(text, language);
	}

	private async playServerTTS(text: string, language: string, audioUrl: string) {
		try {
			const base = API_BASE.replace(/\/api\/?$/, '');
			const fullUrl = audioUrl.startsWith('http')
				? audioUrl
				: `${base}${audioUrl.startsWith('/') ? '' : '/'}${audioUrl}`;
			const token = localStorage.getItem('vaani_token');
			const response = await fetch(fullUrl, {
				headers: token ? { Authorization: `Bearer ${token}` } : {}
			});
			if (!response.ok) throw new Error(`TTS request failed: ${response.status}`);

			const objectUrl = URL.createObjectURL(await response.blob());
			const audio = new Audio(objectUrl);
			audio.volume = 1.0;
			audio.onended = () => URL.revokeObjectURL(objectUrl);
			await audio.play();
		} catch (err) {
			console.warn('Server TTS unavailable, using speech synthesis fallback:', err);
			this.speakBrowser(text, language);
		}
	}

	private speakBrowser(text: string, language: string) {
		if (typeof window === 'undefined' || !window.speechSynthesis || !text) return;

		try {
			window.speechSynthesis.cancel();
			const utterance = new SpeechSynthesisUtterance(text);
			const bcp47 = this.getBcp47(language);
			utterance.lang = bcp47;
			utterance.rate = 1.05;
			utterance.pitch = 1.0;

			const voices = window.speechSynthesis.getVoices();
			if (voices && voices.length > 0) {
				const langPrefix = language.toLowerCase();
				const voice =
					voices.find((v) => v.lang === bcp47) ||
					voices.find((v) => v.lang.toLowerCase().startsWith(langPrefix));
				if (voice) {
					utterance.voice = voice;
				}
			}

			window.speechSynthesis.speak(utterance);
		} catch (err) {
			console.warn('Browser speech synthesis error:', err);
		}
	}
}

export const callSpeechService = new CallSpeechService();
