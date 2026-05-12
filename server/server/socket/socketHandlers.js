const handleAudioTranslation = require('./audioHandler');
const handleGroupCallAudioTranslation = require('./groupCallAudioHandler');
const User = require('../../lib/models/User');
const Chat = require('../../lib/models/Chat');
const Room = require('../../lib/models/Room');
const participantManager = require('../sfu/ParticipantManager');
const workerManager = require('../sfu/TranslationWorkerManager');

const pendingCalls = new Map(); // Store pending private calls for reconnection

module.exports = (io, users, rooms, findUserByUserId, userIdToSocketId) => {
  // Handle socket connections
  io.on('connection', async (socket) => {
    console.log('New client connected:', socket.id);

    const userId = socket.userId;
    const username = socket.user.username || socket.user.user?.username || 'Unknown';

    // Clean up any existing connections for this userId (handle multiple devices/tabs)
    if (userIdToSocketId[userId]) {
      const oldSid = userIdToSocketId[userId];
      if (oldSid !== socket.id) {
        console.log(`[socketHandlers] Cleaning up old connection for userId=${userId}, oldSocketId=${oldSid}`);
        delete users[oldSid];
      }
    }

    // Store user connection - KEY BY SOCKET ID for proper lookup in audio handler
    // Fetch latest user data from DB to get saved language preference
    let dbUser = null;
    try {
      dbUser = await User.findById(userId);
    } catch (err) {
      console.warn(`Failed to fetch user ${userId} from DB during registration`);
    }

    const finalUsername = dbUser?.username || username;
    const preferredLanguage = dbUser?.preferredLanguage || 'en';

    users[socket.id] = {
      socketId: socket.id,
      userId: userId,
      username: finalUsername,
      status: 'online',
      lastActive: new Date(),
      preferredLanguage: preferredLanguage
    };
    userIdToSocketId[userId] = socket.id;

    // Join a private room for this user to receive direct notifications regardless of active chat room
    socket.join(`user_${userId}`);
    console.log(`   🏠 Socket ${socket.id} joined private room: user_${userId}`);

    // Update user status in database
    try {
      const userIdStr = String(userId);
      await User.findByIdAndUpdate(userId, {
        status: 'online',
        lastActive: new Date(),
        socketId: socket.id
      });
      console.log(`[socketHandlers] User registered: socketId=${socket.id}, userId=${userIdStr}, username=${finalUsername}, lang=${preferredLanguage}`);
    } catch (error) {
      console.error(`[socketHandlers] Failed to update user status in DB for userId=${userId}:`, error);
    }

    // Broadcast user online status
    socket.broadcast.emit('userStatusChange', {
      userId,
      status: 'online'
    });

    // Initialize audio translation handlers
    handleAudioTranslation(io, socket, users, userIdToSocketId);
    handleGroupCallAudioTranslation(io, socket, users, userIdToSocketId);

    // Re-emit any pending calls upon reconnection (handles browser refresh during ringing)
    const pendingCall = pendingCalls.get(userId);
    if (pendingCall && (Date.now() - pendingCall.timestamp < 60000)) { // 60s timeout
      console.log(`📡 Resending pending incomingCall to reconnected user ${userId}`);
      setTimeout(() => {
        if (users[socket.id]) {
          socket.emit('incomingCall', pendingCall);
        }
      }, 1000);
    } else if (pendingCall) {
      pendingCalls.delete(userId); // Clean up expired
    }

    // Handle language preference updates
    socket.on('updateLanguagePreference', (data) => {
      const { language } = data;
      if (language && users[socket.id]) {
        users[socket.id].preferredLanguage = language;

        // Keep ParticipantManager in sync for any active group call
        const callRoomId = participantManager.findRoomForUser(String(userId));
        if (callRoomId) {
          participantManager.updateLanguage(callRoomId, userId, language);
        }

        socket.broadcast.emit('userLanguageChanged', {
          userId: userId,
          preferredLanguage: language
        });

        socket.emit('languagePreferenceUpdated', {
          language,
          success: true
        });
      }
    });

    // Handle user joining a room
    socket.on('joinRoom', (roomId) => {
      socket.join(roomId);
      console.log(`User ${userId} joined room ${roomId}`);

      if (!rooms[roomId]) {
        rooms[roomId] = new Set();
      }
      rooms[roomId].add(userId);

      socket.to(roomId).emit('userJoinedRoom', {
        userId,
        username: socket.user.username,
        roomId
      });
    });

    // Handle leaving a room
    socket.on('leaveRoom', (roomId) => {
      socket.leave(roomId);
      console.log(`User ${userId} left room ${roomId}`);

      if (rooms[roomId]) {
        rooms[roomId].delete(userId);
        if (rooms[roomId].size === 0) {
          delete rooms[roomId];
        }
      }

      socket.to(roomId).emit('userLeftRoom', {
        userId,
        username: socket.user.username,
        roomId
      });
    });


    // Client acknowledges that a message was delivered to them
    socket.on('messageDelivered', async (data) => {
      const { messageId, clientTempId } = data || {};
      if (!messageId) return;

      try {
        const updated = await Chat.findByIdAndUpdate(messageId, {
          status: 'delivered',
          deliveredAt: new Date()
        }, { new: true });

        if (updated) {
          const senderId = (updated.sender || '').toString();
          const ioInstance = global.__io;
          if (ioInstance && senderId) {
            const sockets = Array.from(ioInstance.of('/').sockets.values());
            sockets.forEach(s => {
              if (s.user && (s.user.userId === senderId || s.user.userId === senderId.toString())) {
                console.log(`📨 Emitting messageStatusUpdate to sender (${senderId}): messageId=${messageId}, status=delivered`);
                ioInstance.to(s.id).emit('messageStatusUpdate', {
                  messageId: updated._id,
                  status: 'delivered',
                  clientTempId: clientTempId || null
                });
              }
            });
          }
        }
      } catch (err) {
        console.error('Error marking message as delivered:', err);
      }
    });

    // Client marks one or more messages as seen/read
    socket.on('messageSeen', async (data) => {
      const { messageIds } = data || {};
      if (!messageIds || !Array.isArray(messageIds) || messageIds.length === 0) return;

      console.log(`👁️ messageSeen received for ${messageIds.length} messages from user ${userId}`);

      try {
        const ioInstance = global.__io;

        for (const mid of messageIds) {
          try {
            const updated = await Chat.findByIdAndUpdate(mid, {
              status: 'seen',
              seenAt: new Date()
            }, { new: true });

            if (updated) {
              const senderId = (updated.sender || '').toString();
              console.log(`📕 Message ${mid} marked as seen, notifying sender (${senderId})`);

              if (ioInstance && senderId) {
                const sockets = Array.from(ioInstance.of('/').sockets.values());
                sockets.forEach(s => {
                  if (s.user && (s.user.userId === senderId || s.user.userId === senderId.toString())) {
                    console.log(`   ✅ Emitting messageStatusUpdate (seen) to sender socket ${s.id}`);
                    ioInstance.to(s.id).emit('messageStatusUpdate', {
                      messageId: updated._id,
                      status: 'seen'
                    });
                  }
                });
              }
            }
          } catch (innerErr) {
            console.error('Failed to update seen for message', mid, innerErr);
          }
        }
      } catch (err) {
        console.error('Error processing messageSeen:', err);
      }
    });

    // Handle typing indicator
    socket.on('typing', (data) => {
      const { receiverId, roomId, isTyping } = data;

      if (receiverId) {
        const receiverUser = findUserByUserId(receiverId);
        if (receiverUser) {
          io.to(receiverUser.socketId).emit('userTyping', {
            userId,
            username: socket.user.username,
            isTyping
          });
        }
      } else if (roomId) {
        socket.to(roomId).emit('userTyping', {
          userId,
          username: socket.user.username,
          isTyping
        });
      }
    });

    // WebRTC signaling events
    socket.on('callUser', (data) => {
      const { to, offer, callType, roomId } = data;
      console.log(`📞 Call initiated: from=${userId} to=${to}, callType=${callType}, roomId=${roomId}`);

      if (roomId) {
        // Group call — notify via user private rooms so offline-from-chat members also receive it.
        // The REST /group-call/initiate is the preferred path; this covers direct socket initiations.
        (async () => {
          try {
            const room = await Room.findById(roomId).select('participants name').lean();
            if (!room) {
              console.warn(`[callUser] Room ${roomId} not found`);
              return;
            }
            const payload = {
              from: userId,
              fromName: users[socket.id]?.username || socket.user.username,
              callType,
              roomId,
              roomName: room.name,
              callRoomId: data.callRoomId || roomId,
              callId: data.callId || null,
              initiatorId: String(userId),
              initiator: { username: users[socket.id]?.username || socket.user.username }
            };
            let sentCount = 0;
            for (const participantId of room.participants) {
              const pIdStr = String(participantId);
              if (pIdStr === String(userId)) continue; // skip self
              io.to(`user_${pIdStr}`).emit('group_incoming_call', payload);
              sentCount++;
            }
            console.log(`[socketHandlers] [callUser] Notified ${sentCount} group members for room ${roomId}`);
          } catch (err) {
            console.error('Error emitting group incomingCall:', err);
          }
        })();
      } else {
        // Private call
        const toUser = findUserByUserId(to);

        // Store pending call for reconnection
        pendingCalls.set(to, {
          from: userId,
          fromName: socket.user.username,
          offer,
          callType,
          timestamp: Date.now()
        });

        if (toUser) {
          const targetSocket = io.sockets.sockets.get(toUser.socketId);
          if (targetSocket) {
            io.to(toUser.socketId).emit('incomingCall', {
              from: userId,
              fromName: socket.user.username,
              fromLanguage: socket.user.preferredLanguage || 'en',
              offer,
              callType
            });
            socket.emit('incomingCallDelivered', { to, socketId: toUser.socketId });
          } else {
            delete users[toUser.socketId];
            socket.emit('userUnavailable', { to });
          }
        }
      }
    });

    socket.on('answerCall', (data) => {
      const { to, answer, roomId } = data;

      if (roomId) {
        socket.to(roomId).emit('callAnswered', {
          from: userId,
          answer,
          roomId
        });
      } else {
        pendingCalls.delete(userId); // Callee answered, clear pending call
        const toUser = findUserByUserId(to);
        if (toUser) {
          io.to(toUser.socketId).emit('callAnswered', {
            from: userId,
            fromLanguage: socket.user.preferredLanguage || 'en',
            answer
          });
        }
      }
    });

    socket.on('iceCandidate', (data) => {
      const { to, candidate, roomId } = data;

      if (roomId) {
        socket.to(roomId).emit('iceCandidate', {
          from: userId,
          candidate,
          roomId
        });
      } else {
        const toUser = findUserByUserId(to);
        if (toUser) {
          io.to(toUser.socketId).emit('iceCandidate', {
            from: userId,
            candidate
          });
        }
      }
    });

    socket.on('endCall', (data) => {
      const { to, roomId } = data;

      if (roomId) {
        socket.to(roomId).emit('callEnded', {
          from: userId,
          roomId
        });
      } else {
        pendingCalls.delete(userId);
        pendingCalls.delete(to);

        const toUser = findUserByUserId(to);
        if (toUser) {
          io.to(toUser.socketId).emit('callEnded', {
            from: userId
          });
        }
      }
    });

    // Handle incomingCallAck - relay from callee to caller
    socket.on('incomingCallAck', (data) => {
      const { callerId, callSessionId } = data;
      console.log(`📣 incomingCallAck from userId=${userId} (callee) to userId=${callerId} (caller)`);

      const callerUser = findUserByUserId(callerId);
      if (callerUser) {
        io.to(callerUser.socketId).emit('incomingCallAck', {
          from: userId,
          callSessionId: callSessionId
        });
      }
    });

    // Handle userBusy - relay from callee to caller
    socket.on('userBusy', (data) => {
      const { to, callSessionId } = data;
      console.log(`📣 userBusy from userId=${userId} (callee) to userId=${to} (caller)`);

      pendingCalls.delete(userId);
      pendingCalls.delete(to);

      const toUser = findUserByUserId(to);
      if (toUser) {
        io.to(toUser.socketId).emit('userBusy', {
          from: userId,
          callSessionId: callSessionId
        });
      }
    });

    // Group call events (SFU-based — WebRTC mesh signaling removed)
    socket.on('joinGroupCall', (data) => {
      const { callRoomId } = data;
      console.log(`👥 User ${userId} joining group call room: ${callRoomId}`);

      // Join Socket.IO room for translation events (NOT for WebRTC signaling)
      socket.join(callRoomId);

      // Register in ParticipantManager for language routing
      participantManager.handleJoin(callRoomId, userId, {
        socketId: socket.id,
        username: users[socket.id]?.username || socket.user.username || 'Unknown',
        preferredLanguage: users[socket.id]?.preferredLanguage || 'en',
      });

      // Notify others that someone joined
      socket.to(callRoomId).emit('participant_joined', {
        userId,
        username: socket.user.username,
        socketId: socket.id,
      });

      // Send current participant list to the joiner (for UI display — LiveKit handles media)
      const roomParticipants = participantManager.getRoomParticipants(callRoomId);
      const participantList = [];
      for (const [uid, meta] of roomParticipants) {
        if (uid !== String(userId)) {
          participantList.push({ 
            userId: uid, 
            username: meta.username, 
            socketId: meta.socketId,
            preferredLanguage: meta.preferredLanguage
          });
        }
      }
      socket.emit('existingParticipants', { callRoomId, participants: participantList });
    });

    socket.on('leaveGroupCall', (data) => {
      const { callRoomId } = data;
      console.log(`👥 User ${userId} leaving group call room: ${callRoomId}`);

      socket.leave(callRoomId);
      const { remainingCount } = participantManager.handleLeave(callRoomId, userId);

      socket.to(callRoomId).emit('participant_disconnected', {
        userId,
        username: socket.user.username,
        socketId: socket.id,
        reason: 'left',
      });

      // Destroy LiveKit translation tracks when the room is empty
      if (remainingCount === 0) {
        workerManager.destroyWorker(callRoomId).catch(() => {});
      }
    });

    // groupCallOffer / groupCallAnswer / groupCallIceCandidate removed:
    // LiveKit SFU now handles all WebRTC media negotiation internally.

    socket.on('groupCallSpeaking', (data) => {
      const { callRoomId, isSpeaking } = data;
      socket.to(callRoomId).emit('participantSpeaking', {
        userId,
        username: socket.user.username,
        isSpeaking,
      });
    });

    // Handle explicit user logout
    socket.on('userLogout', async () => {
      console.log('User logout event received:', socket.id);

      const user = users[socket.id];
      if (user) {
        const userId = user.userId;

        // Update database immediately
        try {
          await User.findByIdAndUpdate(userId, {
            status: 'offline',
            lastActive: new Date(),
            socketId: null
          });
          console.log(`✅ User logout DB updated for userId=${userId}`);
        } catch (error) {
          console.error(`❌ Failed to update user logout status in DB:`, error);
        }

        // Notify other clients
        socket.broadcast.emit('userStatusChange', {
          userId,
          status: 'offline'
        });

        // Remove from memory
        delete users[socket.id];
      }
    });

    // Handle disconnect (browser close, network issues, etc.)
    socket.on('disconnect', async (reason) => {
      console.log('Client disconnected:', socket.id, 'Reason:', reason);

      const user = users[socket.id];
      if (user) {
        const userId = user.userId;
        user.status = 'offline';
        user.lastActive = new Date();

        // Update database immediately
        try {
          await User.findByIdAndUpdate(userId, {
            status: 'offline',
            lastActive: new Date(),
            socketId: null
          });
          console.log(`✅ User disconnect DB updated for userId=${userId}`);
        } catch (error) {
          console.error(`❌ Failed to update user disconnect status in DB:`, error);
        }

        // Broadcast offline status
        socket.broadcast.emit('userStatusChange', {
          userId,
          status: 'offline'
        });

        // Clean up from SFU ParticipantManager if user was in a group call
        const callRoomId = participantManager.findRoomForUser(String(userId));
        if (callRoomId) {
          const { remainingCount } = participantManager.handleLeave(callRoomId, userId);
          try {
            socket.to(callRoomId).emit('participant_disconnected', {
              userId,
              username: socket.user?.username || 'Unknown',
              reason: 'disconnect',
            });
          } catch (e) {
            console.warn('[socketHandlers] Failed to emit participant_disconnected', e);
          }
          if (remainingCount === 0) {
            workerManager.destroyWorker(callRoomId).catch(() => {});
          }
        }

        // Emit participant_disconnected to any chat/messaging rooms the socket was part of
        Object.keys(rooms).forEach(roomId => {
          if (rooms[roomId]?.has(userId)) {
            rooms[roomId].delete(userId);
            try {
              socket.to(roomId).emit('participant_disconnected', {
                userId,
                username: socket.user?.username || 'Unknown',
                reason: 'disconnect'
              });
            } catch (e) {
              console.warn('Failed to emit participant_disconnected for room', roomId, e);
            }

            if (rooms[roomId].size === 0) {
              delete rooms[roomId];
            }
          }
        });

        // Clean up from memory immediately
        if (userIdToSocketId[userId] === socket.id) {
          delete userIdToSocketId[userId];
        }
        delete users[socket.id];
      }
    });

    // Handle heartbeat/ping to update lastActive
    socket.on('ping', async () => {
      const user = users[socket.id];
      if (user) {
        user.lastActive = new Date();

        // Periodically update DB (throttled - every 30 seconds)
        if (!user.lastDbUpdate || (Date.now() - user.lastDbUpdate) > 30000) {
          user.lastDbUpdate = Date.now();
          try {
            await User.findByIdAndUpdate(user.userId, {
              lastActive: new Date()
            });
          } catch (error) {
            console.error('Failed to update lastActive in DB:', error);
          }
        }

        socket.emit('pong');
      }
    });
  });
};