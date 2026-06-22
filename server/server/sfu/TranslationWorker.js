/**
 * TranslationWorker
 * Server-side LiveKit virtual participant that injects TTS audio as a media track.
 *
 * One TranslationWorker per active callRoomId.
 * Within each worker: one Room connection per target language.
 * Each virtual participant (identity: vaani-translator-{lang}) publishes
 * one LocalAudioTrack that carries the translated speech for that language.
 *
 * Clients subscribe to the track matching their preferredLanguage.
 * Audio never touches Socket.IO — it flows entirely through LiveKit's media path.
 *
 * Falls back gracefully when @livekit/rtc-node binary is unavailable.
 */

const { config } = require('../utils/env');

// Lazy-require so the server starts even if the native binary fails
let rtcNode = null;
let rtcNodeAvailable = false;

try {
  rtcNode = require('@livekit/rtc-node');
  rtcNodeAvailable = true;
  console.log('[TranslationWorker] @livekit/rtc-node loaded — LiveKit track injection enabled');
} catch (err) {
  console.warn('[TranslationWorker] @livekit/rtc-node unavailable:', err.message);
  console.warn('[TranslationWorker] Falling back to Socket.IO audio delivery');
}

// PCM constants — must match Azure TTS Raw16Khz16BitMonoPcm output
const SAMPLE_RATE = 16000;
const NUM_CHANNELS = 1;
const SAMPLES_PER_FRAME = 480; // 30ms at 16kHz — standard WebRTC frame
const BYTES_PER_FRAME = SAMPLES_PER_FRAME * 2; // Int16 = 2 bytes
const DEFAULT_MAX_QUEUE_BYTES = SAMPLE_RATE * NUM_CHANNELS * 2 * 2; // 2s of 16kHz mono PCM
const MAX_QUEUE_BYTES = parseInt(
  process.env.TRANSLATION_WORKER_MAX_QUEUE_BYTES || String(DEFAULT_MAX_QUEUE_BYTES),
  10
);
const DROP_LOG_INTERVAL_MS = 5000;

/**
 * LanguageTrackContext
 * Owns the AudioSource + LocalAudioTrack for one target language.
 * Queues PCM buffers and drains them frame-by-frame to avoid concurrent captureFrame() calls.
 */
class LanguageTrackContext {
  constructor(lang, source) {
    this.lang = lang;
    this.source = source;
    this._queue = [];
    this._queueBytes = 0;
    this._draining = false;
    this._droppedBytes = 0;
    this._lastDropLogAt = 0;
  }

  enqueue(pcmBuffer) {
    const buffer = this._fitQueueBudget(pcmBuffer);
    if (!buffer || buffer.length === 0) return;

    this._queue.push(buffer);
    this._queueBytes += buffer.length;
    if (!this._draining) this._drain();
  }

  async _drain() {
    this._draining = true;
    while (this._queue.length > 0) {
      const buf = this._queue.shift();
      this._queueBytes = Math.max(0, this._queueBytes - buf.length);
      await this._injectBuffer(buf);
    }
    this._draining = false;
  }

  _fitQueueBudget(pcmBuffer) {
    if (!Buffer.isBuffer(pcmBuffer) || pcmBuffer.length === 0) return null;
    if (!Number.isFinite(MAX_QUEUE_BYTES) || MAX_QUEUE_BYTES <= 0) return pcmBuffer;

    let buffer = pcmBuffer;
    if (buffer.length > MAX_QUEUE_BYTES) {
      this._recordDrop(buffer.length - MAX_QUEUE_BYTES);
      buffer = buffer.subarray(buffer.length - MAX_QUEUE_BYTES);
    }

    while (this._queue.length > 0 && this._queueBytes + buffer.length > MAX_QUEUE_BYTES) {
      const dropped = this._queue.shift();
      this._queueBytes = Math.max(0, this._queueBytes - dropped.length);
      this._recordDrop(dropped.length);
    }

    return buffer;
  }

  _recordDrop(byteCount) {
    this._droppedBytes += byteCount;
    const now = Date.now();
    if (now - this._lastDropLogAt < DROP_LOG_INTERVAL_MS) return;
    this._lastDropLogAt = now;
    console.warn(
      `[LanguageTrackContext:${this.lang}] Dropped stale translation PCM (${this._droppedBytes} bytes total) to keep latency bounded`
    );
  }

  async _injectBuffer(pcmBuffer) {
    const { AudioFrame } = rtcNode;
    let offset = 0;

    while (offset < pcmBuffer.length) {
      const end = Math.min(offset + BYTES_PER_FRAME, pcmBuffer.length);
      let slice = pcmBuffer.slice(offset, end);
      offset = end;

      // Pad last frame to full size so captureFrame never gets a short frame
      if (slice.length < BYTES_PER_FRAME) {
        const padded = Buffer.alloc(BYTES_PER_FRAME, 0);
        slice.copy(padded);
        slice = padded;
      }

      const int16 = new Int16Array(slice.buffer, slice.byteOffset, SAMPLES_PER_FRAME);
      const frame = new AudioFrame(int16, SAMPLE_RATE, NUM_CHANNELS, SAMPLES_PER_FRAME);

      try {
        await this.source.captureFrame(frame);
      } catch (err) {
        // captureFrame can fail if the room disconnected mid-stream — don't crash
        console.warn(`[LanguageTrackContext:${this.lang}] captureFrame failed:`, err.message);
      }
    }
  }
}

/**
 * TranslationWorker
 * Manages N Room connections for a single callRoomId, one per target language.
 * Each Room hosts one virtual participant that publishes one audio track.
 */
class TranslationWorker {
  constructor(callRoomId) {
    this.callRoomId = callRoomId;
    this._langContexts = new Map(); // lang → { room, ctx: LanguageTrackContext }
    this._destroyed = false;
  }

  get isAvailable() {
    return rtcNodeAvailable;
  }

  /**
   * Ensure the virtual participant for `lang` exists and its track is published.
   * Idempotent — safe to call multiple times.
   */
  async ensureLanguageTrack(lang) {
    if (!rtcNodeAvailable || this._destroyed) return;
    if (this._langContexts.has(lang)) return;

    const { Room, AudioSource, LocalAudioTrack, TrackPublishOptions, TrackSource } = rtcNode;
    const { AccessToken } = require('livekit-server-sdk');

    const identity = `vaani-translator-${lang}`;

    // Token with publish-only permissions (no subscription needed)
    const at = new AccessToken(config.LIVEKIT_API_KEY, config.LIVEKIT_API_SECRET, {
      identity,
      name: `Vaani Translator (${lang.toUpperCase()})`,
      ttl: '6h',
    });
    at.addGrant({
      roomJoin: true,
      room: this.callRoomId,
      canPublish: true,
      canSubscribe: false,
      canPublishData: false,
    });
    const token = await at.toJwt();

    // AudioSource drives the track with PCM frames
    const source = new AudioSource(SAMPLE_RATE, NUM_CHANNELS);
    const track = LocalAudioTrack.createAudioTrack(`translation-${lang}`, source);

    const room = new Room();

    // Connect as virtual participant (autoSubscribe: false — we only publish)
    await room.connect(config.LIVEKIT_URL, token, { autoSubscribe: false });

    // Set participant metadata so clients can identify translation tracks
    await room.localParticipant.setAttributes({
      type: 'translation',
      language: lang,
      roomId: this.callRoomId,
    });

    // Publish the audio track
    const publishOpts = new TrackPublishOptions();
    publishOpts.source = TrackSource.SOURCE_MICROPHONE; // closest semantic match
    await room.localParticipant.publishTrack(track, publishOpts);

    const ctx = new LanguageTrackContext(lang, source);
    this._langContexts.set(lang, { room, ctx });

    console.log(`[TranslationWorker] ${identity} published track in room ${this.callRoomId}`);
  }

  /**
   * Push raw PCM bytes for a language into the LiveKit track.
   * Auto-creates the virtual participant if this is the first utterance.
   *
   * @param {string} lang      - e.g. 'hi', 'fr'
   * @param {Buffer} pcmBuffer - 16-bit LE signed PCM at 16kHz mono (no WAV header)
   */
  async pushPcm(lang, pcmBuffer) {
    if (!rtcNodeAvailable || this._destroyed) return;
    if (!this._langContexts.has(lang)) {
      await this.ensureLanguageTrack(lang);
    }
    const entry = this._langContexts.get(lang);
    if (entry) entry.ctx.enqueue(pcmBuffer);
  }

  /**
   * Push silence to keep the track alive between utterances.
   * LiveKit may suspend very quiet tracks.
   */
  async pushSilence(lang, durationMs = 100) {
    const samples = Math.floor(SAMPLE_RATE * (durationMs / 1000));
    await this.pushPcm(lang, Buffer.alloc(samples * 2, 0));
  }

  getActiveLanguages() {
    return Array.from(this._langContexts.keys());
  }

  async destroy() {
    if (this._destroyed) return;
    this._destroyed = true;
    for (const [lang, { room }] of this._langContexts) {
      try {
        await room.disconnect();
        console.log(`[TranslationWorker] Disconnected vaani-translator-${lang} from ${this.callRoomId}`);
      } catch (err) {
        console.warn(`[TranslationWorker] Disconnect failed for ${lang}:`, err.message);
      }
    }
    this._langContexts.clear();
  }
}

module.exports = { TranslationWorker, rtcNodeAvailable };
