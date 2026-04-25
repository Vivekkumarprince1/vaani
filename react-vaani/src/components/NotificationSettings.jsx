import React, { useState, useEffect } from 'react';
import notificationManager from '../utils/notificationManager';

/**
 * NotificationSettings Component
 * Allows users to enable/disable browser notifications
 */
const NotificationSettings = ({ onClose }) => {
  const [permissionStatus, setPermissionStatus] = useState('default');
  const [isSupported, setIsSupported] = useState(true);
  const [isRequesting, setIsRequesting] = useState(false);

  useEffect(() => {
    // Check initial state
    const supported = notificationManager.isSupported();
    const status = notificationManager.getPermissionStatus();
    
    setIsSupported(supported);
    setPermissionStatus(status);
    
    console.log('Notification Settings - Initial state:', { supported, status });
  }, []);

  const handleToggleNotifications = async () => {
    console.log('Toggle clicked, current status:', permissionStatus);
    
    // If already granted, show instructions to disable
    if (permissionStatus === 'granted') {
      alert(
        '🔔 Notifications are currently ENABLED\n\n' +
        'To disable notifications, please use your browser settings:\n\n' +
        '• Chrome/Edge: Settings → Privacy → Site Settings → Notifications\n' +
        '• Firefox: Preferences → Privacy → Permissions → Notifications\n' +
        '• Safari: Preferences → Websites → Notifications\n\n' +
        'Find this site in the list and block or remove it.'
      );
      return;
    }

    // If denied, show instructions to enable
    if (permissionStatus === 'denied') {
      alert(
        '🔕 Notifications are BLOCKED\n\n' +
        'To enable notifications, please use your browser settings:\n\n' +
        '• Chrome/Edge: Settings → Privacy → Site Settings → Notifications\n' +
        '• Firefox: Preferences → Privacy → Permissions → Notifications\n' +
        '• Safari: Preferences → Websites → Notifications\n\n' +
        'Find this site in the list and allow notifications.\n\n' +
        'Then refresh this page.'
      );
      return;
    }

    // If default, request permission
    setIsRequesting(true);
    try {
      console.log('Requesting notification permission...');
      const granted = await notificationManager.requestPermission();
      const newStatus = notificationManager.getPermissionStatus();
      
      console.log('Permission request result:', { granted, newStatus });
      setPermissionStatus(newStatus);
      
      if (granted) {
        console.log('✅ Permission granted, showing test notification');
        // Show a test notification
        notificationManager.showMessageNotification({
          senderName: 'Vaani',
          content: '✅ Notifications enabled! You will now receive alerts for calls and messages.',
          isGroupMessage: false,
          messageId: `test-${Date.now()}`
        });
      } else {
        console.warn('❌ Permission denied');
        alert('❌ Notification permission was denied. You can enable it later in browser settings.');
      }
    } catch (error) {
      console.error('Error toggling notifications:', error);
      alert('Error: Could not toggle notifications - ' + error.message);
    } finally {
      setIsRequesting(false);
    }
  };

  const handleRefreshPage = () => {
    window.location.reload();
  };

  const getStatusInfo = () => {
    switch (permissionStatus) {
      case 'granted':
        return {
          icon: '✅',
          title: 'Notifications Enabled',
          message: 'You will receive notifications for incoming calls and messages.',
          color: 'text-green-600',
          bgColor: 'bg-green-50',
          borderColor: 'border-green-200'
        };
      case 'denied':
        return {
          icon: '🔕',
          title: 'Notifications Blocked',
          message: 'Notifications are blocked. Please enable them in your browser settings.',
          color: 'text-red-600',
          bgColor: 'bg-red-50',
          borderColor: 'border-red-200'
        };
      case 'not-supported':
        return {
          icon: '⚠️',
          title: 'Not Supported',
          message: 'Your browser does not support notifications.',
          color: 'text-yellow-600',
          bgColor: 'bg-yellow-50',
          borderColor: 'border-yellow-200'
        };
      default:
        return {
          icon: '🔔',
          title: 'Enable Notifications',
          message: 'Get notified when you receive calls and messages.',
          color: 'text-blue-600',
          bgColor: 'bg-blue-50',
          borderColor: 'border-blue-200'
        };
    }
  };

  const status = getStatusInfo();

  if (!isSupported) {
    return (
      <div className="bg-white rounded-lg shadow-lg p-6 max-w-md">
        <div className="text-center">
          <div className="text-4xl mb-4">⚠️</div>
          <h3 className="text-lg font-semibold mb-2">Notifications Not Supported</h3>
          <p className="text-gray-600 mb-4">
            Your browser does not support desktop notifications.
          </p>
          {onClose && (
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
            >
              Close
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-lg p-6 max-w-md">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center space-x-3">
          <div className="text-3xl">{status.icon}</div>
          <div>
            <h3 className={`text-lg font-semibold ${status.color}`}>
              {status.title}
            </h3>
          </div>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      <p className="text-gray-600 mb-6">
        {status.message}
      </p>

      {/* Toggle Switch Container */}
      <div className="mb-6">
        <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-200">
          <div className="flex-1">
            <p className="text-sm font-medium text-gray-700">
              Notifications
            </p>
            <p className="text-xs text-gray-500 mt-1">
              {permissionStatus === 'granted' ? 'Currently enabled' : 
               permissionStatus === 'denied' ? 'Currently blocked' :
               'Not enabled yet'}
            </p>
          </div>
          
          {/* Toggle Button */}
          <button
            onClick={handleToggleNotifications}
            disabled={isRequesting || !isSupported}
            className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors ${
              permissionStatus === 'granted' 
                ? 'bg-emerald-500 hover:bg-emerald-600' 
                : 'bg-gray-300 hover:bg-gray-400'
            } disabled:opacity-50 disabled:cursor-not-allowed`}
            title={permissionStatus === 'granted' ? 'Click to disable in browser settings' : 'Click to enable notifications'}
          >
            <span
              className={`inline-block h-6 w-6 transform rounded-full bg-white shadow-lg transition-transform ${
                permissionStatus === 'granted' ? 'translate-x-7' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
      </div>

      {permissionStatus === 'granted' && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="flex items-start space-x-3">
            <svg className="w-5 h-5 text-green-600 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div className="flex-1">
              <p className="text-sm text-green-800 font-medium mb-1">
                ✅ Notifications Active
              </p>
              <p className="text-xs text-green-700 mb-2">
                You will receive notifications for:
              </p>
              <ul className="space-y-1 text-xs text-green-700">
                <li className="flex items-center space-x-2">
                  <span>📞</span>
                  <span>Incoming voice and video calls</span>
                </li>
                <li className="flex items-center space-x-2">
                  <span>💬</span>
                  <span>New messages when app is in background</span>
                </li>
                <li className="flex items-center space-x-2">
                  <span>👥</span>
                  <span>Group call invitations</span>
                </li>
              </ul>
              <p className="text-xs text-green-600 mt-3 pt-3 border-t border-green-200">
                To disable: Toggle the switch or use browser settings
              </p>
            </div>
          </div>
        </div>
      )}

      {permissionStatus === 'denied' && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-start space-x-3">
            <svg className="w-5 h-5 text-red-600 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div className="flex-1">
              <p className="text-sm text-red-800 font-medium mb-2">
                ❌ Notifications are Blocked
              </p>
              <p className="text-xs text-red-700 mb-3">
                Your browser has blocked notifications. Follow these steps to enable them:
              </p>
              
              <div className="space-y-2 mb-3">
                <div className="text-xs text-red-700 bg-red-100 p-2 rounded">
                  <strong>Chrome/Edge:</strong> Settings → Privacy → Site Settings → Notifications
                </div>
                <div className="text-xs text-red-700 bg-red-100 p-2 rounded">
                  <strong>Firefox:</strong> Preferences → Privacy → Permissions → Notifications
                </div>
                <div className="text-xs text-red-700 bg-red-100 p-2 rounded">
                  <strong>Safari:</strong> Preferences → Websites → Notifications
                </div>
              </div>
              
              <p className="text-xs text-red-600 mt-2">
                After allowing, refresh this page to activate notifications.
              </p>
              
              <button
                onClick={() => window.location.reload()}
                className="mt-3 w-full px-3 py-2 bg-red-600 text-white text-xs rounded hover:bg-red-700 transition-colors font-medium"
              >
                🔄 Refresh Page
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationSettings;
