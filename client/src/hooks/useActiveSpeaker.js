import { useState, useEffect, useRef } from 'react';
import { RoomEvent } from 'livekit-client';
import ActiveSpeakerManager from '../sfu/ActiveSpeakerManager';

/**
 * useActiveSpeaker
 * Single responsibility: expose current active speaker identity from a LiveKit room.
 *
 * Wraps ActiveSpeakerManager (debounce + history) and optionally emits
 * groupCallSpeaking events to the server so other participants' UIs update.
 *
 * @param {import('livekit-client').Room|null} room
 * @param {object|null} socket - Socket.IO client (optional, for server notification)
 * @param {string} callRoomId
 */
const useActiveSpeaker = (room, socket = null, callRoomId = null) => {
  const [activeSpeakerId, setActiveSpeakerId] = useState(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const managerRef = useRef(null);

  useEffect(() => {
    if (!room) return;

    const manager = new ActiveSpeakerManager();
    managerRef.current = manager;

    const unsubscribe = manager.subscribe((speakerId) => {
      setActiveSpeakerId(speakerId);
      const localIdentity = room.localParticipant?.identity;
      const speaking = speakerId === localIdentity;
      setIsSpeaking(speaking);

      // Notify server so remote participants' UIs show the active speaker badge
      if (socket && callRoomId) {
        socket.emit('groupCallSpeaking', { callRoomId, isSpeaking: speaking });
      }
    });

    const onActiveSpeakersChanged = (speakers) => manager.update(speakers);
    room.on(RoomEvent.ActiveSpeakersChanged, onActiveSpeakersChanged);

    return () => {
      unsubscribe();
      manager.destroy();
      room.off(RoomEvent.ActiveSpeakersChanged, onActiveSpeakersChanged);
      managerRef.current = null;
    };
  }, [room, socket, callRoomId]);

  return { activeSpeakerId, isSpeaking };
};

export default useActiveSpeaker;
