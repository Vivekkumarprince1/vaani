import { getIceServers } from '../utils/webrtcConfig';

/**
 * PeerConnectionManager
 * Manages the RTCPeerConnection lifecycle, ICE candidates, and track events.
 * Follows SRP by focusing only on the WebRTC connection state.
 */
class PeerConnectionManager {
  constructor(onIceCandidate, onTrack, onConnectionStateChange) {
    this.pc = null;
    this.onIceCandidate = onIceCandidate;
    this.onTrack = onTrack;
    this.onConnectionStateChange = onConnectionStateChange;
    this._iceRestartTimer = null;
    this._iceRestartAttempts = 0;
    this._MAX_ICE_RESTARTS = 3;
  }

  createPeerConnection() {
    this.cleanup(); // Ensure no existing connection

    this.pc = new RTCPeerConnection({
      iceServers: getIceServers(),
      iceTransportPolicy: 'all',
      bundlePolicy: 'max-bundle',
      rtcpMuxPolicy: 'require'
    });

    this.pc.onicecandidate = (event) => {
      if (event.candidate && this.onIceCandidate) {
        this.onIceCandidate(event.candidate);
      }
    };

    this.pc.ontrack = (event) => {
      if (this.onTrack) {
        this.onTrack(event);
      }
    };

    this.pc.oniceconnectionstatechange = () => {
      const state = this.pc.iceConnectionState;
      console.log('ICE Connection State:', state);
      if (this.onConnectionStateChange) {
        this.onConnectionStateChange(state);
      }
      if (state === 'failed') {
        this._scheduleIceRestart();
      } else if (state === 'connected' || state === 'completed') {
        this._iceRestartAttempts = 0;
        clearTimeout(this._iceRestartTimer);
      }
    };

    this.pc.onconnectionstatechange = () => {
      console.log('Peer Connection State:', this.pc.connectionState);
    };

    return this.pc;
  }

  _scheduleIceRestart() {
    if (this._iceRestartAttempts >= this._MAX_ICE_RESTARTS) {
      console.warn('PeerConnectionManager: ICE restart limit reached');
      return;
    }
    const delay = Math.min(1000 * Math.pow(2, this._iceRestartAttempts), 8000);
    this._iceRestartTimer = setTimeout(async () => {
      if (!this.pc) return;
      this._iceRestartAttempts++;
      console.log(`PeerConnectionManager: ICE restart attempt ${this._iceRestartAttempts}`);
      try {
        const offer = await this.createOffer({ iceRestart: true });
        // Surface the new offer so the signaling layer can send it to the peer
        if (this.onIceRestart) this.onIceRestart(offer);
      } catch (e) {
        console.error('PeerConnectionManager: ICE restart failed', e);
      }
    }, delay);
  }

  async createOffer(options = {}) {
    if (!this.pc) return null;
    const offer = await this.pc.createOffer(options);
    await this.pc.setLocalDescription(offer);
    return offer;
  }

  async createAnswer(offer) {
    if (!this.pc) return null;
    await this.pc.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    return answer;
  }

  async setRemoteDescription(answer) {
    if (!this.pc) return;
    await this.pc.setRemoteDescription(new RTCSessionDescription(answer));
  }

  async addIceCandidate(candidate) {
    if (!this.pc) return;
    try {
      await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (e) {
      console.error('PeerConnectionManager: Error adding ICE candidate', e);
    }
  }

  addTrack(track, stream) {
    if (!this.pc) return null;
    return this.pc.addTrack(track, stream);
  }

  getSenders() {
    return this.pc ? this.pc.getSenders() : [];
  }

  cleanup() {
    clearTimeout(this._iceRestartTimer);
    this._iceRestartAttempts = 0;
    if (this.pc) {
      this.pc.onicecandidate = null;
      this.pc.ontrack = null;
      this.pc.oniceconnectionstatechange = null;
      this.pc.onconnectionstatechange = null;
      this.pc.close();
      this.pc = null;
    }
  }
}

export default PeerConnectionManager;
