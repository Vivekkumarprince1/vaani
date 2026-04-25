import { useState, useEffect, useRef } from 'react';
import { createOptimizedAudioContext, hasSound, convertToInt16, createWavBuffer, convertToBase64 } from '../utils/audioProcessing';
import performanceMetrics from '../utils/performanceMetrics';


/**
 * Simplified group call audio processing hook
 * Based on 1-to-1 calling pattern: voice â†’ text â†’ broadcast text â†’ translate â†’ display text
 */
const useGroupCallAudioProcessing = (
  localStream,
  socket,
  callRoomId,
  currentLanguage,
  currentUserId,
  isMuted = false
) => {
  const [transcripts, setTranscripts] = useState([]);

  // Audio processing refs
  const audioContextRef = useRef(null);
  const sourceNodeRef = useRef(null);
  const processorNodeRef = useRef(null);

  // Track processed text to prevent duplicates
  const processedTextIdsRef = useRef(new Set());

  // Performance metrics for profiling group call overhead
  const currentMetricRef = useRef(null);

  // TTS playback queue (per-room sequential playback to avoid overlap)
  const ttsQueueRef = useRef([]); // array of { base64, meta }
  const isPlayingRef = useRef(false);
  const runnerRunningRef = useRef(false);
  const currentAudioElRef = useRef(null);

  // Handle mute state changes
  useEffect(() => {
    if (isMuted) {
      console.log('ðŸ”‡ User muted, stopping audio processing');
      cleanupAudioProcessing();
    } else if (localStream && socket?.connected) {
      console.log('ðŸ”Š User unmuted, starting audio processing');
      setupAudioProcessing();
    }
  }, [isMuted]);

  // Initialize audio processing for local stream only
  useEffect(() => {
    if (!localStream || !socket?.connected || isMuted) return;

    setupAudioProcessing();

    return () => {
      cleanupAudioProcessing();
  //   };
  // }, [localStream, socket, callRoomId]);
      cleanupAudioProcessing();
    };
  }, [localStream, socket, callRoomId, isMuted]);

  // Setup audio processing (same as 1-to-1 calling)
  const setupAudioProcessing = async () => {
    try {
      // Initialize audio context
      audioContextRef.current = createOptimizedAudioContext();
      const audioTrack = localStream.getAudioTracks()[0];

      if (!audioTrack) {
        console.error('No audio track found');
        return;
      }

      sourceNodeRef.current = audioContextRef.current.createMediaStreamSource(
        new MediaStream([audioTrack])
      );

      setupScriptProcessor();
    } catch (error) {
      console.error('Audio processing setup failed:', error);
    }
  };

  // Script processor for local audio with instant recognition
  const setupScriptProcessor = () => {
    // Use smaller buffer size for faster processing (2048 = ~46ms at 44.1kHz)
    processorNodeRef.current = audioContextRef.current.createScriptProcessor(2048, 1, 1);
    let audioBuffer = new Float32Array();
    let isProcessing = false;
    let silenceCounter = 0;
    const SILENCE_THRESHOLD = 10; // ~460ms of silence before sending
    const MIN_AUDIO_LENGTH = audioContextRef.current.sampleRate * 0.5; // Minimum 0.5 seconds

    processorNodeRef.current.onaudioprocess = (e) => {
      // Skip if not connected or already processing
      if (!socket?.connected || isProcessing) return;

      const inputData = e.inputBuffer.getChannelData(0);
      
      // Check if current chunk has sound
      const hasCurrentSound = hasSound(inputData);
      
      if (hasCurrentSound) {
        // Add audio data to buffer
        const newBuffer = new Float32Array(audioBuffer.length + inputData.length);
        newBuffer.set(audioBuffer);
        newBuffer.set(inputData, audioBuffer.length);
        audioBuffer = newBuffer;
        silenceCounter = 0; // Reset silence counter when sound is detected
      } else if (audioBuffer.length > 0) {
        // Increment silence counter
        silenceCounter++;
        
        // If we have enough silence and minimum audio length, process the audio
        if (silenceCounter >= SILENCE_THRESHOLD && audioBuffer.length >= MIN_AUDIO_LENGTH) {
          isProcessing = true;
          const bufferToProcess = audioBuffer;
          audioBuffer = new Float32Array(); // Clear buffer immediately
          silenceCounter = 0;
          
          sendAudioForRecognition(bufferToProcess)
            .finally(() => {
              isProcessing = false;
            });
        }
      }
    };

    sourceNodeRef.current.connect(processorNodeRef.current);
    processorNodeRef.current.connect(audioContextRef.current.destination);
  };

  // Send local audio for speech recognition (same as 1-to-1 calling)
  const sendAudioForRecognition = async (audioData) => {
    try {
      // Start performance tracking for group call overhead reduction
      const requestId = `group-${Date.now()}`;
      currentMetricRef.current = performanceMetrics.startTracking(requestId);
      performanceMetrics.recordTimestamp(currentMetricRef.current, 'audioCapture');

      // Don't process audio if user is muted
      if (isMuted) {
        console.log('ðŸ”‡ User is muted, skipping audio processing');
        return;
      }

      // Check socket connection before proceeding
      if (!socket?.connected) {
        console.warn('Socket not connected, cannot send audio for speech recognition');
        return;
      }

      console.log('ðŸ“¤ Sending local audio for group call speech recognition');

      // Convert to PCM and create WAV buffer
      const pcmData = convertToInt16(audioData);
      const wavBuffer = createWavBuffer(pcmData);
      const base64Audio = await convertToBase64(wavBuffer);

      performanceMetrics.recordTimestamp(currentMetricRef.current, 'audioProcessed');

      // Include requestId for tracking
      // const requestId = `group-${Date.now()}`;

      // Send to server for speech recognition
      socket.emit('groupCallRecognizeSpeech', {
        audio: base64Audio,
        sourceLanguage: currentLanguage,
        callRoomId,
        requestId
      });

      // Complete metric after sending
      performanceMetrics.recordTimestamp(currentMetricRef.current, 'serverReceived');
      performanceMetrics.complete(currentMetricRef.current);
    } catch (error) {
      console.error('Error sending audio for group call speech recognition:', error);
    }
  };

  // Cleanup functions
  const cleanupAudioProcessing = () => {
    if (processorNodeRef.current) {
      processorNodeRef.current.disconnect();
      processorNodeRef.current = null;
    }
    if (sourceNodeRef.current) {
      sourceNodeRef.current.disconnect();
      sourceNodeRef.current = null;
    }
  };



  // Set up audio translation event listeners
  useEffect(() => {
    if (!socket || !socket.connected) {
      console.log('Socket not available or not connected, skipping audio processing setup');
      return;
    }

    // Handle recognized speech from other participants
    const handleOriginalText = ({ text, sourceLanguage, speakerId, speakerName, requestId }) => {
      console.log(`ðŸ“ Received original text from ${speakerName}: "${text}"`);

      // Add to transcripts
      setTranscripts(prev => [...prev, {
        userId: speakerId,
        username: speakerName,
        text,
        isTranslated: false,
        language: sourceLanguage,
        timestamp: new Date()
      }].slice(-50));
    };

    // Handle translated text
    // NEW: Handle combined translated speech (text + server-side TTS audio)
    const handleTranslatedSpeech = ({
      translatedText,
      originalText,
      audio,
      speakerId,
      speakerName,
      targetLanguage,
      requestId
    }) => {
      console.log(`🌍 Received translated speech from ${speakerName}: "${translatedText}"`);

      // Add translated text to transcripts
      setTranscripts(prev => [...prev, {
        userId: speakerId,
        username: speakerName,
        text: translatedText,
        isTranslated: true,
        language: targetLanguage,
        timestamp: new Date()
      }].slice(-50));

      // If audio is provided, enqueue it for sequential playback to avoid overlaps
      if (audio) {
        try {
          enqueueTtsAudio(audio, { speakerId, speakerName, requestId, targetLanguage });
        } catch (err) {
          console.error('Failed to enqueue TTS audio:', err);
        }
      }
    };

    // Handle errors
    const handleError = ({ message, requestId }) => {
      console.error(`âŒ Group call error: ${message}`);
    };

    // Register listeners
  socket.on('groupCallOriginalText', handleOriginalText);
  socket.on('groupCallTranslatedSpeech', handleTranslatedSpeech);
    socket.on('groupCallError', handleError);

    return () => {
      socket.off('groupCallOriginalText', handleOriginalText);
      socket.off('groupCallTranslatedSpeech', handleTranslatedSpeech);
      socket.off('groupCallError', handleError);
      // stop any queued TTS playback on unmount
      stopAndCleanupTts();
    };
  }, [socket, currentLanguage, currentUserId, callRoomId]);


  // Utility: convert base64 to Blob (client-side)
  const b64toBlob = (b64Data, contentType = '', sliceSize = 512) => {
    const byteCharacters = atob(b64Data);
    const byteArrays = [];

    for (let offset = 0; offset < byteCharacters.length; offset += sliceSize) {
      const slice = byteCharacters.slice(offset, offset + sliceSize);

      const byteNumbers = new Array(slice.length);
      for (let i = 0; i < slice.length; i++) {
        byteNumbers[i] = slice.charCodeAt(i);
      }

      const byteArray = new Uint8Array(byteNumbers);
      byteArrays.push(byteArray);
    }

    return new Blob(byteArrays, { type: contentType });
  };

  // Enqueue a base64 audio (MP3) for sequential playback
  const enqueueTtsAudio = (base64Audio, meta = {}) => {
    if (!base64Audio) return;
    ttsQueueRef.current.push({ base64: base64Audio, meta });
    // start runner if not running
    if (!runnerRunningRef.current) {
      runnerRunningRef.current = true;
      runTtsQueueRunner();
    }
  };

  // Play single audio element and wait until it ends or errors
  const playAudioAndWait = (audioEl) => {
    return new Promise((resolve) => {
      const onEnded = () => {
        try { audioEl.pause(); audioEl.src = ''; } catch (e) {}
        audioEl.removeEventListener('ended', onEnded);
        audioEl.removeEventListener('error', onError);
        resolve();
      };
      const onError = (err) => {
        console.warn('TTS playback error', err);
        audioEl.removeEventListener('ended', onEnded);
        audioEl.removeEventListener('error', onError);
        try { audioEl.pause(); audioEl.src = ''; } catch (e) {}
        resolve();
      };
      audioEl.addEventListener('ended', onEnded);
      audioEl.addEventListener('error', onError);
      audioEl.play().catch((err) => {
        console.warn('TTS autoplay blocked or failed:', err);
        onError(err);
      });
    });
  };

  // Runner loop that consumes the queue sequentially
  const runTtsQueueRunner = async () => {
    isPlayingRef.current = true;
    while (ttsQueueRef.current.length > 0) {
      const next = ttsQueueRef.current.shift();
      if (!next) break;
      const { base64, meta } = next;
      // stop any existing audio
      if (currentAudioElRef.current) {
        try { currentAudioElRef.current.pause(); currentAudioElRef.current.src = ''; } catch (e) {}
        currentAudioElRef.current = null;
      }
      try {
        const audioUrl = `data:audio/mp3;base64,${base64}`;
        const audioEl = new Audio(audioUrl);
        currentAudioElRef.current = audioEl;
        await playAudioAndWait(audioEl);
        currentAudioElRef.current = null;
      } catch (err) {
        console.error('Error in TTS runner playback:', err);
        currentAudioElRef.current = null;
      }
      // small gap between audios
      // eslint-disable-next-line no-await-in-loop
      await new Promise((res) => setTimeout(res, 50));
    }
    isPlayingRef.current = false;
    runnerRunningRef.current = false;
  };

  // Stop and clean up queue and any playing audio
  const stopAndCleanupTts = () => {
    ttsQueueRef.current = [];
    const audioEl = currentAudioElRef.current;
    if (audioEl) {
      try { audioEl.pause(); audioEl.src = ''; } catch (e) {}
      currentAudioElRef.current = null;
    }
    isPlayingRef.current = false;
    runnerRunningRef.current = false;
  };

  return {
    transcripts
  };
};

export default useGroupCallAudioProcessing;