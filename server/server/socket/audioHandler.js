/**
 * Handle audio translation functionality
 * @param {Object} io - Socket.IO instance
 * @param {Object} socket - Socket connection
 * @param {Object} users - Active users object
 * @param {Object} userIdToSocketId - Map for O(1) lookups
 */
const { translateSpeech, recognizeSpeech, translateText } = require('../utils/speechTranslator');
const { translateSpeechDirect, toSpeechLocale, toLanguageCode, getTranslationConfig } = require('../utils/speechTranslationSDK');
const { getCachedOrSynthesize } = require('../utils/textToSpeechModule');
const serverMetrics = require('../utils/performanceMetrics');
const sdk = require('microsoft-cognitiveservices-speech-sdk');
const audioQueueManager = require('../queue/audioQueueManager');
const redisManager = require('../redis/RedisManager');

/**
 * Resolve a receiver's online status + preferred language.
 * Local in-memory maps are the fast path; Redis is the cross-instance fallback
 * so translation works when sender and receiver are on different instances.
 * Delivery itself uses `io.to('user_<userId>')`, which the Redis adapter routes
 * to whichever instance owns the receiver's socket(s).
 */
async function resolveReceiver(userId, users, userIdToSocketId) {
  const localSid = userIdToSocketId[userId];
  if (localSid && users[localSid]) {
    return { online: true, preferredLanguage: users[localSid].preferredLanguage || 'en' };
  }
  try {
    const r = await redisManager.getUser(userId);
    if (r) return { online: true, preferredLanguage: r.preferredLanguage || 'en' };
  } catch (e) {
    // Redis unavailable — fall through to offline.
  }
  return { online: false, preferredLanguage: 'en' };
}

const handleAudioTranslation = (io, socket, users, userIdToSocketId) => {
  socket.on('audioSystemReady', (data) => {
    socket.audioSystemReady = true;
  });

  // Handle speech recognition only (voice-to-text)
  socket.on('recognizeSpeech', async (data) => {
    try {
      const { audio, sourceLanguage, userId, requestId } = data;
      console.log('[audioHandler] [SPEECH RECOGNITION] Voice to Text Only');
      console.log(`[audioHandler] Language: ${sourceLanguage}`);
      console.log(`[audioHandler] Request: ${requestId || 'none'}`);
      
      // Validate input data
      if (!audio || audio.length < 100) {
        console.warn('Invalid audio data received');
        socket.emit('error', { 
          message: 'Invalid audio data',
          requestId
        });
        return;
      }
      
      // Verify the receiver is online (local or another instance via Redis)
      const receiver = await resolveReceiver(userId, users, userIdToSocketId);
      if (!receiver.online) {
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
      
      // Recognize speech (voice-to-text only) via AudioQueueManager
      const recognizedText = await audioQueueManager.addRecognitionJob(audioBuffer, sourceLanguage);
      
      if (!recognizedText || !recognizedText.trim()) {
        console.log('No speech detected or empty transcription');
        return;
      }
      
      // Send recognized text only to the sender (local).
      // Do NOT forward raw recognized text to the remote receiver.
      socket.emit('recognizedSpeech', {
        text: recognizedText,
        isLocal: true,
        requestId
      });
      
      console.log(`[audioHandler] Speech recognized: "${recognizedText}"`);
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
      console.log('\n💬 [TEXT TRANSLATION] Text Only');
      console.log(`   🌐 ${sourceLanguage} → ${targetLanguage}`);
      console.log(`   🆔 Request: ${requestId || 'none'}`);
      
      // Resolve receiver online status + preferred language (cross-instance aware)
      const receiver = await resolveReceiver(userId, users, userIdToSocketId);
      if (!receiver.online) {
        console.error('Receiver not found or not online:', userId);
        socket.emit('error', {
          message: 'Receiver not found or not online',
          requestId
        });
        return;
      }

      // Get receiver's preferred language
      targetLanguage = receiver.preferredLanguage || targetLanguage || 'en';
      
      console.log(`[audioHandler] Target language set to receiver's preference: ${targetLanguage}`);
      
      // Validate input data
      if (!text || !text.trim()) {
        console.warn('Invalid text data received');
        socket.emit('error', { 
          message: 'Invalid text data',
          requestId
        });
        return;
      }
      
      // Translate text via AudioQueueManager
      const translatedText = await audioQueueManager.addTranslationJob(text, sourceLanguage, targetLanguage);
      
      if (!translatedText) {
        console.log('Translation failed or empty result');
        socket.emit('error', { 
          message: 'Translation failed',
          requestId
        });
        return;
      }
      
      // Send translated text only to the sender (local).
      // Do NOT forward text-only translations to the remote receiver. The
      // receiver will get the combined payload (text + TTS) via
      // 'translatedSpeech' when available.
      socket.emit('translatedText', {
        originalText: text,
        translatedText,
        isLocal: true,
        targetLanguage,
        requestId
      });
      
      console.log(`[audioHandler] Text translated: "${text}" -> "${translatedText}"`);
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
      const participantSocketId = userIdToSocketId[userId];

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

      console.log('[audioHandler] Sending call participant info:', participantInfo);

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
  
  // Handle speech translation -> voice-to-voice using direct speech translation + TTS
  socket.on('translateSpeech', async (data) => {
    const startTime = Date.now();

    try {
      const { audio, sourceLanguage, targetLanguage, userId, requestId, timestamp } = data;
      console.log('[audioHandler] [FULL SPEECH TRANSLATION - VOICE] Voice-to-Voice Pipeline');
      console.log(`[audioHandler] ${sourceLanguage} -> ${targetLanguage}`);
 
      if (timestamp) {
        const clientLatency = startTime - timestamp;
        console.log(`[audioHandler] Client processing: ${clientLatency}ms`);
      }

      if (!audio || audio.length < 100) {
        console.error('Invalid audio data received');
        socket.emit('error', { message: 'Invalid audio data', requestId });
        return;
      }

      const receiver = await resolveReceiver(userId, users, userIdToSocketId);
      if (!receiver.online) {
        console.error('Receiver not found:', userId);
        socket.emit('error', { message: 'Receiver not found', requestId });
        return;
      }

      let audioBuffer;
      try {
        audioBuffer = Buffer.from(audio, 'base64');
      } catch (err) {
        console.error('Error converting audio from base64:', err);
        socket.emit('error', { message: 'Invalid audio format', requestId });
        return;
      }

      const finalTargetLanguage = receiver.preferredLanguage || targetLanguage || 'en';
      console.log(`[audioHandler] Target language set to receiver's preference: ${finalTargetLanguage}`);

      // Partial callback to stream transcripts back
      // Emit partial results only to the sender (local). Do NOT forward
      // partial text-only results to the remote receiver so the remote
      // side only receives the final combined payload (text + TTS).
      const handlePartial = (partial) => {
        if (partial && partial.original) {
          const partialData = {
            text: { original: partial.original, translated: partial.translated || '' },
            audio: null,
            isLocal: true,
            targetLanguage: finalTargetLanguage,
            requestId,
            timestamp: startTime,
            partial: !partial.isFinal
          };

          // Emit partial text only to the sender. Final combined
          // 'translatedSpeech' (text + audio) will be emitted to both
          // sender and receiver when TTS is ready.
          socket.emit('translatedTextPartial', partialData);
        }
      };

      const translateStart = Date.now();
      const result = await audioQueueManager.addSpeechTranslationJob(audioBuffer, sourceLanguage, finalTargetLanguage, handlePartial);
      const translateTime = Date.now() - translateStart;

      if (result.error || !result.translated) {
        console.error('Translation failed:', result.error);
        socket.emit('error', { message: 'Translation failed', requestId });
        return;
      }

      // Synthesize translated text into audio (voice-to-voice) via AudioQueueManager
      let ttsBuffer = null;
      try {
        ttsBuffer = await audioQueueManager.addTtsJob(result.translated, finalTargetLanguage);
      } catch (ttsErr) {
        console.error('Text-to-speech (cached) failed:', ttsErr);
        // Fall back to sending only transcripts
      }

      const finalResponseData = {
        text: { original: result.original || '', translated: result.translated || '' },
        audio: ttsBuffer, // Sending raw Buffer (binary)
        isLocal: true,
        targetLanguage: finalTargetLanguage,
        requestId,
        timestamp: startTime,
        partial: false,
        metrics: { speechTranslation: translateTime, total: Date.now() - startTime }
      };

      // Send to sender (local)
      socket.emit('translatedSpeech', finalResponseData);

      // Send to receiver (remote) — room emit routes across instances via the adapter
      finalResponseData.isLocal = false;
      io.to(`user_${userId}`).emit('translatedSpeech', finalResponseData);

      console.log(`[audioHandler] Voice-to-voice complete: "${result.original}" -> "${result.translated}" (${translateTime}ms)`);
    } catch (error) {
      console.error('Error in voice-to-voice speech translation:', error);
      socket.emit('error', { message: 'Speech translation failed', requestId: data.requestId });
    }
  });

  // ✅ NEW: Optimized Speech Translation using Azure Speech Translation SDK
  // This is FASTER than separate STT + Translation (single API call)
  // Expected: 200-400ms faster than 'translateSpeech' event
  socket.on('translateSpeechOptimized', async (data) => {
    const startTime = Date.now();
    
    try {
      const { audio, sourceLanguage, targetLanguage, userId, requestId, timestamp } = data;
      
      if (timestamp) {
        const clientLatency = startTime - timestamp;
        console.log(`   ⌛ Client processing: ${clientLatency}ms`);
      }
      
      if (!audio || audio.length < 100) {
        console.error('Invalid audio data received');
        socket.emit('error', {
          message: 'Invalid audio data',
          requestId
        });
        return;
      }
      
      const receiver = await resolveReceiver(userId, users, userIdToSocketId);

      if (!receiver.online) {
        console.error('Receiver not found:', userId);
        socket.emit('error', {
          message: 'Receiver not found',
          requestId
        });
        return;
      }

      let audioBuffer;
      try {
        if (Buffer.isBuffer(audio) || audio instanceof Uint8Array) {
          audioBuffer = Buffer.from(audio);
        } else {
          audioBuffer = Buffer.from(audio, 'base64');
        }
      } catch (err) {
        console.error('Error converting audio from base64:', err);
        socket.emit('error', {
          message: 'Invalid audio format',
          requestId
        });
        return;
      }
      
      const finalTargetLanguage = receiver.preferredLanguage || targetLanguage || 'en';

      console.log(`🎙️  Translation Request: ${sourceLanguage} -> ${finalTargetLanguage} (for user ${userId})`);
      
      // ✅ OPTIMIZED: Single API call for speech translation via AudioQueueManager
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
          // Emit partial text-only event only to the sender. The remote
          // receiver will get the final 'translatedSpeech' (text + audio)
          // which keeps text and audio synchronized.
          socket.emit('translatedTextPartial', partialData);

          if (!partial.isFinal) {
            console.log(`[audioHandler] Partial text-only result sent to sender: "${partial.original}"`);
          }
        }
      };
      
      // Start server-side metric tracking for this request
      const serverMetric = serverMetrics.startTracking(requestId);
      // Record server received timestamp (when audio arrives at server)
      serverMetrics.recordTimestamp(serverMetric, 'serverReceived');
      serverMetrics.recordTimestamp(serverMetric, 'translationStart');

      const result = await audioQueueManager.addSpeechTranslationJob(
        audioBuffer,
        sourceLanguage,
        finalTargetLanguage,
        (partial) => {
          // Record partial recognition times loosely
          if (partial && partial.original) {
            // approximate recognition start/end for partial
            serverMetrics.recordTimestamp(serverMetric, 'recognitionStart');
          }
          // invoke existing partial handler to forward to clients
          handlePartialResult(partial);
        }
      );

      serverMetrics.recordTimestamp(serverMetric, 'translationEnd');
      
      const translationTime = Date.now() - translationStartTime;
      
      if (result.error) {
        console.error('Translation failed:', result.error);
        socket.emit('error', {
          message: 'Translation failed',
          requestId: data.requestId
        });
        return;
      }

      if (!result.original) {
        // Silent chunks are common in real-time streams
        console.log('ℹ️  Empty recognition (silence or unrecognized)');
        return;
      }
      
      console.log(`[audioHandler] Complete: "${result.original}" -> "${result.translated}" (${translationTime}ms)`);

      // Phase 1: Send text IMMEDIATELY so both parties can display subtitles
      // without waiting for TTS synthesis. TTS is generated afterwards (below)
      // so it never blocks caption delivery.
      serverMetrics.recordTimestamp(serverMetric, 'clientReceived');

      const textOnlyPayload = {
        text: { original: result.original, translated: result.translated },
        audio: null,
        isLocal: true,
        targetLanguage: finalTargetLanguage,
        requestId,
        timestamp: startTime,
        partial: false,
        audiocoming: true, // hint to client that audio will follow
        metrics: { speechTranslation: translationTime, total: Date.now() - startTime, server: serverMetric }
      };

      socket.emit('translatedSpeech', textOnlyPayload);
      textOnlyPayload.isLocal = false;
      io.to(`user_${userId}`).emit('translatedSpeech', textOnlyPayload);

      // Phase 2: Generate TTS audio AFTER text is already on the wire, then
      // send it as a separate audio-only event (non-blocking for captions).
      let ttsBuffer = null;
      try {
        ttsBuffer = await audioQueueManager.addTtsJob(result.translated, finalTargetLanguage);
      } catch (ttsErr) {
        console.error('Text-to-speech failed:', ttsErr);
      }

      if (ttsBuffer) {
        const audioPayload = {
          text: null,
          audio: ttsBuffer,
          isLocal: true,
          targetLanguage: finalTargetLanguage,
          requestId,
          timestamp: startTime,
          partial: false,
          audioonly: true
        };
        socket.emit('translatedSpeech', audioPayload);
        audioPayload.isLocal = false;
        io.to(`user_${userId}`).emit('translatedSpeech', audioPayload);
      }

      serverMetrics.recordTimestamp(serverMetric, 'displayed');
      serverMetrics.complete(serverMetric);

      const totalTime = Date.now() - startTime;
      console.log(`Optimized pipeline: ${totalTime}ms (translation: ${translationTime}ms)`);
    } catch (error) {
      console.error('Error in optimized speech translation:', error);
      socket.emit('error', {
        message: 'Speech translation failed',
        requestId: data.requestId
      });
    }
  });

  // --- STREAMING PCM HANDLERS ---

  /**
   * Start a continuous speech translation stream
   */
  socket.on('startTranslationStream', async (data) => {
    const { sourceLanguage, targetLanguage, userId, requestId } = data;
    console.log(`🚀 [STREAM] Starting translation stream: ${sourceLanguage} -> ${targetLanguage} (User: ${userId})`);

    const receiver = await resolveReceiver(userId, users, userIdToSocketId);
    if (!receiver.online) {
      console.error('Receiver not found:', userId);
      socket.emit('error', { message: 'Receiver not found', requestId });
      return;
    }

    const finalTargetLanguage = receiver.preferredLanguage || targetLanguage || 'en';

    const sourceLocale = toSpeechLocale(sourceLanguage);
    const targetCode = toLanguageCode(finalTargetLanguage);
    const config = getTranslationConfig(sourceLocale, [targetCode]);

    const pushStream = sdk.AudioInputStream.createPushStream(
      sdk.AudioStreamFormat.getWaveFormatPCM(16000, 16, 1)
    );
    const audioConfig = sdk.AudioConfig.fromStreamInput(pushStream);
    const recognizer = new sdk.TranslationRecognizer(config, audioConfig);

    // Store in socket for later chunks
    socket.translationStream = {
      recognizer,
      pushStream,
      targetCode,
      receiverUserId: userId,
      requestId,
      finalTargetLanguage
    };

    recognizer.recognizing = (s, e) => {
      if (e.result.reason === sdk.ResultReason.TranslatingSpeech) {
        const partial = {
          text: {
            original: e.result.text,
            translated: e.result.translations.get(targetCode) || ''
          },
          partial: true,
          requestId
        };
        // Live partials to BOTH sides so captions update in real time as the
        // speaker talks (previously only the sender saw partials, so the
        // listener waited for the full final segment + TTS before seeing text).
        socket.emit('translatedSpeech', { ...partial, isLocal: true });
        io.to(`user_${userId}`).emit('translatedSpeech', { ...partial, isLocal: false });
      }
    };

    recognizer.recognized = async (s, e) => {
      if (e.result.reason === sdk.ResultReason.TranslatedSpeech) {
        const original = e.result.text;
        const translated = e.result.translations.get(targetCode) || '';

        if (!original) return;

        console.log(`🎯 [STREAM] Recognized: "${original}" -> "${translated}"`);

        // Phase 1: send FINAL text immediately (no TTS wait) so captions lock in
        // on both sides right away.
        const textData = {
          text: { original, translated },
          audio: null,
          partial: false,
          audiocoming: true, // hint: audio will arrive in a follow-up event
          requestId,
          timestamp: Date.now()
        };
        socket.emit('translatedSpeech', { ...textData, isLocal: true });
        io.to(`user_${userId}`).emit('translatedSpeech', { ...textData, isLocal: false });

        // Phase 2: synthesize TTS AFTER text is on the wire, then send audio-only.
        let ttsBuffer = null;
        try {
          ttsBuffer = await getCachedOrSynthesize(translated, finalTargetLanguage);
        } catch (err) {
          console.error('TTS failed in stream:', err);
        }

        if (ttsBuffer) {
          const audioData = {
            text: null,
            audio: ttsBuffer,
            partial: false,
            audioonly: true,
            requestId,
            timestamp: Date.now()
          };
          socket.emit('translatedSpeech', { ...audioData, isLocal: true });
          io.to(`user_${userId}`).emit('translatedSpeech', { ...audioData, isLocal: false });
        }
      }
    };

    recognizer.canceled = (s, e) => {
      console.warn(`⚠️ [STREAM] Canceled: ${e.reason}`);
      if (e.reason === sdk.CancellationReason.Error) {
        console.error(`Error details: ${e.errorDetails}`);
        // Notify client of translation stream error
        socket.emit('translationStreamError', { 
          message: e.errorDetails || 'Azure Speech Service connection failed',
          reason: e.reason,
          requestId: socket.translationStream?.requestId
        });
        // Clean up on error
        if (socket.translationStream) {
          try {
            pushStream.close();
            recognizer.close();
          } catch (cleanupErr) {
            console.error('Error during cleanup:', cleanupErr);
          }
          socket.translationStream = null;
        }
      }
    };

    recognizer.sessionStopped = (s, e) => {
      console.log('🏁 [STREAM] Session stopped');
    };

    recognizer.startContinuousRecognitionAsync(
      () => console.log('✅ [STREAM] Continuous recognition started'),
      (err) => {
        console.error('❌ [STREAM] Failed to start recognition:', err);
        // Notify client of startup failure
        socket.emit('translationStreamError', { 
          message: 'Failed to start translation stream',
          error: err?.message || String(err),
          requestId: data.requestId
        });
        // Clean up on startup failure
        try {
          pushStream.close();
          recognizer.close();
        } catch (cleanupErr) {
          console.error('Error during cleanup:', cleanupErr);
        }
        socket.translationStream = null;
      }
    );
  });

  /**
   * Handle incoming PCM chunks
   */
  socket.on('audioChunk', (chunk) => {
    if (socket.translationStream && socket.translationStream.pushStream) {
      // chunk is expected to be an ArrayBuffer/Buffer of Int16 PCM
      socket.translationStream.pushStream.write(chunk);
    }
  });

  /**
   * Stop the translation stream
   */
  socket.on('stopTranslationStream', () => {
    if (socket.translationStream) {
      const { recognizer, pushStream } = socket.translationStream;
      pushStream.close();
      recognizer.stopContinuousRecognitionAsync(
        () => {
          recognizer.close();
          console.log('🛑 [STREAM] Translation stream stopped');
        },
        (err) => {
          console.error('❌ [STREAM] Error stopping recognizer:', err);
          recognizer.close();
        }
      );
      socket.translationStream = null;
    }
  });

};

module.exports = handleAudioTranslation;