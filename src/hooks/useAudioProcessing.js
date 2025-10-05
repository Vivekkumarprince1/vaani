'use client'

import { useState, useEffect, useRef } from 'react';
import { createOptimizedAudioContext, hasSound, convertToInt16, createWavBuffer, convertToBase64 } from '../utils/audioProcessing';
import performanceMetrics from '../utils/performanceMetrics';

/**
 * OPTIMIZED: Ultra-low latency audio processing
 * Key improvements:
 * 1. Streaming recognition (partial results)
 * 2. Reduced buffer sizes
 * 3. Parallel processing where possible
 * 4. Optimistic UI updates
 * 5. Performance metrics tracking
 */
const useAudioProcessing = (localStream, remoteStream, socket, selectedUser, currentLanguage, peerConnection = null) => {
  // Separate tracking for local vs remote
  const [localOriginal, setLocalOriginal] = useState('');
  const [localTranslated, setLocalTranslated] = useState('');
  const [remoteOriginal, setRemoteOriginal] = useState('');
  const [remoteTranslated, setRemoteTranslated] = useState('');
  
  // Legacy states
  const [transcribedText, setTranscribedText] = useState('');
  const [translatedText, setTranslatedText] = useState('');
  const [localTranscript, setLocalTranscript] = useState('');
  const [remoteTranscript, setRemoteTranscript] = useState('');
  const [callParticipant, setCallParticipant] = useState(null);
  
  // Audio processing refs
  const audioContextRef = useRef(null);
  const sourceNodeRef = useRef(null);
  const processorNodeRef = useRef(null);
  
  // Performance optimization refs
  const lastProcessTimeRef = useRef(0);
  const pendingAudioRef = useRef([]);
  const isProcessingRef = useRef(false);
  
  // ✅ Performance metrics tracking
  const currentMetricRef = useRef(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    if (socket?.connected) {
      socket.emit('audioSystemReady', { ready: true });
      console.log('✅ Audio system ready');
    }
  }, [socket, peerConnection]);

  const getTargetUser = () => {
    return callParticipant || selectedUser;
  };

  useEffect(() => {
    if (!socket?.connected || !selectedUser?.id) return;
    socket.emit('getCallParticipantInfo', { userId: selectedUser.id });
  }, [socket, selectedUser]);

  const setupAudioProcessing = async () => {
    try {
      audioContextRef.current = createOptimizedAudioContext();
      const audioTrack = localStream.getAudioTracks()[0];
      
      if (!audioTrack) {
        console.error('No audio track found');
        return;
      }
      
      sourceNodeRef.current = audioContextRef.current.createMediaStreamSource(
        new MediaStream([audioTrack])
      );
      
      setupOptimizedScriptProcessor();
    } catch (error) {
      console.error('Audio processing setup failed:', error);
    }
  };

  /**
   * OPTIMIZED: Reduced latency audio processor
   * Key changes:
   * - Smaller buffer (512 samples = ~32ms at 16kHz)
   * - Reduced silence threshold (3 chunks = ~96ms)
   * - Minimum audio reduced to 0.3s
   * - Debounced processing
   */
  const setupOptimizedScriptProcessor = () => {
    // CRITICAL: Use 512 buffer size for ~32ms latency (was 2048 = ~128ms)
    processorNodeRef.current = audioContextRef.current.createScriptProcessor(512, 1, 1);
    let audioBuffer = new Float32Array();
    let silenceCounter = 0;
    
    // OPTIMIZED: Reduce thresholds for faster response
    const SILENCE_THRESHOLD = 2; // ~64ms of silence (was 96ms)
    const MIN_AUDIO_LENGTH = audioContextRef.current.sampleRate * 0.3; // 0.3s min (was 0.5s)
    const MIN_PROCESS_INTERVAL = 150; // Minimum 150ms between sends
    
    processorNodeRef.current.onaudioprocess = (e) => {
      if (!socket?.connected || isProcessingRef.current) return;
  
      const inputData = e.inputBuffer.getChannelData(0);
      const hasCurrentSound = hasSound(inputData, 0.003); // Lower threshold
      
      if (hasCurrentSound) {
        const newBuffer = new Float32Array(audioBuffer.length + inputData.length);
        newBuffer.set(audioBuffer);
        newBuffer.set(inputData, audioBuffer.length);
        audioBuffer = newBuffer;
        silenceCounter = 0;
      } else if (audioBuffer.length > 0) {
        silenceCounter++;
        
        // Check if enough silence and minimum audio length
        if (silenceCounter >= SILENCE_THRESHOLD && audioBuffer.length >= MIN_AUDIO_LENGTH) {
          const now = Date.now();
          const timeSinceLastProcess = now - lastProcessTimeRef.current;
          
          // Debounce to prevent too frequent sends
          if (timeSinceLastProcess >= MIN_PROCESS_INTERVAL) {
            isProcessingRef.current = true;
            lastProcessTimeRef.current = now;
            
            const bufferToProcess = audioBuffer;
            audioBuffer = new Float32Array();
            silenceCounter = 0;
            
            sendAudioForTranslation(bufferToProcess)
              .finally(() => {
                isProcessingRef.current = false;
              });
          }
        }
      }
    };
  
    sourceNodeRef.current.connect(processorNodeRef.current);
    processorNodeRef.current.connect(audioContextRef.current.destination);
  };

  /**
   * OPTIMIZED: Faster audio transmission with performance tracking
   */
  const sendAudioForTranslation = async (audioData) => {
    try {
      if (!socket?.connected) return;
      
      const targetUser = getTargetUser();
      const targetLanguage = targetUser?.preferredLanguage || 'en';
      const targetUserId = targetUser?.id || 'unknown';
      
      const requestId = `speech-${Date.now()}`;
      
      // ✅ Start performance tracking
      const metric = performanceMetrics.startTracking(requestId);
      performanceMetrics.recordTimestamp(metric, 'audioCapture');
      currentMetricRef.current = metric;
      
      // Convert and send immediately - no delays
      const pcmData = convertToInt16(audioData);
      const wavBuffer = createWavBuffer(pcmData);
      const base64Audio = await convertToBase64(wavBuffer);
      
      performanceMetrics.recordTimestamp(metric, 'audioProcessed');
      
      // Single event for entire pipeline
      socket.emit('translateSpeech', {
        audio: base64Audio,
        sourceLanguage: currentLanguage,
        targetLanguage,
        userId: targetUserId,
        sampleRate: 16000,
        encoding: 'WAV',
        requestId,
        timestamp: Date.now() // For latency tracking
      });
    } catch (error) {
      console.error('Error sending audio:', error);
    }
  };


   // In useAudioProcessing.js
// Change the socket emit event from 'translateSpeech' to 'translateSpeechOptimized'

// const sendAudioForTranslation = async (audioData) => {
//   try {
//     if (!socket?.connected) return;
    
//     const targetUser = getTargetUser();
//     const targetLanguage = targetUser?.preferredLanguage || 'en';
//     const targetUserId = targetUser?.id || 'unknown';
    
//     const requestId = `speech-${Date.now()}`;
    
//     const metric = performanceMetrics.startTracking(requestId);
//     performanceMetrics.recordTimestamp(metric, 'audioCapture');
//     currentMetricRef.current = metric;
    
//     const pcmData = convertToInt16(audioData);
//     const wavBuffer = createWavBuffer(pcmData);
//     const base64Audio = await convertToBase64(wavBuffer);
    
//     performanceMetrics.recordTimestamp(metric, 'audioProcessed');
    
//     // 🚀 CRITICAL CHANGE: Use optimized event instead
//     socket.emit('translateSpeechOptimized', {  // ← Changed from 'translateSpeech'
//       audio: base64Audio,
//       sourceLanguage: currentLanguage,
//       targetLanguage,
//       userId: targetUserId,
//       sampleRate: 16000,
//       encoding: 'WAV',
//       requestId,
//       timestamp: Date.now()
//     });
//   } catch (error) {
//     console.error('Error sending audio:', error);
//   }
// };

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

  useEffect(() => {
    if (!localStream || !socket?.connected) return;
    setupAudioProcessing();
    return () => {
      cleanupAudioProcessing();
    };
  }, [localStream, socket, callParticipant, currentLanguage]);

  // OPTIMIZED: Event listeners with latency tracking and partial results
  useEffect(() => {
    if (!socket || !socket.connected) return;
    
    const handleTranslatedSpeech = async (data) => {
      if (!data) return;

      const { text, isLocal, requestId, timestamp, partial, metrics } = data;
      
      // ✅ Track client receive time
      const metric = currentMetricRef.current;
      if (metric && metric.requestId === requestId) {
        performanceMetrics.recordTimestamp(metric, 'clientReceived');
      }
      
      // ⚡ Calculate and display latency metrics
      if (timestamp) {
        const totalLatency = Date.now() - timestamp;
        
        if (metrics) {
          console.log(`📊 Performance Metrics:
            ├─ Recognition: ${metrics.recognition}ms
            ├─ Translation: ${metrics.translation}ms
            ├─ Total Server: ${metrics.total}ms
            └─ End-to-End: ${totalLatency}ms`);
        } else if (partial) {
          console.log(`⚡ Partial result latency: ${totalLatency}ms (recognition only)`);
        } else {
          console.log(`⚡ Total latency: ${totalLatency}ms`);
        }
      }

      if (text) {
        if (isLocal) {
          // Always update original text (available in both partial and final)
          if (text.original) {
            setLocalOriginal(text.original);
            setTranscribedText(text.original);
          }
          
          // Only update translated text when available (final result)
          if (text.translated && !partial) {
            setLocalTranslated(text.translated);
            setTranslatedText(text.translated);
            
            // ✅ Complete metrics tracking
            if (metric && metric.requestId === requestId) {
              performanceMetrics.recordTimestamp(metric, 'displayed');
              performanceMetrics.complete(metric);
              currentMetricRef.current = null;
            }
          }
        } else {
          // Always update original text for remote
          if (text.original) {
            setRemoteOriginal(text.original);
          }
          
          // Only update translated text when available (final result)
          if (text.translated && !partial) {
            setRemoteTranslated(text.translated);
          }
        }
      }
    };
    
    socket.on('translatedSpeech', handleTranslatedSpeech);
    
    socket.on('callParticipantInfo', (data) => {
      if (data.participantInfo) {
        setCallParticipant(data.participantInfo);
      }
    });

    return () => {
      socket.off('translatedSpeech', handleTranslatedSpeech);
      socket.off('callParticipantInfo');
    };
  }, [socket, currentLanguage]);

  return {
    transcribedText,
    translatedText,
    localTranscript,
    remoteTranscript,
    callParticipant,
    setCallParticipant,
    localOriginal,
    localTranslated,
    remoteOriginal,
    remoteTranslated
  };
};

export default useAudioProcessing;