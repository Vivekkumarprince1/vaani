import { useEffect, useRef, useState, memo } from 'react';
import { Track } from 'livekit-client';

const ParticipantTile = ({ participant, isLocal = false, isActiveSpeaker = false, preferredLanguage = 'en' }) => {
  const videoRef = useRef(null);
  const audioRef = useRef(null);
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [micEnabled, setMicEnabled] = useState(false);

  const name = participant?.name || participant?.identity || 'Unknown';
  const langLabel = preferredLanguage?.toUpperCase?.() || 'EN';

  // Track camera/mic state reactively via LiveKit events
  useEffect(() => {
    if (!participant) return;

    const update = () => {
      setCameraEnabled(!!participant.isCameraEnabled);
      setMicEnabled(!!participant.isMicrophoneEnabled);
    };

    update();

    participant.on('trackMuted', update);
    participant.on('trackUnmuted', update);
    participant.on('trackPublished', update);
    participant.on('trackUnpublished', update);
    participant.on('trackSubscribed', update);
    participant.on('trackUnsubscribed', update);

    return () => {
      participant.off('trackMuted', update);
      participant.off('trackUnmuted', update);
      participant.off('trackPublished', update);
      participant.off('trackUnpublished', update);
      participant.off('trackSubscribed', update);
      participant.off('trackUnsubscribed', update);
    };
  }, [participant]);

  // Attach remote participant tracks (video + audio)
  useEffect(() => {
    if (!participant || isLocal) return;

    const trackMap = participant.trackPublications;
    if (!trackMap) return;

    const attachTrack = (publication) => {
      if (!publication?.track) return;
      if (publication.track.kind === Track.Kind.Video && videoRef.current) {
        publication.track.attach(videoRef.current);
      }
      if (publication.track.kind === Track.Kind.Audio && audioRef.current) {
        publication.track.attach(audioRef.current);
      }
    };

    const detachTrack = (publication) => {
      publication?.track?.detach();
    };

    for (const pub of trackMap.values()) {
      if (pub.isSubscribed) attachTrack(pub);
    }

    const onSubscribed = (track, pub) => attachTrack(pub);
    const onUnsubscribed = (track, pub) => detachTrack(pub);

    participant.on('trackSubscribed', onSubscribed);
    participant.on('trackUnsubscribed', onUnsubscribed);

    return () => {
      for (const pub of trackMap.values()) detachTrack(pub);
      participant.off('trackSubscribed', onSubscribed);
      participant.off('trackUnsubscribed', onUnsubscribed);
    };
  }, [participant, isLocal, cameraEnabled]);

  // Attach local camera track
  useEffect(() => {
    if (!isLocal || !participant) return;

    const pub = participant.getTrackPublication(Track.Source.Camera);
    const videoTrack = pub?.track;
    if (videoTrack && videoRef.current) {
      videoTrack.attach(videoRef.current);
      return () => videoTrack.detach(videoRef.current);
    }
  }, [isLocal, participant, cameraEnabled]);

  return (
    <div className={`relative bg-gray-900 rounded-lg overflow-hidden flex items-center justify-center
      ${isActiveSpeaker ? 'ring-2 ring-green-400 ring-offset-2 ring-offset-gray-800' : ''}
    `}>
      {cameraEnabled ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={isLocal}
          className="w-full h-full object-cover"
        />
      ) : (
        <div className="flex flex-col items-center justify-center w-full h-full bg-gray-800">
          <div className="w-16 h-16 rounded-full bg-indigo-600 flex items-center justify-center text-2xl font-bold text-white">
            {name.charAt(0).toUpperCase()}
          </div>
        </div>
      )}

      {!isLocal && <audio ref={audioRef} autoPlay />}

      <div className="absolute bottom-0 left-0 right-0 px-2 py-1 bg-gradient-to-t from-black/70 to-transparent flex items-center justify-between">
        <span className="text-white text-xs font-medium truncate">
          {isLocal ? `${name} (You)` : name}
        </span>
        <div className="flex items-center gap-1">
          <span className="text-xs bg-indigo-600 text-white px-1 rounded">{langLabel}</span>
          {!micEnabled && (
            <span className="text-red-400 text-xs" title="Muted">🔇</span>
          )}
          {isActiveSpeaker && micEnabled && (
            <span className="text-green-400 text-xs animate-pulse">🔊</span>
          )}
        </div>
      </div>
    </div>
  );
};

export default memo(ParticipantTile, (prevProps, nextProps) => {
  return (
    prevProps.isLocal === nextProps.isLocal &&
    prevProps.isActiveSpeaker === nextProps.isActiveSpeaker &&
    prevProps.preferredLanguage === nextProps.preferredLanguage &&
    prevProps.participant?.identity === nextProps.participant?.identity &&
    prevProps.participant?.isCameraEnabled === nextProps.participant?.isCameraEnabled &&
    prevProps.participant?.isMicrophoneEnabled === nextProps.participant?.isMicrophoneEnabled
  );
});
