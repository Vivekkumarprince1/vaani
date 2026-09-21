
import React from 'react';
import callSoundPlayer from '../../utils/callSounds';
import {
  MicrophoneIcon,
  NoSymbolIcon,
  PhoneXMarkIcon,
  VideoCameraIcon,
  VideoCameraSlashIcon,
} from '@heroicons/react/24/solid';

/**
 * Component for video call control buttons
 * Includes Mute, Camera, End Call, plus Live Closed Captions (CC) and Audio Ducking toggles
 */
const CallControls = ({
  toggleMute,
  toggleCamera,
  endCall,
  isMuted,
  isCameraOff,
  showCaptions = true,
  toggleCaptions,
  duckingMode = 'duck',
  toggleDucking,
}) => {
  return (
    <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 flex items-center space-x-3 z-20 bg-black/40 backdrop-blur-md px-4 py-2 rounded-full border border-white/10 shadow-2xl">
      <button
        onClick={toggleMute}
        className={`p-3.5 rounded-full ${isMuted ? 'bg-red-500 hover:bg-red-600' : 'bg-gray-700/80 hover:bg-gray-600'} text-white shadow-lg transition-all`}
        aria-label={isMuted ? "Unmute" : "Mute"}
        title={isMuted ? "Unmute microphone" : "Mute microphone"}
      >
        {isMuted ? <NoSymbolIcon className="h-5 w-5" /> : <MicrophoneIcon className="h-5 w-5" />}
      </button>
      
      <button
        onClick={toggleCamera}
        className={`p-3.5 rounded-full ${isCameraOff ? 'bg-red-500 hover:bg-red-600' : 'bg-gray-700/80 hover:bg-gray-600'} text-white shadow-lg transition-all`}
        aria-label={isCameraOff ? "Turn camera on" : "Turn camera off"}
        title={isCameraOff ? "Turn camera on" : "Turn camera off"}
      >
        {isCameraOff ? <VideoCameraSlashIcon className="h-5 w-5" /> : <VideoCameraIcon className="h-5 w-5" />}
      </button>

      {/* Closed Captions (CC) Toggle */}
      {toggleCaptions && (
        <button
          onClick={toggleCaptions}
          className={`p-3.5 rounded-full ${showCaptions ? 'bg-indigo-600 text-white hover:bg-indigo-500' : 'bg-gray-700/80 text-gray-300 hover:bg-gray-600'} shadow-lg transition-all font-bold text-xs flex items-center justify-center`}
          aria-label={showCaptions ? "Hide subtitles" : "Show subtitles"}
          title={showCaptions ? "Subtitles: ON (Click to hide)" : "Subtitles: OFF (Click to show)"}
        >
          <span className="font-mono text-xs tracking-tighter">CC</span>
        </button>
      )}

      {/* Audio Ducking Mode Toggle */}
      {toggleDucking && (
        <button
          onClick={toggleDucking}
          className={`px-3 py-2 rounded-full ${
            duckingMode === 'duck'
              ? 'bg-emerald-600/90 text-white hover:bg-emerald-500'
              : duckingMode === 'mute'
              ? 'bg-amber-600/90 text-white hover:bg-amber-500'
              : 'bg-gray-700/80 text-gray-300 hover:bg-gray-600'
          } shadow-lg transition-all text-xs flex items-center gap-1.5 font-medium`}
          aria-label="Toggle Audio Ducking"
          title={
            duckingMode === 'duck'
              ? "Smart Ducking: Original voice lowered to 15% during translation (Click to mute original)"
              : duckingMode === 'mute'
              ? "Pure Voice: Original voice muted during translation (Click for dual full audio)"
              : "Dual Audio: Both original & translated at 100% (Click for smart ducking)"
          }
        >
          <span className="text-sm">🎧</span>
          <span className="hidden sm:inline">
            {duckingMode === 'duck' ? 'Ducking 15%' : duckingMode === 'mute' ? 'Mute Original' : 'Dual Audio'}
          </span>
        </button>
      )}
      
      <button
        onClick={() => {
          callSoundPlayer.stopAll();
          callSoundPlayer.playDisconnect();
          endCall();
        }}
        className="p-3.5 rounded-full bg-red-600 text-white shadow-lg hover:bg-red-700 transition-colors"
        aria-label="End call"
        title="End call"
      >
        <PhoneXMarkIcon className="h-5 w-5" />
      </button>
    </div>
  );
};

export default CallControls;
