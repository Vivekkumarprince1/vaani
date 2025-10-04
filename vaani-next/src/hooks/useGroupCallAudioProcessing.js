import { useState, useEffect, useRef } from 'react';
import { createOptimizedAudioContext, hasSound, convertToInt16, createWavBuffer, convertToBase64 } from '../utils/audioProcessing';  // Initialize audio processing for local stream only


/**
 * Simplified group call audio processing hook
 * Based on 1-to-1 calling pattern: voice → text → broadcast text → translate → TTS
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

  // Audio queue for translated speech playback
  const audioQueueRef = useRef([]);
  const isPlayingRef = useRef(false);

  // Track processed text to prevent duplicates
  const processedTextIdsRef = useRef(new Set());
  const processedAudioIdsRef = useRef(new Set());

  // Speech synthesis ref
  const speechSynthRef = useRef(typeof window !== 'undefined' ? window.speechSynthesis : null);

  // Handle mute state changes
  useEffect(() => {
    if (isMuted) {
      console.log('🔇 User muted, stopping audio processing');
      cleanupAudioProcessing();
    } else if (localStream && socket?.connected) {
      console.log('🔊 User unmuted, starting audio processing');
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

  // Script processor for local audio (same as 1-to-1 calling)
  const setupScriptProcessor = () => {
    processorNodeRef.current = audioContextRef.current.createScriptProcessor(8192, 1, 1);
    let audioBuffer = new Float32Array();
    let lastProcessingTime = Date.now();
    let isProcessing = false;

    processorNodeRef.current.onaudioprocess = (e) => {
      // Skip if not connected or already processing
      if (!socket?.connected || isProcessing) return;

      const inputData = e.inputBuffer.getChannelData(0);
      const newBuffer = new Float32Array(audioBuffer.length + inputData.length);
      newBuffer.set(audioBuffer);
      newBuffer.set(inputData, audioBuffer.length);
      audioBuffer = newBuffer;

      const now = Date.now();
      // Process every 3 seconds for better recognition
      if (now - lastProcessingTime >= 3000 && audioBuffer.length > 0) {
        if (hasSound(audioBuffer)) {
          isProcessing = true;
          sendAudioForRecognition(audioBuffer)
            .finally(() => {
              isProcessing = false;
              audioBuffer = new Float32Array();
              lastProcessingTime = now;
            });
        } else {
          // Clear buffer if no sound detected
          audioBuffer = new Float32Array();
          lastProcessingTime = now;
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
        console.log('🔇 User is muted, skipping audio processing');
        return;
      }

      // Check socket connection before proceeding
      if (!socket?.connected) {
        console.warn('Socket not connected, cannot send audio for speech recognition');
        return;
      }

      console.log('📤 Sending local audio for group call speech recognition');

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

    // Audio queue processor with intelligent playback
  const processAudioQueue = async () => {
    if (isPlayingRef.current || audioQueueRef.current.length === 0) return;

    try {
      isPlayingRef.current = true;
      const nextAudio = audioQueueRef.current.shift();

      console.log(`🎵 Playing audio from queue (${audioQueueRef.current.length} remaining)`);
      console.log(`🔊 Audio data length: ${nextAudio.length}, type: ${typeof nextAudio}`);
      console.log(`🔊 Audio data starts with: ${nextAudio.substring(0, 100)}...`);

      try {
        // Try to play using AudioContext.decodeAudioData (same as 1-to-1 calling)
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();

        if (audioContext) {
          try {
            // Convert base64 to ArrayBuffer and decode
            const audioBuffer = await fetch(`data:audio/wav;base64,${nextAudio}`)
              .then(response => response.arrayBuffer())
              .then(arrayBuffer => audioContext.decodeAudioData(arrayBuffer));

            // Create and play audio source
            const source = audioContext.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(audioContext.destination);
            source.start();

            console.log('✅ Audio playback successful using AudioContext');
            return; // Success, exit early
          } catch (decodeError) {
            console.warn('⚠️ AudioContext decode failed:', decodeError.message);
            console.warn('⚠️ Audio data length:', nextAudio.length);
            console.warn('⚠️ Audio data starts with:', nextAudio.substring(0, 100));
          }
        }

        // Fallback to Audio element with different MIME types
        const audioUrls = [
          `data:audio/wav;base64,${nextAudio}`,
          `data:audio/mpeg;base64,${nextAudio}`,
          `data:audio/mp3;base64,${nextAudio}`,
          `data:audio/ogg;base64,${nextAudio}`
        ];

        let played = false;
        for (const audioUrl of audioUrls) {
          try {
            const audioElement = new Audio(audioUrl);
            audioElement.volume = 1.0;

            audioElement.onended = () => {
              console.log('✅ Finished playing translated audio');
            };

            await audioElement.play();
            console.log('✅ Audio playback successful using Audio element');
            played = true;
            break; // Success, exit loop
          } catch (audioError) {
            console.warn(`⚠️ Audio element failed for ${audioUrl.split(':')[1].split(';')[0]}:`, audioError.message);
          }
        }

        if (!played) {
          throw new Error('All audio formats failed');
        }
      } catch (error) {
        console.error('❌ All playback methods failed:', error);
      } finally {
        // Small delay before processing next item
        setTimeout(() => {
          isPlayingRef.current = false;
          processAudioQueue(); // Process next audio in queue
        }, 500);
      }
    } catch (error) {
      console.error('❌ Error in processAudioQueue:', error);
      isPlayingRef.current = false;
      processAudioQueue(); // Try next item in queue
    }
  };

  // Generate a unique identifier for audio data
  const generateAudioId = (audioData, requestId) => {
    if (requestId) return requestId;

    // Simple hash function for audio data
    let hash = 0;
    const sample = audioData.substring(0, 100);
    for (let i = 0; i < sample.length; i++) {
      hash = ((hash << 5) - hash) + audioData.charCodeAt(i);
      hash |= 0;
    }
    return `audio-${Date.now()}-${hash}`;
  };

  // Add audio to queue with duplicate prevention
  const queueAudio = (audioData, requestId) => {
    const audioId = generateAudioId(audioData, requestId);

    // Check if we've already processed this audio
    if (processedAudioIdsRef.current.has(audioId)) {
      console.log(`⏭️ Skipping duplicate audio: ${audioId}`);
      return;
    }

    // Add to processed set
    processedAudioIdsRef.current.add(audioId);

    // Limit the size of the set to prevent memory leaks
    if (processedAudioIdsRef.current.size > 100) {
      const oldestId = Array.from(processedAudioIdsRef.current)[0];
      processedAudioIdsRef.current.delete(oldestId);
    }

    // Add to queue
    audioQueueRef.current.push(audioData);
    console.log(`📥 Added audio to queue (length: ${audioQueueRef.current.length}, ID: ${audioId})`);

    // Start processing queue if not already playing
    if (!isPlayingRef.current) {
      processAudioQueue();
    }
  };

  // Text-to-speech function for playing translated text
  const speakText = (text, language) => {
    if (typeof window === 'undefined' || !speechSynthRef.current || !text) return;

    // Cancel any ongoing speech
    speechSynthRef.current.cancel();

    // Create utterance
    const utterance = new SpeechSynthesisUtterance(text);

    // Set language
    if (language) {
      utterance.lang = language;
    }

    // Set voice (optional)
    const voices = speechSynthRef.current.getVoices();
    const matchingVoice = voices.find(voice => voice.lang.startsWith(language));
    if (matchingVoice) {
      utterance.voice = matchingVoice;
    }

    // Adjust settings for better clarity
    utterance.rate = 1.0;  // Normal speed
    utterance.pitch = 1.0; // Normal pitch
    utterance.volume = 1.0; // Full volume

    // Speak the text
    speechSynthRef.current.speak(utterance);

    console.log(`🔊 Speaking text: "${text}" in language: ${language}`);
  };

  // Set up audio translation event listeners
  useEffect(() => {
    if (!socket || !socket.connected) {
      console.log('Socket not available or not connected, skipping audio processing setup');
      return;
    }

    // Handle recognized speech from other participants
    const handleOriginalText = ({ text, sourceLanguage, speakerId, speakerName, requestId }) => {
      console.log(`📝 Received original text from ${speakerName}: "${text}"`);

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
      console.log(`🌍 Received translation from ${speakerName}: "${translatedText}"`);

      // Add to transcripts
      setTranscripts(prev => [...prev, {
        userId: speakerId,
        username: speakerName,
        text: translatedText,
        isTranslated: true,
        language: targetLanguage,
        timestamp: new Date()
      }].slice(-50));

      // Request text-to-speech synthesis
      socket.emit('groupCallSynthesizeSpeech', {
        text: translatedText,
        targetLanguage: currentLanguage,
        speakerId,
        speakerName,
        requestId
      });
    };

    // Handle synthesized audio
    const handleSynthesizedAudio = ({ audio, speakerId, speakerName, targetLanguage }) => {
      console.log(`🔊 Received synthesized audio from ${speakerName} in ${targetLanguage}`);

      // Queue the translated audio for playback
      if (audio) {
        queueAudio(audio, `${speakerId}-${Date.now()}`);
      }
    };

    // Handle errors
    const handleError = ({ message, requestId }) => {
      console.error(`❌ Group call error: ${message}`);
    };

    // Register listeners
    socket.on('groupCallOriginalText', handleOriginalText);
    socket.on('groupCallTranslatedText', handleTranslatedText);
    socket.on('groupCallSynthesizedAudio', handleSynthesizedAudio);
    socket.on('groupCallError', handleError);

    return () => {
      socket.off('groupCallOriginalText', handleOriginalText);
      socket.off('groupCallTranslatedText', handleTranslatedText);
      socket.off('groupCallSynthesizedAudio', handleSynthesizedAudio);
      socket.off('groupCallError', handleError);
    };
  }, [socket, currentLanguage, currentUserId, callRoomId]);

  return {
    transcripts
  };
};

export default useGroupCallAudioProcessing;
