/**
 * MediaTrackManager
 * Manages local and remote media tracks.
 * Handles track switching, muting, and injection of translated audio.
 */
class MediaTrackManager {
  constructor() {
    this.localStream = null;
    this.remoteStream = null;
    this.originalAudioTrack = null;
    this.translatedAudioTrack = null;
    this.videoTrack = null;
  }

  setLocalStream(stream) {
    this.localStream = stream;
    this.originalAudioTrack = stream.getAudioTracks()[0];
    this.videoTrack = stream.getVideoTracks()[0];
  }

  setRemoteStream(stream) {
    this.remoteStream = stream;
  }

  /**
   * Injects a new audio track into the existing PeerConnection.
   * Uses RTCRtpSender.replaceTrack() for seamless switching.
   * 
   * @param {RTCPeerConnection} pc - The active PeerConnection
   * @param {MediaStreamTrack} newTrack - The track to inject (e.g., translated audio)
   */
  async injectAudioTrack(pc, newTrack) {
    const senders = pc.getSenders();
    const audioSender = senders.find(s => s.track && s.track.kind === 'audio');
    
    if (audioSender) {
      console.log('MediaTrackManager: Replacing audio track');
      await audioSender.replaceTrack(newTrack);
      this.translatedAudioTrack = newTrack;
    } else {
      console.warn('MediaTrackManager: No audio sender found to replace track');
    }
  }

  /**
   * Switches between original voice and translated audio.
   * 
   * @param {RTCPeerConnection} pc 
   * @param {string} mode - 'original' or 'translated'
   */
  async switchAudioMode(pc, mode) {
    const trackToUse = mode === 'translated' ? this.translatedAudioTrack : this.originalAudioTrack;
    if (trackToUse) {
      await this.injectAudioTrack(pc, trackToUse);
    }
  }

  stopAllTracks() {
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
    }
    if (this.translatedAudioTrack) {
      this.translatedAudioTrack.stop();
    }
    this.localStream = null;
    this.originalAudioTrack = null;
    this.translatedAudioTrack = null;
    this.videoTrack = null;
  }
}

const mediaTrackManager = new MediaTrackManager();
export default mediaTrackManager;
