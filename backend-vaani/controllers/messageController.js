const connectDB = require('../lib/db');
const Chat = require('../lib/models/Chat');
const User = require('../lib/models/User');

class MessageController {
  /**
   * Send a message
   */
  static async sendMessage(req, res) {
    try {
      await connectDB();

      const decoded = req.user; // From authentication middleware
      const { receiverId, content, roomId, clientTempId } = req.body;

      if (!content) {
        return res.status(400).json({ error: 'Message content is required' });
      }

      const sender = await User.findById(decoded.userId);
      const originalLanguage = sender.preferredLanguage || 'en';

      const newMessage = new Chat({
        sender: decoded.userId,
        originalContent: content,
        content: content,
        originalLanguage,
        // mark as sent when saved to DB
        status: 'sent',
        timestamp: new Date(),
        translations: new Map()
      });

      if (roomId) {
        newMessage.room = roomId;
        newMessage.isGroupMessage = true;
      } else if (receiverId) {
        newMessage.receiver = receiverId;
      } else {
        return res.status(400).json({ error: 'Either receiverId or roomId is required' });
      }

      // Create an optimistic populated message for instant Fire-and-Forget emission
      const optimisticMessage = {
        _id: newMessage._id,
        sender: {
          _id: sender._id,
          username: sender.username,
          preferredLanguage: sender.preferredLanguage
        },
        receiver: receiverId ? { _id: receiverId } : null,
        room: roomId || null,
        isGroupMessage: !!roomId,
        originalContent: content,
        content: content,
        originalLanguage,
        status: 'sent',
        timestamp: newMessage.timestamp,
        clientTempId: clientTempId || null
      };

      // 🔥 ZERO-LATENCY EMIT: Fire the socket event BEFORE the database save
      try {
        const io = global.__io;
        if (io) {
          if (roomId) {
            // Emit to the room
            io.to(roomId).emit('receiveMessage', optimisticMessage);
          } else if (receiverId) {
            // Emit to RECEIVER and SENDER
            const sockets = Array.from(io.of('/').sockets.values());
            sockets.forEach(s => {
              if (s.user && (s.user.userId === receiverId || s.user.userId === receiverId.toString())) {
                io.to(s.id).emit('receiveMessage', optimisticMessage);
              }
              if (s.user && (s.user.userId === decoded.userId || s.user.userId === decoded.userId.toString())) {
                io.to(s.id).emit('receiveMessage', optimisticMessage);
              }
            });
          }
        }
      } catch (emitErr) {
        console.warn('Failed to optimistically emit message:', emitErr);
      }

      // Now save to database
      await newMessage.save();

      // Emit status update to sender indicating database persistence
      try {
        const io = global.__io;
        if (io) {
          const sockets = Array.from(io.of('/').sockets.values());
          sockets.forEach(s => {
            if (s.user && (s.user.userId === decoded.userId || s.user.userId === decoded.userId.toString())) {
              io.to(s.id).emit('messageStatusUpdate', {
                messageId: newMessage._id,
                status: 'sent',
                clientTempId: clientTempId || null
              });
            }
          });
        }
      } catch (statusErr) {
        console.warn('Failed to emit messageStatusUpdate:', statusErr);
      }

      return res.status(201).json(optimisticMessage);
    } catch (err) {
      console.error('Error saving message:', err);
      if (err.message.includes('authorization')) {
        return res.status(401).json({ msg: err.message });
      }
      return res.status(500).json({ error: 'Failed to save message' });
    }
  }
}

module.exports = MessageController;