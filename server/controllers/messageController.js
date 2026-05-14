const connectDB = require('../lib/db');
const Chat = require('../lib/models/Chat');
const User = require('../lib/models/User');

// ─── Cloudinary init ────────────────────────────────────────────────────────
const { v2: cloudinary } = require('cloudinary');
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

class MessageController {
  /**
   * Send a message
   */
  static async sendMessage(req, res) {
    try {
      await connectDB();

      const decoded = req.user;
      const { receiverId, content, roomId, clientTempId, media } = req.body;

      if ((!content || content.trim() === '') && !media) {
        return res.status(400).json({ error: 'Message content or media is required' });
      }

      const sender = await User.findById(decoded.userId);
      const originalLanguage = sender.preferredLanguage || 'en';

      const newMessage = new Chat({
        sender: decoded.userId,
        originalContent: content || '',
        content: content || '',
        originalLanguage,
        status: 'sent',
        timestamp: new Date(),
        translations: new Map()
      });

      if (media) {
        if (media.url) {
          // ✅ New path: Cloudinary-uploaded media — store URL only
          newMessage.media = {
            filename: media.filename,
            mimeType: media.mimeType,
            size: media.size,
            url: media.url,
            publicId: media.publicId || null,
            resourceType: media.resourceType || 'auto',
          };
        } else if (media.data) {
          // 🔄 Legacy path: base64 body upload (kept for backward compatibility)
          const buffer = Buffer.from(media.data, 'base64');
          newMessage.media = {
            filename: media.filename,
            mimeType: media.mimeType,
            data: buffer,
            size: media.size,
          };
        }
      }

      if (roomId) {
        newMessage.room = roomId;
        newMessage.isGroupMessage = true;
      } else if (receiverId) {
        newMessage.receiver = receiverId;
      } else {
        return res.status(400).json({ error: 'Either receiverId or roomId is required' });
      }

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
        originalContent: content || '',
        content: content || '',
        originalLanguage,
        media: newMessage.media ? {
          filename: newMessage.media.filename,
          mimeType: newMessage.media.mimeType,
          size: newMessage.media.size,
          url: newMessage.media.url || null,
          publicId: newMessage.media.publicId || null,
          resourceType: newMessage.media.resourceType || null,
          // Legacy base64 data (only for old buffer-stored media)
          ...(newMessage.media.data ? { data: newMessage.media.data.toString('base64') } : {})
        } : null,
        status: 'sent',
        timestamp: newMessage.timestamp,
        clientTempId: clientTempId || null
      };

      // 🔥 ZERO-LATENCY EMIT: Fire the socket event BEFORE the database save.
      // This ensures the message reaches the recipient as fast as possible.
      // The client will correlate this message using the clientTempId.
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

  /**
   * Get media from a message
   */
  static async getMedia(req, res) {
    try {
      await connectDB();

      const { messageId } = req.params;
      const decoded = req.user;

      const message = await Chat.findById(messageId);

      if (!message) {
        return res.status(404).json({ error: 'Message not found' });
      }

      // Check if user has access to this message
      const userId = decoded.userId;
      const isOwner = message.sender.toString() === userId || message.receiver?.toString() === userId;

      if (!isOwner && message.room) {
        // For group messages, verify user is in the room
        const Room = require('../lib/models/Room');
        const room = await Room.findById(message.room);
        if (!room || !room.members.includes(userId)) {
          return res.status(403).json({ error: 'Access denied' });
        }
      } else if (!isOwner) {
        return res.status(403).json({ error: 'Access denied' });
      }

      // ✅ New: Cloudinary-backed — redirect to signed URL
      if (message.media?.url) {
        return res.redirect(message.media.url);
      }

      // 🔄 Legacy: stream raw buffer
      if (!message.media || !message.media.data) {
        return res.status(404).json({ error: 'No media in this message' });
      }

      res.set('Content-Type', message.media.mimeType);
      res.set('Content-Disposition', `attachment; filename="${message.media.filename}"`);
      res.set('Content-Length', message.media.data.length);
      res.send(message.media.data);
    } catch (err) {
      console.error('Error getting media:', err);
      return res.status(500).json({ error: 'Failed to retrieve media' });
    }
  }
}

module.exports = MessageController;