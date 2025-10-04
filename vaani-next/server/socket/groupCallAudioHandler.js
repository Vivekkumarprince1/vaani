/**
 * Handle group call audio translation functionality
 * Supports multiple participants with speaker detection and per-user translation
 */
const { recognizeSpeech, translateText, synthesizeSpeech } = require('../utils/speechTranslator');

const handleGroupCallAudioTranslation = (io, socket, users) => {
  
  // Handle speech recognition for group calls (speaker's audio to text)
  socket.on('groupCallRecognizeSpeech', async (data) => {
    try {
      const { audio, sourceLanguage, callRoomId, requestId, audioFormat } = data;
      const speakerId = socket.user.userId;
      const speakerName = socket.user.username;
      const speakerInfo = users?.[socket.id] || {};
      const preferredSpeakerLanguage = speakerInfo.preferredLanguage || sourceLanguage || 'en';

      console.log('\n🎤 [GROUP CALL] Speech Recognition');
      console.log(`   👤 Speaker: ${speakerName} (${speakerId})`);
      console.log(`   📝 Preferred language: ${preferredSpeakerLanguage}`);
      console.log(`   🏠 Call Room: ${callRoomId}`);
      console.log(`   🆔 Request: ${requestId || 'none'}`);
      console.log(`   🎛️ Audio format: ${audioFormat || 'unknown'}`);
      
      // Validate input data
      if (!audio || audio.length < 100) {
        console.warn('Invalid audio data received');
        socket.emit('groupCallError', { 
          message: 'Invalid audio data',
          requestId
        });
        return;
      }

      if (!callRoomId) {
        console.warn('Call room ID missing');
        socket.emit('groupCallError', { 
          message: 'Call room ID required',
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
        socket.emit('groupCallError', { 
          message: 'Invalid audio data format',
          requestId
        });
        return;
      }
      
      // Recognize speech (voice-to-text)
      const recognizedText = await recognizeSpeech(audioBuffer, preferredSpeakerLanguage);
      
      if (!recognizedText || !recognizedText.trim()) {
        console.log('No speech detected or empty transcription');
        return;
      }
      
      console.log(`✅ Speech recognized: "${recognizedText}"`);
      
      // Send transcript to speaker (original text)
      socket.emit('groupCallTranscript', {
        text: recognizedText,
        speakerId,
        speakerName,
        language: preferredSpeakerLanguage,
        isOriginal: true,
        requestId
      });
      
      // Get all participants in the call room
      const roomSockets = await io.in(callRoomId).fetchSockets();
      console.log(`📤 Broadcasting to ${roomSockets.length - 1} other participants`);
      
      // Send the original text to all other participants for translation
      for (const participantSocket of roomSockets) {
        if (participantSocket.id !== socket.id) {
          const participant = users[participantSocket.id];
          if (participant) {
            participantSocket.emit('groupCallOriginalText', {
              text: recognizedText,
              sourceLanguage: preferredSpeakerLanguage,
              speakerId,
              speakerName,
              requestId
            });
          }
        }
      }
      
    } catch (error) {
      console.error('Error in group call speech recognition:', error);
      socket.emit('groupCallError', {
        message: 'Speech recognition failed',
        requestId: data.requestId
      });
    }
  });
  
  // Handle translation request for received text in group calls
  socket.on('groupCallTranslateText', async (data) => {
    try {
      const { text, sourceLanguage, targetLanguage, speakerId, speakerName, requestId } = data;
      const listenerId = socket.user.userId;
      const listenerName = socket.user.username;
      
      console.log('\n🌍 [GROUP CALL] Text Translation');
      console.log(`   👤 Speaker: ${speakerName} (${speakerId})`);
      console.log(`   👂 Listener: ${listenerName} (${listenerId})`);
      console.log(`   📝 ${sourceLanguage} → ${targetLanguage}`);
      console.log(`   💬 Text: "${text}"`);
      
      if (!text || !text.trim()) {
        console.warn('Empty text for translation');
        return;
      }
      
      // If target language is same as source, no translation needed
      if (sourceLanguage === targetLanguage) {
        socket.emit('groupCallTranslatedText', {
          originalText: text,
          translatedText: text,
          sourceLanguage,
          targetLanguage,
          speakerId,
          speakerName,
          requestId
        });
        return;
      }
      
      // Translate text
      const translatedText = await translateText(text, sourceLanguage, targetLanguage);
      
      if (!translatedText) {
        console.error('Translation failed');
        socket.emit('groupCallError', {
          message: 'Translation failed',
          requestId
        });
        return;
      }
      
      console.log(`✅ Translated: "${translatedText}"`);
      
      // Send translated text back to the listener
      socket.emit('groupCallTranslatedText', {
        originalText: text,
        translatedText,
        sourceLanguage,
        targetLanguage,
        speakerId,
        speakerName,
        requestId
      });
      
    } catch (error) {
      console.error('Error in group call text translation:', error);
      socket.emit('groupCallError', {
        message: 'Translation failed',
        requestId: data.requestId
      });
    }
  });

  // Handle text-to-speech synthesis for group calls
  socket.on('groupCallSynthesizeSpeech', async (data) => {
    try {
      const { text, targetLanguage, speakerId, speakerName, requestId } = data;
      const listenerId = socket.user.userId;
      
      console.log('\n🔊 [GROUP CALL] Text-to-Speech');
      console.log(`   👤 Speaker: ${speakerName || speakerId}`);
      console.log(`   👂 Listener ID: ${listenerId}`);
      console.log(`   📝 Language: ${targetLanguage}`);
      console.log(`   💬 Text: "${text}"`);
      
      if (!text || !text.trim()) {
        console.warn('Empty text for synthesis');
        return;
      }
      
      // Synthesize speech
      const { audio: audioData, error: synthesisError } = await synthesizeSpeech(text, targetLanguage);
      
      if (synthesisError || !audioData) {
        console.error('Speech synthesis failed:', synthesisError);
        socket.emit('groupCallError', {
          message: 'Speech synthesis failed',
          requestId
        });
        return;
      }
      
      console.log(`✅ Speech synthesized, audio size: ${audioData.length} bytes`);
      console.log(`🔊 Audio data type: ${typeof audioData}, isBuffer: ${Buffer.isBuffer(audioData)}`);
      console.log(`🔊 Audio data sample: ${audioData.toString('base64').substring(0, 100)}...`);
      
      // Send synthesized audio back to the listener
      socket.emit('groupCallSynthesizedAudio', {
        audio: audioData.toString('base64'),
        speakerId,
        speakerName: speakerName || 'Unknown',
        targetLanguage,
        requestId
      });
      
    } catch (error) {
      console.error('Error in group call speech synthesis:', error);
      socket.emit('groupCallError', {
        message: 'Speech synthesis failed',
        requestId: data.requestId
      });
    }
  });
};

module.exports = handleGroupCallAudioTranslation;
