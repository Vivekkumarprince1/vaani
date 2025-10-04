import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true
  },
  mobileNumber: {
    type: String,
    required: true,
    unique: true
  },
  password: {
    type: String,
    required: true
  },
  email: String,
  preferredLanguage: {
    type: String,
    default: 'en'
  },
  socketId: String,
  status: {
    type: String,
    enum: ['online', 'offline'],
    default: 'offline'
  },
  lastActive: {
    type: Date,
    default: Date.now
  }
}, { timestamps: true });

const User = mongoose.models.User || mongoose.model('User', userSchema);

export default User;