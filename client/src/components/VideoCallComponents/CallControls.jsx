
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
 */
const CallControls = ({ toggleMute, toggleCamera, endCall, isMuted, isCameraOff }) => {
  return (
    <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 flex space-x-4 z-20">
      <button
        onClick={toggleMute}
        className={`p-4 rounded-full ${isMuted ? 'bg-red-500' : 'bg-gray-600'} text-white shadow-lg hover:opacity-90 transition-opacity`}
        aria-label={isMuted ? "Unmute" : "Mute"}
        title={isMuted ? "Unmute" : "Mute"}
      >
        {isMuted ? <NoSymbolIcon className="h-6 w-6" /> : <MicrophoneIcon className="h-6 w-6" />}
      </button>
      
      <button
        onClick={toggleCamera}
        className={`p-4 rounded-full ${isCameraOff ? 'bg-red-500' : 'bg-gray-600'} text-white shadow-lg hover:opacity-90 transition-opacity`}
        aria-label={isCameraOff ? "Turn camera on" : "Turn camera off"}
        title={isCameraOff ? "Turn camera on" : "Turn camera off"}
      >
        {isCameraOff ? <VideoCameraSlashIcon className="h-6 w-6" /> : <VideoCameraIcon className="h-6 w-6" />}
      </button>
      
      <button
        onClick={() => {
          callSoundPlayer.stopAll();
          callSoundPlayer.playDisconnect();
          endCall();
        }}
        className="p-4 rounded-full bg-red-500 text-white shadow-lg hover:bg-red-600 transition-colors"
        aria-label="End call"
        title="End call"
      >
        <PhoneXMarkIcon className="h-6 w-6" />
      </button>
    </div>
  );
};

export default CallControls;
