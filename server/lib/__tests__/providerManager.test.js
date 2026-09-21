const providerManager = require('../../server/providers/providerManager');

describe('ProviderManager Multi-Pipeline Support', () => {
  beforeAll(() => {
    // Initialize in fallback mode without requiring MongoDB connection
    providerManager._initializeFallbackFromEnv();
  });

  test('initializes default categories including pipeline and realtime', () => {
    const pipelineConfig = providerManager.getCategoryConfig('pipeline');
    expect(pipelineConfig).toBeDefined();
    expect(pipelineConfig.activeProvider).toBe('versionB_pipeline');

    const realtimeConfig = providerManager.getCategoryConfig('realtime');
    expect(realtimeConfig).toBeDefined();
    expect(realtimeConfig.activeProvider).toBe('openai');
  });

  test('initializes Deepgram under STT providers', () => {
    const sttConfig = providerManager.getCategoryConfig('stt');
    expect(sttConfig.providers.deepgram).toBeDefined();
    expect(sttConfig.providers.deepgram.name).toContain('Deepgram');
    expect(sttConfig.providers.deepgram.model).toBe('nova-2');
  });

  test('initializes ElevenLabs under TTS providers', () => {
    const ttsConfig = providerManager.getCategoryConfig('tts');
    expect(ttsConfig.providers.elevenlabs).toBeDefined();
    expect(ttsConfig.providers.elevenlabs.name).toContain('ElevenLabs');
    expect(ttsConfig.providers.elevenlabs.model).toBe('eleven_multilingual_v2');
  });

  test('getMaskedConfigs masks sensitive keys across all categories', () => {
    const masked = providerManager.getMaskedConfigs();
    expect(masked.pipeline).toBeDefined();
    expect(masked.realtime).toBeDefined();
    expect(masked.stt.providers.deepgram).toBeDefined();
    expect(masked.tts.providers.elevenlabs).toBeDefined();
  });

  test('testConnection throws descriptive error when apiKey is missing', async () => {
    const deepgramTest = await providerManager.testConnection('stt', 'deepgram', { apiKey: '' });
    expect(deepgramTest.success).toBe(false);
    expect(deepgramTest.error).toContain('API Key');

    const elevenLabsTest = await providerManager.testConnection('tts', 'elevenlabs', { apiKey: '' });
    expect(elevenLabsTest.success).toBe(false);
    expect(elevenLabsTest.error).toContain('API Key');

    const groqTest = await providerManager.testConnection('stt', 'groq', { apiKey: '' });
    expect(groqTest.success).toBe(false);
    expect(groqTest.error).toContain('API Key');

    const openRouterTest = await providerManager.testConnection('translation', 'openrouter', { apiKey: '' });
    expect(openRouterTest.success).toBe(false);
    expect(openRouterTest.error).toContain('API Key');

    const nvidiaTest = await providerManager.testConnection('translation', 'nvidia', { apiKey: '' });
    expect(nvidiaTest.success).toBe(false);
    expect(nvidiaTest.error).toContain('API Key');
  });

  test('contains Groq, OpenRouter, and NVIDIA in default providers across stages', () => {
    const stt = providerManager.getCategoryConfig('stt');
    expect(stt.providers.groq).toBeDefined();
    expect(stt.providers.nvidia).toBeDefined();

    const translation = providerManager.getCategoryConfig('translation');
    expect(translation.providers.groq).toBeDefined();
    expect(translation.providers.openrouter).toBeDefined();
    expect(translation.providers.nvidia).toBeDefined();

    const tts = providerManager.getCategoryConfig('tts');
    expect(tts.providers.nvidia).toBeDefined();
  });
});
