const Redis = require('ioredis');
const { config } = require('../utils/env');

/**
 * PubSubManager
 * Single responsibility: Redis pub/sub for cross-instance event broadcasting.
 *
 * Used when multiple Node.js server instances run behind a load balancer.
 * Publisher and subscriber use separate Redis connections (ioredis requirement).
 *
 * Channels:
 *   vaani:translation:{callRoomId}:{targetLang}  → translated speech payload
 *   vaani:participant:{userId}                    → user status changes
 *   vaani:room:{callRoomId}                       → room-level events (join/leave)
 *
 * Gracefully disabled when REDIS_URL is not configured.
 */

class PubSubManager {
  constructor() {
    this._pub = null;
    this._sub = null;
    this._handlers = new Map(); // channel pattern → Set<callback>
    this._isReady = false;
    this._init();
  }

  _createClient() {
    return new Redis(config.REDIS_URL, {
      lazyConnect: true,
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => (times > 5 ? null : Math.min(times * 500, 3000)),
    });
  }

  _init() {
    if (!config.REDIS_URL) {
      console.warn('[PubSubManager] REDIS_URL not set — pub/sub disabled');
      return;
    }

    try {
      this._pub = this._createClient();
      this._sub = this._createClient();

      this._sub.on('message', (channel, message) => {
        this._dispatch(channel, message);
      });

      this._sub.on('pmessage', (pattern, channel, message) => {
        this._dispatch(channel, message, pattern);
      });

      Promise.all([
        this._pub.connect(),
        this._sub.connect(),
      ]).then(() => {
        this._isReady = true;
        console.log('[PubSubManager] Connected — pub/sub ready');
      }).catch((err) => {
        console.warn('[PubSubManager] Connect failed:', err.message);
      });
    } catch (err) {
      console.warn('[PubSubManager] Init failed:', err.message);
    }
  }

  // ── Publish ───────────────────────────────────────────────────────────────

  async publish(channel, payload) {
    if (!this._isReady) return;
    const message = typeof payload === 'string' ? payload : JSON.stringify(payload);
    await this._pub.publish(channel, message);
  }

  // Convenience publishers

  async publishTranslation(callRoomId, targetLang, payload) {
    return this.publish(`vaani:translation:${callRoomId}:${targetLang}`, payload);
  }

  async publishParticipantEvent(userId, payload) {
    return this.publish(`vaani:participant:${userId}`, payload);
  }

  async publishRoomEvent(callRoomId, payload) {
    return this.publish(`vaani:room:${callRoomId}`, payload);
  }

  // ── Subscribe ─────────────────────────────────────────────────────────────

  /**
   * Subscribe to an exact channel.
   * @param {string}   channel
   * @param {Function} callback  (payload: object) => void
   * @returns {Function} unsubscribe
   */
  async subscribe(channel, callback) {
    if (!this._isReady) return () => {};

    if (!this._handlers.has(channel)) {
      this._handlers.set(channel, new Set());
      await this._sub.subscribe(channel);
    }
    this._handlers.get(channel).add(callback);

    return () => this._unsubscribe(channel, callback);
  }

  /**
   * Subscribe using a glob pattern (e.g. 'vaani:translation:*').
   * @param {string}   pattern
   * @param {Function} callback  (channel: string, payload: object) => void
   * @returns {Function} unsubscribe
   */
  async psubscribe(pattern, callback) {
    if (!this._isReady) return () => {};

    const key = `p:${pattern}`;
    if (!this._handlers.has(key)) {
      this._handlers.set(key, new Set());
      await this._sub.psubscribe(pattern);
    }
    this._handlers.get(key).add(callback);

    return () => this._punsubscribe(pattern, callback);
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  _dispatch(channel, rawMessage, pattern = null) {
    let payload;
    try { payload = JSON.parse(rawMessage); } catch { payload = rawMessage; }

    // Exact channel subscribers
    this._handlers.get(channel)?.forEach((cb) => {
      try { cb(payload); } catch (e) { console.warn('[PubSubManager] handler error:', e); }
    });

    // Pattern subscribers
    if (pattern) {
      this._handlers.get(`p:${pattern}`)?.forEach((cb) => {
        try { cb(channel, payload); } catch (e) { console.warn('[PubSubManager] phandler error:', e); }
      });
    }
  }

  async _unsubscribe(channel, callback) {
    const set = this._handlers.get(channel);
    if (!set) return;
    set.delete(callback);
    if (set.size === 0) {
      this._handlers.delete(channel);
      if (this._isReady) await this._sub.unsubscribe(channel);
    }
  }

  async _punsubscribe(pattern, callback) {
    const key = `p:${pattern}`;
    const set = this._handlers.get(key);
    if (!set) return;
    set.delete(callback);
    if (set.size === 0) {
      this._handlers.delete(key);
      if (this._isReady) await this._sub.punsubscribe(pattern);
    }
  }

  get isReady() {
    return this._isReady;
  }
}

module.exports = new PubSubManager();
