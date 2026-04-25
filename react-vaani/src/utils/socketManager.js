import { io } from 'socket.io-client';

/**
 * Socket.IO Connection Manager for Next.js
 * 
 * This utility provides a robust way to manage Socket.IO connections
 */
class SocketManager {
  constructor() {
    this.socket = null;
    this.token = null;
  // Default to the extracted backend running on port 4000. Can be overridden by NEXT_PUBLIC_SOCKET_URL.
  this.baseUrl = import.meta.env.VITE_SOCKET_URL || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:4000');
  // event -> Set of handlers
  this.eventHandlers = new Map();
    this.isConnected = false;
    this.attemptCount = 0;
    this.maxAttempts = 10;
    this.useWebSocket = true;
  }

  /**
   * Initialize the socket connection
   * @param {string} token - Authentication token
   * @returns {Object} - The socket instance
   */
  initialize(token) {
    this.token = token;
    this.connect();
    this.setupBrowserEventListeners();
    return this.socket;
  }

  /**
   * Connect to the Socket.IO server
   */
  connect() {
    if (this.socket) {
      this.cleanup();
    }

    const transportOptions = this.useWebSocket 
      ? ['polling', 'websocket']
      : ['polling'];
    
    const socketOptions = {
      auth: { token: this.token },
      path: '/socket.io',
      reconnection: true,
      reconnectionAttempts: this.maxAttempts,
      reconnectionDelay: 2000,
      reconnectionDelayMax: 10000,
      timeout: 20000,
      transports: transportOptions,
      upgrade: this.useWebSocket,
      rememberUpgrade: true,
      forceNew: true,
    };

    console.log('Connecting to socket with options:', {
      baseUrl: this.baseUrl,
      transports: transportOptions,
      useWebSocket: this.useWebSocket
    });

    this.socket = io(this.baseUrl, socketOptions);
    this.setupListeners();
  }

  /**
   * Setup socket event listeners
   */
  setupListeners() {
    if (!this.socket) return;

    // Connection events
    this.socket.on('connect', () => {
      console.log('Socket connected:', this.socket.id);
      this.isConnected = true;
      this.attemptCount = 0;
      
      // Start heartbeat when connected
      this.startHeartbeat();
    });

    this.socket.on('disconnect', (reason) => {
      console.log('Socket disconnected:', reason);
      this.isConnected = false;
      
      // Stop heartbeat when disconnected
      this.stopHeartbeat();
    });

    this.socket.on('connect_error', (error) => {
      console.error('Socket connection error:', error);
      this.attemptCount++;
      
      if (this.attemptCount >= 3 && this.useWebSocket) {
        console.log('Switching to polling-only mode');
        this.useWebSocket = false;
        this.connect();
      }
    });

    // Handle pong response from server
    this.socket.on('pong', () => {
      // Pong received - connection is alive
      console.debug('Pong received from server');
    });

    // Restore custom event handlers
    this.eventHandlers.forEach((handlerSet, event) => {
      handlerSet.forEach(handler => {
        this.socket.on(event, handler);
      });
    });

    // Development helper: log all incoming socket events to debug missing signals
    try {
      // Always log in development, and specifically log group call events
      this.socket.onAny((event, ...args) => {
        try {
          if (event.includes('group') || event.includes('call') || event.includes('Call')) {
            console.log(`🔊 [SOCKET EVENT] ${event}:`, args);
          } else if (process.env.NODE_ENV !== 'production') {
            console.debug('[socket.onAny] event:', event, 'args:', args);
          }
        } catch (e) {
          // ignore
        }
      });
    } catch (e) {
      // some socket versions may not support onAny; ignore silently
      console.warn('Socket.onAny not supported:', e);
    }

    // Bootstrap-level bridge: dispatch a DOM CustomEvent for incomingCall so code
    // outside React lifecycle (or listeners added before socketManager is imported)
    // can reliably observe incoming calls. This reduces missed events when handlers
    // are attached later by components.
    try {
      this.socket.on('incomingCall', (...args) => {
        try {
          if (typeof window !== 'undefined' && window.CustomEvent) {
            const ev = new CustomEvent('app:incomingCall', { detail: args });
            window.dispatchEvent(ev);
          }
        } catch (e) {
          // ignore DOM dispatch errors in non-browser environments
        }
      });
    } catch (e) {
      // ignore if socket doesn't support
    }
  }

  /**
   * Register an event handler
   * @param {string} event - Event name
   * @param {Function} handler - Event handler function
   */
  on(event, handler) {
    // Always store handler so it can be attached later when socket connects
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    const handlerSet = this.eventHandlers.get(event);
    handlerSet.add(handler);

    // If socket is already created, attach immediately
    if (this.socket) {
      try {
        this.socket.on(event, handler);
      } catch (e) {
        console.warn('Failed to attach socket handler immediately:', e);
      }
    }
  }

  /**
   * Remove an event handler
   * @param {string} event - Event name
   */
  off(event, handler) {
    // Remove handler(s) from our local registry first
    const handlerSet = this.eventHandlers.get(event);

    if (handler) {
      if (handlerSet) {
        handlerSet.delete(handler);
        if (handlerSet.size === 0) this.eventHandlers.delete(event);
      }

      // If socket exists, detach from socket as well
      if (this.socket) {
        try { this.socket.off(event, handler); } catch (e) {}
      }
      return;
    }

    // Remove all handlers for this event
    if (handlerSet) {
      this.eventHandlers.delete(event);
    }

    if (this.socket) {
      try {
        // Detach all known handlers from the socket
        // (if socket.off supports removing a handler by reference)
        // We kept references in handlerSet earlier, but since we've deleted it, we can't iterate here.
        // As a safe fallback, call socket.off(event) to remove all handlers if supported.
        if (typeof this.socket.off === 'function') {
          this.socket.off(event);
        }
      } catch (e) {
        console.warn('Failed to remove socket handlers for event:', event, e);
      }
    }
  }

  /**
   * Emit an event
   * @param {string} event - Event name
   * @param {*} data - Data to send
   */
  emit(event, data) {
    if (!this.socket || !this.isConnected) {
      console.warn('Socket not connected');
      return;
    }
    
    this.socket.emit(event, data);
  }

  /**
   * Cleanup socket connection
   * @param {boolean} isLogout - Whether this is a logout action
   */
  cleanup(isLogout = false) {
    // Stop heartbeat
    this.stopHeartbeat();
    
    // Remove browser event listeners
    this.removeBrowserEventListeners();
    
    if (this.socket) {
      // If this is a logout, notify the server before disconnecting
      if (isLogout && this.isConnected) {
        try {
          this.socket.emit('userLogout');
        } catch (error) {
          console.warn('Failed to emit userLogout:', error);
        }
      }
      
      this.socket.disconnect();
      this.socket = null;
    }
    this.isConnected = false;
  }

  /**
   * Handle user logout - cleanup socket and notify server
   */
  handleLogout() {
    this.cleanup(true);
  }

  /**
   * Get socket instance
   * @returns {Object} - The socket instance
   */
  getSocket() {
    return this.socket;
  }

  /**
   * Check if socket is connected
   * @returns {boolean}
   */
  isSocketConnected() {
    return this.isConnected;
  }

  /**
   * Setup heartbeat to keep connection alive and update lastActive
   */
  startHeartbeat() {
    // Clear any existing heartbeat
    this.stopHeartbeat();
    
    // Send ping every 25 seconds (before server's 60s pingTimeout)
    this.heartbeatInterval = setInterval(() => {
      if (this.socket && this.isConnected) {
        this.socket.emit('ping');
      }
    }, 25000);
    
    console.log('Heartbeat started');
  }

  /**
   * Stop heartbeat interval
   */
  stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
      console.log('Heartbeat stopped');
    }
  }

  /**
   * Setup browser event listeners for tab/window close
   */
  setupBrowserEventListeners() {
    if (typeof window === 'undefined') return;

    // Handle page unload (close tab/window)
    const handleBeforeUnload = () => {
      if (this.socket && this.isConnected) {
        // Send synchronous disconnect signal
        this.socket.emit('userLogout');
        this.socket.disconnect();
      }
    };

    // Handle visibility change (tab switch, minimize)
    const handleVisibilityChange = () => {
      if (document.hidden) {
        // User switched away from tab - could implement idle timeout here
        console.log('Tab hidden - user may be idle');
      } else {
        // User came back to tab
        console.log('Tab visible again');
        if (!this.isConnected && this.token) {
          console.log('Reconnecting...');
          this.connect();
        }
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Store cleanup function
    this.browserEventCleanup = () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }

  /**
   * Remove browser event listeners
   */
  removeBrowserEventListeners() {
    if (this.browserEventCleanup) {
      this.browserEventCleanup();
      this.browserEventCleanup = null;
    }
  }
}

// Create and export a singleton instance
const socketManager = new SocketManager();
export default socketManager;