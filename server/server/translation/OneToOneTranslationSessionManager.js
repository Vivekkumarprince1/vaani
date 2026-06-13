const sdk = require('microsoft-cognitiveservices-speech-sdk');

const PCM_CHUNK_MAX_BYTES = 64 * 1024;
const DEFAULT_MAX_STREAM_BYTES_PER_SECOND = parseInt(
  process.env.TRANSLATION_STREAM_MAX_BYTES_PER_SECOND || String(64 * 1024),
  10
);
const DEFAULT_IDLE_TIMEOUT_MS = parseInt(
  process.env.TRANSLATION_STREAM_IDLE_TIMEOUT_MS || String(60 * 1000),
  10
);
const DEFAULT_BACKPRESSURE_STATUS_INTERVAL_MS = 5 * 1000;

class OneToOneTranslationSessionManager {
  constructor(deps = {}) {
    const speechTranslation = deps.getTranslationConfig && deps.toSpeechLocale && deps.toLanguageCode
      ? null
      : require('../utils/speechTranslationSDK');
    this.sdk = deps.sdk || sdk;
    this.getTranslationConfig = deps.getTranslationConfig || speechTranslation.getTranslationConfig;
    this.toSpeechLocale = deps.toSpeechLocale || speechTranslation.toSpeechLocale;
    this.toLanguageCode = deps.toLanguageCode || speechTranslation.toLanguageCode;
    this.getCachedOrSynthesize = deps.getCachedOrSynthesize || ((text, lang) => require('./SharedTranslationCache').getOrSynthesize(text, lang));
    this.now = deps.now || (() => Date.now());
    this.maxStreamBytesPerSecond = Number.isFinite(deps.maxStreamBytesPerSecond)
      ? deps.maxStreamBytesPerSecond
      : DEFAULT_MAX_STREAM_BYTES_PER_SECOND;
    this.idleTimeoutMs = Number.isFinite(deps.idleTimeoutMs)
      ? deps.idleTimeoutMs
      : DEFAULT_IDLE_TIMEOUT_MS;
    this.idleCheckIntervalMs = Number.isFinite(deps.idleCheckIntervalMs)
      ? deps.idleCheckIntervalMs
      : Math.min(15 * 1000, Math.max(1000, Math.floor(this.idleTimeoutMs / 2)));
    this.backpressureStatusIntervalMs = Number.isFinite(deps.backpressureStatusIntervalMs)
      ? deps.backpressureStatusIntervalMs
      : DEFAULT_BACKPRESSURE_STATUS_INTERVAL_MS;
    this.sessions = new Map();
    this.socketIndex = new Map();
  }

  async startSession({ io, socket, receiverUserId, sourceLanguage, targetLanguage, requestId }) {
    if (!io || !socket || !receiverUserId) {
      throw new Error('io, socket, and receiverUserId are required');
    }

    const key = this._key(socket.id, receiverUserId);
    await this.stopSession(key, 'replaced');

    const sourceLocale = this.toSpeechLocale(sourceLanguage || 'en');
    const targetCode = this.toLanguageCode(targetLanguage || 'en');
    const streamId = requestId || `stream_${this.now()}`;

    this._emitStatus(socket, 'connecting', {
      requestId: streamId,
      targetLanguage: targetCode,
    });

    const translationConfig = this.getTranslationConfig(sourceLocale, [targetCode]);
    const audioFormat = this.sdk.AudioStreamFormat.getWaveFormatPCM(16000, 16, 1);
    const pushStream = this.sdk.AudioInputStream.createPushStream(audioFormat);
    const audioConfig = this.sdk.AudioConfig.fromStreamInput(pushStream);
    const recognizer = new this.sdk.TranslationRecognizer(translationConfig, audioConfig);

    const session = {
      key,
      io,
      socket,
      socketId: socket.id,
      receiverUserId,
      sourceLanguage: sourceLocale,
      targetLanguage: targetCode,
      requestId: streamId,
      pushStream,
      recognizer,
      startedAt: this.now(),
      active: true,
      bytesReceived: 0,
      finalCount: 0,
      lastAudioAt: this.now(),
      ingressWindowStartedAt: this.now(),
      ingressWindowBytes: 0,
      droppedChunks: 0,
      droppedBytes: 0,
      lastBackpressureStatusAt: 0,
      idleMonitor: null,
    };

    this.sessions.set(key, session);
    this.socketIndex.set(socket.id, key);
    this._startIdleMonitor(session);
    this._wireRecognizer(session);

    await new Promise((resolve, reject) => {
      recognizer.startContinuousRecognitionAsync(
        () => {
          if (!session.active) return resolve();
          this._emitStatus(socket, 'live', {
            requestId: streamId,
            targetLanguage: targetCode,
          });
          resolve();
        },
        (err) => {
          this.sessions.delete(key);
          this.socketIndex.delete(socket.id);
          this._stopIdleMonitor(session);
          this._safeClose(pushStream);
          this._safeClose(recognizer);
          this._emitError(socket, 'Failed to start translation stream', streamId, err);
          reject(err);
        }
      );
    });

    return session;
  }

  writeChunkForSocket(socketId, chunk) {
    const key = this.socketIndex.get(socketId);
    if (!key) return false;
    return this.writeChunk(key, chunk);
  }

  writeChunk(key, chunk) {
    const session = this.sessions.get(key);
    if (!session?.active || !session.pushStream) return false;

    const buffer = this._normalizeChunk(chunk);
    if (!buffer || buffer.length === 0 || buffer.length > PCM_CHUNK_MAX_BYTES) return false;

    const now = this.now();
    if (!this._reserveIngressBudget(session, buffer.length, now)) {
      return false;
    }

    try {
      session.pushStream.write(buffer);
      session.bytesReceived += buffer.length;
      session.lastAudioAt = now;
      return true;
    } catch (err) {
      this._emitError(session.socket, 'Audio stream write failed', session.requestId, err);
      this.stopSession(key, 'write_failed').catch(() => {});
      return false;
    }
  }

  async stopSessionForSocket(socketId, reason = 'stopped') {
    const key = this.socketIndex.get(socketId);
    if (!key) return;
    await this.stopSession(key, reason);
  }

  async stopSession(key, reason = 'stopped') {
    const session = this.sessions.get(key);
    if (!session) return;

    session.active = false;
    this.sessions.delete(key);
    if (this.socketIndex.get(session.socketId) === key) {
      this.socketIndex.delete(session.socketId);
    }
    this._stopIdleMonitor(session);

    this._safeClose(session.pushStream);
    await new Promise((resolve) => {
      try {
        session.recognizer.stopContinuousRecognitionAsync(
          () => {
            this._safeClose(session.recognizer);
            resolve();
          },
          () => {
            this._safeClose(session.recognizer);
            resolve();
          }
        );
      } catch {
        this._safeClose(session.recognizer);
        resolve();
      }
    });

    this._emitStatus(session.socket, 'off', {
      requestId: session.requestId,
      reason,
      bytesReceived: session.bytesReceived,
      droppedChunks: session.droppedChunks,
      droppedBytes: session.droppedBytes,
    });
  }

  activeCount() {
    return this.sessions.size;
  }

  _wireRecognizer(session) {
    const ResultReason = this.sdk.ResultReason;
    const CancellationReason = this.sdk.CancellationReason;

    session.recognizer.recognizing = (_s, e) => {
      if (!session.active || e.result?.reason !== ResultReason.TranslatingSpeech) return;
      const original = (e.result.text || '').trim();
      const translated = e.result.translations?.get(session.targetLanguage) || '';
      if (!original && !translated) return;

      const eventId = `${session.requestId}:partial:${this.now()}`;
      this._emitTranslatedSpeech(session, {
        text: { original, translated },
        audio: null,
        partial: true,
        requestId: eventId,
        targetLanguage: session.targetLanguage,
        timestamp: this.now(),
      });
    };

    session.recognizer.recognized = (_s, e) => {
      if (!session.active || e.result?.reason !== ResultReason.TranslatedSpeech) return;
      const original = (e.result.text || '').trim();
      const translated = e.result.translations?.get(session.targetLanguage) || '';
      if (!original) return;

      this._handleFinalResult(session, original, translated || original).catch((err) => {
        this._emitError(session.socket, 'Final translation handling failed', session.requestId, err);
      });
    };

    session.recognizer.canceled = (_s, e) => {
      if (!session.active) return;
      const message = e.reason === CancellationReason.Error
        ? (e.errorDetails || 'Azure Speech Service connection failed')
        : 'Translation stream canceled';
      this._emitStatus(session.socket, 'degraded', {
        requestId: session.requestId,
        reason: e.reason,
      });
      this._emitError(session.socket, message, session.requestId, e.errorDetails);
      this.stopSession(session.key, 'canceled').catch(() => {});
    };

    session.recognizer.sessionStopped = () => {
      if (!session.active) return;
      this.stopSession(session.key, 'session_stopped').catch(() => {});
    };
  }

  async _handleFinalResult(session, original, translated) {
    const segmentStartedAt = this.now();
    const eventId = `${session.requestId}:final:${++session.finalCount}:${segmentStartedAt}`;

    this._emitTranslatedSpeech(session, {
      text: { original, translated },
      audio: null,
      partial: false,
      audiocoming: true,
      requestId: eventId,
      targetLanguage: session.targetLanguage,
      timestamp: segmentStartedAt,
    });

    this._emitLatency(session, {
      requestId: eventId,
      phase: 'finalText',
      latencyMs: this.now() - segmentStartedAt,
      targetLanguage: session.targetLanguage,
    });

    let audio = null;
    const ttsStartedAt = this.now();
    try {
      audio = await this.getCachedOrSynthesize(translated, session.targetLanguage);
    } catch (err) {
      this._emitStatus(session.socket, 'degraded', {
        requestId: eventId,
        reason: 'tts_failed',
      });
      this._emitError(session.socket, 'Translated voice unavailable; captions still working', eventId, err);
    }

    if (!session.active || !audio) return;

    this._emitTranslatedSpeech(session, {
      text: null,
      audio,
      partial: false,
      audioonly: true,
      requestId: eventId,
      targetLanguage: session.targetLanguage,
      timestamp: segmentStartedAt,
      metrics: {
        tts: this.now() - ttsStartedAt,
        total: this.now() - segmentStartedAt,
      },
    });

    this._emitLatency(session, {
      requestId: eventId,
      phase: 'audioReady',
      latencyMs: this.now() - segmentStartedAt,
      ttsMs: this.now() - ttsStartedAt,
      targetLanguage: session.targetLanguage,
    });
  }

  _emitTranslatedSpeech(session, payload) {
    session.socket.emit('translatedSpeech', { ...payload, isLocal: true });
    session.io.to(`user_${session.receiverUserId}`).emit('translatedSpeech', { ...payload, isLocal: false });
  }

  _emitStatus(socket, status, extra = {}) {
    socket.emit('translationStreamStatus', {
      status,
      mode: 'one-to-one',
      timestamp: this.now(),
      ...extra,
    });
  }

  _emitError(socket, message, requestId, err) {
    socket.emit('translationStreamError', {
      message,
      requestId,
      error: err?.message || (typeof err === 'string' ? err : undefined),
    });
  }

  _emitLatency(session, metric) {
    const payload = {
      mode: 'one-to-one',
      timestamp: this.now(),
      ...metric,
    };
    session.socket.emit('translationLatencyMetric', payload);
    session.io.to(`user_${session.receiverUserId}`).emit('translationLatencyMetric', payload);
  }

  _normalizeChunk(chunk) {
    if (Buffer.isBuffer(chunk)) return chunk;
    if (chunk instanceof ArrayBuffer) return Buffer.from(chunk);
    if (ArrayBuffer.isView(chunk)) return Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength);
    return null;
  }

  _reserveIngressBudget(session, byteLength, now) {
    if (!this.maxStreamBytesPerSecond || this.maxStreamBytesPerSecond <= 0) {
      return true;
    }

    if (now - session.ingressWindowStartedAt >= 1000) {
      session.ingressWindowStartedAt = now;
      session.ingressWindowBytes = 0;
    }

    if (session.ingressWindowBytes + byteLength <= this.maxStreamBytesPerSecond) {
      session.ingressWindowBytes += byteLength;
      return true;
    }

    session.droppedChunks += 1;
    session.droppedBytes += byteLength;

    if (now - session.lastBackpressureStatusAt >= this.backpressureStatusIntervalMs) {
      session.lastBackpressureStatusAt = now;
      this._emitStatus(session.socket, 'degraded', {
        requestId: session.requestId,
        reason: 'audio_backpressure',
        droppedChunks: session.droppedChunks,
        droppedBytes: session.droppedBytes,
      });
    }

    return false;
  }

  _startIdleMonitor(session) {
    if (!this.idleTimeoutMs || this.idleTimeoutMs <= 0) return;

    session.idleMonitor = setInterval(() => {
      if (!session.active) return;
      if (this.now() - session.lastAudioAt < this.idleTimeoutMs) return;
      this.stopSession(session.key, 'idle_timeout').catch(() => {});
    }, this.idleCheckIntervalMs);

    if (typeof session.idleMonitor.unref === 'function') {
      session.idleMonitor.unref();
    }
  }

  _stopIdleMonitor(session) {
    if (!session?.idleMonitor) return;
    clearInterval(session.idleMonitor);
    session.idleMonitor = null;
  }

  _key(socketId, receiverUserId) {
    return `${socketId}:${receiverUserId}`;
  }

  _safeClose(obj) {
    try {
      obj?.close?.();
    } catch {
      // ignore cleanup failures
    }
  }
}

let singleton = null;
const getSingleton = () => {
  if (!singleton) singleton = new OneToOneTranslationSessionManager();
  return singleton;
};

const exportedManager = {
  startSession: (...args) => getSingleton().startSession(...args),
  writeChunkForSocket: (...args) => getSingleton().writeChunkForSocket(...args),
  writeChunk: (...args) => getSingleton().writeChunk(...args),
  stopSessionForSocket: (...args) => getSingleton().stopSessionForSocket(...args),
  stopSession: (...args) => getSingleton().stopSession(...args),
  activeCount: (...args) => getSingleton().activeCount(...args),
};

module.exports = exportedManager;
module.exports.OneToOneTranslationSessionManager = OneToOneTranslationSessionManager;
