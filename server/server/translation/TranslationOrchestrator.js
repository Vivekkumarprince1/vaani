/**
 * TranslationOrchestrator
 * Single responsibility: coordinate the full audio→text→translate→TTS→emit pipeline
 * for group calls, with active-speaker gating and shared TTS cache.
 *
 * Extracted from groupCallAudioHandler.js so the pipeline can be:
 *   - tested independently
 *   - reused by future WebSocket/WebRTC data channels
 *   - extended with GPU translation workers without changing the handler
 *
 * Usage:
 *   const orchestrator = require('./TranslationOrchestrator');
 *   await orchestrator.handleAudio({ audioBuffer, speakerId, speakerName, callRoomId, sourceLang, io });
 */

const { recognizeSpeech, translateText } = require('../utils/speechTranslator');
const { translateSpeechToMultipleLanguages } = require('../utils/speechTranslationSDK');
const sharedCache = require('./SharedTranslationCache');
const LanguageRoutingMap = require('./LanguageRoutingMap');
const participantManager = require('../sfu/ParticipantManager');
const workerManager = require('../sfu/TranslationWorkerManager');
const { synthesizeStreaming } = require('./StreamingTTSPipeline');

// Minimum PCM energy to consider audio "active speech" (VAD gate)
const SILENCE_THRESHOLD = 100;

class TranslationOrchestrator {
  /**
   * Main entry point. Called by groupCallAudioHandler on 'groupCallRecognizeSpeech'.
   *
   * @param {object} opts
   * @param {Buffer}  opts.audioBuffer
   * @param {string}  opts.speakerId
   * @param {string}  opts.speakerName
   * @param {string}  opts.callRoomId
   * @param {string}  opts.sourceLang
   * @param {string}  opts.requestId
   * @param {object}  opts.io          - Socket.IO server instance
   * @param {object}  opts.speakerSocket - emitter for transcript back to speaker
   */
  async handleAudio({ audioBuffer, speakerId, speakerName, callRoomId, sourceLang, requestId, io, speakerSocket }) {
    // ── VAD gate ─────────────────────────────────────────────────────────────
    if (!this._hasActiveSpeech(audioBuffer)) {
      console.log('[TranslationOrchestrator] Silence detected — skipping');
      return;
    }

    // ── Build language routing map ────────────────────────────────────────────
    const rawLangMap = participantManager.getLanguageRoutingMap(callRoomId, speakerId);
    const routingMap = LanguageRoutingMap.fromRoomManager(rawLangMap);
    const targetLanguages = routingMap.getTargetLanguages();

    const normalizedTargets = Array.from(new Set(
      targetLanguages.map((l) => (typeof l === 'string' ? l.split('-')[0] : 'en')).filter(Boolean)
    ));

    console.log(`[TranslationOrchestrator] Targets: [${normalizedTargets.join(', ')}] in room ${callRoomId}`);

    // ── Azure batch STT + multi-language translation ───────────────────────
    let multiResult = null;
    if (normalizedTargets.length > 0) {
      try {
        multiResult = await translateSpeechToMultipleLanguages(audioBuffer, sourceLang, normalizedTargets);
      } catch (err) {
        console.error('[TranslationOrchestrator] Batch translate failed:', err.message);
      }
    }

    // Fallback to STT-only
    let recognizedText = multiResult?.original || '';
    if (!recognizedText?.trim()) {
      try {
        recognizedText = await recognizeSpeech(audioBuffer, sourceLang) || '';
      } catch (err) {
        console.error('[TranslationOrchestrator] Fallback STT failed:', err.message);
      }
    }

    if (!recognizedText?.trim()) {
      console.log('[TranslationOrchestrator] No speech detected');
      return;
    }

    console.log(`[TranslationOrchestrator] Recognized: "${recognizedText}"`);

    // ── Emit transcript to speaker ────────────────────────────────────────────
    speakerSocket?.emit('groupCallTranscript', {
      text: recognizedText, speakerId, speakerName,
      language: sourceLang, isOriginal: true, requestId,
    });

    // ── Broadcast original text to all listeners ──────────────────────────────
    const roomParticipants = participantManager.getRoomParticipants(callRoomId);
    for (const [uid, meta] of roomParticipants) {
      if (uid === speakerId || !meta.socketId) continue;
      io.to(meta.socketId).emit('groupCallOriginalText', {
        text: recognizedText, sourceLanguage: sourceLang,
        speakerId, speakerName, requestId,
      });
    }

    // ── Per-language TTS + delivery ──────────────────────────────────────────
    if (routingMap.isEmpty()) return;

    const ttsJobs = [];
    for (const [lang, userIds] of routingMap.entries()) {
      ttsJobs.push(
        this._handleLangDelivery({
          lang, userIds, multiResult, recognizedText, sourceLang,
          callRoomId, speakerId, speakerName, requestId,
          io, roomParticipants,
        })
      );
    }

    await Promise.allSettled(ttsJobs);
    console.log(`[TranslationOrchestrator] Done — ${routingMap.size()} lang groups`);
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  async _resolveTranslation({ lang, multiResult, recognizedText, sourceLang }) {
    let finalText = recognizedText;
    try {
      if (multiResult?.translations?.[lang]) {
        finalText = multiResult.translations[lang];
      } else if (lang !== (sourceLang || 'en').split('-')[0]) {
        const translated = await translateText(recognizedText, sourceLang, lang);
        if (translated) finalText = translated;
      }
    } catch (err) {
      console.error(`[TranslationOrchestrator] Translation error for ${lang}:`, err.message);
    }
    return finalText;
  }

  async _handleLangDelivery({
    lang, userIds, multiResult, recognizedText, sourceLang,
    callRoomId, speakerId, speakerName, requestId,
    io, roomParticipants,
  }) {
    const finalText = await this._resolveTranslation({ lang, multiResult, recognizedText, sourceLang });

    if (workerManager.isEnabled) {
      // Path A: Streaming TTS → LiveKit track (audio never touches Socket.IO)
      try {
        await synthesizeStreaming({
          text: finalText,
          lang,
          onChunk: async (pcmChunk) => {
            await workerManager.pushPcm(callRoomId, lang, pcmChunk);
          },
        });
      } catch (err) {
        console.error(`[TranslationOrchestrator] Streaming TTS failed for ${lang}:`, err.message);
      }

      // Text-only event — subtitles only, no audio payload
      for (const uid of userIds) {
        const meta = roomParticipants.get(uid);
        if (!meta?.socketId) continue;
        try {
          io.to(meta.socketId).emit('groupCallTranslatedText', {
            originalText: recognizedText,
            translatedText: finalText,
            sourceLanguage: sourceLang,
            targetLanguage: lang,
            speakerId,
            speakerName,
            requestId,
          });
        } catch (e) {
          console.warn(`[TranslationOrchestrator] text emit failed uid=${uid}:`, e.message);
        }
      }
    } else {
      // Path B: Batch TTS → Socket.IO audio buffer (fallback / dev mode)
      let ttsBuffer = null;
      try {
        ttsBuffer = await sharedCache.getOrSynthesize(finalText, lang);
      } catch (err) {
        console.error(`[TranslationOrchestrator] TTS error for ${lang}:`, err.message);
      }

      for (const uid of userIds) {
        const meta = roomParticipants.get(uid);
        if (!meta?.socketId) continue;
        try {
          io.to(meta.socketId).emit('groupCallTranslatedSpeech', {
            originalText: recognizedText,
            translatedText: finalText,
            audio: ttsBuffer,
            sourceLanguage: sourceLang,
            targetLanguage: lang,
            speakerId,
            speakerName,
            requestId,
          });
        } catch (e) {
          console.warn(`[TranslationOrchestrator] speech emit failed uid=${uid}:`, e.message);
        }
      }
    }
  }

  _hasActiveSpeech(buffer) {
    if (!buffer || buffer.length < 44) return false;
    // Sample PCM Int16 values from the buffer body (skip WAV header: 44 bytes)
    let energy = 0;
    const step = 4;
    const start = 44;
    let count = 0;
    for (let i = start; i < buffer.length - 1; i += step) {
      const sample = buffer.readInt16LE(i);
      energy += Math.abs(sample);
      count++;
    }
    const avgEnergy = count > 0 ? energy / count : 0;
    return avgEnergy > SILENCE_THRESHOLD;
  }
}

module.exports = new TranslationOrchestrator();
