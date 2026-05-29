const crypto = require('crypto');
const { getCachedOrSynthesize } = require('../utils/textToSpeechModule');
const redisManager = require('../redis/RedisManager');
const pLimitModule = require('p-limit');
const pLimit = (pLimitModule && pLimitModule.default) ? pLimitModule.default : pLimitModule;

// Single, process-wide TTS concurrency cap shared by BOTH 1:1 and group-call
// paths (every TTS request flows through getOrSynthesize). Previously each path
// had its own limiter, so the real concurrent-synthesis count could exceed any
// single intended cap.
const TTS_CONCURRENCY = parseInt(process.env.TTS_CONCURRENCY || '4', 10);
const ttsLimit = pLimit(TTS_CONCURRENCY);

/**
 * SharedTranslationCache
 * Single responsibility: deduplicate TTS generation across multiple subscribers.
 *
 * If 20 participants all want EN→HI, this ensures the TTS audio is generated
 * exactly once and shared. Phase 3: in-process LRU. Phase 4: Redis-backed.
 *
 * The existing textToSpeechModule.js already caches by (text, lang).
 * This layer adds a request-dedup guard to prevent parallel in-flight duplicates.
 */

const MAX_ENTRIES = 200;
const TTL_MS = 5 * 60 * 1000; // 5 minutes

class SharedTranslationCache {
  constructor() {
    // key → { buffer, expiresAt }
    this._cache = new Map();
    // key → Promise<Buffer> — in-flight dedup guard
    this._inFlight = new Map();
  }

  /**
   * Get a TTS buffer from cache, or synthesize once and share the result.
   *
   * @param {string} text  - Text to synthesize
   * @param {string} lang  - Target language code (e.g. 'hi', 'fr')
   * @returns {Promise<Buffer|null>}
   */
  async getOrSynthesize(text, lang) {
    const key = this._key(text, lang);

    // 1. Check Redis (cross-instance shared cache)
    if (redisManager.isReady) {
      try {
        const redisBuffer = await redisManager.getTranslation(key);
        if (redisBuffer) return redisBuffer;
      } catch (err) {
        console.warn('[SharedTranslationCache] Redis get failed:', err.message);
      }
    }

    // 2. Serve from in-process LRU
    const cached = this._cache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.buffer;
    }

    // 3. Deduplicate concurrent in-flight requests for the same key
    if (this._inFlight.has(key)) {
      return this._inFlight.get(key);
    }

    const promise = ttsLimit(() => getCachedOrSynthesize(text, lang))
      .then(async (buffer) => {
        this._set(key, buffer);
        // Populate Redis so other instances benefit
        if (redisManager.isReady && buffer) {
          redisManager.setTranslation(key, buffer).catch(() => {});
        }
        return buffer;
      })
      .catch((err) => {
        console.error(`[SharedTranslationCache] TTS failed (${lang}):`, err.message);
        return null;
      })
      .finally(() => {
        this._inFlight.delete(key);
      });

    this._inFlight.set(key, promise);
    return promise;
  }

  _key(text, lang) {
    return crypto.createHash('md5').update(`${lang}:${text}`).digest('hex');
  }

  _set(key, buffer) {
    if (this._cache.size >= MAX_ENTRIES) {
      // Evict oldest entry
      const oldest = this._cache.keys().next().value;
      this._cache.delete(oldest);
    }
    this._cache.set(key, { buffer, expiresAt: Date.now() + TTL_MS });
  }

  invalidate(text, lang) {
    this._cache.delete(this._key(text, lang));
  }

  stats() {
    return { size: this._cache.size, inFlight: this._inFlight.size };
  }
}

module.exports = new SharedTranslationCache();
