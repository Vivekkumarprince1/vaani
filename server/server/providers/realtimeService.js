const axios = require('axios');
const providerManager = require('./providerManager');

/**
 * Creates an ephemeral session token for OpenAI Realtime Speech-to-Speech (Version A)
 */
async function createRealtimeSession({ voice, instructions } = {}) {
  const { config } = providerManager.getActiveProvider('realtime');
  const apiKey = config.apiKey || process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error('OpenAI Realtime API key is not configured');
  }

  const model = config.model || 'gpt-4o-realtime-preview';
  const selectedVoice = voice || config.voice || 'alloy';
  const defaultInstructions = instructions || config.instructions || 
    'You are a real-time speech translator. Listen to audio and immediately translate and speak in the target language.';

  try {
    const response = await axios.post(
      'https://api.openai.com/v1/realtime/sessions',
      {
        model,
        voice: selectedVoice,
        instructions: defaultInstructions,
        modalities: ['audio', 'text']
      },
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      }
    );

    return {
      success: true,
      clientSecret: response.data.client_secret?.value,
      sessionId: response.data.id,
      model: response.data.model,
      voice: response.data.voice
    };
  } catch (err) {
    console.error('[createRealtimeSession] Error:', err.response?.data || err.message);
    throw new Error(err.response?.data?.error?.message || 'Failed to initialize OpenAI Realtime session');
  }
}

module.exports = {
  createRealtimeSession
};
