// Call sounds utility for playing ringtones and notifications

class CallSounds {
  constructor() {
    this.sounds = {
      ringtone: null,
      ringback: null,
      disconnect: null
    };
    this.initialized = false;
    this.userInteracted = false;
    this.playingSound = null; // Track currently playing sound
  }

  /**
   * Initialize audio files - called lazily on first play
   */
  init() {
    if (this.initialized) return;

    try {
      // Create audio instances with preload
      this.sounds.ringtone = new Audio('/sounds/ringtone.mp3');
      this.sounds.ringback = new Audio('/sounds/ringback.mp3');
      this.sounds.disconnect = new Audio('/sounds/disconnect.mp3');

      // Set properties
      this.sounds.ringtone.loop = true;
      this.sounds.ringback.loop = true;
      this.sounds.ringtone.preload = 'auto';
      this.sounds.ringback.preload = 'auto';
      this.sounds.disconnect.preload = 'auto';

      // Add volume control (0.0 to 1.0)
      this.sounds.ringtone.volume = 0.7;
      this.sounds.ringback.volume = 0.7;
      this.sounds.disconnect.volume = 0.8;

      this.initialized = true;
      console.log('✓ Call sounds initialized');
    } catch (error) {
      console.error('Error initializing call sounds:', error);
    }
  }

  /**
   * Enable user interaction flag (call this on any user action)
   */
  enableUserInteraction() {
    this.userInteracted = true;
  }

  /**
   * Safely play an audio element with proper state checking
   */
  async safePlay(audioElement, soundName) {
    if (!audioElement) return false;

    try {
      // Reset if audio is already playing
      if (!audioElement.paused) {
        audioElement.pause();
        audioElement.currentTime = 0;
      }

      // Try to play
      const playPromise = audioElement.play();
      
      if (playPromise !== undefined) {
        await playPromise;
        this.playingSound = soundName;
        console.log(`✓ Playing ${soundName}`);
        return true;
      }
    } catch (err) {
      // Handle different error types
      if (err.name === 'NotAllowedError') {
        console.warn(`⚠️ ${soundName} blocked - user interaction required`);
      } else if (err.name === 'NotSupportedError') {
        console.warn(`⚠️ ${soundName} - audio format not supported`);
      } else {
        console.warn(`⚠️ Could not play ${soundName}:`, err.message);
      }
      return false;
    }
  }

  /**
   * Safely stop an audio element
   */
  safeStop(audioElement, soundName) {
    if (!audioElement) return;

    try {
      if (!audioElement.paused) {
        audioElement.pause();
        console.log(`✓ Stopped ${soundName}`);
      }
      audioElement.currentTime = 0;
    } catch (err) {
      console.warn(`⚠️ Error stopping ${soundName}:`, err.message);
    }
  }

  /**
   * Play ringtone (incoming call)
   */
  async playRingtone() {
    this.init();
    this.stopAll(); // Stop any other sounds first
    return await this.safePlay(this.sounds.ringtone, 'ringtone');
  }

  /**
   * Play ringback (outgoing call)
   */
  async playRingback() {
    this.init();
    this.stopAll(); // Stop any other sounds first
    return await this.safePlay(this.sounds.ringback, 'ringback');
  }

  /**
   * Play disconnect sound
   */
  async playDisconnect() {
    this.init();
    
    // Always create a fresh audio instance for disconnect sound
    // This prevents "operation not supported" errors
    try {
      const disconnectSound = new Audio('/sounds/disconnect.mp3');
      disconnectSound.volume = 0.8;
      
      const playPromise = disconnectSound.play();
      if (playPromise !== undefined) {
        await playPromise;
        console.log('✓ Playing disconnect sound');
      }
    } catch (err) {
      // Silently fail for disconnect sound to avoid console noise
      if (err.name !== 'NotAllowedError') {
        console.warn('Could not play disconnect sound');
      }
    }
  }

  /**
   * Stop ringtone
   */
  stopRingtone() {
    this.safeStop(this.sounds.ringtone, 'ringtone');
  }

  /**
   * Stop ringback
   */
  stopRingback() {
    this.safeStop(this.sounds.ringback, 'ringback');
  }

  /**
   * Stop all sounds immediately
   */
  stopAll() {
    this.stopRingtone();
    this.stopRingback();
    this.playingSound = null;
  }

  /**
   * Get current playing sound
   */
  getCurrentSound() {
    return this.playingSound;
  }
}

// Create and export a singleton instance
const callSounds = new CallSounds();
export default callSounds;