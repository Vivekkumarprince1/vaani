/**
 * Browser Notification Manager
 * Handles browser notifications for incoming calls and messages
 */

class NotificationManager {
  constructor() {
    this.permission = 'default';
    this.isEnabled = false;
    this.activeNotifications = new Map();
  }

  /**
   * Request notification permission from the user
   * @returns {Promise<boolean>} - Whether permission was granted
   */
  async requestPermission() {
    try {
      if (!('Notification' in window)) {
        console.warn('This browser does not support notifications');
        return false;
      }

      // Check current permission status
      if (Notification.permission === 'granted') {
        this.permission = 'granted';
        this.isEnabled = true;
        console.log('✅ Notification permission already granted');
        return true;
      }

      if (Notification.permission === 'denied') {
        this.permission = 'denied';
        this.isEnabled = false;
        console.warn('⚠️ Notification permission was denied');
        return false;
      }

      // Request permission
      const permission = await Notification.requestPermission();
      this.permission = permission;
      this.isEnabled = permission === 'granted';
      
      if (this.isEnabled) {
        console.log('✅ Notification permission granted');
      } else {
        console.warn('⚠️ Notification permission denied');
      }

      return this.isEnabled;
    } catch (error) {
      console.error('Error requesting notification permission:', error);
      return false;
    }
  }

  /**
   * Check if notifications are enabled
   * @returns {boolean}
   */
  isNotificationEnabled() {
    return this.isEnabled && Notification.permission === 'granted';
  }

  /**
   * Show notification for incoming call
   * @param {Object} callData - Call information
   * @param {Function} onAccept - Callback when user accepts the call
   * @param {Function} onReject - Callback when user rejects the call
   */
  showIncomingCallNotification(callData, onAccept, onReject) {
    if (!this.isNotificationEnabled()) {
      console.log('Notifications not enabled, skipping call notification');
      return null;
    }

    try {
      const { fromName, callType, isGroupCall, roomName, callSessionId } = callData;
      
      const title = isGroupCall 
        ? `📞 ${roomName || 'Group'} - Incoming ${callType} call`
        : `📞 Incoming ${callType} call`;
      
      const body = isGroupCall
        ? `${fromName || 'Someone'} is calling in ${roomName || 'the group'}`
        : `${fromName || 'Someone'} is calling you`;

      const notification = new Notification(title, {
        body: body,
        icon: '/vite.svg',
        badge: '/vite.svg',
        tag: `call-${callSessionId || callData.callId || Date.now()}`,
        requireInteraction: true,
        vibrate: [200, 100, 200, 100, 200, 100, 200],
        data: callData
      });

      // Store notification reference
      const notificationId = `call-${callSessionId || callData.callId || Date.now()}`;
      this.activeNotifications.set(notificationId, notification);

      // Handle notification click (main body)
      notification.onclick = (event) => {
        event.preventDefault();
        window.focus();
        if (onAccept) {
          onAccept();
        }
        notification.close();
        this.activeNotifications.delete(notificationId);
      };

      // Handle notification close
      notification.onclose = () => {
        this.activeNotifications.delete(notificationId);
      };

      // Handle notification error
      notification.onerror = (error) => {
        console.error('Notification error:', error);
        this.activeNotifications.delete(notificationId);
      };

      // Auto-close after 30 seconds if not interacted with
      setTimeout(() => {
        if (this.activeNotifications.has(notificationId)) {
          notification.close();
          this.activeNotifications.delete(notificationId);
        }
      }, 30000);

      console.log('✅ Call notification shown:', title);
      return notification;
    } catch (error) {
      console.error('Error showing call notification:', error);
      return null;
    }
  }

  /**
   * Show notification for new message
   * @param {Object} messageData - Message information
   * @param {Function} onClick - Callback when user clicks the notification
   */
  showMessageNotification(messageData, onClick) {
    if (!this.isNotificationEnabled()) {
      console.log('Notifications not enabled, skipping message notification');
      return null;
    }

    try {
      const { senderName, content, isGroupMessage, roomName, timestamp, messageId } = messageData;
      
      const title = isGroupMessage
        ? `💬 ${roomName || 'Group Message'}`
        : `💬 ${senderName || 'New Message'}`;
      
      const body = isGroupMessage
        ? `${senderName}: ${content}`
        : content;

      // Truncate long messages
      const truncatedBody = body.length > 100 
        ? body.substring(0, 97) + '...'
        : body;

      const notification = new Notification(title, {
        body: truncatedBody,
        icon: '/vite.svg',
        badge: '/vite.svg',
        tag: `message-${messageId || Date.now()}`,
        requireInteraction: false,
        vibrate: [200, 100, 200],
        data: messageData,
        timestamp: timestamp ? new Date(timestamp).getTime() : Date.now()
      });

      // Store notification reference
      const notificationId = `message-${messageId || Date.now()}`;
      this.activeNotifications.set(notificationId, notification);

      // Handle notification click
      notification.onclick = (event) => {
        event.preventDefault();
        window.focus();
        if (onClick) {
          onClick(messageData);
        }
        notification.close();
        this.activeNotifications.delete(notificationId);
      };

      // Handle notification close
      notification.onclose = () => {
        this.activeNotifications.delete(notificationId);
      };

      // Handle notification error
      notification.onerror = (error) => {
        console.error('Notification error:', error);
        this.activeNotifications.delete(notificationId);
      };

      // Auto-close after 5 seconds
      setTimeout(() => {
        if (this.activeNotifications.has(notificationId)) {
          notification.close();
          this.activeNotifications.delete(notificationId);
        }
      }, 5000);

      console.log('✅ Message notification shown:', title);
      return notification;
    } catch (error) {
      console.error('Error showing message notification:', error);
      return null;
    }
  }

  /**
   * Close a specific notification
   * @param {string} notificationId - Notification ID to close
   */
  closeNotification(notificationId) {
    const notification = this.activeNotifications.get(notificationId);
    if (notification) {
      notification.close();
      this.activeNotifications.delete(notificationId);
    }
  }

  /**
   * Close all active notifications
   */
  closeAllNotifications() {
    this.activeNotifications.forEach((notification) => {
      try {
        notification.close();
      } catch (error) {
        console.warn('Error closing notification:', error);
      }
    });
    this.activeNotifications.clear();
    console.log('✅ All notifications closed');
  }

  /**
   * Get notification permission status
   * @returns {string} - 'granted', 'denied', or 'default'
   */
  getPermissionStatus() {
    if (!('Notification' in window)) {
      return 'not-supported';
    }
    return Notification.permission;
  }

  /**
   * Check if browser supports notifications
   * @returns {boolean}
   */
  isSupported() {
    return 'Notification' in window;
  }
}

// Create and export singleton instance
const notificationManager = new NotificationManager();

// Auto-initialize permission status on load
if ('Notification' in window) {
  notificationManager.permission = Notification.permission;
  notificationManager.isEnabled = Notification.permission === 'granted';
}

export default notificationManager;
