import { useState, useEffect, useRef } from 'react';
import { convertToInt16, createWavBuffer } from '../utils/audioProcessing';
import performanceMetrics from '../utils/performanceMetrics';

/**
 * useGroupCallAudioProcessing (AudioWorklet edition)
 *
 * Captures local microphone audio, accumulates frames until silence is detected,
 * then sends a WAV buffer to the server via Socket.IO for STT + translation.
 *
 * When useLiveKitAudioTracks=true (server USE_LIVEKIT_AUDIO_TRACKS flag is on):
 *   - TTS audio arrives via LiveKit tracks (useTranslatedAudioTrack hook)
 *   - This hook only handles audio capture + transcript state updates
 *   - Listens to 'groupCallTranslatedText' (text-only, no audio payload)
 *
 * When useLiveKitAudioTracks=false (fallback / dev mode):
 *   - TTS audio arrives via Socket.IO 'groupCallTranslatedSpeech' event
 *   - This hook drives the TTS playback queue as before
 */
const useGroupCallAudioProcessing = (
  localStream,
  socket,
  callRoomId,
  currentLanguage,
  currentUserId,
  isMuted = false,
  useLiveKitAudioTracks = false
) => {
  const [transcripts, setTranscripts] = useState([]);

  const audioContextRef = useRef(null);
  const sourceNodeRef = useRef(null);
  const workletNodeRef = useRef(null);

  // TTS playback queue (sequential to prevent overlapping audio)
  const ttsQueueRef = useRef([]);
  const isPlayingRef = useRef(false);
  const currentAudioElRef = useRef(null);

  // ── Audio capture setup / teardown ────────────────────────────────────────

  useEffect(() => {
    if (!localStream || !socket?.connected || isMuted) {
      cleanupAudioCapture();
      return;
    }

    setupAudioCapture();
    return cleanupAudioCapture;
  }, [localStream, socket, callRoomId, isMuted]);

  const setupAudioCapture = async () => {
    try {
      const audioTrack = localStream.getAudioTracks()[0];
      if (!audioTrack) return;

      // 16 kHz matches Azure STT preferred sample rate
      audioContextRef.current = new AudioContext({ sampleRate: 16000 });
      sourceNodeRef.current = audioContextRef.current.createMediaStreamSource(
        new MediaStream([audioTrack])
      );

      // Attempt AudioWorklet (modern, non-deprecated)
      try {
        await audioContextRef.current.audioWorklet.addModule('/worklets/VaaniProcessor.js');
        workletNodeRef.current = new AudioWorkletNode(audioContextRef.current, 'vaani-processor');

        let audioBuffer = [];
        let silenceCounter = 0;
        const SILENCE_THRESHOLD = 10; // ~10 callbacks ≈ 460ms
        const MIN_SAMPLES = audioContextRef.current.sampleRate * 0.5; // 0.5 s

        const hasSound = (data) => data.some((s) => Math.abs(s) > 0.005);

        workletNodeRef.current.port.onmessage = (event) => {
          if (!socket?.connected) return;

          // VaaniProcessor posts raw Float32Array chunks
          const pcmChunk = event.data instanceof Float32Array ? event.data : new Float32Array(event.data);
          const chunkHasSound = hasSound(pcmChunk);

          if (chunkHasSound) {
            audioBuffer.push(...Array.from(pcmChunk));
            silenceCounter = 0;
          } else if (audioBuffer.length > 0) {
            silenceCounter++;
            if (silenceCounter >= SILENCE_THRESHOLD && audioBuffer.length >= MIN_SAMPLES) {
              const chunk = Float32Array.from(audioBuffer);
              audioBuffer = [];
              silenceCounter = 0;
              _sendAudioForRecognition(chunk);
            }
          }
        };

        sourceNodeRef.current.connect(workletNodeRef.current);
        // Do not connect to destination — we only need the port messages
        console.log('[useGroupCallAudioProcessing] AudioWorklet connected');
      } catch (workletErr) {
        // Fallback: ScriptProcessor (deprecated but still widely supported)
        console.warn('[useGroupCallAudioProcessing] AudioWorklet unavailable, falling back to ScriptProcessor:', workletErr.message);
        _setupScriptProcessorFallback();
      }
    } catch (err) {
      console.error('[useGroupCallAudioProcessing] Setup failed:', err);
    }
  };

  const _setupScriptProcessorFallback = () => {
    const ctx = audioContextRef.current;
    // eslint-disable-next-line no-console
    console.warn('[useGroupCallAudioProcessing] Using deprecated ScriptProcessor');
    const processor = ctx.createScriptProcessor(2048, 1, 1);
    workletNodeRef.current = processor;

    let audioBuffer = new Float32Array();
    let silenceCounter = 0;
    const SILENCE_THRESHOLD = 10;
    const MIN_SAMPLES = ctx.sampleRate * 0.5;

    const hasSound = (data) => data.some((s) => Math.abs(s) > 0.005);

    processor.onaudioprocess = (e) => {
      if (!socket?.connected) return;
      const inputData = e.inputBuffer.getChannelData(0);
      if (hasSound(inputData)) {
        const next = new Float32Array(audioBuffer.length + inputData.length);
        next.set(audioBuffer);
        next.set(inputData, audioBuffer.length);
        audioBuffer = next;
        silenceCounter = 0;
      } else if (audioBuffer.length > 0) {
        silenceCounter++;
        if (silenceCounter >= SILENCE_THRESHOLD && audioBuffer.length >= MIN_SAMPLES) {
          const chunk = audioBuffer;
          audioBuffer = new Float32Array();
          silenceCounter = 0;
          _sendAudioForRecognition(chunk);
        }
      }
    };

    sourceNodeRef.current.connect(processor);
    processor.connect(ctx.destination);
  };

  const cleanupAudioCapture = () => {
    if (workletNodeRef.current) {
      try { workletNodeRef.current.disconnect(); } catch (e) {}
      workletNodeRef.current = null;
    }
    if (sourceNodeRef.current) {
      try { sourceNodeRef.current.disconnect(); } catch (e) {}
      sourceNodeRef.current = null;
    }
    if (audioContextRef.current) {
      try { audioContextRef.current.close(); } catch (e) {}
      audioContextRef.current = null;
    }
  };

  // ── Send audio to server ──────────────────────────────────────────────────

  const _sendAudioForRecognition = (audioData) => {
    try {
      if (isMuted || !socket?.connected) return;

      const requestId = `group-${Date.now()}`;
      const metric = performanceMetrics.startTracking(requestId);
      performanceMetrics.recordTimestamp(metric, 'audioCapture');

      const pcmData = convertToInt16(audioData);
      const wavBuffer = createWavBuffer(pcmData);

      socket.emit('groupCallRecognizeSpeech', {
        audio: wavBuffer,
        sourceLanguage: currentLanguage,
        callRoomId,
        requestId,
      });

      performanceMetrics.recordTimestamp(metric, 'serverReceived');
      performanceMetrics.complete(metric);
    } catch (err) {
      console.error('[useGroupCallAudioProcessing] Send failed:', err);
    }
  };

  // ── Socket event listeners (translation results) ──────────────────────────

  useEffect(() => {
    if (!socket?.connected) return;

    const handleOriginalText = ({ text, sourceLanguage, speakerId, speakerName }) => {
      setTranscripts((prev) => [
        ...prev,
        { userId: speakerId, username: speakerName, text, isTranslated: false, language: sourceLanguage, timestamp: new Date() },
      ].slice(-50));
    };

    const handleError = ({ message }) => {
      console.error('[useGroupCallAudioProcessing] Server error:', message);
    };

    socket.on('groupCallOriginalText', handleOriginalText);
    socket.on('groupCallError', handleError);

    let cleanup;
    if (useLiveKitAudioTracks) {
      // Path A: audio comes via LiveKit tracks — only update transcript state
      const handleTranslatedText = ({ translatedText, speakerId, speakerName, targetLanguage }) => {
        setTranscripts((prev) => [
          ...prev,
          { userId: speakerId, username: speakerName, text: translatedText, isTranslated: true, language: targetLanguage, timestamp: new Date() },
        ].slice(-50));
      };
      socket.on('groupCallTranslatedText', handleTranslatedText);
      cleanup = () => socket.off('groupCallTranslatedText', handleTranslatedText);
    } else {
      // Path B: audio comes via Socket.IO buffer — update transcripts + drive TTS queue
      const handleTranslatedSpeech = ({ translatedText, speakerId, speakerName, targetLanguage, audio }) => {
        setTranscripts((prev) => [
          ...prev,
          { userId: speakerId, username: speakerName, text: translatedText, isTranslated: true, language: targetLanguage, timestamp: new Date() },
        ].slice(-50));
        if (audio) _enqueueTts(audio);
      };
      socket.on('groupCallTranslatedSpeech', handleTranslatedSpeech);
      cleanup = () => {
        socket.off('groupCallTranslatedSpeech', handleTranslatedSpeech);
        _stopTts();
      };
    }

    return () => {
      socket.off('groupCallOriginalText', handleOriginalText);
      socket.off('groupCallError', handleError);
      cleanup?.();
    };
  }, [socket, currentLanguage, callRoomId, useLiveKitAudioTracks]);

  // ── TTS sequential playback queue ────────────────────────────────────────

  const _enqueueTts = (audioBuffer) => {
    ttsQueueRef.current.push(audioBuffer);
    if (!isPlayingRef.current) _runTtsQueue();
  };

  const _runTtsQueue = async () => {
    isPlayingRef.current = true;
    while (ttsQueueRef.current.length > 0) {
      const buffer = ttsQueueRef.current.shift();
      try {
        const blob = new Blob([buffer], { type: 'audio/mp3' });
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        currentAudioElRef.current = audio;
        await new Promise((resolve) => {
          audio.onended = resolve;
          audio.onerror = resolve;
          audio.play().catch(resolve);
        });
        URL.revokeObjectURL(url);
        currentAudioElRef.current = null;
      } catch (e) {
        console.warn('[useGroupCallAudioProcessing] TTS playback failed:', e);
      }
      await new Promise((r) => setTimeout(r, 50));
    }
    isPlayingRef.current = false;
  };

  const _stopTts = () => {
    ttsQueueRef.current = [];
    const el = currentAudioElRef.current;
    if (el) { try { el.pause(); el.src = ''; } catch (e) {} }
    currentAudioElRef.current = null;
    isPlayingRef.current = false;
  };

  return { transcripts };
};

export default useGroupCallAudioProcessing;
