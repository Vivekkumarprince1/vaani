/**
 * TranslationWorkerManager
 * Singleton — owns one TranslationWorker per active callRoomId.
 *
 * All server code that needs to push TTS audio into LiveKit goes through here.
 * Returns false from pushPcm() when the feature flag is off or rtc-node is
 * unavailable, so callers can fall back to Socket.IO delivery transparently.
 */

const { TranslationWorker, rtcNodeAvailable } = require('./TranslationWorker');
const { config } = require('../utils/env');

class TranslationWorkerManager {
  constructor() {
    this._workers = new Map(); // callRoomId → TranslationWorker
    this._enabled = config.USE_LIVEKIT_AUDIO_TRACKS && rtcNodeAvailable;

    if (this._enabled) {
      console.log('[TranslationWorkerManager] LiveKit audio track injection ENABLED');
    } else {
      const reason = !config.USE_LIVEKIT_AUDIO_TRACKS
        ? 'USE_LIVEKIT_AUDIO_TRACKS=false'
        : '@livekit/rtc-node unavailable';
      console.log(`[TranslationWorkerManager] Disabled (${reason}) — Socket.IO audio fallback active`);
    }
  }

  get isEnabled() {
    return this._enabled;
  }

  /**
   * Push raw PCM for a target language into the LiveKit track for that room.
   *
   * @param {string} callRoomId
   * @param {string} lang        - e.g. 'hi', 'fr'
   * @param {Buffer} pcmBuffer   - 16-bit LE PCM, 16kHz mono, no WAV header
   * @returns {Promise<boolean>} - true if pushed to LiveKit, false if fallback needed
   */
  async pushPcm(callRoomId, lang, pcmBuffer) {
    if (!this._enabled) return false;

    const worker = this._getOrCreateWorker(callRoomId);
    try {
      await worker.pushPcm(lang, pcmBuffer);
      return true;
    } catch (err) {
      console.error(`[TranslationWorkerManager] pushPcm failed (${callRoomId}/${lang}):`, err.message);
      return false;
    }
  }

  /**
   * Push silence for a language to prevent LiveKit from suspending the track
   * between utterances (e.g. when speaker pauses).
   */
  async pushSilence(callRoomId, lang, durationMs = 100) {
    if (!this._enabled) return;
    const worker = this._workers.get(callRoomId);
    if (worker) await worker.pushSilence(lang, durationMs).catch(() => {});
  }

  /**
   * Destroy the worker for a room when the call ends.
   * Called from socketHandlers.js on last participant leaving.
   */
  async destroyWorker(callRoomId) {
    const worker = this._workers.get(callRoomId);
    if (!worker) return;
    this._workers.delete(callRoomId);
    await worker.destroy().catch((err) => {
      console.warn(`[TranslationWorkerManager] destroy failed for ${callRoomId}:`, err.message);
    });
  }

  /** Destroy all workers — call on graceful server shutdown. */
  async destroyAll() {
    const ids = Array.from(this._workers.keys());
    await Promise.allSettled(ids.map((id) => this.destroyWorker(id)));
  }

  activeWorkerCount() {
    return this._workers.size;
  }

  _getOrCreateWorker(callRoomId) {
    if (!this._workers.has(callRoomId)) {
      this._workers.set(callRoomId, new TranslationWorker(callRoomId));
      console.log(`[TranslationWorkerManager] Worker created for room ${callRoomId}`);
    }
    return this._workers.get(callRoomId);
  }
}

module.exports = new TranslationWorkerManager();
