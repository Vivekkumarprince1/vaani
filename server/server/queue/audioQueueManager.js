// p-limit@7 is ESM-only; require() returns a namespace object, so unwrap .default
// (same pattern used in speechTranslationSDK.js / SharedTranslationCache.js).
const pLimitModule = require('p-limit');
const pLimit = (pLimitModule && pLimitModule.default) ? pLimitModule.default : pLimitModule;
const { recognizeSpeech, translateText } = require('../utils/speechTranslator');
const sharedCache = require('../translation/SharedTranslationCache');
const { translateSpeechDirect } = require('../utils/speechTranslationSDK');

/**
 * AudioQueueManager
 * Single responsibility: Provide concurrency-limited background queue executors
 * using p-limit to keep Socket.IO events completely non-blocking.
 * 
 * Configured limits:
 * - Recognition queue: max 10 concurrent jobs
 * - Translation queue: max 5 concurrent jobs
 * - TTS synthesis queue: max 3 concurrent jobs
 */
class AudioQueueManager {
  constructor() {
    this.recognitionLimit = pLimit(10);
    this.translationLimit = pLimit(5);
    // TTS concurrency + in-flight dedup + LRU + Redis are all handled inside
    // SharedTranslationCache, so no separate TTS limiter is needed here.

    // In-flight request deduplication map (text-translation only)
    this.pendingTranslations = new Map();
  }

  /**
   * Add a speech recognition job
   */
  async addRecognitionJob(audioBuffer, sourceLanguage) {
    return this.recognitionLimit(async () => {
      return recognizeSpeech(audioBuffer, sourceLanguage);
    });
  }

  /**
   * Add a text translation job (REST/SDK based)
   */
  async addTranslationJob(text, sourceLanguage, targetLanguage) {
    const dedupKey = `${sourceLanguage}:${targetLanguage}:${text}`;
    
    if (this.pendingTranslations.has(dedupKey)) {
      return this.pendingTranslations.get(dedupKey);
    }

    const jobPromise = this.translationLimit(async () => {
      return translateText(text, sourceLanguage, targetLanguage);
    });

    this.pendingTranslations.set(dedupKey, jobPromise);
    
    jobPromise.finally(() => {
      this.pendingTranslations.delete(dedupKey);
    });

    return jobPromise;
  }

  /**
   * Add a TTS synthesis job.
   * Delegates to SharedTranslationCache, which provides a single shared
   * concurrency cap, in-flight dedup, an in-process LRU (TTL), and a
   * cross-instance Redis layer — the same path used by group calls.
   */
  async addTtsJob(text, targetLanguage) {
    return sharedCache.getOrSynthesize(text, targetLanguage);
  }

  /**
   * Add a speech translation optimized SDK job
   */
  async addSpeechTranslationJob(audioBuffer, sourceLanguage, targetLanguage, handlePartial) {
    return this.recognitionLimit(async () => {
      return translateSpeechDirect(audioBuffer, sourceLanguage, targetLanguage, handlePartial);
    });
  }
}

module.exports = new AudioQueueManager();
