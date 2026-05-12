const express = require('express');
const router = express.Router();
const authenticate = require('../middleware/auth');
const livekitManager = require('../server/sfu/LiveKitManager');
const GroupCall = require('../lib/models/GroupCall');
const connectDB = require('../lib/db');

/**
 * POST /api/livekit/token
 *
 * Returns a signed LiveKit access token for the requesting participant.
 * The client calls this immediately before connecting to the LiveKit room.
 *
 * Body: { callRoomId: string }
 * Headers: x-auth-token (JWT)
 * Response: { token: string, livekitUrl: string }
 */
router.post('/token', authenticate, async (req, res) => {
  try {
    await connectDB();

    const { callRoomId } = req.body;
    const { userId, username } = req.user;

    if (!callRoomId) {
      return res.status(400).json({ error: 'callRoomId is required' });
    }

    const groupCall = await GroupCall.findOne({ callRoomId });
    if (!groupCall) {
      return res.status(404).json({ error: 'Group call not found' });
    }

    const isParticipant = groupCall.participants.some(
      (p) => p.userId.toString() === String(userId)
    );
    if (!isParticipant) {
      return res.status(403).json({ error: 'Not a participant of this call' });
    }

    await livekitManager.ensureRoom(callRoomId);
    const token = await livekitManager.generateToken(callRoomId, userId, username);

    return res.json({
      token,
      livekitUrl: require('../server/utils/env').config.LIVEKIT_URL,
    });
  } catch (err) {
    console.error('[/api/livekit/token]', err.message);
    return res.status(500).json({ error: 'Failed to generate LiveKit token' });
  }
});

/**
 * DELETE /api/livekit/room/:callRoomId
 *
 * Deletes the LiveKit room when a group call ends.
 * Only callable by a participant of that call.
 */
router.delete('/room/:callRoomId', authenticate, async (req, res) => {
  try {
    await connectDB();

    const { callRoomId } = req.params;
    const { userId } = req.user;

    const groupCall = await GroupCall.findOne({ callRoomId });
    if (!groupCall) {
      return res.status(404).json({ error: 'Group call not found' });
    }

    const isParticipant = groupCall.participants.some(
      (p) => p.userId.toString() === String(userId)
    );
    if (!isParticipant) {
      return res.status(403).json({ error: 'Not a participant of this call' });
    }

    await livekitManager.deleteRoom(callRoomId);
    return res.json({ success: true });
  } catch (err) {
    console.error('[DELETE /api/livekit/room]', err.message);
    return res.status(500).json({ error: 'Failed to delete LiveKit room' });
  }
});

module.exports = router;
