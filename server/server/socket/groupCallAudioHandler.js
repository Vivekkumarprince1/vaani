/**
 * Group call audio translation handler (SFU-aware).
 *
 * Delegates the full STT → translation → TTS → delivery pipeline to
 * TranslationOrchestrator, which chooses the correct audio delivery path:
 *   - USE_LIVEKIT_AUDIO_TRACKS=true  → PCM injected as LiveKit track via TranslationWorker
 *   - USE_LIVEKIT_AUDIO_TRACKS=false → TTS buffer emitted via Socket.IO (fallback)
 */
const orchestrator = require('../translation/TranslationOrchestrator');
const { translateText } = require('../utils/speechTranslator');
const { textToSpeech } = require('../utils/textToSpeechModule');

const handleGroupCallAudioTranslation = (io, socket, users) => {

  socket.on('groupCallRecognizeSpeech', async (data) => {
    const { audio, sourceLanguage, callRoomId, requestId } = data;
    const speakerId = String(socket.user.userId);
    const speakerName = socket.user.username;
    const speakerInfo = users?.[socket.id] || {};
    const sourceLang = speakerInfo.preferredLanguage || sourceLanguage || 'en';

    if (!audio || audio.length < 100) {
      socket.emit('groupCallError', { message: 'Invalid audio data', requestId });
      return;
    }
    if (!callRoomId) {
      socket.emit('groupCallError', { message: 'Call room ID required', requestId });
      return;
    }

    let audioBuffer;
    try {
      audioBuffer = Buffer.isBuffer(audio) || audio instanceof Uint8Array
        ? Buffer.from(audio)
        : Buffer.from(audio, 'base64');
    } catch {
      socket.emit('groupCallError', { message: 'Invalid audio format', requestId });
      return;
    }

    try {
      await orchestrator.handleAudio({
        audioBuffer,
        speakerId,
        speakerName,
        callRoomId,
        sourceLang,
        requestId,
        io,
        speakerSocket: socket,
      });
    } catch (err) {
      console.error('[groupCallAudioHandler] Orchestrator error:', err.message);
      socket.emit('groupCallError', { message: 'Speech recognition failed', requestId });
    }
  });

  // On-demand text translation for a single listener (unchanged behavior,
  // but audio omitted from response when LiveKit audio tracks are active)
  socket.on('groupCallTranslateText', async (data) => {
    const { config } = require('../utils/env');
    try {
      const { text, sourceLanguage, targetLanguage, speakerId, speakerName, requestId } = data;

      if (!text?.trim()) return;

      if (sourceLanguage === targetLanguage) {
        socket.emit('groupCallTranslatedText', {
          originalText: text, translatedText: text,
          sourceLanguage, targetLanguage, speakerId, speakerName, requestId,
        });
        return;
      }

      const translatedText = await translateText(text, sourceLanguage, targetLanguage);
      if (!translatedText) {
        socket.emit('groupCallError', { message: 'Translation failed', requestId });
        return;
      }

      // When LiveKit tracks are active, emit text-only; audio arrives via track.
      if (config.USE_LIVEKIT_AUDIO_TRACKS) {
        socket.emit('groupCallTranslatedText', {
          originalText: text, translatedText,
          sourceLanguage, targetLanguage, speakerId, speakerName, requestId,
        });
        return;
      }

      let ttsBuffer = null;
      try {
        ttsBuffer = await textToSpeech(translatedText, targetLanguage);
      } catch (ttsErr) {
        console.error('[groupCallAudioHandler] TTS failed:', ttsErr);
      }

      socket.emit('groupCallTranslatedSpeech', {
        originalText: text, translatedText,
        audio: ttsBuffer, sourceLanguage, targetLanguage, speakerId, speakerName, requestId,
      });

    } catch (error) {
      console.error('[groupCallAudioHandler] Text translation error:', error);
      socket.emit('groupCallError', { message: 'Translation failed', requestId: data?.requestId });
    }
  });
};

module.exports = handleGroupCallAudioTranslation;
