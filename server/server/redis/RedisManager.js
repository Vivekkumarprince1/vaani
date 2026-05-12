const Redis = require('ioredis');
const { config } = require('../utils/env');

/**
 * RedisManager
 * Single responsibility: Redis client singleton with typed helpers.
 *
 * Phase 4 target key schema:
 *   user:{userId}                       → JSON { socketId, username, preferredLanguage, status }
 *   room:{callRoomId}:participants       → Redis Hash  userId → JSON meta
 *   translation:{hash}                  → Buffer (TTS audio, TTL 5 min)
 *
 * Gracefully degrades if Redis is unavailable — callers must check `isReady`.
 */

const USER_TTL = 24 * 60 * 60;      // 24 hours (seconds)
const TRANSLATION_TTL = 5 * 60;     // 5 minutes (seconds)
const PARTICIPANT_TTL = 4 * 60 * 60; // 4 hours (seconds)

class RedisManager {
  constructor() {
    this._client = null;
    this._isReady = false;
    this._init();
  }

  _init() {
    if (!config.REDIS_URL) {
      console.warn('[RedisManager] REDIS_URL not set — Redis disabled');
      return;
    }

    try {
      this._client = new Redis(config.REDIS_URL, {
        lazyConnect: true,
        maxRetriesPerRequest: 3,
        enableReadyCheck: true,
        retryStrategy: (times) => {
          if (times > 5) return null; // Stop retrying after 5 attempts
          return Math.min(times * 500, 3000);
        },
      });

      this._client.on('ready', () => {
        this._isReady = true;
        console.log('[RedisManager] Connected to Redis');
      });

      this._client.on('error', (err) => {
        this._isReady = false;
        console.warn('[RedisManager] Redis error:', err.message);
      });

      this._client.on('close', () => {
        this._isReady = false;
      });

      this._client.connect().catch((err) => {
        console.warn('[RedisManager] Initial connect failed:', err.message);
      });
    } catch (err) {
      console.warn('[RedisManager] Init failed:', err.message);
    }
  }

  get isReady() {
    return this._isReady;
  }

  get client() {
    return this._client;
  }

  // ── User state ────────────────────────────────────────────────────────────

  async setUser(userId, data) {
    if (!this._isReady) return;
    await this._client.set(`user:${userId}`, JSON.stringify(data), 'EX', USER_TTL);
  }

  async getUser(userId) {
    if (!this._isReady) return null;
    const raw = await this._client.get(`user:${userId}`);
    return raw ? JSON.parse(raw) : null;
  }

  async deleteUser(userId) {
    if (!this._isReady) return;
    await this._client.del(`user:${userId}`);
  }

  // ── Participant state (per room) ──────────────────────────────────────────

  async setParticipant(callRoomId, userId, meta) {
    if (!this._isReady) return;
    const key = `room:${callRoomId}:participants`;
    await this._client.hset(key, String(userId), JSON.stringify(meta));
    await this._client.expire(key, PARTICIPANT_TTL);
  }

  async removeParticipant(callRoomId, userId) {
    if (!this._isReady) return;
    await this._client.hdel(`room:${callRoomId}:participants`, String(userId));
  }

  async getRoomParticipants(callRoomId) {
    if (!this._isReady) return new Map();
    const raw = await this._client.hgetall(`room:${callRoomId}:participants`);
    if (!raw) return new Map();
    const map = new Map();
    for (const [uid, json] of Object.entries(raw)) {
      try { map.set(uid, JSON.parse(json)); } catch (e) {}
    }
    return map;
  }

  async deleteRoom(callRoomId) {
    if (!this._isReady) return;
    await this._client.del(`room:${callRoomId}:participants`);
  }

  // ── Translation TTS cache ─────────────────────────────────────────────────

  async setTranslation(hash, buffer) {
    if (!this._isReady) return;
    await this._client.set(`translation:${hash}`, buffer, 'EX', TRANSLATION_TTL);
  }

  async getTranslation(hash) {
    if (!this._isReady) return null;
    // ioredis returns Buffer when the value is binary
    return this._client.getBuffer(`translation:${hash}`);
  }

  // ── Generic helpers ───────────────────────────────────────────────────────

  async publish(channel, message) {
    if (!this._isReady) return;
    await this._client.publish(channel, typeof message === 'string' ? message : JSON.stringify(message));
  }

  async ping() {
    if (!this._isReady) return false;
    try {
      await this._client.ping();
      return true;
    } catch (e) {
      return false;
    }
  }
}

module.exports = new RedisManager();
