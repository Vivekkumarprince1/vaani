/**
 * RoomManager
 * Single responsibility: maintain the server-side participant registry for active SFU rooms.
 *
 * Tracks per-room participant metadata needed for translation routing.
 * Phase 2: in-process Map. Phase 4: swapped for Redis-backed equivalent.
 *
 * Does NOT touch MongoDB — that is owned by groupCallController.js.
 * Does NOT own Socket.IO events — that is owned by socketHandlers.js.
 */
class RoomManager {
  constructor() {
    // callRoomId → { participants: Map<userId, ParticipantMeta> }
    this._rooms = new Map();
  }

  // ── Participant registry ──────────────────────────────────────────────────

  addParticipant(callRoomId, userId, { socketId, username, preferredLanguage }) {
    if (!this._rooms.has(callRoomId)) {
      this._rooms.set(callRoomId, { participants: new Map() });
    }
    this._rooms.get(callRoomId).participants.set(String(userId), {
      socketId,
      username: username || 'Unknown',
      preferredLanguage: (preferredLanguage || 'en').split('-')[0],
      joinedAt: Date.now(),
    });
  }

  removeParticipant(callRoomId, userId) {
    const room = this._rooms.get(callRoomId);
    if (!room) return;
    room.participants.delete(String(userId));
    if (room.participants.size === 0) {
      this._rooms.delete(callRoomId);
    }
  }

  updateLanguage(callRoomId, userId, preferredLanguage) {
    const meta = this._getParticipantMeta(callRoomId, userId);
    if (meta) meta.preferredLanguage = (preferredLanguage || 'en').split('-')[0];
  }

  updateSocketId(callRoomId, userId, socketId) {
    const meta = this._getParticipantMeta(callRoomId, userId);
    if (meta) meta.socketId = socketId;
  }

  getParticipant(callRoomId, userId) {
    return this._getParticipantMeta(callRoomId, userId);
  }

  getRoomParticipants(callRoomId) {
    return this._rooms.get(callRoomId)?.participants ?? new Map();
  }

  hasRoom(callRoomId) {
    return this._rooms.has(callRoomId);
  }

  activeRoomCount() {
    return this._rooms.size;
  }

  // ── Translation routing ───────────────────────────────────────────────────

  /**
   * Build a language → [userId] map for all participants in a room,
   * excluding the speaker (excludeUserId).
   *
   * Used by the translation handler to know which target languages to generate
   * and which participants should receive each translated stream.
   *
   * Returns: Map<string, string[]>  e.g. { hi: ['u1','u2'], fr: ['u3'] }
   */
  getLanguageRoutingMap(callRoomId, excludeUserId) {
    const participants = this.getRoomParticipants(callRoomId);
    const langMap = new Map();

    for (const [uid, meta] of participants) {
      if (uid === String(excludeUserId)) continue;
      const lang = meta.preferredLanguage || 'en';
      if (!langMap.has(lang)) langMap.set(lang, []);
      langMap.get(lang).push(uid);
    }

    return langMap;
  }

  /**
   * Returns the socketId for a given userId in a room.
   * Used by the translation handler to emit directly to a participant.
   */
  getSocketId(callRoomId, userId) {
    return this._getParticipantMeta(callRoomId, userId)?.socketId ?? null;
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  _getParticipantMeta(callRoomId, userId) {
    return this._rooms.get(callRoomId)?.participants.get(String(userId)) ?? null;
  }
}

module.exports = new RoomManager();
