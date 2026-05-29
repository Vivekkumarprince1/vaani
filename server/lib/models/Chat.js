const mongoose = require('mongoose');

const chatSchema = new mongoose.Schema({
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  receiver: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  originalContent: {
    type: String
  },
  content: {
    type: String
  },
  originalLanguage: {
    type: String,
    default: 'en'
  },
  translations: {
    type: Map,
    of: String,
    default: new Map()
  },
  // Media support (Cloudinary-backed)
  media: {
    type: {
      filename: String,
      mimeType: String,
      size: Number,
      // Cloudinary fields (new)
      url: String,
      publicId: String,
      resourceType: String,
      // Legacy buffer field — kept for backward compatibility with old messages only
      data: Buffer,
    }
  },
  // Message delivery/read status
  status: {
    type: String,
    enum: ['queued', 'sent', 'delivered', 'seen'],
    default: 'sent'
  },
  deliveredAt: {
    type: Date
  },
  seenAt: {
    type: Date
  },
  timestamp: {
    type: Date,
    default: Date.now
  },
  room: {
    type: String
  },
  isGroupMessage: {
    type: Boolean,
    default: false
  }
});

// Indexes for the chat-history read path (historyController.getHistory).
// The 1:1 query is an $or over both sender/receiver directions, so index both
// orderings; each branch then resolves via a single indexed range scan on
// timestamp (which also serves the newest-first sort + `before` cursor).
chatSchema.index({ sender: 1, receiver: 1, timestamp: -1 });
chatSchema.index({ receiver: 1, sender: 1, timestamp: -1 });
// Room (group) history query.
chatSchema.index({ room: 1, timestamp: -1 });

const Chat = mongoose.models.Chat || mongoose.model('Chat', chatSchema);

module.exports = Chat;