'use client'

import React, { useEffect } from 'react';
import TextReader from '../TextReader';
import callSoundPlayer from '../../utils/callSounds';

/**
 * Component to display real-time translations during video calls
 * Now uses TextReader component with auto text-to-speech
 */
const TranslationOverlay = ({ transcribedText, translatedText, language = '' }) => {
  useEffect(() => {
    // Ensure playback allowed on component mount to satisfy browser autoplay policy
    callSoundPlayer.ensurePlaybackAllowed().then(() => {
      console.log('✅ Playback allowed (TranslationOverlay mount)');
    }).catch((err) => {
      console.warn('🔒 Playback not allowed on mount (TranslationOverlay):', err);
    });
  }, []);

  console.log('TranslationOverlay rendered with:', { translatedText, language });
  return (
    <div className="absolute bottom-20 left-0 right-0 px-4 space-y-3">
      {transcribedText && (
        <TextReader
          text={transcribedText}
          label="Original"
          className="bg-opacity-90"
          maxHeight="120px"
          autoSpeak={false}
        />
      )}
      
      {translatedText && (
        <TextReader
          text={translatedText}
          label="Translated"
          language={language}
          showControls={true}
          className="bg-opacity-90"
          maxHeight="150px"
          autoSpeak={true}
          speechRate={1.0}
          speechPitch={1.0}
          speechVolume={1.0}
        />
      )}
    </div>
  );
};

export default TranslationOverlay;
