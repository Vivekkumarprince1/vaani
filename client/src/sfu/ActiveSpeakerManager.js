/**
 * ActiveSpeakerManager
 * Single responsibility: VAD + dominant speaker history tracking.
 *
 * Receives speaker updates from LiveKit and applies:
 *   - debounce to prevent rapid flicker
 *   - history to surface the most recent sustained speaker
 *   - subscriber pattern so multiple components can react
 */

const DEBOUNCE_MS = 300;
const HISTORY_SIZE = 5;

class ActiveSpeakerManager {
  constructor() {
    this._current = null;
    this._history = []; // most recent first
    this._debounceTimer = null;
    this._listeners = new Set();
  }

  /**
   * Called by useLiveKitRoom / RoomEvent.ActiveSpeakersChanged.
   * @param {import('livekit-client').Participant[]} speakers - sorted by audio level
   */
  update(speakers) {
    clearTimeout(this._debounceTimer);

    this._debounceTimer = setTimeout(() => {
      const dominant = speakers[0]?.identity ?? null;

      if (dominant !== this._current) {
        this._current = dominant;
        if (dominant) {
          this._history = [dominant, ...this._history.slice(0, HISTORY_SIZE - 1)];
        }
        this._notify();
      }
    }, DEBOUNCE_MS);
  }

  getCurrent() {
    return this._current;
  }

  getHistory() {
    return [...this._history];
  }

  subscribe(callback) {
    this._listeners.add(callback);
    return () => this._listeners.delete(callback);
  }

  destroy() {
    clearTimeout(this._debounceTimer);
    this._listeners.clear();
  }

  _notify() {
    for (const cb of this._listeners) {
      try { cb(this._current); } catch (e) { /* ignore */ }
    }
  }
}

export default ActiveSpeakerManager;
