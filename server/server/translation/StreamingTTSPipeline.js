/**
 * StreamingTTSPipeline
 * Azure TTS in streaming mode → raw PCM chunks delivered via callback.
 *
 * Key improvement over the current batch approach (textToSpeechModule.js):
 *   - Uses SpeechSynthesizer.synthesizing event to get audio chunks AS Azure
 *     produces them, rather than waiting for the full sentence to complete.
 *   - Output format: Raw16Khz16BitMonoPcm (no WAV header) — ready for direct
 *     injection into @livekit/rtc-node AudioSource.captureFrame().
 *   - Enables sub-sentence playback latency (first words play while Azure is
 *     still synthesizing the rest of the sentence).
 *
 * This module is used ONLY when USE_LIVEKIT_AUDIO_TRACKS=true.
 * When the flag is off, textToSpeechModule.getCachedOrSynthesize() is used instead.
 */

const sdk = require('microsoft-cognitiveservices-speech-sdk');
const { config } = require('../utils/env');

// Voice map — kept in sync with textToSpeechModule.js
const VOICE_MAP = {
  en: 'en-US-JennyNeural',
  hi: 'hi-IN-SwaraNeural',
  es: 'es-ES-ElviraNeural',
  fr: 'fr-FR-DeniseNeural',
  de: 'de-DE-KatjaNeural',
  it: 'it-IT-ElsaNeural',
  ja: 'ja-JP-NanamiNeural',
  ko: 'ko-KR-SunHiNeural',
  pt: 'pt-BR-FranciscaNeural',
  ru: 'ru-RU-SvetlanaNeural',
  zh: 'zh-CN-XiaoxiaoNeural',
  ar: 'ar-SA-ZariyahNeural',
  ta: 'ta-IN-PallaviNeural',
  te: 'te-IN-ShrutiNeural',
  bn: 'bn-IN-TanishaaNeural',
  gu: 'gu-IN-DhwaniNeural',
  kn: 'kn-IN-SapnaNeural',
  ml: 'ml-IN-SobhanaNeural',
  mr: 'mr-IN-AarohiNeural',
  ur: 'ur-IN-GulNeural',
};

const getVoice = (lang) => {
  const code = (lang || 'en').toLowerCase().split('-')[0];
  return VOICE_MAP[code] || 'en-US-JennyNeural';
};

const escapeXml = (str) =>
  str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

/**
 * Synthesize text to streaming PCM.
 *
 * The `onChunk` callback fires with raw PCM Buffer chunks as Azure produces them.
 * This enables the caller to pipe chunks directly into LiveKit via captureFrame()
 * without waiting for the complete utterance to finish.
 *
 * @param {object}   opts
 * @param {string}   opts.text       - Text to synthesize
 * @param {string}   opts.lang       - Language code e.g. 'hi', 'fr'
 * @param {Function} opts.onChunk    - (Buffer) => void — called for each PCM chunk
 * @param {number}   [opts.timeoutMs=15000]
 * @returns {Promise<{ totalBytes: number, voiceName: string }>}
 */
async function synthesizeStreaming({ text, lang, onChunk, timeoutMs = 15000 }) {
  if (!text?.trim()) throw new Error('[StreamingTTSPipeline] Empty text');

  const SPEECH_KEY = config.AZURE_SPEECH_KEY;
  const SPEECH_REGION = config.AZURE_SPEECH_REGION;
  if (!SPEECH_KEY || !SPEECH_REGION) {
    throw new Error('[StreamingTTSPipeline] Azure Speech credentials not configured');
  }

  const voiceName = getVoice(lang);
  const voiceLang = voiceName.split('-').slice(0, 2).join('-');

  const speechConfig = sdk.SpeechConfig.fromSubscription(SPEECH_KEY, SPEECH_REGION);
  speechConfig.speechSynthesisVoiceName = voiceName;

  // Raw 16kHz 16-bit mono PCM — no WAV header — directly injectable into AudioFrame
  speechConfig.speechSynthesisOutputFormat =
    sdk.SpeechSynthesisOutputFormat.Raw16Khz16BitMonoPcm;

  return new Promise((resolve, reject) => {
    let totalBytes = 0;
    let settled = false;

    const timeoutId = setTimeout(() => {
      if (settled) return;
      settled = true;
      try { synthesizer.close(); } catch (e) {}
      reject(new Error(`[StreamingTTSPipeline] Timeout (${timeoutMs}ms) for lang=${lang}`));
    }, timeoutMs);

    // null AudioConfig → output goes to synthesizing event (in-memory streaming)
    const synthesizer = new sdk.SpeechSynthesizer(speechConfig, null);

    // The `synthesizing` event fires incrementally as Azure produces audio chunks.
    // e.result.audioData is an ArrayBuffer of raw PCM bytes (no WAV header).
    synthesizer.synthesizing = (_s, e) => {
      if (!e.result?.audioData || e.result.audioData.byteLength === 0) return;
      const chunk = Buffer.from(e.result.audioData);
      totalBytes += chunk.length;
      try {
        onChunk(chunk);
      } catch (cbErr) {
        console.warn('[StreamingTTSPipeline] onChunk error:', cbErr.message);
      }
    };

    const ssml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${voiceLang}">
  <voice name="${voiceName}">${escapeXml(text)}</voice>
</speak>`;

    synthesizer.speakSsmlAsync(
      ssml,
      (result) => {
        clearTimeout(timeoutId);
        if (settled) return;
        settled = true;
        try { synthesizer.close(); } catch (e) {}

        if (result.reason === sdk.ResultReason.SynthesizingAudioCompleted) {
          console.log(`[StreamingTTSPipeline] Complete — ${totalBytes} bytes, voice=${voiceName}`);
          resolve({ totalBytes, voiceName });
        } else {
          const detail = result.errorDetails || `reason=${result.reason}`;
          reject(new Error(`[StreamingTTSPipeline] Synthesis failed: ${detail}`));
        }
      },
      (err) => {
        clearTimeout(timeoutId);
        if (settled) return;
        settled = true;
        try { synthesizer.close(); } catch (e) {}
        reject(new Error(`[StreamingTTSPipeline] SDK error: ${err}`));
      }
    );
  });
}

module.exports = { synthesizeStreaming };
