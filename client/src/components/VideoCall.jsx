
import React from 'react';
import { useTranslation } from '../contexts/TranslationContext';
import VideoStreams from './VideoCallComponents/VideoStreams';

import CallControls from './VideoCallComponents/CallControls';

/**
 * VideoCall component to handle video calls with real-time translation
 * Updated to use text-based translation workflow:
 * 1. Speaking side: Voice recognition only (voice-to-text)
 * 2. Send text data only (not audio) to the other side
 * 3. Receiving side: Translate text and convert to speech
 */
const VideoCall = ({
  localStream,
  remoteStream,
  localVideoRef,
  remoteVideoRef,
  toggleMute,
  toggleCamera,
  endCall,
  isMuted,
  isCameraOff,
  selectedUser,
  localOriginal,
  localTranslated,
  remoteOriginal,
  remoteTranslated
}) => {
  const { currentLanguage, languages } = useTranslation();
  
  // Get language names for display
  const yourLanguageName = languages?.[currentLanguage]?.name || currentLanguage;
  const theirLanguageName = selectedUser?.preferredLanguage 
    ? (languages?.[selectedUser.preferredLanguage]?.name || selectedUser.preferredLanguage)
    : 'Their Language';


  return (
    <div className="relative h-[calc(100vh-220px)] rounded-lg p-4 overflow-hidden bg-black flex flex-col">
      {/* Video streams (local and remote) with transcriptions overlaid */}
      <VideoStreams
        localVideoRef={localVideoRef}
        remoteVideoRef={remoteVideoRef}
        localStream={localStream}
        remoteStream={remoteStream}
        localTranscript={localOriginal}
        localTranslated={localTranslated}
        remoteTranscript={remoteOriginal}
        remoteTranslated={remoteTranslated}
        yourLanguage={currentLanguage}
        yourLanguageName={yourLanguageName}
      />

      {/* Call controls (mute, camera, end call) */}
      <CallControls
        toggleMute={toggleMute}
        toggleCamera={toggleCamera}
        endCall={endCall}
        isMuted={isMuted}
        isCameraOff={isCameraOff}
      />
    </div>
  );
};

export default VideoCall;
