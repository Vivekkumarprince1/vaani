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

const Chat = mongoose.models.Chat || mongoose.model('Chat', chatSchema);

module.exports = Chat;