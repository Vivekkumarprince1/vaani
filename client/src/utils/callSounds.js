// ✅ High-quality, no-copyright vintage telephone sounds
// Handles ringtone (incoming), ringback (outgoing), connect, and disconnect
// Includes generated tone fallback for browser autoplay restrictions

class CallSounds {
  constructor() {
    this.sounds = {
      ringtone: null,
      ringback: null,
      connect: null,
      disconnect: null,
      busy: null
    };
    this.initialized = false;
    this.playingSound = null;
    this.audioContext = null;
    this._loopOscillator = null;
  }

  /**
   * Initialize with vintage telephone tones
   */
  init() {
    if (this.initialized) return;
    this.initialized = true;

    // Load audio files from /public/sounds
    this.sounds.ringtone = new Audio('/sounds/vintage_ringtone.mp3');
    this.sounds.ringback = new Audio('/sounds/vintage_ringback.mp3');

    this.sounds.ringtone.loop = true;
    this.sounds.ringback.loop = true;

    this.sounds.ringtone.preload = 'auto';
    this.sounds.ringback.preload = 'auto';

    this.sounds.ringtone.volume = 0.8;
    this.sounds.ringback.volume = 0.7;

    console.log('✓ Call sounds initialized (vintage tones ready)');
  }

  /**
   * Ensure audio context for generated fallback tones
   */
  async ensureAudioContext() {
    try {
      if (!this.audioContext) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (AC) this.audioContext = new AC();
      }
      if (this.audioContext?.state === 'suspended') {
        await this.audioContext.resume().catch(() => {});
      }
      return this.audioContext;
    } catch (err) {
      return null;
    }
  }

  /**
   * Play safely, respecting browser policies
   */
  async safePlay(audioElement, soundName) {
    if (!audioElement) {
      console.warn(`⚠️ ${soundName} not initialized`);
      return false;
    }

    try {
      if (!audioElement.paused) {
        audioElement.pause();
        audioElement.currentTime = 0;
      }
      
      this.playingSound = soundName;
      await audioElement.play();
      
      // If sound was stopped while we were waiting for the play promise to resolve
      if (this.playingSound !== soundName) return 'aborted';
      
      console.log(`✓ Playing ${soundName}`);
      return true;
    } catch (err) {
      // Return 'aborted' instead of false so we don't accidentally trigger the fallback beep
      if (err.name === 'AbortError') return 'aborted';

      if (err.name !== 'NotAllowedError') {
        console.warn(`⚠️ Could not play ${soundName}:`, err.message);
      }
      return false;
    }
  }

  /**
   * 📞 Play incoming call ringtone
   */
  async playRingtone() {
    this.init();
    this.stopAll();

    this.playingSound = 'ringtone';
    const ok = await this.safePlay(this.sounds.ringtone, 'ringtone');
    
    // Only start fallback loop if ok is strictly false (NotAllowedError), ignoring 'aborted'
    if (ok === false && this.playingSound === 'ringtone') {
      await this.ensureAudioContext();
      // Check state again after async gap to prevent ghost loops
      if (this.playingSound === 'ringtone') {
        this._startGeneratedLoop(420, 'ringtone');
      }
    }
  }

  /**
   * 📤 Play outgoing call ringback tone
   */
  async playRingback() {
    this.init();
    this.stopAll();

    // Set intended sound before awaiting
    this.playingSound = 'ringback';
    const ok = await this.safePlay(this.sounds.ringback, 'ringback');
    
    // Only start fallback if we are STILL supposed to be playing ringback
    // Only start fallback loop if ok is strictly false, ignoring 'aborted'
    if (ok === false && this.playingSound === 'ringback') {
      await this.ensureAudioContext();
      // Check state again after async gap to prevent ghost loops
      if (this.playingSound === 'ringback') {
        this._startGeneratedLoop(620, 'ringback');
      }
    }
  }

  /**
   * 🔔 Play connect tone
   */
  async playConnect() {
    this.init();
    this.stopAll();

    const ac = await this.ensureAudioContext();
    if (ac) {
      await this._playGeneratedBeep(880, 0.12, 0.6);
      this.playingSound = 'connect';
      console.log('✓ Playing connect beep');
    }
  }

  /**
   * ❌ Play disconnect tone
   */
  async playDisconnect() {
    this.init();
    const ac = await this.ensureAudioContext();
    if (ac) {
      await this._playGeneratedBeep(440, 0.18, 0.8);
      console.log('✓ Playing disconnect beep');
    }
  }

  /**
   * ⏳ Play busy tone (pulsed)
   * 🔄 Generated loop fallback for ringtone/ringback
   */
  async playBusyTone() {
    this.init();
    this.stopAll();

    this.playingSound = 'busy';
    // Use generated tone for busy signal (standard 480Hz+620Hz or simple 440Hz pulsed)
    await this.ensureAudioContext();
    // Prevent forever beeping if the call is ended before the context resolves
    if (this.playingSound === 'busy') {
      this._startGeneratedLoop(440, 'busy', { interval: 500, pulseDuration: 450 });
      console.log('✓ Playing busy tone');
    }
  }

  /**
   * 🔄 Generated loop fallback for ringtone/ringback/busy
   */
  _startGeneratedLoop(freq, name, options = {}) {
    if (!this.audioContext) return;
    this._stopGeneratedLoop(); // Prevent orphaned oscillator loops and memory leaks

    const interval = options.interval || 400;
    const pulseDuration = options.pulseDuration || 80;

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

      // Pulsing pattern
      const pulse = () => {
        const t = ac.currentTime;
        gain.gain.cancelScheduledValues(t);
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.linearRampToValueAtTime(0.7, t + 0.02);
        gain.gain.linearRampToValueAtTime(0.0001, t + (pulseDuration / 1000));
        gain.gain.linearRampToValueAtTime(0.0001, t + 0.08);
      };

      pulse();
      const timer = setInterval(pulse, interval);

      this._loopOscillator = { osc, gain, timer };
      this.playingSound = name;
      console.log(`✓ Started generated ${name}`);
    } catch (err) {
      console.warn('⚠️ Failed to start generated loop:', err.message);
    }
  }

  /**
   * ⏹ Stop generated loop
   */
  _stopGeneratedLoop() {
    if (this._loopOscillator) {
      const { osc, gain, timer } = this._loopOscillator;
      clearInterval(timer);
      try {
        osc.stop();
        gain.disconnect();
      } catch (e) {}
      this._loopOscillator = null;
    }
  }

  /**
   * 🔊 Play short generated beep
   */
  async _playGeneratedBeep(freq, duration, volume) {
    const ac = await this.ensureAudioContext();
    if (!ac) return;

    return new Promise((resolve) => {
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
        } catch (e) {}
        resolve();
      }, duration * 1000);
    });
  }

  /**
   * 🛑 Stop all sounds
   */
  stopAll() {
    if (this.sounds.ringtone && !this.sounds.ringtone.paused) {
      this.sounds.ringtone.pause();
      this.sounds.ringtone.currentTime = 0;
    }
    if (this.sounds.ringback && !this.sounds.ringback.paused) {
      this.sounds.ringback.pause();
      this.sounds.ringback.currentTime = 0;
    }
    this._stopGeneratedLoop();
    this.playingSound = null;
  }

  stopRingtone() {
    if (this.sounds.ringtone && !this.sounds.ringtone.paused) {
      this.sounds.ringtone.pause();
      this.sounds.ringtone.currentTime = 0;
    }
    if (this.playingSound === 'ringtone') this._stopGeneratedLoop();
    if (this.playingSound === 'ringtone') this.playingSound = null;
  }

  stopRingback() {
    if (this.sounds.ringback && !this.sounds.ringback.paused) {
      this.sounds.ringback.pause();
      this.sounds.ringback.currentTime = 0;
    }
    if (this.playingSound === 'ringback') this._stopGeneratedLoop();
    if (this.playingSound === 'ringback') this.playingSound = null;
  }

  stopBusyTone() {
    if (this.playingSound === 'busy') this._stopGeneratedLoop();
    if (this.playingSound === 'busy') this.playingSound = null;
  }

  getCurrentSound() {
    return this.playingSound;
  }

  /**
   * 🔓 Unlock audio for autoplay restrictions
   */
  async unlockAudio() {
    const ac = await this.ensureAudioContext();
    if (ac) {
      try {
        await this._playGeneratedBeep(440, 0.01, 0.001);
        console.log('✓ Audio unlocked');
        return true;
      } catch (err) {
        return false;
      }
    }
    return false;
  }

  async ensurePlaybackAllowed() {
    try {
      const unlocked = await this.unlockAudio();
      if (unlocked) return true;

      const ac = await this.ensureAudioContext();
      if (ac) {
        if (ac.state === 'suspended') {
          try {
            await ac.resume();
            return true;
          } catch (e) {}
        } else {
          return true;
        }
      }

      throw new Error('Playback not allowed');
    } catch (err) {
      return Promise.reject(err);
    }
  }

  enableUserInteraction() {
    this.unlockAudio().catch(() => {});
  }
}

// ✅ Export as singleton
const callSounds = new CallSounds();
export default callSounds;
