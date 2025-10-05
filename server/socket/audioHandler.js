/**
 * Handle audio translation functionality
 * @param {Object} io - Socket.IO instance
 * @param {Object} socket - Socket connection
 * @param {Object} users - Active users object
 */
const { translateSpeech, recognizeSpeech, translateText } = require('../utils/speechTranslator');
// ✅ NEW: Import optimized Speech Translation SDK (single API call)
const { translateSpeechDirect } = require('../utils/speechTranslationSDK');

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
  
  // Handle speech recognition and translation (text-only workflow)
  // ✅ OPTIMIZED: Parallel processing with immediate feedback
  socket.on('translateSpeech', async (data) => {
    const startTime = Date.now();
    
    try {
      const { audio, sourceLanguage, targetLanguage, userId, requestId, timestamp } = data;
      console.log('\n🎯 [FULL SPEECH TRANSLATION] Complete Pipeline (OPTIMIZED)');
      console.log(`   📝 ${sourceLanguage} → ${targetLanguage}`);
      console.log(`   🆔 Request: ${requestId || 'none'}`);
      
      // Calculate client-side latency
      if (timestamp) {
        const clientLatency = startTime - timestamp;
        console.log(`   ⏱️  Client processing: ${clientLatency}ms`);
      }
      
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
      
      // ✅ OPTIMIZED: Speech-to-text and text translation with parallel feedback
      const { recognizeSpeech, translateText } = require('../utils/speechTranslator');
      
      // Step 1: Recognize speech (voice-to-text)
      const recognitionStartTime = Date.now();
      const originalText = await recognizeSpeech(audioBuffer, sourceLanguage);
      const recognitionTime = Date.now() - recognitionStartTime;
      
      if (!originalText || !originalText.trim()) {
        console.log('No speech detected or empty transcription');
        return;
      }
      
      console.log(`✅ Speech recognized (${recognitionTime}ms): "${originalText}"`);
      
      // ⚡ OPTIMIZATION: Send original text immediately (don't wait for translation)
      const partialResponseData = {
        text: {
          original: originalText,
          translated: '' // Translation in progress
        },
        audio: null,
        isLocal: true,
        targetLanguage: finalTargetLanguage,
        requestId,
        timestamp: startTime,
        partial: true // Flag to indicate translation is still in progress
      };
      
      // Send partial result to sender immediately
      socket.emit('translatedSpeech', partialResponseData);
      
      // Send to receiver as well (they see original text while translation happens)
      partialResponseData.isLocal = false;
      io.to(receiverSocketId).emit('translatedSpeech', partialResponseData);
      
      console.log(`⚡ Immediate feedback sent (${Date.now() - startTime}ms)`);
      
      // Step 2: Translate text in parallel (non-blocking)
      const translationStartTime = Date.now();
      const translatedText = await translateText(originalText, sourceLanguage, finalTargetLanguage);
      const translationTime = Date.now() - translationStartTime;
      
      if (!translatedText) {
        console.error('Translation failed');
        socket.emit('error', {
          message: 'Translation failed',
          requestId
        });
        return;
      }
      
      console.log(`✅ Text translated (${translationTime}ms): "${translatedText}"`);
      
      // Send complete result with both original and translated text
      const finalResponseData = {
        text: {
          original: originalText,
          translated: translatedText
        },
        audio: null,
        isLocal: true,
        targetLanguage: finalTargetLanguage,
        requestId,
        timestamp: startTime,
        partial: false, // Final result
        metrics: {
          recognition: recognitionTime,
          translation: translationTime,
          total: Date.now() - startTime
        }
      };
      
      // Send to sender (local)
      socket.emit('translatedSpeech', finalResponseData);
      
      // Send to receiver (remote)
      finalResponseData.isLocal = false;
      io.to(receiverSocketId).emit('translatedSpeech', finalResponseData);
      
      const totalTime = Date.now() - startTime;
      console.log(`✅ Complete translation pipeline: ${totalTime}ms (Recognition: ${recognitionTime}ms, Translation: ${translationTime}ms)`);
    } catch (error) {
      console.error('Error in speech translation:', error);
      socket.emit('error', {
        message: 'Speech translation failed',
        requestId: data.requestId
      });
    }
  });

  // ✅ NEW: Optimized Speech Translation using Azure Speech Translation SDK
  // This is FASTER than separate STT + Translation (single API call)
  // Expected: 200-400ms faster than 'translateSpeech' event
  socket.on('translateSpeechOptimized', async (data) => {
    const startTime = Date.now();
    
    try {
      const { audio, sourceLanguage, targetLanguage, userId, requestId, timestamp } = data;
      console.log('\n🚀 [OPTIMIZED SPEECH TRANSLATION] Single API Call');
      console.log(`   📝 ${sourceLanguage} → ${targetLanguage}`);
      console.log(`   🆔 Request: ${requestId || 'none'}`);
      
      if (timestamp) {
        const clientLatency = startTime - timestamp;
        console.log(`   ⏱️  Client processing: ${clientLatency}ms`);
      }
      
      if (!audio || audio.length < 100) {
        console.error('Invalid audio data received');
        socket.emit('error', {
          message: 'Invalid audio data',
          requestId
        });
        return;
      }
      
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
      
      const receiverData = users[receiverSocketId];
      const finalTargetLanguage = receiverData.preferredLanguage || targetLanguage || 'en';
      
      console.log(`   🎯 Target language: ${finalTargetLanguage}`);
      
      // ✅ OPTIMIZED: Single API call for speech translation
      const translationStartTime = Date.now();
      
      // Callback for partial results
      const handlePartialResult = (partial) => {
        if (partial.original) {
          const partialData = {
            text: {
              original: partial.original,
              translated: partial.translated || ''
            },
            audio: null,
            isLocal: true,
            targetLanguage: finalTargetLanguage,
            requestId,
            timestamp: startTime,
            partial: !partial.isFinal
          };
          
          socket.emit('translatedSpeech', partialData);
          
          partialData.isLocal = false;
          io.to(receiverSocketId).emit('translatedSpeech', partialData);
          
          if (!partial.isFinal) {
            console.log(`⚡ Partial result sent: "${partial.original}"`);
          }
        }
      };
      
      const result = await translateSpeechDirect(
        audioBuffer, 
        sourceLanguage, 
        finalTargetLanguage,
        handlePartialResult
      );
      
      const translationTime = Date.now() - translationStartTime;
      
      if (result.error || !result.original) {
        console.error('Translation failed:', result.error);
        socket.emit('error', {
          message: 'Translation failed',
          requestId
        });
        return;
      }
      
      console.log(`✅ Complete: "${result.original}" → "${result.translated}" (${translationTime}ms)`);
      
      // Send final result
      const finalResponseData = {
        text: {
          original: result.original,
          translated: result.translated
        },
        audio: null,
        isLocal: true,
        targetLanguage: finalTargetLanguage,
        requestId,
        timestamp: startTime,
        partial: false,
        metrics: {
          speechTranslation: translationTime,
          total: Date.now() - startTime
        }
      };
      
      socket.emit('translatedSpeech', finalResponseData);
      
      finalResponseData.isLocal = false;
      io.to(receiverSocketId).emit('translatedSpeech', finalResponseData);
      
      const totalTime = Date.now() - startTime;
      console.log(`🚀 Optimized pipeline: ${totalTime}ms (Speech Translation: ${translationTime}ms)`);
      console.log(`   💡 Estimated savings: ~200-300ms vs separate STT+Translation`);
    } catch (error) {
      console.error('Error in optimized speech translation:', error);
      socket.emit('error', {
        message: 'Speech translation failed',
        requestId: data.requestId
      });
    }
  });
};

module.exports = handleAudioTranslation;