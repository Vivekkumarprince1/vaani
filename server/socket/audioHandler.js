/**
 * Handle audio translation functionality
 * @param {Object} io - Socket.IO instance
 * @param {Object} socket - Socket connection
 * @param {Object} users - Active users object
 */
const { translateSpeech, recognizeSpeech, translateText } = require('../utils/speechTranslator');

const handleAudioTranslation = (io, socket, users) => {
  // Add event listener for client-side ready state
  socket.on('audioSystemReady', (data) => {
    console.log('Client audio system ready:', data);
    socket.audioSystemReady = true;
  });
  
  // NEW: Handle speech recognition only (voice-to-text)
  socket.on('recognizeSpeech', async (data) => {
    try {
      const { audio, sourceLanguage, userId, requestId } = data;
      console.log('\n🎤 [SPEECH RECOGNITION] Voice to Text Only');
      console.log(`   📝 Language: ${sourceLanguage}`);
      console.log(`   🆔 Request: ${requestId || 'none'}`);
      
      // Validate input data
      if (!audio || audio.length < 100) {
        console.warn('Invalid audio data received');
        socket.emit('error', { 
          message: 'Invalid audio data',
          requestId
        });
        return;
      }
      
      // Find receiver's socket ID
      const receiverSocketId = Object.keys(users).find(
        key => users[key].userId === userId
      );
      
      if (!receiverSocketId) {
        console.error('Receiver not found or not online:', userId);
        socket.emit('error', { 
          message: 'Receiver not found or not online',
          requestId
        });
        return;
      }
      
      // Convert base64 to buffer
      let audioBuffer;
      try {
        audioBuffer = Buffer.from(audio, 'base64');
      } catch (err) {
        console.error('Error decoding audio data:', err);
        socket.emit('error', { 
          message: 'Invalid audio data format',
          requestId
        });
        return;
      }
      
      // Recognize speech (voice-to-text only)
      const recognizedText = await recognizeSpeech(audioBuffer, sourceLanguage);
      
      if (!recognizedText || !recognizedText.trim()) {
        console.log('No speech detected or empty transcription');
        return;
      }
      
      // Send recognized text to both parties
      socket.emit('recognizedSpeech', {
        text: recognizedText,
        isLocal: true,
        requestId
      });
      
      io.to(receiverSocketId).emit('recognizedSpeech', {
        text: recognizedText,
        isLocal: false,
        requestId
      });
      
      console.log(`✅ Speech recognized: "${recognizedText}"`);
    } catch (error) {
      console.error('Error in speech recognition:', error);
      socket.emit('error', {
        message: 'Speech recognition failed',
        requestId: data.requestId
      });
    }
  });
  
  // NEW: Handle text translation only
  socket.on('translateText', async (data) => {
    try {
      let { text, sourceLanguage, targetLanguage, userId, requestId } = data;
      console.log('\n📝 [TEXT TRANSLATION] Text Only');
      console.log(`   📝 ${sourceLanguage} → ${targetLanguage}`);
      console.log(`   🆔 Request: ${requestId || 'none'}`);
      
      // Find receiver's socket ID
      const receiverSocketId = Object.keys(users).find(
        key => users[key].userId === userId
      );
      
      if (!receiverSocketId) {
        console.error('Receiver not found or not online:', userId);
        socket.emit('error', { 
          message: 'Receiver not found or not online',
          requestId
        });
        return;
      }
      
      // Get receiver's preferred language
      const receiverData = users[receiverSocketId];
      targetLanguage = receiverData.preferredLanguage || targetLanguage || 'en';
      
      console.log(`   🎯 Target language set to receiver's preference: ${targetLanguage}`);
      
      // Validate input data
      if (!text || !text.trim()) {
        console.warn('Invalid text data received');
        socket.emit('error', { 
          message: 'Invalid text data',
          requestId
        });
        return;
      }
      
      // Translate text
      const translatedText = await translateText(text, sourceLanguage, targetLanguage);
      
      if (!translatedText) {
        console.log('Translation failed or empty result');
        socket.emit('error', { 
          message: 'Translation failed',
          requestId
        });
        return;
      }
      
      // Send translated text to both parties
      socket.emit('translatedText', {
        originalText: text,
        translatedText,
        isLocal: true,
        targetLanguage,
        requestId
      });
      
      io.to(receiverSocketId).emit('translatedText', {
        originalText: text,
        translatedText,
        isLocal: false,
        targetLanguage,
        requestId
      });
      
      console.log(`✅ Text translated: "${text}" → "${translatedText}"`);
    } catch (error) {
      console.error('Error in text translation:', error);
      socket.emit('error', {
        message: 'Text translation failed',
        requestId: data.requestId
      });
    }
  });
  
  
  // NEW: Handle text-to-speech generation request
  socket.on('generateTTS', async (data) => {
    try {
      const { text, targetLanguage, requestId } = data;
      console.log('\n🔊 [TEXT-TO-SPEECH] Generate Audio');
      console.log(`   📝 Text: "${text}"`);
      console.log(`   🌐 Language: ${targetLanguage}`);
      console.log(`   🆔 Request: ${requestId || 'none'}`);
      
      // Validate input
      if (!text || !text.trim()) {
        console.warn('Invalid text for TTS');
        socket.emit('ttsError', { 
          message: 'Invalid text for TTS',
          requestId
        });
        return;
      }
      
      // Import textToSpeech function
      const { textToSpeech } = require('../utils/speechTranslator');
      
      // Generate audio from text
      const { audio: audioBuffer, error: ttsError } = await textToSpeech(text, targetLanguage);
      
      if (ttsError || !audioBuffer) {
        console.error('TTS generation failed:', ttsError);
        socket.emit('ttsError', { 
          message: ttsError || 'TTS generation failed',
          requestId
        });
        return;
      }
      
      // Convert to base64
      const audioBase64 = audioBuffer.toString('base64');
      console.log(`✅ TTS audio generated: ${audioBuffer.length} bytes`);
      
      // Send audio back to client
      socket.emit('ttsAudio', {
        audio: audioBase64,
        requestId,
        timestamp: Date.now()
      });
      
    } catch (error) {
      console.error('Error in generateTTS handler:', error);
      socket.emit('ttsError', {
        message: 'TTS generation failed: ' + (error.message || 'Unknown error'),
        requestId: data?.requestId
      });
    }
  });
  
  // Add a ping/pong mechanism to check client audio system readiness
  socket.on('pingAudioSystem', () => {
    socket.emit('pongAudioSystem', { timestamp: Date.now() });
  });

  // Handle request for call participant information
  socket.on('getCallParticipantInfo', async (data) => {
    try {
      const { userId } = data;
      
      if (!userId) {
        console.warn('getCallParticipantInfo: No userId provided');
        return;
      }

      // Find the participant's socket
      const participantSocketId = Object.keys(users).find(
        key => users[key].userId === userId
      );

      if (!participantSocketId) {
        console.warn(`getCallParticipantInfo: User ${userId} not found in active users`);
        socket.emit('callParticipantInfo', {
          participantInfo: null,
          error: 'User not found or offline'
        });
        return;
      }

      const participantData = users[participantSocketId];
      
      // Use the preferredLanguage stored in the users object
      // This is updated when user changes language via 'updateLanguagePreference' event
      const participantInfo = {
        id: userId,
        name: participantData.username || 'Unknown',
        preferredLanguage: participantData.preferredLanguage || 'en',
        socketId: participantSocketId
      };

      console.log('📞 Sending call participant info:', participantInfo);

      socket.emit('callParticipantInfo', {
        participantInfo,
        error: null
      });
    } catch (error) {
      console.error('Error getting call participant info:', error);
      socket.emit('callParticipantInfo', {
        participantInfo: null,
        error: error.message
      });
    }
  });
  
  // NEW: Handle full speech translation pipeline (STT -> Translation -> TTS)
  socket.on('translateSpeech', async (data) => {
    try {
      const { audio, sourceLanguage, targetLanguage, userId, requestId } = data;
      console.log('\n🎯 [FULL SPEECH TRANSLATION] Complete Pipeline');
      console.log(`   📝 ${sourceLanguage} → ${targetLanguage}`);
      console.log(`   🆔 Request: ${requestId || 'none'}`);
      
      // Validate input data
      if (!audio || audio.length < 100) {
        console.error('Invalid audio data received');
        socket.emit('error', {
          message: 'Invalid audio data',
          requestId
        });
        return;
      }
      
      // Find receiver's socket ID
      const receiverSocketId = Object.keys(users).find(
        key => users[key].userId === userId
      );
      
      if (!receiverSocketId) {
        console.error('Receiver not found:', userId);
        socket.emit('error', {
          message: 'Receiver not found',
          requestId
        });
        return;
      }
      
      // Convert base64 to buffer
      let audioBuffer;
      try {
        audioBuffer = Buffer.from(audio, 'base64');
      } catch (err) {
        console.error('Error converting audio from base64:', err);
        socket.emit('error', {
          message: 'Invalid audio format',
          requestId
        });
        return;
      }
      
      // Get receiver's preferred language
      const receiverData = users[receiverSocketId];
      const finalTargetLanguage = receiverData.preferredLanguage || targetLanguage || 'en';
      
      console.log(`   🎯 Target language set to receiver's preference: ${finalTargetLanguage}`);
      
      // Use the complete speech translation pipeline
      const { translateSpeech } = require('../utils/speechTranslator');
      const result = await translateSpeech(audioBuffer, sourceLanguage, finalTargetLanguage);
      
      if (result.error) {
        console.error('Speech translation pipeline error:', result.error);
        socket.emit('error', {
          message: 'Speech translation failed: ' + result.error,
          requestId
        });
        return;
      }
      
      // Convert audio buffer to base64 if available
      let audioBase64 = null;
      if (result.audio) {
        audioBase64 = result.audio.toString('base64');
        console.log(`✅ Full pipeline completed: ${result.audio.length} bytes audio generated`);
      } else {
        console.warn('No audio generated from TTS');
      }
      
      // Send complete result to both parties
      const responseData = {
        text: result.text,
        audio: audioBase64,
        isLocal: true,
        targetLanguage: finalTargetLanguage,
        requestId
      };
      
      // Send to sender (local)
      socket.emit('translatedSpeech', responseData);
      
      // Send to receiver (remote) - they get the translated audio and text
      responseData.isLocal = false;
      io.to(receiverSocketId).emit('translatedSpeech', responseData);
      
      console.log(`✅ Full speech translation completed: "${result.text.original}" → "${result.text.translated}"`);
    } catch (error) {
      console.error('Error in full speech translation pipeline:', error);
      socket.emit('error', {
        message: 'Full speech translation failed',
        requestId: data.requestId
      });
    }
  });
};

module.exports = handleAudioTranslation;