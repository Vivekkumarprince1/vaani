const { OneToOneTranslationSessionManager } = require('../OneToOneTranslationSessionManager');

function createFakeSdk() {
  const recognizers = [];
  const pushStreams = [];

  class TranslationRecognizer {
    constructor() {
      this.closed = false;
      this.stopped = false;
      recognizers.push(this);
    }

    startContinuousRecognitionAsync(onSuccess) {
      onSuccess();
    }

    stopContinuousRecognitionAsync(onSuccess) {
      this.stopped = true;
      onSuccess();
    }

    close() {
      this.closed = true;
    }
  }

  const sdk = {
    ResultReason: {
      TranslatingSpeech: 'TranslatingSpeech',
      TranslatedSpeech: 'TranslatedSpeech',
    },
    CancellationReason: {
      Error: 'Error',
    },
    AudioStreamFormat: {
      getWaveFormatPCM: jest.fn(() => ({ sampleRate: 16000 })),
    },
    AudioInputStream: {
      createPushStream: jest.fn(() => {
        const stream = {
          writes: [],
          closed: false,
          write(chunk) { this.writes.push(Buffer.from(chunk)); },
          close() { this.closed = true; },
        };
        pushStreams.push(stream);
        return stream;
      }),
    },
    AudioConfig: {
      fromStreamInput: jest.fn(() => ({})),
    },
    TranslationRecognizer,
  };

  return { sdk, recognizers, pushStreams };
}

function createSocket(id = 'socket-1') {
  return {
    id,
    emitted: [],
    emit(event, payload) {
      this.emitted.push({ event, payload });
    },
  };
}

function createIo() {
  const emitted = [];
  return {
    emitted,
    to(room) {
      return {
        emit(event, payload) {
          emitted.push({ room, event, payload });
        },
      };
    },
  };
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

const testDeps = (sdk, overrides = {}) => ({
  sdk,
  getTranslationConfig: jest.fn(() => ({})),
  toSpeechLocale: jest.fn((lang) => lang || 'en'),
  toLanguageCode: jest.fn((lang) => (lang || 'en').split('-')[0]),
  getCachedOrSynthesize: jest.fn(),
  ...overrides,
});

describe('OneToOneTranslationSessionManager', () => {
  test('replaces duplicate active sessions for the same socket and receiver', async () => {
    const { sdk, recognizers, pushStreams } = createFakeSdk();
    const manager = new OneToOneTranslationSessionManager(testDeps(sdk));
    const socket = createSocket();
    const io = createIo();

    await manager.startSession({ io, socket, receiverUserId: 'u2', sourceLanguage: 'en', targetLanguage: 'hi', requestId: 's1' });
    await manager.startSession({ io, socket, receiverUserId: 'u2', sourceLanguage: 'en', targetLanguage: 'hi', requestId: 's2' });

    expect(manager.activeCount()).toBe(1);
    expect(recognizers[0].stopped).toBe(true);
    expect(recognizers[0].closed).toBe(true);
    expect(pushStreams[0].closed).toBe(true);
    expect(recognizers[1].closed).toBe(false);
  });

  test('writes PCM chunks only while a stream is active', async () => {
    const { sdk, pushStreams } = createFakeSdk();
    const manager = new OneToOneTranslationSessionManager(testDeps(sdk));
    const socket = createSocket();

    expect(manager.writeChunkForSocket(socket.id, Buffer.from([1, 2]))).toBe(false);

    await manager.startSession({ io: createIo(), socket, receiverUserId: 'u2', sourceLanguage: 'en', targetLanguage: 'hi', requestId: 's1' });
    expect(manager.writeChunkForSocket(socket.id, Buffer.from([1, 2]))).toBe(true);
    expect(pushStreams[0].writes).toHaveLength(1);
  });

  test('drops audio chunks when ingress exceeds the per-stream byte budget', async () => {
    const { sdk, pushStreams } = createFakeSdk();
    const manager = new OneToOneTranslationSessionManager(testDeps(sdk, {
      now: () => 1000,
      maxStreamBytesPerSecond: 4,
      backpressureStatusIntervalMs: 0,
    }));
    const socket = createSocket();

    await manager.startSession({ io: createIo(), socket, receiverUserId: 'u2', sourceLanguage: 'en', targetLanguage: 'hi', requestId: 's1' });

    expect(manager.writeChunkForSocket(socket.id, Buffer.from([1, 2, 3]))).toBe(true);
    expect(manager.writeChunkForSocket(socket.id, Buffer.from([4, 5]))).toBe(false);
    expect(pushStreams[0].writes).toHaveLength(1);

    const degraded = socket.emitted.find((e) => e.event === 'translationStreamStatus' && e.payload.reason === 'audio_backpressure');
    expect(degraded.payload).toMatchObject({
      status: 'degraded',
      requestId: 's1',
      droppedChunks: 1,
      droppedBytes: 2,
    });
  });

  test('reports dropped audio totals when a stream stops', async () => {
    const { sdk } = createFakeSdk();
    const manager = new OneToOneTranslationSessionManager(testDeps(sdk, {
      now: () => 1000,
      maxStreamBytesPerSecond: 4,
      backpressureStatusIntervalMs: 0,
    }));
    const socket = createSocket();

    await manager.startSession({ io: createIo(), socket, receiverUserId: 'u2', sourceLanguage: 'en', targetLanguage: 'hi', requestId: 's1' });
    manager.writeChunkForSocket(socket.id, Buffer.from([1, 2, 3]));
    manager.writeChunkForSocket(socket.id, Buffer.from([4, 5]));
    await manager.stopSessionForSocket(socket.id, 'test_done');

    const off = socket.emitted.find((e) => e.event === 'translationStreamStatus' && e.payload.status === 'off');
    expect(off.payload).toMatchObject({
      reason: 'test_done',
      bytesReceived: 3,
      droppedChunks: 1,
      droppedBytes: 2,
    });
  });

  test('stops idle streams automatically', async () => {
    jest.useFakeTimers();
    try {
      const { sdk } = createFakeSdk();
      let now = 0;
      const manager = new OneToOneTranslationSessionManager(testDeps(sdk, {
        now: () => now,
        idleTimeoutMs: 1000,
        idleCheckIntervalMs: 100,
      }));
      const socket = createSocket();

      await manager.startSession({ io: createIo(), socket, receiverUserId: 'u2', sourceLanguage: 'en', targetLanguage: 'hi', requestId: 's1' });
      expect(manager.activeCount()).toBe(1);

      now = 1001;
      jest.advanceTimersByTime(100);
      await Promise.resolve();
      await Promise.resolve();

      expect(manager.activeCount()).toBe(0);
      expect(socket.emitted.some((e) => (
        e.event === 'translationStreamStatus' &&
        e.payload.status === 'off' &&
        e.payload.reason === 'idle_timeout'
      ))).toBe(true);
    } finally {
      jest.useRealTimers();
    }
  });

  test('emits partial captions to sender and receiver immediately', async () => {
    const { sdk, recognizers } = createFakeSdk();
    const manager = new OneToOneTranslationSessionManager(testDeps(sdk, { now: () => 1000 }));
    const socket = createSocket();
    const io = createIo();

    await manager.startSession({ io, socket, receiverUserId: 'u2', sourceLanguage: 'en', targetLanguage: 'hi', requestId: 's1' });
    recognizers[0].recognizing(null, {
      result: {
        reason: sdk.ResultReason.TranslatingSpeech,
        text: 'hello',
        translations: new Map([['hi', 'namaste']]),
      },
    });

    const local = socket.emitted.find((e) => e.event === 'translatedSpeech' && e.payload.partial);
    const remote = io.emitted.find((e) => e.event === 'translatedSpeech' && e.payload.partial);
    expect(local.payload).toMatchObject({ isLocal: true, partial: true, text: { original: 'hello', translated: 'namaste' } });
    expect(remote.room).toBe('user_u2');
    expect(remote.payload).toMatchObject({ isLocal: false, partial: true });
  });

  test('emits final text before translated audio', async () => {
    const { sdk, recognizers } = createFakeSdk();
    const tts = deferred();
    const manager = new OneToOneTranslationSessionManager(testDeps(sdk, {
      getCachedOrSynthesize: jest.fn(() => tts.promise),
      now: () => 2000,
    }));
    const socket = createSocket();
    const io = createIo();

    await manager.startSession({ io, socket, receiverUserId: 'u2', sourceLanguage: 'en', targetLanguage: 'hi', requestId: 's1' });
    recognizers[0].recognized(null, {
      result: {
        reason: sdk.ResultReason.TranslatedSpeech,
        text: 'hello',
        translations: new Map([['hi', 'namaste']]),
      },
    });

    await flush();
    expect(socket.emitted.some((e) => e.event === 'translatedSpeech' && e.payload.text && !e.payload.audio)).toBe(true);
    expect(socket.emitted.some((e) => e.event === 'translatedSpeech' && e.payload.audio)).toBe(false);

    tts.resolve(Buffer.from([9, 9]));
    await flush();
    expect(socket.emitted.some((e) => e.event === 'translatedSpeech' && e.payload.audioonly && e.payload.audio)).toBe(true);
    const remoteAudio = io.emitted.find((e) => e.event === 'translatedSpeech' && e.payload.audioonly && e.payload.audio);
    expect(remoteAudio).toBeTruthy();
    expect(remoteAudio.room).toBe('user_u2');
    expect(remoteAudio.payload).toMatchObject({
      isLocal: false,
      audioonly: true,
      targetLanguage: 'hi',
    });
  });

  test('keeps final captions when TTS fails and reports degraded status', async () => {
    const { sdk, recognizers } = createFakeSdk();
    const manager = new OneToOneTranslationSessionManager(testDeps(sdk, {
      getCachedOrSynthesize: jest.fn(() => Promise.reject(new Error('tts down'))),
      now: () => 3000,
    }));
    const socket = createSocket();

    await manager.startSession({ io: createIo(), socket, receiverUserId: 'u2', sourceLanguage: 'en', targetLanguage: 'hi', requestId: 's1' });
    recognizers[0].recognized(null, {
      result: {
        reason: sdk.ResultReason.TranslatedSpeech,
        text: 'hello',
        translations: new Map([['hi', 'namaste']]),
      },
    });

    await flush();
    expect(socket.emitted.some((e) => e.event === 'translatedSpeech' && e.payload.text)).toBe(true);
    expect(socket.emitted.some((e) => e.event === 'translationStreamStatus' && e.payload.status === 'degraded')).toBe(true);
    expect(socket.emitted.some((e) => e.event === 'translatedSpeech' && e.payload.audio)).toBe(false);
  });
});
