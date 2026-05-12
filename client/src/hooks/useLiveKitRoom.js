import { useState, useEffect, useRef, useCallback } from 'react';
import { Room, RoomEvent, ConnectionState } from 'livekit-client';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

const useLiveKitRoom = (callRoomId, options = {}) => {
  const { enabled = true, publishVideo = true, publishAudio = true } = options;

  const [connectionState, setConnectionState] = useState(ConnectionState.Disconnected);
  const [remoteParticipants, setRemoteParticipants] = useState([]);
  const [activeSpeakerId, setActiveSpeakerId] = useState(null);
  const [localParticipant, setLocalParticipant] = useState(null);
  const [room, setRoom] = useState(null);
  const [error, setError] = useState(null);
  const [updateTick, setUpdateTick] = useState(0);

  const roomRef = useRef(null);

  const forceUpdate = useCallback(() => {
    setUpdateTick((t) => t + 1);
  }, []);

  const getOrCreateRoom = useCallback(() => {
    if (!roomRef.current) {
      roomRef.current = new Room({
        adaptiveStream: true,
        dynacast: true,
        audioCaptureDefaults: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 16000,
        },
        videoCaptureDefaults: {
          resolution: { width: 1280, height: 720, frameRate: 30 },
        },
      });
    }
    return roomRef.current;
  }, []);

  const syncParticipants = useCallback((r) => {
    setRemoteParticipants(Array.from(r.remoteParticipants.values()));
    // Re-set localParticipant reference so dependents re-render when tracks change
    setLocalParticipant(r.localParticipant ?? null);
  }, []);

  useEffect(() => {
    if (!enabled || !callRoomId) return;

    let cancelled = false;
    const r = getOrCreateRoom();

    const onConnectionStateChanged = (state) => {
      if (!cancelled) setConnectionState(state);
    };
    const onParticipantChanged = () => {
      if (!cancelled) syncParticipants(r);
    };
    const onActiveSpeakersChanged = (speakers) => {
      if (!cancelled) setActiveSpeakerId(speakers[0]?.identity ?? null);
    };
    const onLocalTrackChanged = () => {
      if (!cancelled) {
        setLocalParticipant(r.localParticipant ?? null);
        forceUpdate();
      }
    };

    r
      .on(RoomEvent.ConnectionStateChanged, onConnectionStateChanged)
      .on(RoomEvent.ParticipantConnected, onParticipantChanged)
      .on(RoomEvent.ParticipantDisconnected, onParticipantChanged)
      .on(RoomEvent.TrackSubscribed, onParticipantChanged)
      .on(RoomEvent.TrackUnsubscribed, onParticipantChanged)
      .on(RoomEvent.ActiveSpeakersChanged, onActiveSpeakersChanged)
      .on(RoomEvent.LocalTrackPublished, onLocalTrackChanged)
      .on(RoomEvent.LocalTrackUnpublished, onLocalTrackChanged)
      .on(RoomEvent.TrackMuted, onParticipantChanged)
      .on(RoomEvent.TrackUnmuted, onParticipantChanged);

    const connect = async () => {
      try {
        const authToken = localStorage.getItem('token');
        const { data } = await axios.post(
          `${API_URL}/livekit/token`,
          { callRoomId },
          { headers: { 'x-auth-token': authToken } }
        );

        if (cancelled) return;

        if (!data.token || !data.livekitUrl) {
          throw new Error('Invalid server response: missing token or livekitUrl');
        }

        const token = typeof data.token === 'object' ? data.token.token : data.token;
        console.log('[useLiveKitRoom] Connecting to:', data.livekitUrl, 'with token type:', typeof token);

        await r.connect(data.livekitUrl, token);
        if (cancelled) {
          r.disconnect();
          return;
        }

        if (publishAudio) await r.localParticipant.setMicrophoneEnabled(true);
        if (publishVideo) await r.localParticipant.setCameraEnabled(true);

        setRoom(r);
        syncParticipants(r);
      } catch (err) {
        if (!cancelled) {
          console.error('[useLiveKitRoom] Connection failed:', err.message);
          setError(err.message);
        }
      }
    };

    connect();

    return () => {
      cancelled = true;
      r.off(RoomEvent.ConnectionStateChanged, onConnectionStateChanged);
      r.off(RoomEvent.ParticipantConnected, onParticipantChanged);
      r.off(RoomEvent.ParticipantDisconnected, onParticipantChanged);
      r.off(RoomEvent.TrackSubscribed, onParticipantChanged);
      r.off(RoomEvent.TrackUnsubscribed, onParticipantChanged);
      r.off(RoomEvent.ActiveSpeakersChanged, onActiveSpeakersChanged);
      r.off(RoomEvent.LocalTrackPublished, onLocalTrackChanged);
      r.off(RoomEvent.LocalTrackUnpublished, onLocalTrackChanged);
      r.off(RoomEvent.TrackMuted, onParticipantChanged);
      r.off(RoomEvent.TrackUnmuted, onParticipantChanged);
      r.disconnect();
      roomRef.current = null;
      setRoom(null);
      setLocalParticipant(null);
      setRemoteParticipants([]);
    };
  }, [callRoomId, enabled, publishVideo, publishAudio, getOrCreateRoom, syncParticipants]);

  const toggleMicrophone = useCallback(async (enabled) => {
    const r = roomRef.current;
    if (!r) return;
    await r.localParticipant.setMicrophoneEnabled(enabled);
  }, []);

  const toggleCamera = useCallback(async (enabled) => {
    const r = roomRef.current;
    if (!r) return;
    await r.localParticipant.setCameraEnabled(enabled);
  }, []);

  return {
    room,
    connectionState,
    remoteParticipants,
    activeSpeakerId,
    localParticipant,
    error,
    isConnected: connectionState === ConnectionState.Connected,
    toggleMicrophone,
    toggleCamera,
  };
};

export default useLiveKitRoom;
