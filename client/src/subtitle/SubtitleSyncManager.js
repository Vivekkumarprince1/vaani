/**
 * SubtitleSyncManager
 * Single responsibility: receive translation events and produce timed subtitle entries.
 *
 * Listens to Socket.IO events:
 *   - groupCallOriginalText     → original speech subtitle
 *   - groupCallTranslatedText   → translated subtitle (LiveKit audio path, text-only)
 *   - groupCallTranslatedSpeech → translated subtitle (Socket.IO audio fallback path)
 *
 * Both translated event types carry the same text fields; audio payloads are ignored.
 * Each subtitle has a TTL and is removed automatically.
 * Consumers subscribe via SubtitleSyncManager.subscribe().
 */

const DEFAULT_TTL_MS = 4000;

class SubtitleSyncManager {
  constructor({ ttlMs = DEFAULT_TTL_MS } = {}) {
    this._ttlMs = ttlMs;
    this._subtitles = []; // [{ id, speakerId, speakerName, original, translated, lang, expiresAt }]
    this._listeners = new Set();
    this._timers = new Map(); // id → setTimeout handle
    this._socket = null;
    this._boundHandlers = {};
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  attach(socket) {
    this._socket = socket;

    this._boundHandlers.originalText = ({ text, speakerId, speakerName, requestId }) => {
      this._upsert({ id: requestId || `${speakerId}-${Date.now()}`, speakerId, speakerName, original: text, translated: null, lang: null });
    };

    // Handles both LiveKit path (groupCallTranslatedText) and fallback path (groupCallTranslatedSpeech).
    // Audio field on the fallback event is intentionally ignored here — subtitles only.
    this._boundHandlers.translatedEvent = ({ originalText, translatedText, speakerId, speakerName, targetLanguage, requestId }) => {
      this._upsert({
        id: requestId || `${speakerId}-${Date.now()}`,
        speakerId,
        speakerName,
        original: originalText,
        translated: translatedText,
        lang: targetLanguage,
      });
    };

    socket.on('groupCallOriginalText', this._boundHandlers.originalText);
    socket.on('groupCallTranslatedText', this._boundHandlers.translatedEvent);
    socket.on('groupCallTranslatedSpeech', this._boundHandlers.translatedEvent);

    return this;
  }

  detach() {
    if (this._socket) {
      this._socket.off('groupCallOriginalText', this._boundHandlers.originalText);
      this._socket.off('groupCallTranslatedText', this._boundHandlers.translatedEvent);
      this._socket.off('groupCallTranslatedSpeech', this._boundHandlers.translatedEvent);
      this._socket = null;
    }
    this._timers.forEach((t) => clearTimeout(t));
    this._timers.clear();
    this._subtitles = [];
    this._notify();
  }

  // ── Subscription ──────────────────────────────────────────────────────────

  subscribe(callback) {
    this._listeners.add(callback);
    callback([...this._subtitles]);
    return () => this._listeners.delete(callback);
  }

  getSubtitles() {
    return [...this._subtitles];
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  _upsert({ id, speakerId, speakerName, original, translated, lang }) {
    const existing = this._subtitles.find((s) => s.id === id);
    if (existing) {
      if (translated) { existing.translated = translated; existing.lang = lang; }
      existing.expiresAt = Date.now() + this._ttlMs;
      this._resetTimer(id);
    } else {
      const entry = { id, speakerId, speakerName, original, translated, lang, expiresAt: Date.now() + this._ttlMs };
      this._subtitles.push(entry);
      this._scheduleExpiry(id);
    }
    this._notify();
  }

  _scheduleExpiry(id) {
    const t = setTimeout(() => {
      this._subtitles = this._subtitles.filter((s) => s.id !== id);
      this._timers.delete(id);
      this._notify();
    }, this._ttlMs);
    this._timers.set(id, t);
  }

  _resetTimer(id) {
    const existing = this._timers.get(id);
    if (existing) clearTimeout(existing);
    this._scheduleExpiry(id);
  }

  _notify() {
    const snapshot = [...this._subtitles];
    this._listeners.forEach((cb) => { try { cb(snapshot); } catch (e) {} });
  }
}

export default SubtitleSyncManager;
