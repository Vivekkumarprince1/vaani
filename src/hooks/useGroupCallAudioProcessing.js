import { useState, useEffect, useRef } from 'react';
import { createOptimizedAudioContext, hasSound, convertToInt16, createWavBuffer, convertToBase64 } from '../utils/audioProcessing';  // Initialize audio processing for local      // Text will be displayed using TextReader component    // Note: Text will be displayed using text reader componenttream only


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

      // Include requestId for tracking
      const requestId = `group-${Date.now()}`;

      // Send to server for speech recognition
      socket.emit('groupCallRecognizeSpeech', {
        audio: base64Audio,
        sourceLanguage: currentLanguage,
        callRoomId,
        requestId
      });
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

      // Request translation to my language
      socket.emit('groupCallTranslateText', {
        text,
        sourceLanguage,
        targetLanguage: currentLanguage,
        speakerId,
        speakerName,
        requestId
      });
    };

    // Handle translated text
    const handleTranslatedText = ({
      translatedText,
      originalText,
      speakerId,
      speakerName,
      targetLanguage,
      requestId
    }) => {
      console.log(`ðŸŒ Received translation from ${speakerName}: "${translatedText}"`);

      // Add to transcripts
      setTranscripts(prev => [...prev, {
        userId: speakerId,
        username: speakerName,
        text: translatedText,
        isTranslated: true,
        language: targetLanguage,
        timestamp: new Date()
      }].slice(-50));

      // Text will be displayed using TextReader component
    };

    // Handle errors
    const handleError = ({ message, requestId }) => {
      console.error(`âŒ Group call error: ${message}`);
    };

    // Register listeners
    socket.on('groupCallOriginalText', handleOriginalText);
    socket.on('groupCallTranslatedText', handleTranslatedText);
    socket.on('groupCallError', handleError);

    return () => {
      socket.off('groupCallOriginalText', handleOriginalText);
      socket.off('groupCallTranslatedText', handleTranslatedText);
      socket.off('groupCallError', handleError);
    };
  }, [socket, currentLanguage, currentUserId, callRoomId]);

  return {
    transcripts
  };
};

export default useGroupCallAudioProcessing;