const mongoose = require('mongoose');

const providerConfigSchema = new mongoose.Schema({
  category: {
    type: String,
    enum: ['pipeline', 'realtime', 'stt', 'tts', 'translation', 'sfu'],
    required: true,
    unique: true
  },
  activeProvider: {
    type: String,
    required: true
  },
  providers: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, { timestamps: true });

const ProviderConfig = mongoose.models.ProviderConfig || mongoose.model('ProviderConfig', providerConfigSchema);

module.exports = ProviderConfig;
