/**
 * useTranslatedAudioTrack
 * Subscribes to the LiveKit audio track published by the server-side
 * TranslationWorker virtual participant (identity: vaani-translator-{lang}).
 *
 * Attaches the track to an <audio> element so the browser plays it.
 * Exposes volume control and enabled/disabled toggle.
 *
 * Usage:
 *   const { audioRef, isPlaying, setVolume, toggleEnabled } =
 *     useTranslatedAudioTrack(room, preferredLanguage);
 *
 *   return <audio ref={audioRef} />;
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { RoomEvent, Track } from 'livekit-client';
import {
  findTranslatorParticipant,
  getTranslatorAudioTrack,
  translatorLanguage,
} from '../sfu/TrackSubscriptionManager';

/**
 * @param {Room|null} room - LiveKit Room from useLiveKitRoom
 * @param {string}    preferredLanguage - e.g. 'hi', 'fr'
 * @param {boolean}   [enabled=true]
 */
export function useTranslatedAudioTrack(room, preferredLanguage, enabled = true) {
  const audioRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolumeState] = useState(1.0);
  const [isEnabled, setIsEnabled] = useState(enabled);

  const lang = preferredLanguage?.split('-')[0]?.toLowerCase() || 'en';

  // Attach or detach the audio track from the <audio> element
  const attachTrack = useCallback((pub) => {
    if (!audioRef.current || !pub?.track) {
      setIsPlaying(false);
      return;
    }
    pub.track.attach(audioRef.current);
    audioRef.current.volume = volume;
    audioRef.current.muted = !isEnabled;
    setIsPlaying(true);
  }, [volume, isEnabled]);

  const detachAll = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.srcObject = null;
    }
    setIsPlaying(false);
  }, []);

  useEffect(() => {
    if (!room || !lang) return;

    // Try to attach immediately if the track is already there
    const existing = findTranslatorParticipant(room.remoteParticipants, lang);
    if (existing) {
      const pub = getTranslatorAudioTrack(existing);
      if (pub) attachTrack(pub);
    }

    // Listen for new tracks being subscribed
    const onTrackSubscribed = (track, pub, participant) => {
      if (
        track.kind !== Track.Kind.Audio ||
        translatorLanguage(participant) !== lang
      ) return;
      attachTrack(pub);
    };

    const onTrackUnsubscribed = (track, _pub, participant) => {
      if (
        track.kind !== Track.Kind.Audio ||
        translatorLanguage(participant) !== lang
      ) return;
      detachAll();
    };

    const onParticipantConnected = (participant) => {
      if (translatorLanguage(participant) !== lang) return;
      // Poll briefly — track may not be published immediately
      const check = () => {
        const pub = getTranslatorAudioTrack(participant);
        if (pub) attachTrack(pub);
      };
      setTimeout(check, 200);
      setTimeout(check, 800);
    };

    room.on(RoomEvent.TrackSubscribed, onTrackSubscribed);
    room.on(RoomEvent.TrackUnsubscribed, onTrackUnsubscribed);
    room.on(RoomEvent.ParticipantConnected, onParticipantConnected);

    return () => {
      room.off(RoomEvent.TrackSubscribed, onTrackSubscribed);
      room.off(RoomEvent.TrackUnsubscribed, onTrackUnsubscribed);
      room.off(RoomEvent.ParticipantConnected, onParticipantConnected);
      detachAll();
    };
  }, [room, lang, attachTrack, detachAll]);

  // Sync volume changes to the audio element
  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
  }, [volume]);

  // Sync enabled/muted state
  useEffect(() => {
    if (audioRef.current) audioRef.current.muted = !isEnabled;
  }, [isEnabled]);

  const setVolume = useCallback((v) => {
    setVolumeState(Math.max(0, Math.min(1, v)));
  }, []);

  const toggleEnabled = useCallback(() => {
    setIsEnabled((prev) => !prev);
  }, []);

  return { audioRef, isPlaying, volume, setVolume, isEnabled, toggleEnabled };
}
