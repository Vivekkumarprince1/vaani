/**
 * SFUConnectionManager
 * Single responsibility: LiveKit room connect/disconnect/reconnect lifecycle.
 *
 * This is a plain JS class (not a React hook) so it can be used outside
 * component trees — e.g. from event handlers or service workers.
 * React components should prefer useLiveKitRoom which wraps this.
 */
import { Room, RoomEvent, ConnectionState } from 'livekit-client';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

class SFUConnectionManager {
  constructor() {
    this.room = null;
    this.callRoomId = null;
    this._retryCount = 0;
    this._listeners = new Map(); // event → Set<callback>
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /**
   * Connect to a LiveKit room.
   * @param {string} callRoomId - maps to LiveKit room name
   * @param {object} options - { publishAudio, publishVideo }
   */
  async connect(callRoomId, options = {}) {
    const { publishAudio = true, publishVideo = true } = options;

    if (this.room && this.room.state === ConnectionState.Connected) {
      if (this.callRoomId === callRoomId) return; // already connected to same room
      await this.disconnect();
    }

    this.callRoomId = callRoomId;
    this.room = new Room({
      adaptiveStream: true,
      dynacast: true,
      audioCaptureDefaults: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        sampleRate: 16000,
      },
    });

    this._bindRoomEvents();
    await this._connectWithRetry(publishAudio, publishVideo);
  }

  async disconnect() {
    if (this.room) {
      await this.room.disconnect();
      this.room = null;
    }
    this.callRoomId = null;
    this._retryCount = 0;
  }

  async toggleMicrophone(enabled) {
    if (!this.room) return;
    await this.room.localParticipant.setMicrophoneEnabled(enabled);
  }

  async toggleCamera(enabled) {
    if (!this.room) return;
    await this.room.localParticipant.setCameraEnabled(enabled);
  }

  on(event, callback) {
    if (!this._listeners.has(event)) this._listeners.set(event, new Set());
    this._listeners.get(event).add(callback);
    return this;
  }

  off(event, callback) {
    this._listeners.get(event)?.delete(callback);
    return this;
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  async _connectWithRetry(publishAudio, publishVideo) {
    try {
      const { token, livekitUrl } = await this._fetchToken();
      await this.room.connect(livekitUrl, token);

      if (publishAudio) await this.room.localParticipant.setMicrophoneEnabled(true);
      if (publishVideo) await this.room.localParticipant.setCameraEnabled(true);

      this._retryCount = 0;
      this._emit('connected', { room: this.room });
    } catch (err) {
      console.error('[SFUConnectionManager] Connection error:', err.message);
      if (this._retryCount < MAX_RETRIES) {
        this._retryCount++;
        console.log(`[SFUConnectionManager] Retry ${this._retryCount}/${MAX_RETRIES} in ${RETRY_DELAY_MS}ms`);
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * this._retryCount));
        return this._connectWithRetry(publishAudio, publishVideo);
      }
      this._emit('error', { message: err.message });
    }
  }

  async _fetchToken() {
    const authToken = localStorage.getItem('token');
    const { data } = await axios.post(
      `${API_URL}/livekit/token`,
      { callRoomId: this.callRoomId },
      { headers: { 'x-auth-token': authToken } }
    );
    return data;
  }

  _bindRoomEvents() {
    const room = this.room;

    room.on(RoomEvent.ConnectionStateChanged, (state) => {
      this._emit('connectionStateChanged', { state });
      if (state === ConnectionState.Reconnecting) {
        console.log('[SFUConnectionManager] Reconnecting...');
      }
    });

    room.on(RoomEvent.ParticipantConnected, (p) => this._emit('participantConnected', { participant: p }));
    room.on(RoomEvent.ParticipantDisconnected, (p) => this._emit('participantDisconnected', { participant: p }));
    room.on(RoomEvent.TrackSubscribed, (track, pub, p) => this._emit('trackSubscribed', { track, publication: pub, participant: p }));
    room.on(RoomEvent.TrackUnsubscribed, (track, pub, p) => this._emit('trackUnsubscribed', { track, publication: pub, participant: p }));
    room.on(RoomEvent.ActiveSpeakersChanged, (speakers) => this._emit('activeSpeakersChanged', { speakers }));
    room.on(RoomEvent.Disconnected, () => this._emit('disconnected', {}));
  }

  _emit(event, payload) {
    this._listeners.get(event)?.forEach((cb) => {
      try { cb(payload); } catch (e) { console.warn('[SFUConnectionManager] listener error:', e); }
    });
  }
}

export default SFUConnectionManager;
