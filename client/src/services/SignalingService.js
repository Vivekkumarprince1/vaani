import socketManager from '../utils/socketManager';

/**
 * SignalingService
 * Handles all WebRTC signaling events via Socket.IO.
 * Decouples signaling logic from components and PeerConnection management.
 */
class SignalingService {
  constructor() {
    this.socket = null;
    this.listeners = new Map();
  }

  initialize() {
    this.socket = socketManager.getSocket();
    if (!this.socket) {
      console.error('SignalingService: Socket not initialized');
    }
  }

  // --- Emitters ---

  emitCallUser(data) {
    // data: { to, offer, callType, roomId, callSessionId }
    socketManager.emit('callUser', data);
  }

  emitAnswerCall(data) {
    // data: { to, answer, roomId, callSessionId, callRoomId }
    socketManager.emit('answerCall', data);
  }

  emitIceCandidate(data) {
    // data: { to, candidate, roomId }
    socketManager.emit('iceCandidate', data);
  }

  emitEndCall(data) {
    // data: { to, roomId, callSessionId }
    socketManager.emit('endCall', data);
  }

  emitIncomingCallAck(data) {
    // data: { callerId, calleeId, callSessionId }
    socketManager.emit('incomingCallAck', data);
  }

  emitUserBusy(data) {
    // data: { to, callSessionId }
    socketManager.emit('userBusy', data);
  }

  // --- Listeners ---

  onIncomingCall(callback) {
    socketManager.on('incomingCall', callback);
  }

  onCallAnswered(callback) {
    socketManager.on('callAnswered', callback);
  }

  onIceCandidate(callback) {
    socketManager.on('iceCandidate', callback);
  }

  onCallEnded(callback) {
    socketManager.on('callEnded', callback);
  }

  onIncomingCallAck(callback) {
    socketManager.on('incomingCallAck', callback);
  }

  onUserBusy(callback) {
    socketManager.on('userBusy', callback);
  }

  onUserUnavailable(callback) {
    socketManager.on('userUnavailable', callback);
  }

  // Generic cleanup for specific listeners if needed
  removeListener(event, callback) {
    socketManager.off(event, callback);
  }
}

const signalingService = new SignalingService();
export default signalingService;
