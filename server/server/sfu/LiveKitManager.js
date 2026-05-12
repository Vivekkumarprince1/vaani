const { AccessToken, RoomServiceClient } = require('livekit-server-sdk');
const { config } = require('../utils/env');

/**
 * LiveKitManager
 * Single responsibility: LiveKit token generation and room administration.
 * No business logic — callers own participant tracking and lifecycle.
 */
class LiveKitManager {
  constructor() {
    this.apiKey = config.LIVEKIT_API_KEY;
    this.apiSecret = config.LIVEKIT_API_SECRET;
    this.livekitUrl = config.LIVEKIT_URL;

    if (!this.apiKey || !this.apiSecret) {
      console.warn('[LiveKitManager] LIVEKIT_API_KEY / LIVEKIT_API_SECRET not set — SFU disabled');
      this.enabled = false;
      return;
    }

    this.enabled = true;
    // RoomServiceClient expects HTTP(S) URL, not WS
    const httpUrl = this.livekitUrl
      .replace('wss://', 'https://')
      .replace('ws://', 'http://');

    this.roomService = new RoomServiceClient(httpUrl, this.apiKey, this.apiSecret);
  }

  /**
   * Generate a signed LiveKit access token for a participant.
   * The callRoomId is used as the LiveKit room name.
   */
  async generateToken(callRoomId, userId, username) {
    if (!this.enabled) throw new Error('LiveKit not configured');

    const at = new AccessToken(this.apiKey, this.apiSecret, {
      identity: String(userId),
      name: username,
      ttl: '4h',
    });

    at.addGrant({
      roomJoin: true,
      room: callRoomId,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });

    const token = await at.toJwt();
    console.log(`[LiveKitManager] Generated token for user ${userId} in room ${callRoomId} (type: ${typeof token})`);
    return token;
  }

  /**
   * Ensure a LiveKit room exists. Idempotent — safe to call on every join.
   */
  async ensureRoom(callRoomId, options = {}) {
    if (!this.enabled) return;
    try {
      await this.roomService.createRoom({
        name: callRoomId,
        emptyTimeout: 300,
        maxParticipants: 100,
        ...options,
      });
    } catch (err) {
      // 409 / "already exists" is expected when room was pre-created
      if (!err.message?.toLowerCase().includes('already exists') && err.code !== 409) {
        throw err;
      }
    }
  }

  /**
   * List active participants in a LiveKit room.
   * Returns an array of ParticipantInfo objects.
   */
  async listParticipants(callRoomId) {
    if (!this.enabled) return [];
    return this.roomService.listParticipants(callRoomId);
  }

  /**
   * Remove a specific participant from a LiveKit room.
   */
  async removeParticipant(callRoomId, participantIdentity) {
    if (!this.enabled) return;
    try {
      await this.roomService.removeParticipant(callRoomId, participantIdentity);
    } catch (err) {
      // Participant may have already left
      console.warn(`[LiveKitManager] removeParticipant failed: ${err.message}`);
    }
  }

  /**
   * Delete a LiveKit room entirely. Call when group call ends.
   */
  async deleteRoom(callRoomId) {
    if (!this.enabled) return;
    try {
      await this.roomService.deleteRoom(callRoomId);
    } catch (err) {
      console.warn(`[LiveKitManager] deleteRoom failed: ${err.message}`);
    }
  }
}

module.exports = new LiveKitManager();
