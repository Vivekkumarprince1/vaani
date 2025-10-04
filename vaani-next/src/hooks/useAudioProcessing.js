'use client'

import { useState, useEffect, useRef } from 'react';
import { createOptimizedAudioContext, hasSound, convertToInt16, createWavBuffer, convertToBase64 } from '../utils/audioProcessing';
import AudioMixer from '../services/AudioMixer';

/**
 * Custom hook for real-time audio processing and translation in calls
 * Modified to implement text-based translation workflow:
 * 1. Speaking side: Voice recognition only (voice-to-text)
 * 2. Send text data only (not audio) to the other side
 * 3. Receiving side: Translate text and convert to speech
 */
const useAudioProcessing = (localStream, remoteStream, socket, selectedUser, currentLanguage, peerConnection = null) => {
  // Separate tracking for local (what I said) vs remote (what they said)
  const [localOriginal, setLocalOriginal] = useState('');      // What I said in my language
  const [localTranslated, setLocalTranslated] = useState('');  // What they heard (translated)
  const [remoteOriginal, setRemoteOriginal] = useState('');    // What they said in their language
  const [remoteTranslated, setRemoteTranslated] = useState(''); // What I heard (translated)
  
  // Legacy states for backward compatibility
  const [transcribedText, setTranscribedText] = useState('');
  const [translatedText, setTranslatedText] = useState('');
  const [localTranscript, setLocalTranscript] = useState('');
  const [remoteTranscript, setRemoteTranscript] = useState('');
  const [isRemoteAudioProcessing, setIsRemoteAudioProcessing] = useState(false);
  const [callParticipant, setCallParticipant] = useState(null);
  
  // Audio processing refs
  const audioContextRef = useRef(null);
  const sourceNodeRef = useRef(null);
  const processorNodeRef = useRef(null);
  const audioMixerRef = useRef(null);
  
  // Audio playback queue system
  const audioQueueRef = useRef([]);
  const isPlayingRef = useRef(false);
  
  // Track processed text to prevent duplicates
  const processedTextIdsRef = useRef(new Set());
  const processedAudioIdsRef = useRef(new Set());
  
  // Speech synthesis ref
  const speechSynthRef = useRef(typeof window !== 'undefined' ? window.speechSynthesis : null);

  // Initialize AudioMixer for text-to-speech playback on receiving side
  useEffect(() => {
    if (typeof window === 'undefined') return;

    audioMixerRef.current = new AudioMixer();
    
    // We no longer need to replace audio tracks since we're sending text data
    // The original audio tracks will be used for voice recognition only
    
    // Inform server that audio system is ready
    if (socket?.connected) {
      socket.emit('audioSystemReady', { ready: true });
      console.log('✅ Audio system ready event sent to server');
    }
    
    // Create a function to unlock audio context on user interaction
    const unlockAudio = async () => {
      try {
        if (audioMixerRef.current) {
          await audioMixerRef.current.ensureAudioContextActive();
          console.log('✅ Audio context unlocked by user interaction');
        }
      } catch (err) {
        console.warn('⚠️ Error unlocking audio context:', err);
      }
    };
    
    // Add event listeners to unlock audio on user interaction
    document.addEventListener('click', unlockAudio, { once: true });
    document.addEventListener('touchstart', unlockAudio, { once: true });
    document.addEventListener('keydown', unlockAudio, { once: true });
    
    return () => {
      // Clean up event listeners
      document.removeEventListener('click', unlockAudio);
      document.removeEventListener('touchstart', unlockAudio);
      document.removeEventListener('keydown', unlockAudio);
      
      // Cancel any ongoing speech synthesis
      if (typeof window !== 'undefined' && speechSynthRef.current) {
        speechSynthRef.current.cancel();
      }
      
      if (audioMixerRef.current && audioMixerRef.current.cleanup) {
        audioMixerRef.current.cleanup();
      }
    };
  }, [socket, peerConnection]);

  // Audio queue processor with intelligent playback
  const processAudioQueue = async () => {
    if (isPlayingRef.current || audioQueueRef.current.length === 0) return;
    
    try {
      isPlayingRef.current = true;
      const nextAudio = audioQueueRef.current.shift();
      
      // Show audio notification
      const audioNotification = document.createElement('div');
      audioNotification.textContent = '🔊 Playing translated audio...';
      audioNotification.style.cssText = `
        position: fixed;
        top: 80px;
        left: 50%;
        transform: translateX(-50%);
        background-color: rgba(0,0,0,0.8);
        color: white;
        padding: 12px 24px;
        border-radius: 8px;
        z-index: 9999;
        font-size: 14px;
        box-shadow: 0 4px 6px rgba(0,0,0,0.1);
      `;
      document.body.appendChild(audioNotification);
      
      console.log(`🎵 Playing audio from queue (${audioQueueRef.current.length} remaining)`);
      
      try {
        // Ensure audio context is active
        await audioMixerRef.current.ensureAudioContextActive();
        
        // Play locally (for the receiver to hear the translated audio from remote user)
        await audioMixerRef.current.playTranslatedAudio(nextAudio);
        console.log('✅ Audio playback successful (hearing remote user\'s translated speech)');
      } catch (error) {
        console.error('⚠️ Primary playback failed, trying fallback:', error);
        
        try {
          // Fallback to Audio element
          const audioElement = new Audio(`data:audio/wav;base64,${nextAudio}`);
          await audioElement.play();
          console.log('✅ Fallback audio playback successful');
        } catch (fallbackError) {
          console.error('❌ All playback methods failed:', fallbackError);
        }
      } finally {
        // Remove notification
        if (document.body.contains(audioNotification)) {
          setTimeout(() => {
            if (document.body.contains(audioNotification)) {
              document.body.removeChild(audioNotification);
            }
          }, 500);
        }
        
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

  // Get the correct target user
  const getTargetUser = () => {
    return callParticipant || selectedUser;
  };

  // Request participant info from server when mounted
  useEffect(() => {
    if (!socket?.connected || !selectedUser?.id) return;
    
    socket.emit('getCallParticipantInfo', { userId: selectedUser.id });
  }, [socket, selectedUser]);

  // Audio processing setup for local stream
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

  // Script processor for local audio
  const setupScriptProcessor = () => {
    processorNodeRef.current = audioContextRef.current.createScriptProcessor(8192, 1, 1);
    let audioBuffer = new Float32Array();
    let lastProcessingTime = Date.now();
    let isProcessing = false;
    
    processorNodeRef.current.onaudioprocess = (e) => {
      // Skip if muted or already processing
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
          sendAudioForTranslation(audioBuffer)
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


  // Send local audio for complete speech translation pipeline (STT -> Translation -> TTS)
  const sendAudioForTranslation = async (audioData) => {
    try {
      // Check socket connection before proceeding
      if (!socket?.connected) {
        console.warn('Socket not connected, cannot send audio for speech translation');
        return;
      }
      
      const targetUser = getTargetUser();
      // Use fallback values if target user info is missing
      const targetLanguage = targetUser?.preferredLanguage || 'en';
      const targetUserId = targetUser?.id || 'unknown';
      
      console.log('📤 Sending local audio for complete speech translation pipeline:', {
        myLanguage: currentLanguage,
        theirLanguage: targetLanguage,
        userId: targetUserId
      });
      
      // Convert to PCM and create WAV buffer
      const pcmData = convertToInt16(audioData);
      const wavBuffer = createWavBuffer(pcmData);
      const base64Audio = await convertToBase64(wavBuffer);
      
      // Include requestId for tracking
      const requestId = `speech-${Date.now()}`;
      
      // Use new full pipeline event instead of step-by-step approach
      socket.emit('translateSpeech', {
        audio: base64Audio,
        sourceLanguage: currentLanguage,
        targetLanguage,
        userId: targetUserId,
        sampleRate: 16000,
        encoding: 'WAV',
        requestId
      });
    } catch (error) {
      console.error('Error sending audio for speech translation:', error);
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

  // Initialize audio processing for local stream only
  // Remote stream should NOT be processed - it already contains translated audio from the other person
  useEffect(() => {
    if (!localStream || !socket?.connected) return;

    setupAudioProcessing();

    return () => {
      cleanupAudioProcessing();
    };
  }, [localStream, socket, callParticipant, currentLanguage]);

  // Text-to-speech function for playing translated text
  const speakText = (text, language) => {
    if (typeof window === 'undefined' || !speechSynthRef.current || !text) {
      console.log('undefined or empty text');
      return;
    }

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
    
    // Handle translated audio
    const handleTranslatedAudio = async (data) => {
      if (!data) return;

      const { text, audio, requestId, isRemote } = data;
      
      console.log(`⭐ RECEIVED translatedAudio event`, {
        hasText: !!text,
        hasAudio: !!audio,
        audioLength: audio ? audio.length : 0,
        requestId,
        isRemote,
        direction: isRemote ? 'THEIR SPEECH → MY EARS' : 'MY SPEECH → DISPLAY ON MY LOCAL VIDEO'
      });

      // Update UI with transcription/translation text
      if (text) {
        if (!isRemote) {
          // This is MY speech - show on MY local video (small PIP)
          // Display what I said in my language
          setLocalOriginal(text.original || '');     // What I said
          setLocalTranslated(text.translated || ''); // What they heard
          console.log('📝 Updated LOCAL video (what I said):', {
            original: text.original,
            translated: text.translated
          });
        } else {
          // This is THEIR speech - show on THEIR remote video (main view)
          // Display the translation in my language
          setRemoteOriginal(text.original || '');      // What they said
          setRemoteTranslated(text.translated || '');  // What I heard (translated to my language)
          console.log('📝 Updated REMOTE video (what they said):', {
            original: text.original,
            translated: text.translated
          });
        }
        
        // Legacy states for backward compatibility
        setTranscribedText(text.original || '');
        setTranslatedText(text.translated || '');
      }

      // Queue the translated audio if available (only for remote audio that I need to hear)
      if (audio && isRemote) {
        queueAudio(audio, requestId);
      } else if (audio && !isRemote) {
        // This is MY translated speech that should be sent to the OTHER person
        // Send it through WebRTC if available
        if (translatedAudioDestinationRef.current) {
          try {
            const audioContext = translatedAudioDestinationRef.current.context;
            const audioBuffer = await fetch(`data:audio/wav;base64,${audio}`)
              .then(response => response.arrayBuffer())
              .then(arrayBuffer => audioContext.decodeAudioData(arrayBuffer));
            
            const sourceNode = audioContext.createBufferSource();
            sourceNode.buffer = audioBuffer;
            sourceNode.connect(translatedAudioDestinationRef.current);
            sourceNode.start();
            
            console.log('✅ My translated audio sent through WebRTC to remote peer');
          } catch (webrtcError) {
            console.warn('⚠️ Failed to send my translated audio through WebRTC:', webrtcError);
          }
        }
      } else if (!audio) {
        console.warn('Received translatedAudio event without audio data');
      }
    };

    // Handle recognized speech events (legacy - kept for backward compatibility)
    const handleRecognizedSpeech = ({ text, isLocal, requestId }) => {
      console.log(`Received speech recognition result, isLocal: ${isLocal}`, { text });
      
      if (isLocal) {
        // Update what I said - but don't send for translation since full pipeline handles it
        setLocalOriginal(text);
        setLocalTranscript(text);
        console.log('📝 Local speech recognized (legacy handler):', text);
      } else {
        // Update what they said
        setRemoteOriginal(text);
        setRemoteTranscript(text);
        console.log('📝 Remote speech recognized (legacy handler):', text);
      }
    };
    
    // Handle translated text events (legacy - kept for backward compatibility)
    const handleTranslatedText = ({ originalText, translatedText, isLocal, requestId, targetLanguage }) => {
      console.log(`Received translated text, isLocal: ${isLocal}`, { 
        original: originalText, 
        translated: translatedText,
        targetLanguage
      });
      
      if (isLocal) {
        // What they heard (my speech translated to their language)
        setLocalTranslated(translatedText);
        console.log('📝 Local text translated (legacy handler):', translatedText);
      } else {
        // What I heard (their speech translated to my language)
        setRemoteTranslated(translatedText);
        console.log('📝 Remote text translated (legacy handler):', translatedText);
        
        // Don't request TTS here since full pipeline handles it
      }
    };
    
    // Handle transcript updates (legacy)
    const handleAudioTranscript = ({ text, isLocal }) => {
      console.log(`Received transcript update, isLocal: ${isLocal}`, { text });
      if (isLocal) {
        setLocalTranscript(text);
      } else {
        setRemoteTranscript(text);
      }
    };
    
    // Handle TTS audio from server
    const handleTTSAudio = async ({ audio, requestId }) => {
      console.log('🔊 Received TTS audio from server:', { 
        audioLength: audio ? audio.length : 0,
        requestId 
      });
      
      if (!audio) {
        console.warn('No audio data in TTS response');
        return;
      }
      
      try {
        // Play the audio through AudioMixer
        if (audioMixerRef.current) {
          console.log('🎵 Playing TTS audio through AudioMixer');
          await audioMixerRef.current.playTranslatedAudio(audio);
          console.log('✅ TTS audio playback completed');
        } else {
          console.warn('AudioMixer not available');
        }
      } catch (error) {
        console.error('Error playing TTS audio:', error);
      }
    };
    
    // Handle TTS errors
    const handleTTSError = ({ message, requestId }) => {
      console.error('TTS generation error:', { message, requestId });
    };
    
    // NEW: Handle complete speech translation pipeline response
    const handleTranslatedSpeech = async (data) => {
      if (!data) return;

      const { text, audio, isLocal, requestId, targetLanguage } = data;
      
      console.log(`⭐ RECEIVED translatedSpeech event (FULL PIPELINE)`, {
        hasText: !!text,
        hasAudio: !!audio,
        audioLength: audio ? audio.length : 0,
        requestId,
        isLocal,
        direction: isLocal ? 'MY SPEECH → THEIR EARS' : 'THEIR SPEECH → MY EARS'
      });

      // Update UI with transcription/translation text
      if (text) {
        if (isLocal) {
          // This is MY speech - show on MY local video (small PIP)
          // Display what I said in my language and what they heard
          setLocalOriginal(text.original || '');     // What I said
          setLocalTranslated(text.translated || ''); // What they heard
          console.log('📝 Updated LOCAL video (what I said):', {
            original: text.original,
            translated: text.translated
          });
        } else {
          // This is THEIR speech - show on THEIR remote video (main view)
          // Display what they said and what I heard (translated to my language)
          setRemoteOriginal(text.original || '');      // What they said
          setRemoteTranslated(text.translated || '');  // What I heard (translated)
          console.log('📝 Updated REMOTE video (what they said):', {
            original: text.original,
            translated: text.translated
          });
        }
        
        // Legacy states for backward compatibility
        setTranscribedText(text.original || '');
        setTranslatedText(text.translated || '');
      }

      // Play the translated audio if available (only for remote audio that I need to hear)
      if (audio && !isLocal) {
        queueAudio(audio, requestId);
      } else if (audio && isLocal) {
        // Local translated audio is handled by the server sending it to the remote peer
        console.log('✅ Local translated audio processed by server');
      } else if (!audio) {
        console.warn('Received translatedSpeech event without audio data');
      }
    };
    
    // Listen for the new full pipeline event
    socket.on('translatedSpeech', handleTranslatedSpeech);
    
    // Keep legacy listeners for backward compatibility (can be removed later)
    socket.on('recognizedSpeech', handleRecognizedSpeech);
    socket.on('translatedText', handleTranslatedText);
    socket.on('translatedAudio', handleTranslatedAudio);
    socket.on('audioTranscript', handleAudioTranscript);
    socket.on('ttsAudio', handleTTSAudio);
    socket.on('ttsError', handleTTSError);
    
    // Handle participant info updates
    socket.on('callParticipantInfo', (data) => {
      if (data.participantInfo) {
        console.log('Received call participant info:', data.participantInfo);
        setCallParticipant(data.participantInfo);
      }
    });

    // Add listeners for debugging - only log actual errors
    const handleSocketError = (error) => {
      try {
        // Some socket implementations emit an empty object or undefined as a non-fatal event
        if (!error || (typeof error === 'object' && Object.keys(error).length === 0)) {
          // Use debug level to avoid noisy console output for normal connection events
          console.debug('Socket error event received but no payload (likely non-fatal connection event)');
          return;
        }

        // If it's an Error instance, log the stack for more context
        if (error instanceof Error) {
          console.error('Socket error in audio processing:', error.stack || error.message || error);
          return;
        }

        // If it's a string, log it directly
        if (typeof error === 'string') {
          console.error('Socket error in audio processing:', error);
          return;
        }

        // For objects, try to stringify safely; fall back to direct logging
        try {
          const serialized = JSON.stringify(error);
          console.error('Socket error in audio processing:', serialized);
        } catch (serErr) {
          console.error('Socket error in audio processing (non-serializable payload):', error);
        }
      } catch (handlerErr) {
        // Ensure the error handler itself never throws
        console.error('Unexpected error in socket error handler:', handlerErr);
      }
    };

    socket.on('error', handleSocketError);

    return () => {
      socket.off('recognizedSpeech', handleRecognizedSpeech);
      socket.off('translatedText', handleTranslatedText);
      socket.off('translatedAudio', handleTranslatedAudio);
      socket.off('audioTranscript', handleAudioTranscript);
      socket.off('ttsAudio', handleTTSAudio);
      socket.off('ttsError', handleTTSError);
      socket.off('callParticipantInfo');
      // Remove the error handler using the same function reference
      socket.off('error', handleSocketError);
    };
  }, [socket, currentLanguage]);

  return {
    transcribedText,
    translatedText,
    localTranscript,
    remoteTranscript,
    callParticipant,
    setCallParticipant,
    // New clear transcription/translation tracking
    localOriginal,      // What I said
    localTranslated,    // What they heard
    remoteOriginal,     // What they said
    remoteTranslated    // What I heard
  };
};

export default useAudioProcessing;
