import React, { useEffect, useRef } from 'react';
import CallSubtitlesOverlay from './CallSubtitlesOverlay';

/**
 * Component to display local and remote video streams during calls
 * Features smooth audio ducking and broadcast-grade floating live captions
 */
const VideoStreams = ({ 
  localVideoRef, 
  remoteVideoRef, 
  localStream, 
  remoteStream,
  localTranscript = '',
  localTranslated = '',
  remoteTranscript = '',
  remoteTranslated = '',
  yourLanguage = 'en',
  yourLanguageName = 'Your Language',
  remoteUserName = 'Remote Caller',
  isRemoteAudioDucked = false,
  duckingMode = 'duck',
  showCaptions = true
}) => {
  const duckIntervalRef = useRef(null);

  // Setup video streams when components receive new streams
  useEffect(() => {
    const setupVideo = async (ref, stream, isLocal) => {
      if (!ref.current || !stream) {
        console.log(`${isLocal ? 'Local' : 'Remote'} video ref or stream missing`);
        return;
      }

      try {
        // Reset video element
        ref.current.srcObject = null;
        
        // Set new stream
        ref.current.srcObject = stream;
        // Local is always muted to prevent self feedback echo
        ref.current.muted = isLocal;
        ref.current.playsInline = true;
        ref.current.autoplay = true;
        
        // Ensure video elements are properly sized
        ref.current.style.width = '100%';
        ref.current.style.height = '100%';
        ref.current.style.objectFit = 'cover';

        // Play with auto-play fallback
        try {
          await ref.current.play();
        } catch (playError) {
          if (playError.name === 'NotAllowedError') {
            console.log('Auto-play prevented, waiting for user interaction');
            const playOnClick = async () => {
              try {
                await ref.current.play();
                ref.current.removeEventListener('click', playOnClick);
              } catch (err) {
                console.error('Play on click failed:', err);
              }
            };
            ref.current.addEventListener('click', playOnClick);
          }
        }

      } catch (err) {
        console.error(`Error setting up ${isLocal ? 'local' : 'remote'} video:`, err);
      }
    };

    if (localStream && localVideoRef.current) {
      setupVideo(localVideoRef, localStream, true);
    }
    
    if (remoteStream && remoteVideoRef.current) {
      setupVideo(remoteVideoRef, remoteStream, false);
    }

    return () => {
      // Cleanup function
      const cleanupVideo = (ref) => {
        if (ref.current) {
          ref.current.srcObject = null;
          ref.current.removeAttribute('src');
          ref.current.load();
        }
      };
      cleanupVideo(localVideoRef);
      cleanupVideo(remoteVideoRef);
    };
  }, [localStream, remoteStream, localVideoRef, remoteVideoRef]);

  // Smooth Audio Ducking Engine
  // Ramps remote video volume smoothly up/down to eliminate pops, echo, and voice collision
  useEffect(() => {
    const videoEl = remoteVideoRef.current;
    if (!videoEl) return;

    // Remote audio must not be hard-muted so ducking volume controls audible level
    videoEl.muted = false;

    let targetVolume = 1.0;
    if (isRemoteAudioDucked) {
      if (duckingMode === 'duck') {
        targetVolume = 0.15; // 15% ducked volume for natural human inflection in background
      } else if (duckingMode === 'mute') {
        targetVolume = 0.0;  // 0% for pure translated audio only
      } else {
        targetVolume = 1.0;  // 100% for full dual audio
      }
    }

    if (duckIntervalRef.current) clearInterval(duckIntervalRef.current);

    const stepTime = 15;
    const totalSteps = 8;
    let stepCount = 0;
    const startVolume = typeof videoEl.volume === 'number' ? videoEl.volume : 1;
    const volumeDelta = (targetVolume - startVolume) / totalSteps;

    duckIntervalRef.current = setInterval(() => {
      stepCount++;
      if (stepCount >= totalSteps || !remoteVideoRef.current) {
        if (remoteVideoRef.current) {
          remoteVideoRef.current.volume = targetVolume;
        }
        clearInterval(duckIntervalRef.current);
        duckIntervalRef.current = null;
      } else {
        const nextVol = Math.max(0, Math.min(1, startVolume + volumeDelta * stepCount));
        remoteVideoRef.current.volume = nextVol;
      }
    }, stepTime);

    return () => {
      if (duckIntervalRef.current) {
        clearInterval(duckIntervalRef.current);
        duckIntervalRef.current = null;
      }
    };
  }, [remoteVideoRef, isRemoteAudioDucked, duckingMode]);

  return (
    <>
      {/* Remote Video Container */}
      <div className="flex-1 relative overflow-hidden bg-gray-950">
        <video
          ref={remoteVideoRef}
          playsInline
          autoPlay
          className="absolute inset-0 w-full h-full object-cover video-element"
          style={{ transform: 'scaleX(-1)' }}
        />

        {/* Studio-Grade Floating Live Captions & Translation Overlay */}
        <CallSubtitlesOverlay
          localTranscript={localTranscript}
          localTranslated={localTranslated}
          remoteTranscript={remoteTranscript}
          remoteTranslated={remoteTranslated}
          yourLanguage={yourLanguage}
          yourLanguageName={yourLanguageName}
          remoteUserName={remoteUserName}
          isAudioDucked={isRemoteAudioDucked}
          visible={showCaptions}
        />
      </div>

      {/* Local Video Picture-in-Picture */}
      <div className="absolute top-4 right-4 w-44 h-32 md:w-52 md:h-36 bg-black/80 border border-white/20 rounded-xl overflow-hidden shadow-2xl z-20 transition-all hover:scale-105">
        <video
          ref={localVideoRef}
          playsInline
          muted
          className="w-full h-full object-cover video-element"
          style={{ transform: 'scaleX(-1)' }}
        />
        
        {/* Local Speaking Indicator Tag */}
        <div className="absolute top-2 left-2 flex items-center gap-1.5 bg-black/60 backdrop-blur-md px-2 py-0.5 rounded-md border border-white/10 text-[10px] text-white">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span>You ({yourLanguage.toUpperCase()})</span>
        </div>
      </div>

      {/* Styles for video elements and animations */}
      <style jsx>{`
        .video-element {
          -webkit-playsinline: 1;
          playsinline: 1;
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        
        .animate-fade-in {
          animation: fadeIn 0.3s ease-in;
        }
        
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        
        .line-clamp-2 {
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
      `}</style>
    </>
  );
};

export default VideoStreams;
