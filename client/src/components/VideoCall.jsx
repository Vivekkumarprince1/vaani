
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
  localOriginal,
  localTranslated,
  remoteOriginal,
  remoteTranslated,
  translationStatus = 'off',
  translationLatency = null,
  isRemoteAudioDucked = false
}) => {
  const { currentLanguage, languages } = useTranslation();
  
  // Get language names for display
  const yourLanguageName = languages?.[currentLanguage]?.name || currentLanguage;
  const statusMeta = {
    connecting: { label: 'Translation connecting', className: 'border-amber-400/50 bg-amber-900/50 text-amber-100' },
    authenticating: { label: 'Translation authenticating', className: 'border-amber-400/50 bg-amber-900/50 text-amber-100' },
    live: { label: 'Translation live', className: 'border-emerald-400/50 bg-emerald-900/50 text-emerald-100' },
    degraded: { label: 'Translation degraded', className: 'border-orange-400/50 bg-orange-900/50 text-orange-100' },
    off: { label: 'Translation off', className: 'border-gray-500/50 bg-gray-900/70 text-gray-200' },
  }[translationStatus] || { label: 'Translation off', className: 'border-gray-500/50 bg-gray-900/70 text-gray-200' };
  const shouldMuteRemoteOriginal = ['connecting', 'authenticating', 'live', 'degraded'].includes(translationStatus);

  const latencyText = translationLatency?.latencyMs
    ? `${translationLatency.phase || 'latency'} ${Math.round(translationLatency.latencyMs)}ms`
    : null;

  return (
    <div className="relative h-[calc(100vh-220px)] rounded-lg p-4 overflow-hidden bg-black flex flex-col">
      <div className="absolute top-4 left-4 z-20 flex flex-wrap gap-2 text-xs">
        <div className={`rounded-md border px-2.5 py-1.5 shadow-lg backdrop-blur ${statusMeta.className}`}>
          {statusMeta.label}
        </div>
        {latencyText && (
          <div className="rounded-md border border-sky-400/40 bg-sky-950/60 px-2.5 py-1.5 text-sky-100 shadow-lg backdrop-blur">
            {latencyText}
          </div>
        )}
        {isRemoteAudioDucked && (
          <div className="rounded-md border border-indigo-400/40 bg-indigo-950/60 px-2.5 py-1.5 text-indigo-100 shadow-lg backdrop-blur">
            Original audio lowered
          </div>
        )}
      </div>

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
        muteRemoteAudio={shouldMuteRemoteOriginal}
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
