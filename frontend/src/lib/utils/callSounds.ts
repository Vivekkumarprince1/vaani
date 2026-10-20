// High-quality telephone sounds: ringtone (incoming), callertune/ringback (outgoing), connect, and disconnect
// Includes generated Web Audio API oscillator fallback if audio files or autoplay are blocked

class CallSounds {
	private sounds: {
		ringtone: HTMLAudioElement | null;
		ringback: HTMLAudioElement | null;
	} = {
		ringtone: null,
		ringback: null
	};

	private initialized = false;
	private playingSound: string | null = null;
	private audioContext: AudioContext | null = null;
	private loopOscillator: { osc: OscillatorNode; gain: GainNode; timer: any } | null = null;

	init() {
		if (this.initialized || typeof window === 'undefined') return;
		this.initialized = true;

		try {
			this.sounds.ringtone = new Audio('/sounds/vintage_ringtone.mp3');
			this.sounds.ringback = new Audio('/sounds/vintage_ringback.mp3');

			this.sounds.ringtone.loop = true;
			this.sounds.ringback.loop = true;

			this.sounds.ringtone.preload = 'auto';
			this.sounds.ringback.preload = 'auto';

			this.sounds.ringtone.volume = 0.85;
			this.sounds.ringback.volume = 0.7;
		} catch (err) {
			console.warn('Call sounds audio element initialization notice:', err);
		}
	}

	private async ensureAudioContext(): Promise<AudioContext | null> {
		if (typeof window === 'undefined') return null;
		try {
			if (!this.audioContext) {
				const AC = window.AudioContext || (window as any).webkitAudioContext;
				if (AC) this.audioContext = new AC();
			}
			if (this.audioContext?.state === 'suspended') {
				await this.audioContext.resume().catch(() => {});
			}
			return this.audioContext;
		} catch {
			return null;
		}
	}

	private async safePlay(audioElement: HTMLAudioElement | null, soundName: string): Promise<boolean | 'aborted'> {
		if (!audioElement) return false;

		try {
			if (!audioElement.paused) {
				audioElement.pause();
				audioElement.currentTime = 0;
			}

			this.playingSound = soundName;
			await audioElement.play();

			if (this.playingSound !== soundName) return 'aborted';
			return true;
		} catch (err: any) {
			if (err.name === 'AbortError') return 'aborted';
			return false;
		}
	}

	// 📞 Incoming Ringtone
	async playRingtone() {
		this.init();
		this.stopAll();

		this.playingSound = 'ringtone';
		const ok = await this.safePlay(this.sounds.ringtone, 'ringtone');

		if (ok === false && this.playingSound === 'ringtone') {
			await this.ensureAudioContext();
			if (this.playingSound === 'ringtone') {
				this.startGeneratedLoop(440, 'ringtone', { interval: 2500, pulseDuration: 1200 });
			}
		}
	}

	// 📤 Outgoing Callertune (Ringback tone)
	async playRingback() {
		this.init();
		this.stopAll();

		this.playingSound = 'ringback';
		const ok = await this.safePlay(this.sounds.ringback, 'ringback');

		if (ok === false && this.playingSound === 'ringback') {
			await this.ensureAudioContext();
			if (this.playingSound === 'ringback') {
				this.startGeneratedLoop(425, 'ringback', { interval: 3000, pulseDuration: 1000 });
			}
		}
	}

	// 🔔 Call Connected Beep
	async playConnect() {
		this.stopAll();
		await this.playGeneratedBeep(880, 0.15, 0.5);
	}

	// ❌ Call Disconnected Tone
	async playDisconnect() {
		this.stopAll();
		await this.playGeneratedBeep(440, 0.25, 0.6);
	}

	private startGeneratedLoop(freq: number, name: string, options: { interval?: number; pulseDuration?: number } = {}) {
		if (!this.audioContext) return;
		this.stopGeneratedLoop();

		const interval = options.interval || 3000;
		const pulseDuration = options.pulseDuration || 1000;

		try {
			const ac = this.audioContext;
			const osc = ac.createOscillator();
			const gain = ac.createGain();

			osc.type = 'sine';
			osc.frequency.value = freq;
			gain.gain.value = 0.0001;

			osc.connect(gain);
			gain.connect(ac.destination);
			osc.start();

			const pulse = () => {
				const t = ac.currentTime;
				gain.gain.cancelScheduledValues(t);
				gain.gain.setValueAtTime(0.0001, t);
				gain.gain.linearRampToValueAtTime(0.5, t + 0.04);
				gain.gain.linearRampToValueAtTime(0.0001, t + pulseDuration / 1000);
			};

			pulse();
			const timer = setInterval(pulse, interval);

			this.loopOscillator = { osc, gain, timer };
			this.playingSound = name;
		} catch (err: any) {
			console.warn('Failed to start oscillator loop:', err);
		}
	}

	private stopGeneratedLoop() {
		if (this.loopOscillator) {
			const { osc, gain, timer } = this.loopOscillator;
			clearInterval(timer);
			try {
				osc.stop();
				osc.disconnect();
				gain.disconnect();
			} catch {}
			this.loopOscillator = null;
		}
	}

	private async playGeneratedBeep(freq: number, duration: number, volume: number): Promise<void> {
		const ac = await this.ensureAudioContext();
		if (!ac) return;

		return new Promise((resolve) => {
			try {
				const osc = ac.createOscillator();
				const gain = ac.createGain();

				osc.type = 'sine';
				osc.frequency.value = freq;
				gain.gain.value = volume;

				osc.connect(gain);
				gain.connect(ac.destination);
				osc.start();

				setTimeout(() => {
					try {
						osc.stop();
						osc.disconnect();
						gain.disconnect();
					} catch {}
					resolve();
				}, duration * 1000);
			} catch {
				resolve();
			}
		});
	}

	stopAll() {
		if (this.sounds.ringtone && !this.sounds.ringtone.paused) {
			this.sounds.ringtone.pause();
			this.sounds.ringtone.currentTime = 0;
		}
		if (this.sounds.ringback && !this.sounds.ringback.paused) {
			this.sounds.ringback.pause();
			this.sounds.ringback.currentTime = 0;
		}
		this.stopGeneratedLoop();
		this.playingSound = null;
	}
}

export const callSounds = new CallSounds();
