import React, { useEffect, useCallback, useState, useRef } from 'react';
import { Track } from 'livekit-client';
import { useTranslation } from '../contexts/TranslationContext';
import CallControls from './VideoCallComponents/CallControls';
import ParticipantGrid from './ParticipantGrid';
import GroupCaptionRenderer from '../subtitle/GroupCaptionRenderer';
import useLiveKitRoom from '../hooks/useLiveKitRoom';
import useGroupCallAudioProcessing from '../hooks/useGroupCallAudioProcessing';
import { useTranslatedAudioTrack } from '../hooks/useTranslatedAudioTrack';
import { filterHumanParticipants } from '../sfu/TrackSubscriptionManager';

// True when the server is injecting TTS audio as LiveKit tracks.
// Must match server USE_LIVEKIT_AUDIO_TRACKS env var.
const USE_LIVEKIT_AUDIO_TRACKS = import.meta.env.VITE_USE_LIVEKIT_AUDIO_TRACKS === 'true';

/**
 * GroupVideoCall (SFU-based)
 *
 * Orchestrator only — wires hooks together and renders layout.
 * WebRTC mesh peer connections removed; LiveKit SFU handles all media routing.
 * Translation pipeline (Socket.IO → Azure → TTS) is unchanged.
 */
const GroupVideoCall = ({
  socket,
  callRoomId,
  roomName,
  currentUserId,
  onEndCall,
  callType = 'video',
}) => {
  const { currentLanguage } = useTranslation();

  // ── SFU connection ────────────────────────────────────────────────────────
  const {
    room,
    connectionState,
    remoteParticipants,
    activeSpeakerId,
    localParticipant,
    error: livekitError,
    isConnected,
    toggleMicrophone,
    toggleCamera: livekitToggleCamera,
  } = useLiveKitRoom(callRoomId, {
    enabled: Boolean(callRoomId),
    publishAudio: true,
    publishVideo: callType === 'video',
  });

  // ── Local UI state ────────────────────────────────────────────────────────
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(callType === 'audio');
  const [linkCopied, setLinkCopied] = useState(false);
  const copyTimeoutRef = useRef(null);

  const handleCopyLink = useCallback(() => {
    const link = `${window.location.origin}/join/${callRoomId}`;
    navigator.clipboard.writeText(link).then(() => {
      setLinkCopied(true);
      clearTimeout(copyTimeoutRef.current);
      copyTimeoutRef.current = setTimeout(() => setLinkCopied(false), 2000);
    }).catch(() => {
      // Fallback for browsers that block clipboard without interaction
      const el = document.createElement('textarea');
      el.value = link;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      setLinkCopied(true);
      clearTimeout(copyTimeoutRef.current);
      copyTimeoutRef.current = setTimeout(() => setLinkCopied(false), 2000);
    });
  }, [callRoomId]);

  // ── Translation + transcription pipeline ─────────────────────────────────
  const localAudioStream = localParticipant
    ? localParticipant.getTrackPublication?.(Track.Source.Microphone)?.track?.mediaStream
    : null;

  const { transcripts } = useGroupCallAudioProcessing(
    localAudioStream,
    socket,
    callRoomId,
    currentLanguage,
    currentUserId,
    isMuted,
    USE_LIVEKIT_AUDIO_TRACKS
  );

  // ── Translated audio track (LiveKit path) ────────────────────────────────
  const {
    audioRef: translatedAudioRef,
    isPlaying: isTranslatedAudioPlaying,
    isEnabled: isTranslatedAudioEnabled,
    toggleEnabled: toggleTranslatedAudio,
  } = useTranslatedAudioTrack(room, currentLanguage, USE_LIVEKIT_AUDIO_TRACKS);

  // Filter out vaani-translator-* virtual participants from the UI grid.
  // room.remoteParticipants is a Map; remoteParticipants is already an Array.
  const humanRemoteParticipants = USE_LIVEKIT_AUDIO_TRACKS
    ? filterHumanParticipants(room?.remoteParticipants ?? new Map())
    : (remoteParticipants ?? []);

  // ── Notify server that we joined (for translation routing) ────────────────
  useEffect(() => {
    if (!socket || !callRoomId) return;
    socket.emit('joinGroupCall', { callRoomId });

    return () => {
      socket.emit('leaveGroupCall', { callRoomId });
    };
  }, [socket, callRoomId]);

  // ── Handle participant_joined / participant_disconnected for UI badge data ─
  // LiveKit handles media; these Socket.IO events carry username/language metadata.
  const [participantLanguages, setParticipantLanguages] = useState({});

  useEffect(() => {
    if (!socket) return;

    const onJoined = ({ userId, username }) => {
      setParticipantLanguages((prev) => ({ ...prev, [userId]: currentLanguage }));
    };
    const onLanguageChanged = ({ userId, preferredLanguage }) => {
      setParticipantLanguages((prev) => ({ ...prev, [userId]: preferredLanguage }));
    };
    const onExistingParticipants = ({ participants }) => {
      console.log('👥 Received existing participants:', participants);
      const languages = {};
      participants.forEach(p => {
        // We don't have language here, but we can assume default or wait for sync
        languages[p.userId] = 'en'; 
      });
      setParticipantLanguages((prev) => ({ ...prev, ...languages }));
    };

    socket.on('participant_joined', onJoined);
    socket.on('userLanguageChanged', onLanguageChanged);
    socket.on('existingParticipants', onExistingParticipants);

    return () => {
      socket.off('participant_joined', onJoined);
      socket.off('userLanguageChanged', onLanguageChanged);
      socket.off('existingParticipants', onExistingParticipants);
    };
  }, [socket, currentLanguage]);

  // ── Controls ──────────────────────────────────────────────────────────────
  const handleToggleMute = useCallback(async () => {
    const next = !isMuted;
    setIsMuted(next);
    await toggleMicrophone(!next);
  }, [isMuted, toggleMicrophone]);

  const handleToggleCamera = useCallback(async () => {
    const next = !isCameraOff;
    setIsCameraOff(next);
    await livekitToggleCamera(!next);
  }, [isCameraOff, livekitToggleCamera]);

  const handleEndCall = useCallback(() => {
    socket?.emit('leaveGroupCall', { callRoomId });
    onEndCall?.();
  }, [socket, callRoomId, onEndCall]);

  const participantCount = 1 + humanRemoteParticipants.length;

  return (
    <div className="fixed inset-0 z-50 bg-gray-900 flex flex-col">
      {/* Hidden audio element that plays the translated LiveKit track */}
      {USE_LIVEKIT_AUDIO_TRACKS && (
        <audio ref={translatedAudioRef} autoPlay playsInline style={{ display: 'none' }} />
      )}

      {/* Header */}
      <div className="flex-shrink-0 bg-gradient-to-b from-black/60 to-transparent px-4 py-3 flex items-center justify-between">
        <div>
          <h2 className="text-white text-lg font-semibold">{roomName}</h2>
          {livekitError ? (
            <p className="text-red-400 text-xs font-medium animate-pulse">
              ⚠️ Connection Error: {livekitError}
            </p>
          ) : (
            <p className="text-gray-300 text-xs">
              {participantCount} participant{participantCount !== 1 ? 's' : ''} · {connectionState}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {USE_LIVEKIT_AUDIO_TRACKS && (
            <button
              onClick={toggleTranslatedAudio}
              title={isTranslatedAudioEnabled ? 'Mute translation' : 'Unmute translation'}
              className={`text-xs px-2 py-0.5 rounded border transition-colors ${
                isTranslatedAudioEnabled
                  ? 'border-green-500 text-green-400 bg-green-900/30'
                  : 'border-gray-600 text-gray-400 bg-gray-800/50'
              }`}
            >
              {isTranslatedAudioEnabled ? '🔊' : '🔇'} TL
            </button>
          )}
          <button
            onClick={handleCopyLink}
            title="Copy meeting link"
            className={`text-xs px-2 py-0.5 rounded border transition-colors flex items-center gap-1 ${
              linkCopied
                ? 'border-emerald-500 text-emerald-400 bg-emerald-900/30'
                : 'border-gray-600 text-gray-300 bg-gray-800/50 hover:border-gray-400'
            }`}
          >
            {linkCopied ? (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                Copied!
              </>
            ) : (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                </svg>
                Share
              </>
            )}
          </button>
          <span className="text-xs text-indigo-300 bg-indigo-900/50 px-2 py-0.5 rounded">
            {currentLanguage?.toUpperCase()}
          </span>
        </div>
      </div>

      {/* Participant grid — fills available space */}
      <div className="flex-1 min-h-0">
        <ParticipantGrid
          localParticipant={localParticipant}
          remoteParticipants={humanRemoteParticipants}
          activeSpeakerId={activeSpeakerId}
          participantLanguages={participantLanguages}
        />
      </div>

      {/* Subtitle overlay (synced to TTS playback) */}
      <GroupCaptionRenderer socket={socket} currentUserId={currentUserId} />

      {/* Transcript overlay */}
      {transcripts.length > 0 && (
        <div className="flex-shrink-0 px-4 py-2 space-y-1 max-h-44 overflow-y-auto">
          {transcripts.slice(-3).map((transcript, idx) => {
            const isTranslated = transcript.isTranslated;
            return (
              <div
                key={`${transcript.userId}-${idx}-${transcript.timestamp}`}
                className={`animate-fade-in px-3 py-1.5 rounded-md text-sm ${
                  isTranslated ? 'bg-green-900/60' : 'bg-gray-800/70'
                }`}
              >
                <span className="text-xs text-emerald-300 font-medium mr-1">
                  {isTranslated
                    ? `🌐 ${transcript.username}`
                    : `${transcript.userId === currentUserId ? '🎤' : '👤'} ${transcript.username}`}
                </span>
                <span className="text-white">{transcript.text}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Call controls */}
      <div className="flex-shrink-0 bg-gradient-to-t from-black/60 to-transparent px-6 pb-6 pt-2">
        <CallControls
          toggleMute={handleToggleMute}
          toggleCamera={handleToggleCamera}
          endCall={handleEndCall}
          isMuted={isMuted}
          isCameraOff={isCameraOff}
        />
      </div>
    </div>
  );
};

export default GroupVideoCall;

// Inject keyframe for transcript fade-in (once per page load)
if (typeof document !== 'undefined' && !document.head.querySelector('[data-group-call-styles]')) {
  const style = document.createElement('style');
  style.setAttribute('data-group-call-styles', 'true');
  style.textContent = `
    @keyframes fadeIn { from { opacity:0; transform:translateY(6px); } to { opacity:1; transform:translateY(0); } }
    .animate-fade-in { animation: fadeIn 0.25s ease-out; }
  `;
  document.head.appendChild(style);
}
