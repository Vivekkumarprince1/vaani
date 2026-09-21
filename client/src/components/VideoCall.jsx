import React, { useState } from 'react';
import { useTranslation } from '../contexts/TranslationContext';
import VideoStreams from './VideoCallComponents/VideoStreams';
import CallControls from './VideoCallComponents/CallControls';

/**
 * VideoCall component to handle video calls with real-time translation,
 * smooth audio ducking, and floating live captions.
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
  remoteTranslated,
  translationStatus = 'off',
  translationLatency = null,
  isRemoteAudioDucked = false
}) => {
  const { currentLanguage, languages } = useTranslation();
  const [showCaptions, setShowCaptions] = useState(true);
  const [duckingMode, setDuckingMode] = useState('duck'); // 'duck' (15%), 'mute' (0%), 'off' (100%)
  
  // Get language names for display
  const yourLanguageName = languages?.[currentLanguage]?.name || currentLanguage;
  const statusMeta = {
    connecting: { label: 'Translation connecting', className: 'border-amber-400/50 bg-amber-900/50 text-amber-100' },
    authenticating: { label: 'Translation authenticating', className: 'border-amber-400/50 bg-amber-900/50 text-amber-100' },
    live: { label: 'Translation live', className: 'border-emerald-400/50 bg-emerald-900/50 text-emerald-100' },
    degraded: { label: 'Translation degraded', className: 'border-orange-400/50 bg-orange-900/50 text-orange-100' },
    off: { label: 'Translation off', className: 'border-gray-500/50 bg-gray-900/70 text-gray-200' },
  }[translationStatus] || { label: 'Translation off', className: 'border-gray-500/50 bg-gray-900/70 text-gray-200' };

  const latencyText = translationLatency?.latencyMs
    ? `${translationLatency.phase || 'latency'} ${Math.round(translationLatency.latencyMs)}ms`
    : null;

  const handleToggleDucking = () => {
    setDuckingMode((prev) => {
      if (prev === 'duck') return 'mute';
      if (prev === 'mute') return 'off';
      return 'duck';
    });
  };

  return (
    <div className="relative h-[calc(100vh-220px)] rounded-lg p-4 overflow-hidden bg-black flex flex-col">
      {/* Top HUD: Status, Latency & Audio Ducking Badges */}
      <div className="absolute top-4 left-4 z-20 flex flex-wrap items-center gap-2 text-xs">
        <div className={`rounded-md border px-2.5 py-1.5 shadow-lg backdrop-blur ${statusMeta.className}`}>
          {statusMeta.label}
        </div>
        {latencyText && (
          <div className="rounded-md border border-sky-400/40 bg-sky-950/60 px-2.5 py-1.5 text-sky-100 shadow-lg backdrop-blur">
            {latencyText}
          </div>
        )}
        {isRemoteAudioDucked && (
          <div className="rounded-md border border-emerald-400/40 bg-emerald-950/70 px-2.5 py-1.5 text-emerald-200 shadow-lg backdrop-blur flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>
              {duckingMode === 'duck' ? 'Original voice lowered 15%' : duckingMode === 'mute' ? 'Original voice muted' : 'Dual audio active'}
            </span>
          </div>
        )}
      </div>

      {/* Video streams (local and remote) with studio captions & audio ducking */}
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
        remoteUserName={selectedUser?.username || 'Remote Caller'}
        isRemoteAudioDucked={isRemoteAudioDucked}
        duckingMode={duckingMode}
        showCaptions={showCaptions}
      />

      {/* Call controls (mute, camera, CC subtitles, ducking toggle, end call) */}
      <CallControls
        toggleMute={toggleMute}
        toggleCamera={toggleCamera}
        endCall={endCall}
        isMuted={isMuted}
        isCameraOff={isCameraOff}
        showCaptions={showCaptions}
        toggleCaptions={() => setShowCaptions((prev) => !prev)}
        duckingMode={duckingMode}
        toggleDucking={handleToggleDucking}
      />
    </div>
  );
};

export default VideoCall;
