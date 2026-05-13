const dbConnect = require('../lib/db');
const GroupCall = require('../lib/models/GroupCall');
const Room = require('../lib/models/Room');
const { v4: uuidv4 } = require('uuid');
const participantManager = require('../server/sfu/ParticipantManager');

class GroupCallController {
  // In-memory timers for calls with single participant
  // key: callId (string) -> timeoutId
  static _noParticipantTimers = global.__groupCallNoParticipantTimers || new Map();
  // Ensure global reference persists across modules
  static _ensureGlobalTimerMap() {
    if (!global.__groupCallNoParticipantTimers) global.__groupCallNoParticipantTimers = GroupCallController._noParticipantTimers;
    else GroupCallController._noParticipantTimers = global.__groupCallNoParticipantTimers;
  }
  /**
   * Get pending group call notifications for the current user
   */
  static async getPending(req, res) {
    try {
      const userId = req.user.userId;

      await dbConnect();

      // Find all ringing calls where user is a participant
      // Filter out calls older than 5 minutes
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      
      const pendingCalls = await GroupCall.find({
        'participants.userId': userId,
        'participants.status': 'invited',
        status: 'ringing',
        createdAt: { $gte: fiveMinutesAgo }
      })
        .populate('initiator', 'username email')
        .populate('roomId', 'name participants')
        .sort({ createdAt: -1 });

      // Background task: Mark very old ringing calls as ended so they don't clog the DB
      // We don't await this to keep the response fast
      GroupCall.updateMany(
        { status: 'ringing', createdAt: { $lt: fiveMinutesAgo } },
        { status: 'ended', endedAt: new Date() }
      ).catch(err => console.error('Error cleaning up stale group calls:', err));

      return res.status(200).json({
        calls: pendingCalls
      });
    } catch (error) {
      console.error('Error fetching pending group calls:', error);
      return res.status(500).json(
        { message: 'Internal server error', error: error.message }
      );
    }
  }

  /**
   * Initiate a group call for a room
   */
  static async initiate(req, res) {
    try {
      const userId = req.user.userId;

      await dbConnect();

      const { roomId, callType = 'video' } = req.body;

      if (!roomId) {
        return res.status(400).json(
          { message: 'Room ID is required' }
        );
      }

      // Verify room exists and user is a participant
      const room = await Room.findById(roomId);
      if (!room) {
        return res.status(404).json(
          { message: 'Room not found' }
        );
      }

      const isParticipant = room.participants.some(
        p => p.toString() === userId.toString()
      );
      if (!isParticipant) {
        return res.status(403).json(
          { message: 'You are not a participant of this room' }
        );
      }

      // Check if there's already an active call for this room
      let existingCall = await GroupCall.findOne({
        roomId,
        status: { $in: ['ringing', 'active'] }
      });

      // Helper to notify participants
      const notifyParticipants = async (call, targetParticipants) => {
        try {
          const io = global.__io;
          if (!io) {
            console.warn('   ⚠️ [GroupCall] Socket.IO instance not available for notification');
            return;
          }

          const payload = {
            callId: String(call._id),
            callRoomId: call.callRoomId,
            roomId: String(call.roomId._id || call.roomId),
            roomName: call.roomId.name || room.name,
            callType: call.callType,
            initiatorId: String(call.initiator._id || call.initiator),
            initiator: {
              _id: String(call.initiator._id || call.initiator),
              username: call.initiator.username || 'System',
              email: call.initiator.email || ''
            },
            participants: call.participants.map(p => ({
              userId: String(p.userId._id || p.userId),
              status: p.status,
              username: p.userId.username || 'User'
            }))
          };

          let sentCount = 0;
          targetParticipants.forEach(pId => {
            const pIdStr = String(pId);
            const initiatorId = String(call.initiator._id || call.initiator);
            
            if (pIdStr === initiatorId) {
              console.log(`      ⏭️ [Signaling] Skipping initiator: ${pIdStr}`);
              return;
            }

            const targetRoom = `user_${pIdStr}`;
            // Diagnostic: Check if anyone is in this room on this instance
            const roomMembers = io.sockets.adapter.rooms.get(targetRoom);
            const isOnlineLocally = roomMembers && roomMembers.size > 0;

            console.log(`      🚀 [Signaling] Emitting to ${targetRoom} (Online locally: ${isOnlineLocally})`);
            io.to(targetRoom).emit('group_incoming_call', payload);
            io.to(targetRoom).emit('groupCallIncoming', payload);
            sentCount++;
          });

          console.log(`   ✨ [Signaling] Notification broadcast complete. Sent to ${sentCount} target rooms.`);
          return sentCount;
        } catch (err) {
          console.error('❌ [GroupCall] Critical error in notifyParticipants:', err);
          return 0;
        }
      };

      if (existingCall) {
        // If the call has no active participants or is older than 5 minutes with status 'ringing',
        // it's likely abandoned - automatically end it and create a new one
        const callAge = Date.now() - new Date(existingCall.startedAt).getTime();
        const isAbandoned =
          existingCall.activeParticipants.length === 0 ||
          (existingCall.status === 'ringing' && callAge > 5 * 60 * 1000); // 5 minutes

        if (isAbandoned) {
          console.log(`Sweep! Auto-ending abandoned call ${existingCall._id} for room ${roomId}`);
          existingCall.endCall();
          await existingCall.save();
          existingCall = null;
          console.log('✅ Abandoned call ended, proceeding to create new call');
        } else {
          // Return the existing active call with populated data
          console.log(`⚠️ Found active call ${existingCall._id} in DB (Status: ${existingCall.status})`);
          await existingCall.populate('initiator', 'username email');
          await existingCall.populate('participants.userId', 'username email');
          await existingCall.populate('roomId', 'name participants');

          // Get truly active participants from the SFU room manager
          const sfuParticipants = participantManager.getRoomParticipants(existingCall.callRoomId);
          console.log(`   📡 SFU Room ${existingCall.callRoomId} has ${sfuParticipants.size} active connections:`, Array.from(sfuParticipants.keys()));

          // Find anyone who is a participant but NOT in the SFU room
          const inactiveIds = existingCall.participants
            .map(p => String(p.userId._id || p.userId))
            .filter(pId => {
              if (pId === String(userId)) return false;
              const isActive = sfuParticipants.has(pId);
              if (isActive) console.log(`      ✅ Participant ${pId} is already active in SFU`);
              return !isActive;
            });
          
          if (inactiveIds.length > 0) {
            console.log(`   🔄 Re-notifying ${inactiveIds.length} inactive participants:`, inactiveIds);
            await notifyParticipants(existingCall, inactiveIds);
          }

          return res.status(200).json({
            message: 'Active call already exists for this room',
            call: existingCall
          });
        }
      }

      // Create unique call room ID
      const callRoomId = `group-call-${uuidv4()}`;

      // Create participants array (all room members)
      const participants = room.participants.map(participantId => ({
        userId: participantId,
        status: participantId.toString() === userId.toString() ? 'joined' : 'invited',
        joinedAt: participantId.toString() === userId.toString() ? new Date() : undefined,
        notificationSent: false,
        notificationDelivered: false
      }));

      // Create group call
      const groupCall = new GroupCall({
        roomId,
        callRoomId,
        initiator: userId,
        participants,
        callType,
        status: 'ringing',
        activeParticipants: [userId]
      });

      await groupCall.save();

      // Populate for response and notification
      await groupCall.populate('initiator', 'username email');
      await groupCall.populate('participants.userId', 'username email');
      await groupCall.populate('roomId', 'name participants');

      // Emit socket event to notify all participants
      console.log(`📞 [GroupCall] Notifying ${room.participants.length} participants about new group call: ${room.name}`);
      const sentCount = await notifyParticipants(groupCall, room.participants);
      
      // Update notification flags
      if (sentCount > 0) {
        groupCall.participants.forEach(p => {
          if (p.status === 'invited') p.notificationSent = true;
        });
        await groupCall.save();
      }

      return res.status(201).json({
        message: 'Group call initiated',
        call: groupCall
      });
    } catch (error) {
      console.error('Error initiating group call:', error);
      return res.status(500).json(
        { message: 'Internal server error', error: error.message }
      );
    }
  }

  /**
   * Create an instant meeting — no pre-existing group required.
   * Creates a temporary room owned by the caller, initiates a group call,
   * and returns a shareable join link.
   */
  static async createInstantMeeting(req, res) {
    try {
      const userId = req.user.userId;
      const { callType = 'video', meetingName } = req.body;

      await dbConnect();

      const name = meetingName?.trim() || `Meeting by ${req.user.username || 'user'}`;

      // Create a temporary room with just the creator
      const room = new Room({
        name,
        createdBy: userId,
        participants: [userId],
        admins: [userId],
        roomType: 'group',
      });
      await room.save();

      // Initiate a group call for the new room
      const callRoomId = `group-call-${uuidv4()}`;
      const groupCall = new GroupCall({
        roomId: room._id,
        callRoomId,
        initiator: userId,
        participants: [{ userId, status: 'joined', joinedAt: new Date() }],
        callType,
        status: 'ringing',
        activeParticipants: [userId],
      });
      await groupCall.save();

      return res.status(201).json({
        callId: groupCall._id,
        callRoomId,
        roomId: room._id,
        roomName: room.name,
        callType,
        joinLink: `/join/${callRoomId}`,
      });
    } catch (error) {
      console.error('Error creating instant meeting:', error);
      return res.status(500).json({ message: 'Internal server error', error: error.message });
    }
  }

  /**
   * Get (or create) a stable meeting link for a room.
   * Returns the active callRoomId if a call is running, otherwise the most recent
   * callRoomId so the link stays consistent for the group.
   */
  static async getRoomMeetingLink(req, res) {
    try {
      const userId = req.user.userId;
      const { roomId } = req.params;

      await dbConnect();

      const room = await Room.findById(roomId);
      if (!room) return res.status(404).json({ message: 'Room not found' });

      const isMember = room.participants.some(p => p.toString() === userId.toString());
      if (!isMember) return res.status(403).json({ message: 'Not a member of this room' });

      // Prefer active/ringing call, fall back to most recent ended call
      let call = await GroupCall.findOne({ roomId, status: { $in: ['ringing', 'active'] } }).sort({ createdAt: -1 });
      if (!call) {
        call = await GroupCall.findOne({ roomId }).sort({ createdAt: -1 });
      }

      if (call) {
        return res.status(200).json({ callRoomId: call.callRoomId, roomName: room.name });
      }

      // No call history — generate a stable deterministic callRoomId for this room
      // so the same room always gets the same link even before first call
      const stableId = `group-call-room-${roomId}`;
      return res.status(200).json({ callRoomId: stableId, roomName: room.name });
    } catch (error) {
      console.error('Error getting room meeting link:', error);
      return res.status(500).json({ message: 'Internal server error', error: error.message });
    }
  }

  /**
   * Resolve a shareable meeting link by callRoomId.
   * Returns the active call if one exists, otherwise returns the Room so the
   * client can initiate a new call.  Works even when no call is currently running.
   */
  static async getByRoomId(req, res) {
    try {
      const userId = req.user.userId;
      const { callRoomId } = req.params;

      await dbConnect();

      // 1. Try to find an active/ringing call with this LiveKit callRoomId
      let groupCall = await GroupCall.findOne({
        callRoomId,
        status: { $in: ['ringing', 'active'] },
      })
        .populate('initiator', 'username email')
        .populate('participants.userId', 'username email')
        .populate('roomId', 'name participants');

      if (groupCall) {
        const isInstant = groupCall.roomId?.name?.startsWith('Meeting by ') || false;

        if (!isInstant) {
          // Regular group call — validate room membership
          const roomParticipants = groupCall.roomId?.participants || [];
          const isMember = roomParticipants.some(p => p.toString() === userId.toString());
          if (!isMember) {
            return res.status(403).json({ message: 'You are not a member of this group' });
          }
        }

        // Add user to participants if not already listed (open for instant meetings)
        const alreadyParticipant = groupCall.participants.some(
          p => (p.userId?._id || p.userId).toString() === userId.toString()
        );
        if (!alreadyParticipant) {
          groupCall.participants.push({ userId, status: 'invited' });
          // Also add to room participants so they can re-join later
          if (isInstant) {
            await Room.findByIdAndUpdate(groupCall.roomId?._id || groupCall.roomId, {
              $addToSet: { participants: userId },
            });
          }
          await groupCall.save();
        }

        return res.status(200).json({ call: groupCall, hasActiveCall: true });
      }

      // 2. No active call — look up the Room that owns this callRoomId.
      const endedCall = await GroupCall.findOne({ callRoomId })
        .populate('roomId', 'name participants');

      if (endedCall) {
        const room = endedCall.roomId;
        if (!room) {
          return res.status(404).json({ message: 'Room not found for this link' });
        }
        const isInstant = room.name?.startsWith('Meeting by ');
        if (!isInstant) {
          const isMember = (room.participants || []).some(p => p.toString() === userId.toString());
          if (!isMember) {
            return res.status(403).json({ message: 'You are not a member of this group' });
          }
        }
        return res.status(200).json({
          hasActiveCall: false,
          room: { _id: room._id, name: room.name },
          isInstant,
        });
      }

      // 3. Handle stable room-based links (format: group-call-room-<mongoId>)
      if (callRoomId.startsWith('group-call-room-')) {
        const roomId = callRoomId.replace('group-call-room-', '');
        const room = await Room.findById(roomId).catch(() => null);
        if (!room) return res.status(404).json({ message: 'This meeting link is invalid or expired' });
        const isMember = (room.participants || []).some(p => p.toString() === userId.toString());
        if (!isMember) return res.status(403).json({ message: 'You are not a member of this group' });
        return res.status(200).json({ hasActiveCall: false, room: { _id: room._id, name: room.name } });
      }

      return res.status(404).json({ message: 'This meeting link is invalid or expired' });
    } catch (error) {
      console.error('Error resolving call by roomId:', error);
      return res.status(500).json({ message: 'Internal server error', error: error.message });
    }
  }

  /**
   * Get group call details
   */
  static async getCall(req, res) {
    try {
      const userId = req.user.userId;
      const { callId } = req.params;

      await dbConnect();

      const groupCall = await GroupCall.findById(callId)
        .populate('initiator', 'username email')
        .populate('participants.userId', 'username email')
        .populate('roomId', 'name participants');

      if (!groupCall) {
        return res.status(404).json(
          { message: 'Group call not found' }
        );
      }

      // Check if user is a participant
      const isParticipant = groupCall.participants.some(
        p => p.userId._id.toString() === userId.toString()
      );

      if (!isParticipant) {
        return res.status(403).json(
          { message: 'You are not a participant of this call' }
        );
      }

      return res.status(200).json({
        call: groupCall
      });
    } catch (error) {
      console.error('Error fetching group call:', error);
      return res.status(500).json(
        { message: 'Internal server error', error: error.message }
      );
    }
  }

  /**
   * Decline a group call invitation
   */
  static async decline(req, res) {
    try {
      const userId = req.user.userId;
      const { callId } = req.params;

      await dbConnect();

      const groupCall = await GroupCall.findById(callId);
      if (!groupCall) {
        return res.status(404).json(
          { message: 'Group call not found' }
        );
      }

      // Find participant and update status
      const participant = groupCall.participants.find(
        p => p.userId.toString() === userId.toString()
      );

      if (!participant) {
        return res.status(403).json(
          { message: 'You are not a participant of this call' }
        );
      }

      participant.status = 'declined';

      await groupCall.save();

      return res.status(200).json({
        message: 'Group call declined'
      });
    } catch (error) {
      console.error('Error declining group call:', error);
      return res.status(500).json(
        { message: 'Internal server error', error: error.message }
      );
    }
  }

  /**
   * Join a group call
   */
  static async join(req, res) {
    try {
      const userId = req.user.userId;
      const { callId } = req.params;

      await dbConnect();

      const groupCall = await GroupCall.findById(callId);
      if (!groupCall) {
        return res.status(404).json(
          { message: 'Group call not found' }
        );
      }

      // Find or auto-add participant (instant meetings are open-invite)
      let participant = groupCall.participants.find(
        p => p.userId.toString() === userId.toString()
      );

      if (!participant) {
        // Allow joining if it's an instant meeting (no strict room membership)
        const room = await Room.findById(groupCall.roomId);
        const isInstant = room?.name?.startsWith('Meeting by ');
        if (!isInstant) {
          return res.status(403).json({ message: 'You are not a participant of this call' });
        }
        // Add as new participant
        groupCall.participants.push({ userId, status: 'joined', joinedAt: new Date() });
        participant = groupCall.participants[groupCall.participants.length - 1];
        if (room) {
          await Room.findByIdAndUpdate(groupCall.roomId, { $addToSet: { participants: userId } });
        }
      }

      // Update participant status
      participant.status = 'joined';
      participant.joinedAt = new Date();

      // Add to active participants if not already there
      if (!groupCall.activeParticipants.includes(userId)) {
        groupCall.activeParticipants.push(userId);
      }

      // If call is still ringing and first person joins, make it active
      if (groupCall.status === 'ringing' && groupCall.activeParticipants.length >= 2) {
        groupCall.status = 'active';
      }

      await groupCall.save();

      // Clear any pending "no participants" timer when someone joins
      try {
        GroupCallController._ensureGlobalTimerMap();
        const timers = GroupCallController._noParticipantTimers;
        const callIdStr = groupCall._id.toString();
        if (timers.has(callIdStr)) {
          clearTimeout(timers.get(callIdStr));
          timers.delete(callIdStr);
          console.log(`⏱️ Cleared no-participant timer for call ${callIdStr} because someone joined`);
        }
      } catch (e) {
        console.warn('Failed to clear no-participant timer on join:', e);
      }

      // Notify other participants
      try {
        if (global.__io) {
          const io = global.__io;
          io.to(groupCall.callRoomId).emit('participantJoined', {
            callId: groupCall._id,
            userId,
            activeParticipants: groupCall.activeParticipants
          });
        }
      } catch (err) {
        console.error('Error emitting participant joined event:', err);
      }

      await groupCall.populate('participants.userId', 'username email');
      await groupCall.populate('roomId', 'name');

      return res.status(200).json({
        message: 'Joined group call',
        call: groupCall
      });
    } catch (error) {
      console.error('Error joining group call:', error);
      return res.status(500).json(
        { message: 'Internal server error', error: error.message }
      );
    }
  }

  /**
   * Leave a group call
   */
  static async leave(req, res) {
    try {
      const userId = req.user.userId;
      const { callId } = req.params;

      await dbConnect();

      let groupCall = await GroupCall.findById(callId);
      if (!groupCall) {
        return res.status(404).json(
          { message: 'Group call not found' }
        );
      }

      // Remove participant with retry logic for version conflicts
      let retryCount = 0;
      const maxRetries = 3;

      while (retryCount < maxRetries) {
        try {
          // Use findOneAndUpdate to avoid version conflicts
          const updateResult = await GroupCall.findOneAndUpdate(
            { _id: callId },
            {
              $set: {
                'participants.$[elem].status': 'left',
                'participants.$[elem].leftAt': new Date()
              },
              $pull: {
                activeParticipants: userId
              }
            },
            {
              arrayFilters: [{ 'elem.userId': userId }],
              new: true
            }
          );

          if (!updateResult) {
            return res.status(404).json(
              { message: 'Group call not found' }
            );
          }

          groupCall = updateResult;
          break; // Success, exit retry loop
        } catch (error) {
          retryCount++;
          if (retryCount >= maxRetries) {
            console.error('Failed to update group call after retries:', error);
            throw error;
          }
          // Wait a bit before retrying
          await new Promise(resolve => setTimeout(resolve, 100 * retryCount));
        }
      }

      // If no active participants left, end the call
      if (groupCall.activeParticipants.length === 0) {
        groupCall.status = 'ended';
        groupCall.endedAt = new Date();
        groupCall.duration = Math.floor((groupCall.endedAt - groupCall.startedAt) / 1000);

        // Mark all non-joined participants as missed
        groupCall.participants.forEach(p => {
          if (p.status === 'invited') {
            p.status = 'missed';
          } else if (p.status === 'joined' && !p.leftAt) {
            p.leftAt = groupCall.endedAt;
          }
        });

        await groupCall.save();
      }

      // If only one active participant remains, start a 30s timer to auto-end the call
      try {
        GroupCallController._ensureGlobalTimerMap();
        const timers = GroupCallController._noParticipantTimers;
        const callIdStr = groupCall._id.toString();

        if (groupCall.activeParticipants.length === 1) {
          // Clear existing timer if any
          if (timers.has(callIdStr)) {
            clearTimeout(timers.get(callIdStr));
            timers.delete(callIdStr);
          }

          console.log(`⏱️ Starting no-participant timer for call ${callIdStr} (30s)`);
          const t = setTimeout(async () => {
            try {
              // Re-fetch latest state
              await dbConnect();
              const fresh = await GroupCall.findById(callId);
              if (!fresh) return;
              if (fresh.activeParticipants.length <= 1 && fresh.status !== 'ended') {
                // End the call
                fresh.status = 'ended';
                fresh.endedAt = new Date();
                fresh.duration = Math.floor((fresh.endedAt - fresh.startedAt) / 1000);
                fresh.participants.forEach(p => {
                  if (p.status === 'invited') p.status = 'missed';
                  else if (p.status === 'joined' && !p.leftAt) p.leftAt = fresh.endedAt;
                });
                await fresh.save();

                // Emit event to notify all sockets in call room
                if (global.__io) {
                  try {
                    const io = global.__io;
                    io.to(fresh.callRoomId).emit('group_call_ended', { callId: fresh._id, reason: 'no_participants' });
                    console.log(`📣 Emitted group_call_ended for call ${fresh._id} reason=no_participants`);
                  } catch (e) {
                    console.warn('Failed to emit group_call_ended:', e);
                  }
                }
              }
            } catch (e) {
              console.error('Error in no-participant timer handler:', e);
            } finally {
              // Clean up timer map
              try { timers.delete(callIdStr); } catch (e) {}
            }
          }, 30 * 1000);

          timers.set(callIdStr, t);
        } else {
          // If more than one participant, ensure no timer is running
          if (timers.has(callIdStr)) {
            clearTimeout(timers.get(callIdStr));
            timers.delete(callIdStr);
            console.log(`⏱️ Cleared no-participant timer for call ${callIdStr} because participants increased`);
          }
        }
      } catch (e) {
        console.warn('Failed to manage no-participant timer on leave:', e);
      }

      // Notify other participants
      try {
        if (global.__io) {
          const io = global.__io;
          io.to(groupCall.callRoomId).emit('participantLeft', {
            callId: groupCall._id,
            userId,
            activeParticipants: groupCall.activeParticipants,
            callEnded: groupCall.status === 'ended'
          });
        }
      } catch (err) {
        console.error('Error emitting participant left event:', err);
      }

      return res.status(200).json({
        message: 'Left group call',
        callEnded: groupCall.status === 'ended'
      });
    } catch (error) {
      console.error('Error leaving group call:', error);
      return res.status(500).json(
        { message: 'Internal server error', error: error.message }
      );
    }
  }
}

module.exports = GroupCallController;