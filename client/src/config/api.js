/**
 * Centralized API Configuration
 * Handles environment-specific URLs and protocols
 */

// Get base URLs from environment variables
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3001';
const NODE_ENV = import.meta.env.VITE_NODE_ENV || 'development';

/**
 * Protocol handler for Socket.IO
 * Converts http → ws, https → wss
 */
const getSocketURL = () => {
  let socketUrl = SOCKET_URL;
  
  // In browser, use location protocol if not explicitly set
  if (typeof window !== 'undefined' && !import.meta.env.VITE_SOCKET_URL) {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    socketUrl = `${protocol}//${window.location.host}`;
  } else if (socketUrl.startsWith('http://')) {
    socketUrl = socketUrl.replace('http://', 'ws://');
  } else if (socketUrl.startsWith('https://')) {
    socketUrl = socketUrl.replace('https://', 'wss://');
  }
  
  return socketUrl;
};

export const config = {
  API_URL,
  SOCKET_URL: getSocketURL(),
  NODE_ENV,
  isDevelopment: NODE_ENV === 'development',
  isProduction: NODE_ENV === 'production',
  USE_LIVEKIT_AUDIO_TRACKS: import.meta.env.VITE_USE_LIVEKIT_AUDIO_TRACKS === 'true',
};

export default config;
