const roomManager = require('./RoomManager');

/**
 * ParticipantManager
 * Single responsibility: participant lifecycle hooks for SFU group calls.
 *
 * Coordinates join/leave events between socketHandlers.js and RoomManager.
 * Does NOT own MongoDB updates (groupCallController.js does that via REST).
 * Does NOT emit Socket.IO events directly — it returns data for callers to emit.
 */
class ParticipantManager {
  /**
   * Register a participant when they join a group call SFU room.
   * Called from socketHandlers.js on the 'joinGroupCall' event.
   *
   * @param {string} callRoomId
   * @param {string} userId
   * @param {object} meta - { socketId, username, preferredLanguage }
   */
  handleJoin(callRoomId, userId, meta) {
    roomManager.addParticipant(callRoomId, userId, meta);
    console.log(`[ParticipantManager] ${meta.username} joined ${callRoomId} (${roomManager.getRoomParticipants(callRoomId).size} in room)`);
  }

  /**
   * De-register a participant when they leave or disconnect.
   * Called from socketHandlers.js on 'leaveGroupCall' or socket 'disconnect'.
   *
   * @param {string} callRoomId
   * @param {string} userId
   * @returns {{ remainingCount: number }} — callers use this to decide call end logic
   */
  handleLeave(callRoomId, userId) {
    roomManager.removeParticipant(callRoomId, userId);
    const remaining = roomManager.getRoomParticipants(callRoomId).size;
    console.log(`[ParticipantManager] user ${userId} left ${callRoomId} (${remaining} remaining)`);
    return { remainingCount: remaining };
  }

  /**
   * Update a participant's preferred language.
   * Called when a user changes their language preference mid-call.
   */
  updateLanguage(callRoomId, userId, preferredLanguage) {
    roomManager.updateLanguage(callRoomId, userId, preferredLanguage);
  }

  /**
   * Update a participant's socketId (e.g. on reconnect).
   */
  updateSocketId(callRoomId, userId, socketId) {
    roomManager.updateSocketId(callRoomId, userId, socketId);
  }

  /**
   * Find which callRoomId a userId is currently in.
   * Scans all rooms — used on disconnect when we don't have callRoomId in scope.
   *
   * @param {string} userId
   * @returns {string|null} callRoomId or null
   */
  findRoomForUser(userId) {
    // RoomManager doesn't expose internal map directly; iterate via its API
    for (const [callRoomId] of roomManager._rooms) {
      if (roomManager.getParticipant(callRoomId, userId)) {
        return callRoomId;
      }
    }
    return null;
  }

  getParticipant(callRoomId, userId) {
    return roomManager.getParticipant(callRoomId, userId);
  }

  getRoomParticipants(callRoomId) {
    return roomManager.getRoomParticipants(callRoomId);
  }

  getLanguageRoutingMap(callRoomId, excludeUserId) {
    return roomManager.getLanguageRoutingMap(callRoomId, excludeUserId);
  }

  getSocketId(callRoomId, userId) {
    return roomManager.getSocketId(callRoomId, userId);
  }
}

module.exports = new ParticipantManager();
