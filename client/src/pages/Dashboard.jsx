import React, { useState, useEffect, useContext, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import { AuthContext } from '../contexts/AuthContext';
import { ThemeContext } from '../contexts/ThemeContext';
import { useTranslation } from '../contexts/TranslationContext';
import socketManager from '../utils/socketManager';
import { getIceServers } from '../utils/webrtcConfig';
import callSoundPlayer from '../utils/callSounds';
import notificationManager from '../utils/notificationManager';
import Header from '../components/Header';
import ContactList from '../components/ContactList';
import MessageSection from '../components/MessageSection';
import VideoCall from '../components/VideoCall';
import GroupVideoCall from '../components/GroupVideoCall';
import Loader from '../components/Loader';
import SocketStatus from '../components/SocketStatus';
import CreateGroupModal from '../components/CreateGroupModal';
import GroupManagementModal from '../components/GroupManagementModal';
import NotificationSettings from '../components/NotificationSettings';
import callManager from '../managers/CallManager';
import signalingService from '../services/SignalingService';
import mediaTrackManager from '../rtc/MediaTrackManager';
import { Card, Button, Badge, Modal } from '../components/ui';



const API_URL = import.meta.env.VITE_API_URL || '/api';

const Dashboard = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isAuthenticated, loading: authLoading } = useContext(AuthContext);
  const { currentLanguage, changeLanguage, translateText, translateTexts } = useTranslation();

  const [messages, setMessages] = useState([]);
  const [messagesPageHasMore, setMessagesPageHasMore] = useState(false);
  const [messagesLoadingMore, setMessagesLoadingMore] = useState(false);
  const [users, setUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [rooms, setRooms] = useState([]);
  const [selectedRoom, setSelectedRoom] = useState(null);
  const [showSidebar, setShowSidebar] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMessage, setLoadingMessage] = useState("Loading...");

  // Unread message counts
  const [unreadByContact, setUnreadByContact] = useState({});
  const [unreadByRoom, setUnreadByRoom] = useState({});

  // Video call state
  const [inCall, setInCall] = useState(false);
  const [callType, setCallType] = useState(null); // 'audio' or 'video'
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  
  // Transcripts
  const [localOriginal, setLocalOriginal] = useState('');
  const [localTranslated, setLocalTranslated] = useState('');
  const [remoteOriginal, setRemoteOriginal] = useState('');
  const [remoteTranslated, setRemoteTranslated] = useState('');

  const [incomingCall, setIncomingCall] = useState(null);
  const [acceptingCall, setAcceptingCall] = useState(false);
  const [activeCallSession, setActiveCallSession] = useState(null);
  // Caller-side ringing state (UI: show callee/device as ringing)
  const [callerRinging, setCallerRinging] = useState(false);
  const [remoteRingingUser, setRemoteRingingUser] = useState(null);
  const [showCreateGroupModal, setShowCreateGroupModal] = useState(false);
  const [showAddContactModal, setShowAddContactModal] = useState(false);
  const [addContactPhone, setAddContactPhone] = useState('');
  const [addContactStatus, setAddContactStatus] = useState('');
  const [showInviteOption, setShowInviteOption] = useState(false);
  const [managingRoom, setManagingRoom] = useState(null);

  // Group call state
  const [inGroupCall, setInGroupCall] = useState(false);
  const [groupCallData, setGroupCallData] = useState(null);
  const [pendingGroupCalls, setPendingGroupCalls] = useState([]);
  const [incomingGroupCall, setIncomingGroupCall] = useState(null);

  // Notification settings
  const [showNotificationSettings, setShowNotificationSettings] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState('default');

  // Media preview state has been moved to MessageSection.jsx

  const socketInstance = socketManager.getSocket();

  // Refs to hold latest selection for socket handlers (avoid stale closures)
  const selectedUserRef = useRef(selectedUser);
  const selectedRoomRef = useRef(selectedRoom);
  const roomsRef = useRef([]);
  const currentLanguageRef = useRef(currentLanguage);
  const userRef = useRef(user);
  const inCallRef = useRef(inCall);
  const inGroupCallRef = useRef(inGroupCall);
  const incomingCallRef = useRef(incomingCall);

  const handleCallEndedLocally = useCallback(() => {
    console.log('[Dashboard] Cleaning up call state locally');
    console.log('🧹 Cleaning up call state locally');
    setInCall(false);
    setIncomingCall(null);
    setLocalStream(null);
    setRemoteStream(null);
    callSoundPlayer.stopAll();
    callManager.cleanup();
  }, []);



  // Refs
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const initiatorOfferSentRef = useRef(new Set()); // track callSessionIds we've sent offers for

  // 1. Initialize Socket.IO when authenticated
  // Check authentication
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (isAuthenticated && token) {
      console.log('[Dashboard] Initializing socket connection');
      socketManager.initialize(token);
    }

    return () => {
      // Only cleanup on unmount, not on every re-render
      // unless we want to disconnect when auth is lost
    };
  }, [isAuthenticated]); 

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      console.log('[Dashboard] Permanent cleanup on unmount');
      callManager.cleanup();
      socketManager.cleanup();
      if (window.vaaniDebug) delete window.vaaniDebug;
    };
  }, []);

  // 2. Maintain a global debug object for troubleshooting
  useEffect(() => {
    window.vaaniDebug = {
      user,
      isAuthenticated,
      inCall,
      inGroupCall,
      incomingCall,
      incomingGroupCall,
      socketConnected: socketManager.isSocketConnected?.() || socketManager.isConnected,
      resetStates: () => {
        setInCall(false);
        setInGroupCall(false);
        setIncomingCall(null);
        setIncomingGroupCall(null);
        console.log('🛡️ Debug: All call states reset');
      }
    };
  }, [user, isAuthenticated, inCall, inGroupCall, incomingCall, incomingGroupCall]);

  // 3. Auth redirection logic
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      navigate('/login');
    }
  }, [isAuthenticated, authLoading, navigate]);

  // Initialize notification manager and check permission on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const status = notificationManager.getPermissionStatus();
    setNotificationPermission(status);

    // Auto-show notification settings banner if permission is default (not asked yet)
    if (status === 'default') {
      // Show settings after a brief delay
      const timer = setTimeout(() => {
        setShowNotificationSettings(true);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, []);

  // Fetch users
  const fetchUsers = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(`${API_URL}/auth/users`, {
        headers: { 'x-auth-token': token }
      });

      // Transform users to match expected format
      const transformedUsers = res.data.map(u => ({
        id: u._id,
        name: u.username,
        avatar: u.username?.[0]?.toUpperCase() || 'U',
        status: u.status || 'offline',
        lastSeen: u.lastActive
      }));

      setUsers(transformedUsers);
    } catch (err) {
      console.error('Error fetching users:', err);
    }
  };

  // Fetch rooms
  const fetchRooms = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(`${API_URL}/chat/rooms`, {
        headers: { 'x-auth-token': token }
      });
      const roomsData = res.data || [];
      setRooms(roomsData);

      // Ensure we join socket.io rooms for real-time room messages
      try {
        const socket = socketManager.getSocket();
        const joinAll = () => {
          (roomsData || []).forEach(r => {
            try {
              socketManager.emit('joinRoom', r._id);
            } catch (e) {
              console.warn('Failed to join room:', r._id, e);
            }
          });
        };

        if (socket && socket.connected) {
          joinAll();
        } else if (socket) {
          // join once socket connects
          const onConnectJoin = () => {
            joinAll();
            try { socketManager.off('connect', onConnectJoin); } catch (e) { }
          };
          socketManager.on('connect', onConnectJoin);
        }
      } catch (e) {
        console.warn('Error while trying to join rooms:', e);
      }
    } catch (err) {
      console.error('Error fetching rooms:', err);
      setRooms([]);
    }
  };

  // Fetch messages (supports pagination options: { before, limit, append })
  const fetchMessages = async (userId, roomId, opts = {}) => {
    try {
      const token = localStorage.getItem('token');
      const params = userId ? { userId } : { roomId: selectedRoom._id };
      params.limit = opts.limit || 30;
      if (opts.before) params.before = opts.before;
      const res = await axios.get(`${API_URL}/chat/history`, {
        headers: { 'x-auth-token': token },
        params
      });
      // API returns { messages, hasMore }
      const data = res.data || { messages: [] };
      if (opts.append) {
        // prepend older messages so chronological order remains
        setMessages(prev => [...data.messages, ...prev]);
      } else {
        setMessages(data.messages || []);
      }
      setMessagesPageHasMore(Boolean(data.hasMore));

      // Mark unread messages as seen
      if (data.messages && data.messages.length > 0 && !opts.append) {
        const currentUserId = user?._id || user?.id;
        const unseenMessageIds = data.messages
          .filter(msg => {
            const senderId = msg.sender?._id || msg.sender;
            const msgStatus = msg.status;
            return senderId !== currentUserId && msgStatus !== 'seen';
          })
          .map(msg => msg._id || msg.id)
          .filter(Boolean);

        if (unseenMessageIds.length > 0) {
          // Emit to server to mark as seen
          socketManager.emit('messageSeen', { messageIds: unseenMessageIds });

          // Clear unread count for this contact/room locally
          if (userId) {
            setUnreadByContact(prev => {
              const updated = { ...prev };
              delete updated[userId];
              return updated;
            });
          } else if (roomId) {
            setUnreadByRoom(prev => {
              const updated = { ...prev };
              delete updated[roomId];
              return updated;
            });
          }
        }
      }
    } catch (err) {
      console.error('Error fetching messages:', err);
      setMessages([]);
    }
  };

  // Load older messages (pagination) when called
  const fetchMoreMessages = async () => {
    if (!messages || messagesLoadingMore || !messagesPageHasMore) return false;
    setMessagesLoadingMore(true);
    try {
      const oldest = messages[0];
      const before = oldest ? oldest.timestamp : undefined;
      await fetchMessages(selectedUser?._id || null, selectedRoom?._id || null, { append: true, before, limit: 30 });
      return true;
    } catch (e) {
      console.error('Error loading more messages:', e);
      return false;
    } finally {
      setMessagesLoadingMore(false);
    }
  };

  // Fetch pending group calls
  const fetchPendingGroupCalls = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(`${API_URL}/chat/group-call/pending`, {
        headers: { 'x-auth-token': token }
      });
      setPendingGroupCalls(res.data.calls || []);
    } catch (err) {
      console.error('Error fetching pending group calls:', err);
    }
  };

  // Fetch unread message counts
  const fetchUnreadCounts = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(`${API_URL}/chat/unread-counts`, {
        headers: { 'x-auth-token': token }
      });
      setUnreadByContact(res.data.unreadByContact || {});
      setUnreadByRoom(res.data.unreadByRoom || {});
    } catch (err) {
      console.error('Error fetching unread counts:', err);
    }
  };

  // Add Contact
  const handleAddContact = async (e) => {
    e?.preventDefault();
    if (!addContactPhone.trim()) return;

    try {
      setAddContactStatus('Adding...');
      setShowInviteOption(false);
      const token = localStorage.getItem('token');
      const res = await axios.post(`${API_URL}/auth/contacts/add`, 
        { mobileNumber: addContactPhone },
        { headers: { 'x-auth-token': token } }
      );
      
      if (res.data.success) {
        setAddContactStatus('Contact added successfully!');
        setAddContactPhone('');
        fetchUsers(); // Refresh the contact list
        setTimeout(() => {
          setShowAddContactModal(false);
          setAddContactStatus('');
        }, 1500);
      }
    } catch (err) {
      console.error('Error adding contact:', err);
      if (err.response?.status === 404) {
        setAddContactStatus(err.response.data.error || 'User not found. You can invite them to Vaani!');
        setShowInviteOption(true);
      } else if (err.response?.data?.error) {
        setAddContactStatus(err.response.data.error);
        setShowInviteOption(false);
      } else {
        setAddContactStatus('Failed to add contact');
        setShowInviteOption(false);
      }
    }
  };

  // Keep refs up to date to avoid stale closures in socket listeners
  useEffect(() => {
    selectedUserRef.current = selectedUser;
    selectedRoomRef.current = selectedRoom;
    currentLanguageRef.current = currentLanguage;
    userRef.current = user;
    inCallRef.current = inCall;
    inGroupCallRef.current = inGroupCall;
    incomingCallRef.current = incomingCall;
  }, [selectedUser, selectedRoom, currentLanguage, user, inCall, inGroupCall, incomingCall]);

  // Initialize Socket.IO
  useEffect(() => {
    if (!isAuthenticated || !user || typeof window === 'undefined') return;

    const token = localStorage.getItem('token');
    if (!token) return;

    // Enable audio on any user interaction
    const enableAudio = () => {
      callSoundPlayer.enableUserInteraction();
      document.removeEventListener('click', enableAudio);
      document.removeEventListener('keydown', enableAudio);
    };
    document.addEventListener('click', enableAudio);
    document.addEventListener('keydown', enableAudio);

    // --- Hoisted Socket Handlers ---
    const handleGroupCallIncoming = (payload = {}) => {
      try {
        const currentUserId = user?._id || user?.id;
        console.log('[Dashboard] 🔔 group_incoming_call received:', { 
          payload, 
          currentUserId, 
          inCall: inCallRef.current, 
          inGroupCall: inGroupCallRef.current 
        });

        if (!currentUserId) {
          console.warn('[Dashboard] Received call notification but user is not loaded');
          return;
        }

        const invitation = payload.invitation || payload;
        if (!invitation || !invitation.callRoomId) {
          console.error('[Dashboard] Received group call but callRoomId is missing:', invitation);
          return;
        }

        // Check if user is already in any type of call
        if (inCallRef.current || inGroupCallRef.current) {
          console.log('[Dashboard] Already in a call, ignoring group invitation from:', invitation.initiator?.username);
          return;
        }

        // Prevent self-notification if logic on server fails
        if (invitation.initiatorId && String(invitation.initiatorId) === String(currentUserId)) {
          console.log('[Dashboard] Ignoring group call initiated by self');
          return;
        }

        console.log('[Dashboard] ✅ Presenting incoming group call modal:', invitation.roomName);
        
        // Ensure state is clean before showing new call
        setIncomingGroupCall(null);
        setTimeout(() => {
          setIncomingGroupCall(invitation);
          callSoundPlayer.playRingtone().catch(e => console.warn('[Dashboard] Ringtone error:', e));
        }, 10);

        // Show browser notification if tab is not active
        if (document.hidden) {
          const initiatorName = invitation.initiator?.username || invitation.initiator?.name || 'Someone';
          notificationManager.showIncomingCallNotification({
            from: initiatorName,
            title: `Group ${invitation.callType} call: ${invitation.roomName}`,
            body: `Incoming group call from ${initiatorName}`,
            callId: invitation.callId,
            fromName: initiatorName,
            callType: invitation.callType,
            isGroupCall: true,
            roomName: invitation.roomName,
            callSessionId: invitation.callId
          }, () => {
            window.focus();
            joinGroupCall(invitation);
          }, () => {
            declineGroupCall(invitation);
          });
        }
      } catch (err) {
        console.error('[Dashboard] Error in handleGroupCallIncoming:', err);
      }
    };

    const handleGroupCallEnded = (data) => {
      try {
        console.log('[Dashboard] group_call_ended received');
        callSoundPlayer.stopAll();
        callSoundPlayer.playDisconnect().catch(() => {});

        if (inGroupCallRef.current) {
          setIncomingGroupCall(null);
          setInGroupCall(false);
          setGroupCallData(null);
        }
      } catch (e) {
        console.error('[Dashboard] Error handling group_call_ended:', e);
      }
    };

    const handleIncomingCall = (data) => {
      if (inCallRef.current || inGroupCallRef.current || (incomingCallRef.current && incomingCallRef.current.callSessionId !== data.callSessionId)) {
        console.log('[Dashboard] Signal BUSY to caller:', data.from);
        signalingService.emitUserBusy({ 
          to: data.from, 
          callSessionId: data.callSessionId 
        });
        return;
      }

      console.log('[Dashboard] Received incomingCall:', data);
      setIncomingCall(data);
      callSoundPlayer.playRingtone().catch(() => {});
      
      notificationManager.showIncomingCallNotification({
        fromName: data.fromName || 'Someone',
        callType: data.callType || 'video'
      }, () => {
        window.focus();
      }, () => {
        rejectCall();
      });
    };

    try {
      const socket = socketManager.initialize(token);

      // Wait for socket to connect, then send initial language preference
      const sendLanguagePreference = () => {
        if (currentLanguage) {
          socket.emit('updateLanguagePreference', { language: currentLanguage });
          console.log('[Dashboard] Sent initial language preference:', currentLanguage);
          console.log('📡 Sent initial language preference to server:', currentLanguage);
        }
      };

      // Send immediately if already connected
      if (socket.connected) {
        sendLanguagePreference();
      } else {
        // Or wait for connection
        socket.on('connect', sendLanguagePreference);
      }

      // --- Register Listeners ---
      // Listen for real-time messages
      socketManager.on('receiveMessage', async (msg) => {
        console.log('💬 [RECEIVE_MESSAGE EVENT] Received:', msg);

        // Use refs to avoid stale closures (selectedUser/selectedRoom may change)
        const selUser = selectedUserRef.current;
        const selRoom = selectedRoomRef.current;

        // Debug: Log what we're comparing
        const senderIdFromMsg = msg.sender?._id || msg.sender?.id || msg.sender;
        const selectedUserId = selUser?.id || selUser?._id;

        console.log(`    Message details:`, {
          senderFromMsg: senderIdFromMsg,
          senderFullObj: msg.sender,
          selectedUser: {
            id: selUser?.id,
            _id: selUser?._id,
            name: selUser?.name
          },
          room: {
            msgRoom: msg.room || msg.roomId,
            selectedRoom: selRoom?._id
          },
          clientTempId: msg.clientTempId
        });

        // Determine whether this message should be appended to the current view
        // For sender's own messages: check if RECEIVER matches selected user
        // For incoming messages: check if SENDER matches selected user
        const currentUserId = userRef.current?._id || userRef.current?.id;
        const isSelfMessage = senderIdFromMsg === currentUserId?.toString() || senderIdFromMsg === currentUserId;

        const receiverIdFromMsg = msg.receiver?._id || msg.receiver || msg.receiverId;

        const isSenderMatch = selUser && (
          senderIdFromMsg === selectedUserId ||
          senderIdFromMsg === selUser.id ||
          senderIdFromMsg === selUser._id ||
          senderIdFromMsg?.toString() === selectedUserId?.toString()
        );

        const isReceiverMatch = selUser && receiverIdFromMsg && (
          receiverIdFromMsg === selectedUserId ||
          receiverIdFromMsg === selUser.id ||
          receiverIdFromMsg === selUser._id ||
          receiverIdFromMsg?.toString() === selectedUserId?.toString()
        );

        const isRoomMatch = selRoom && (msg.room === selRoom._id || msg.roomId === selRoom._id);

        // If it's my own message, check receiver matches. If it's incoming, check sender matches
        const shouldAppend = (isSelfMessage && isReceiverMatch) || (!isSelfMessage && isSenderMatch) || isRoomMatch;
        
        console.log(`   ✅ Should append: ${shouldAppend} (isSelf: ${isSelfMessage}, senderMatch: ${isSenderMatch}, receiverMatch: ${isReceiverMatch}, roomMatch: ${isRoomMatch})`);

        if (!shouldAppend) {
          console.log(`   ⏭️ Skipping - message not relevant to current view (selUser: ${selUser?.name}, selRoom: ${selRoom?.name})`);

          // If message is not for current view but is for this user, refresh unread counts
          if (!isSelfMessage) {
            fetchUnreadCounts();

            // Show browser notification for new message if:
            // 1. Not sent by current user
            // 2. Window is not focused OR message is not in current chat
            if (document.hidden || !shouldAppend) {
              const senderInfo = typeof msg.sender === 'object' ? msg.sender : null;
              const senderName = senderInfo?.username || senderInfo?.name || 'Someone';
              const isGroupMsg = Boolean(msg.room || msg.roomId);
              const roomInfo = isGroupMsg ? roomsRef.current?.find(r => r._id === (msg.room || msg.roomId)) : null;

              notificationManager.showMessageNotification({
                senderName: senderName,
                content: msg.content,
                isGroupMessage: isGroupMsg,
                roomName: roomInfo?.name || 'Group',
                messageId: msg._id || msg.id,
                timestamp: msg.timestamp
              }, () => {
                // On click: focus window and select the appropriate chat
                window.focus();
                if (isGroupMsg && roomInfo) {
                  selectRoom(roomInfo);
                } else if (senderInfo) {
                  // Find the user in the users list and select
                  const sender = users.find(u => u.id === (senderInfo._id || senderInfo.id));
                  if (sender) {
                    selectUser(sender);
                  }
                }
              });
            }
          }

          return;
        }

        try {
          // Translate incoming message into the user's preferred language before appending
          const translatedContent = await translateText(msg.content, currentLanguageRef.current, null);
          // Attach translated content so MessageSection will display the preferred language immediately
          const msgWithTranslated = { ...msg, content: translatedContent, _originalContent: msg.content };
          setMessages(prev => {
            const persistedId = msgWithTranslated._id || msgWithTranslated.id || `${msgWithTranslated.timestamp}-${msgWithTranslated.sender}`;
            if (prev.some(m => (m._id || m.id) === persistedId)) return prev;
            console.log(`   🔍 Looking for existing message with id: ${persistedId}`);
            // If already present by persisted id, do nothing
            if (prev.some(m => (m._id || m.id) === persistedId)) {
              console.log(`   ℹ️ Message already present by persisted id, skipping`);
              return prev;
            }
            // If we have an optimistic message with clientTempId, replace it
            if (msgWithTranslated.clientTempId) {
              console.log(`   🔍 Looking for optimistic message with clientTempId: ${msgWithTranslated.clientTempId}`);
              const idx = prev.findIndex(m => (m._id === msgWithTranslated.clientTempId) || (m.id === msgWithTranslated.clientTempId));
              if (idx !== -1) {
                console.log(`   ✅ FOUND optimistic message at index ${idx}, replacing with persisted message`);
                const copy = prev.slice();
                copy[idx] = msgWithTranslated;
                return copy;
              } else {
                console.log(`   ⚠️ No optimistic message found with clientTempId`);
              }
            }
            console.log(`   ➕ Appending new message`);
            return [...prev, msgWithTranslated];
          });
          // Acknowledge delivery to server when this client (recipient) receives the message
          try {
            const messageId = msg._id || msg.id || null;
            const isFromOther = !(msg.sender && ((msg.sender._id && msg.sender._id === (userRef.current?._id || userRef.current?.id)) || (msg.sender === (userRef.current?._id || userRef.current?.id))));
            if (messageId && isFromOther) {
              console.log(`📨 [Dashboard] Emitting messageDelivered for messageId=${messageId}`);
              socketManager.emit('messageDelivered', { messageId, clientTempId: msg.clientTempId || null });
            }
          } catch (e) {
            console.error('❌ [Dashboard] Error emitting messageDelivered:', e);
          }
        } catch (err) {
          console.warn('Translation on receive failed, appending original message:', err);
          setMessages(prev => {
            const persistedId = msg._id || msg.id || `${msg.timestamp}-${msg.sender}`;
            if (prev.some(m => (m._id || m.id) === persistedId)) return prev;
            if (msg.clientTempId) {
              const idx = prev.findIndex(m => (m._id === msg.clientTempId) || (m.id === msg.clientTempId));
              if (idx !== -1) {
                const copy = prev.slice();
                copy[idx] = msg;
                return copy;
              }
            }
            return [...prev, msg];
          });
          // Acknowledge delivery in fallback path as well
          try {
            const messageId = msg._id || msg.id || null;
            const isFromOther = !(msg.sender && ((msg.sender._id && msg.sender._id === (userRef.current?._id || userRef.current?.id)) || (msg.sender === (userRef.current?._id || userRef.current?.id))));
            if (messageId && isFromOther) {
              socketManager.emit('messageDelivered', { messageId, clientTempId: msg.clientTempId || null });
            }
          } catch (e) {
            // ignore
          }
        }
      });

      // Listen for message status updates (queued -> sent -> delivered -> seen)
      socketManager.on('messageStatusUpdate', (payload) => {
        try {
          const { messageId, status, clientTempId } = payload || {};
          console.log(`🔄 [Dashboard] messageStatusUpdate received: messageId=${messageId}, status=${status}, clientTempId=${clientTempId}`);

          if (!messageId && !clientTempId) {
            console.warn('⚠️ [Dashboard] messageStatusUpdate missing both messageId and clientTempId, ignoring');
            return;
          }

          setMessages(prev => {
            console.log(`   📊 Current messages array (${prev.length} items):`);
            prev.forEach((m, idx) => {
              console.log(`     [${idx}] _id=${m._id}, id=${m.id}, clientTempId=${m.clientTempId}, status=${m.status}`);
            });

            const key = messageId || clientTempId;
            console.log(`   🔍 Looking for key: "${key}"`);

            const updatedMessages = prev.map(m => {
              const mId = m._id || m.id;
              const mTempId = m.clientTempId;
              const matchesId = mId && mId.toString() === key.toString();
              const matchesTempId = mTempId && mTempId.toString() === key.toString();

              if (matchesId || matchesTempId) {
                console.log(`   ✅ MATCH FOUND! mId=${mId} (matches=${matchesId}), mTempId=${mTempId} (matches=${matchesTempId})`);
                console.log(`      Updating status from "${m.status}" to "${status}"`);
                return { ...m, status };
              }
              return m;
            });

            const wasUpdated = updatedMessages.some((m, idx) => JSON.stringify(m) !== JSON.stringify(prev[idx]));
            if (!wasUpdated) {
              console.log(`   ❌ NO MATCH FOUND! messageId=${messageId}, clientTempId=${clientTempId}`);
            }

            return updatedMessages;
          });

          // Refresh unread counts when status changes to 'delivered' or 'seen'
          // This handles cases where messages are marked as seen from other devices/tabs
          if (status === 'delivered' || status === 'seen') {
            fetchUnreadCounts();
          }
        } catch (e) {
          console.warn('❌ Error handling messageStatusUpdate:', e);
        }
      });

      // Listen for typing indicators
      socketManager.on('userTyping', (data) => {
        const selUser = selectedUserRef.current;
        const selRoom = selectedRoomRef.current;
        if ((selUser && data.userId === selUser.id) ||
          (selRoom && data.roomId === selRoom._id)) {
          setIsTyping(data.isTyping);
        }
      });

      // Listen for user status changes
      socketManager.on('userStatusChange', (data) => {
        setUsers(prevUsers =>
          prevUsers.map(u =>
            u.id === data.userId
              ? { ...u, status: data.status }
              : u
          )
        );
      });

      // Listen for room updates (members added/removed, metadata changed)
      socketManager.on('roomUpdated', (updatedRoom) => {
        console.log('[Dashboard] Room updated via socket:', updatedRoom);
        console.log('📣 Room updated via socket:', updatedRoom);
        setRooms(prev => prev.map(r => r._id === updatedRoom._id ? updatedRoom : r));
        const selRoom = selectedRoomRef.current;
        if (selRoom && selRoom._id === updatedRoom._id) {
          setSelectedRoom(updatedRoom);
        }
        if (managingRoom && managingRoom._id === updatedRoom._id) {
          setManagingRoom(updatedRoom);
        }
      });

      // Listen for new rooms created that include this user
      socketManager.on('roomCreated', (newRoom) => {
        console.log('[Dashboard] New room created via socket:', newRoom);
        console.log('📣 New room created via socket:', newRoom);
        setRooms(prev => {
          // Avoid duplicates
          if (prev.some(r => r._id === newRoom._id)) return prev;
          return [newRoom, ...prev];
        });
      });

      // Group call listeners (consolidated)
      socketManager.on('group_incoming_call', handleGroupCallIncoming);
      socketManager.on('groupCallIncoming', handleGroupCallIncoming);
      socketManager.on('groupCallInvitation', handleGroupCallIncoming);
      
      // Signal that we are ready for events
      socketManager.emit('clientReady', { userId: user?._id || user?.id });
      socketManager.on('group_call_ended', handleGroupCallEnded);
      socketManager.on('incomingCall', handleIncomingCall);
      
      socketManager.on('userBusy', (data) => {
        callSoundPlayer.stopRingback();
        callSoundPlayer.playBusyTone().catch(() => {});
        handleCallEndedLocally();
        alert(`${data.fromName || 'User'} is currently busy.`);
        setTimeout(() => callSoundPlayer.stopBusyTone(), 3000);
      });

      socketManager.on('userUnavailable', (data) => {
        callSoundPlayer.stopRingback();
        handleCallEndedLocally();
        alert(`${data.fromName || 'User'} is currently offline.`);
      });

      socketManager.on('callAnswered', (data) => {
        callSoundPlayer.stopRingback();
        callSoundPlayer.playConnect().catch(() => {});
      });

      socketManager.on('callEnded', (data) => {
        handleCallEndedLocally();
        callSoundPlayer.playDisconnect().catch(() => {});
      });

      // Participant events (join/disconnect)
      socketManager.on('participant_joined', (data) => {
        console.log('[Dashboard] Participant joined:', data.username);
        console.log('🔔 participant_joined:', data);
        try {
          const { userId, username } = data || {};
          // Show a small toast or UI message (simple console for now)
          console.log(`✅ ${username} joined the call (${userId})`);
          // If we were ringing or ringbacking, stop those sounds and play connect
          try {
            const current = callSoundPlayer.getCurrentSound && callSoundPlayer.getCurrentSound();
            if (current === 'ringback' || current === 'ringtone') {
              callSoundPlayer.stopAll();
              callSoundPlayer.playConnect().catch(() => { });
            }
          } catch (e) {
            console.warn('Error handling sounds on participant_joined:', e);
          }
          // Optionally refresh participants list if in a call
          if (inGroupCallRef.current) {
            // Trigger a re-fetch of the current call data or merge participant locally
            // For now, append to groupCallData.participants if present
            setGroupCallData(prev => {
              if (!prev) return prev;
              const exists = (prev.participants || []).some(p => (p.userId?._id || p.userId) === userId);
              if (exists) return prev;
              return { ...prev, participants: [...(prev.participants || []), { userId, username, status: 'joined' }] };
            });
          }
        } catch (e) {
          console.error('Error handling participant_joined:', e);
        }
      });

      socketManager.on('participant_disconnected', (data) => {
        console.log('[Dashboard] Participant disconnected:', data.username);
        console.log('⚠️ participant_disconnected:', data);
        try {
          const { userId, username, reason } = data || {};
          // Show UI notification
          console.warn(`⚠️ ${username} disconnected (${reason})`);
          // Update groupCallData participants status
          setGroupCallData(prev => {
            if (!prev) return prev;
            const participants = (prev.participants || []).map(p => {
              const id = p.userId?._id || p.userId || p.id;
              if (id && id.toString() === userId.toString()) {
                return { ...p, status: 'left' };
              }
              return p;
            });
            return { ...prev, participants };
          });
        } catch (e) {
          console.error('Error handling participant_disconnected:', e);
        }
      });

      // --- RTC Initialization ---
      // Handle remote end of call (auto-end or explicit end)
      socketManager.on('group_call_ended', (data) => {
        try {
          console.log('🔔 group_call_ended received:', data);
          // Stop any ringing/ringback immediately
          callSoundPlayer.stopAll();
          // Play disconnect sound to notify user the call ended
          callSoundPlayer.playDisconnect().catch(() => {
            // ignore
          });

          // If this client is currently in the call, clean up local state
          if (inGroupCallRef.current) {
            setInGroupCall(false);
            setGroupCallData(null);
          }
          setIncomingGroupCall(null);
        } catch (e) {
          console.error('Error handling group_call_ended:', e);
        }
      });

      // -------------------------------------------------------------
      // Refactored WebRTC Call Management
      // -------------------------------------------------------------
      callManager.initialize({
        onRemoteTrack: (event) => {
          console.log('RTC: Remote track received');
          if (event.streams && event.streams[0]) {
            setRemoteStream(event.streams[0]);
          }
        },
        onConnectionStateChange: (state) => {
          if (state === 'connected') callSoundPlayer.playConnect().catch(() => {});
          if (state === 'disconnected' || state === 'failed') handleCallEndedLocally();
          console.log('RTC: Connection state changed:', state);
          if (state === 'connected') {
            callSoundPlayer.playConnect().catch(() => {});
          }
          if (state === 'disconnected' || state === 'failed') {
            handleCallEndedLocally();
          }
        },
        onTranslatedSpeech: (data) => {
          if (data.text) {
            if (data.isLocal) {
              setLocalOriginal(data.text.original);
              setLocalTranslated(data.text.translated);
            } else {
              setRemoteOriginal(data.text.original);
              setRemoteTranslated(data.text.translated);
            }
          }
        }
      });

      // WebRTC Call Signaling Listeners
      socketManager.on('incomingCall', (data) => {
        // BUSY DETECTION: If already in a call or group call or have a pending incoming call, signal BUSY
        if (inCallRef.current || inGroupCallRef.current || (incomingCallRef.current && incomingCallRef.current.callSessionId !== data.callSessionId)) {
          console.log('📵 Signal BUSY to caller:', data.from);
          signalingService.emitUserBusy({ 
            to: data.from, 
            callSessionId: data.callSessionId 
          });
          return;
        }

        console.log('📞 Received incomingCall:', data);
        setIncomingCall(data);
        callSoundPlayer.playRingtone().catch(() => {});
        
        // Show notification
        notificationManager.showIncomingCallNotification({
          fromName: data.fromName || 'Someone',
          callType: data.callType || 'video'
        }, () => {
          window.focus();
          // Acceptance logic handled in Answer button
        }, () => {
          rejectCall();
        });
      });

      socketManager.on('userBusy', (data) => {
        console.log('📵 Remote user is BUSY:', data);
        callSoundPlayer.stopRingback();
        callSoundPlayer.playBusyTone().catch(() => {});
        
        setInCall(false);
        setIncomingCall(null);
        setLocalStream(null);
        setRemoteStream(null);
        
        alert(`${data.fromName || 'User'} is currently busy with another call.`);
        
        setTimeout(() => {
          callSoundPlayer.stopBusyTone();
        }, 3000);
      });

      socketManager.on('userUnavailable', (data) => {
        console.log('📵 Remote user is UNAVAILABLE:', data);
        callSoundPlayer.stopRingback();
        
        setInCall(false);
        setIncomingCall(null);
        setLocalStream(null);
        setRemoteStream(null);
        
        alert(`${data.fromName || 'User'} is currently offline.`);
      });

      socketManager.on('callAnswered', (data) => {
        console.log('✅ Call answered by remote user');
        callSoundPlayer.stopRingback();
        callSoundPlayer.playConnect().catch(() => {});
      });

      socketManager.on('callEnded', (data) => {
        console.log('🛑 Call ended by remote user');
        handleCallEndedLocally();
        callSoundPlayer.playDisconnect().catch(() => {});
      });


      // Fetch pending group calls on socket connection
      // This is already handled concurrently in loadData, so we skip the duplicate fetch here
      // const fetchPendingCallInvitations = async () => { ... };
      // fetchPendingCallInvitations();
    } catch (error) {
      console.error('[Dashboard] Socket/RTC initialization failed:', error);
      console.warn('Socket.IO initialization failed:', error.message);
      // Continue without real-time features
    }

    // Don't cleanup socket on component unmount - let it persist
    // Only cleanup if explicitly logging out
    return () => {
      // Clean up event listeners
      // Clean up event listeners if navigating away
      try {
        socketManager.off('receiveMessage');
        socketManager.off('messageStatusUpdate');
        socketManager.off('userTyping');
        socketManager.off('userStatusChange');
        socketManager.off('roomUpdated');
        socketManager.off('roomCreated');
        socketManager.off('groupCallIncoming', handleGroupCallIncoming);
        socketManager.off('groupCallInvitation', handleGroupCallIncoming);
        socketManager.off('groupCallInitiated', handleGroupCallIncoming);
        socketManager.off('group_incoming_call', handleGroupCallIncoming);
        socketManager.off('group_call_ended', handleGroupCallEnded);
        socketManager.off('incomingCall', handleIncomingCall);
        socketManager.off('callAnswered');
        socketManager.off('callEnded');
        socketManager.off('userBusy');
        socketManager.off('userUnavailable');
        socketManager.off('participant_joined');
        socketManager.off('participant_disconnected');
      } catch (err) {
        console.warn('Socket listener cleanup error:', err);
        // Don't fully cleanup; just remove specific listeners we added
        // socketManager.cleanup() is too aggressive - it disconnects the socket
      }
    };
  }, [isAuthenticated, user]);

  // Handle showing the incoming group call from pending calls if there are any
  useEffect(() => {
    if (pendingGroupCalls && pendingGroupCalls.length > 0 && !inGroupCall && !incomingGroupCall) {
      const call = pendingGroupCalls[0];
      setIncomingGroupCall({
        callId: call._id || call.id,
        callRoomId: call.callRoomId,
        roomId: call.roomId?._id || call.roomId,
        roomName: call.roomId?.name || 'Group',
        callType: call.callType || 'video',
        initiator: call.initiator
      });
      callSoundPlayer.playRingtone().catch(() => {});
    }
  }, [pendingGroupCalls, inGroupCall, incomingGroupCall]);

  // Load initial data
  useEffect(() => {
    if (isAuthenticated && user) {
      const loadData = async () => {
        setLoadingMessage("Loading your data...");
        // Parallelize initial API requests using Promise.all to avoid the "waterfall" bottleneck
        await Promise.all([
          fetchUsers(),
          fetchRooms(),
          fetchPendingGroupCalls(),
          fetchUnreadCounts()
        ]);

        // Join socket.io rooms for real-time updates (so receiveMessage and room events reach this client)
        try {
          const socket = socketManager.getSocket();
          if (socket && socket.connected) {
            // Use the latest rooms state after fetchRooms resolved
            const tokenRooms = await (async () => rooms)();
            (rooms || []).forEach(r => {
              try {
                socketManager.emit('joinRoom', r._id);
              } catch (e) {
                console.warn('Failed to join room after load:', r._id, e);
              }
            });
          }
        } catch (e) {
          console.warn('Error while joining rooms after initial load:', e);
        }
        setLoading(false);
      };
      loadData();
    }
  }, [isAuthenticated, user]);

  // Handle auto-join from shareable meeting link (/join/:callRoomId redirect)
  useEffect(() => {
    if (!isAuthenticated || !user) return;
    const callData = location.state?.autoJoinGroupCall;
    if (!callData) return;
    // Clear location state so refreshing the page doesn't re-trigger
    navigate(location.pathname, { replace: true, state: {} });
    setGroupCallData(callData);
    setInGroupCall(true);
  }, [isAuthenticated, user, location.state]);

  // Listen for loadOlderMessages events from MessageSection (scroll to top)
  useEffect(() => {
    const onLoadOlder = async () => {
      try {
        await fetchMoreMessages();
      } catch (e) {
        // ignore
      }
    };
    window.addEventListener('loadOlderMessages', onLoadOlder);
    return () => window.removeEventListener('loadOlderMessages', onLoadOlder);
  }, [messages, messagesPageHasMore, messagesLoadingMore, selectedUser, selectedRoom]);

  // Fetch messages when user/room is selected
  useEffect(() => {
    if (selectedUser) {
      fetchMessages(selectedUser.id, null, { append: false });
    } else if (selectedRoom) {
      fetchMessages(null, selectedRoom._id, { append: false });
    }
  }, [selectedUser, selectedRoom]);

  // Select user
  const selectUser = (u) => {
    if (inCall || callerRinging || inGroupCall) {
      alert("Please end the current call before switching to another chat.");
      return;
    }

    // If we were in a room previously, leave it
    try {
      const prevRoom = selectedRoomRef.current;
      if (prevRoom && socketManager.socket?.connected) {
        socketManager.emit('leaveRoom', prevRoom._id);
      }
    } catch (err) {
      console.warn('Error leaving previous room when selecting user:', err);
    }

    setSelectedUser(u);
    setSelectedRoom(null);
    setShowSidebar(false);
  };

  // Keep ref in sync
  useEffect(() => {
    selectedUserRef.current = selectedUser;
  }, [selectedUser]);

  // Select room
  const selectRoom = (room) => {
    if (inCall || callerRinging || inGroupCall) {
      alert("Please end the current call before switching to another chat.");
      return;
    }

    // Leave previous room and join the new one so socket.io room broadcasts reach us
    try {
      const prevRoom = selectedRoomRef.current;
      if (prevRoom && prevRoom._id && socketManager.socket?.connected) {
        if (prevRoom._id !== room._id) {
          socketManager.emit('leaveRoom', prevRoom._id);
        }
      }
      if (room && room._id && socketManager.socket?.connected) {
        socketManager.emit('joinRoom', room._id);
      }
    } catch (err) {
      console.warn('Error joining/leaving rooms on selectRoom:', err);
    }

    setSelectedRoom(room);
    setSelectedUser(null);
    setShowSidebar(false);
  };

  // Keep ref in sync
  useEffect(() => {
    selectedRoomRef.current = selectedRoom;
  }, [selectedRoom]);

  useEffect(() => {
    roomsRef.current = rooms;
  }, [rooms]);

  // Create room
  const createRoom = () => {
    setShowCreateGroupModal(true);
  };

  // Handle group creation
  const handleCreateGroup = async (groupData) => {
    try {
      const token = localStorage.getItem('token');
      const res = await axios.post(`${API_URL}/chat/rooms`, groupData, {
        headers: { 'x-auth-token': token }
      });

      setRooms(prev => [res.data, ...prev]);
      selectRoom(res.data);
    } catch (err) {
      console.error('Error creating room:', err);
      alert('Failed to create room');
    }
  };

  // Handle room updates (for group management)
  const handleRoomUpdate = (updatedRoom) => {
    setRooms(prev => prev.map(room =>
      room._id === updatedRoom._id ? updatedRoom : room
    ));
    if (selectedRoom && selectedRoom._id === updatedRoom._id) {
      setSelectedRoom(updatedRoom);
    }
    // If group management modal is open for this room, update it too so the modal shows latest participants immediately
    if (managingRoom && managingRoom._id === updatedRoom._id) {
      setManagingRoom(updatedRoom);
    }
  };

  // Send message
  const sendMessage = async ({ content, media }) => {
    if ((!content || !content.trim()) && !media) return;

    const clientTempId = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const optimisticMessage = {
      _id: clientTempId,
      id: clientTempId,
      clientTempId,
      sender: { _id: user?._id || user?.id, username: user?.username || user?.name },
      content: content || '',
      originalContent: content || '',
      timestamp: new Date().toISOString(),
      status: 'queued',
      room: selectedRoom?._id || null,
      receiver: selectedUser?.id || null,
      isGroupMessage: Boolean(selectedRoom),
      media: media || null
    };

    // Add optimistic message to UI immediately
    setMessages(prev => [...prev, optimisticMessage]);

    try {
      const token = localStorage.getItem('token');
      const payload = {
        content: content || '',
        media: media || null,
        clientTempId,
        ...(selectedUser ? { receiverId: selectedUser.id } : { roomId: selectedRoom._id })
      };

      // Save to database via API. 
      // The server will emit 'receiveMessage' via socket, which is handled by our global listener.
      // That listener will replace this optimistic message with the persisted one using clientTempId.
      await axios.post(`${API_URL}/chat/message`, payload, {
        headers: { 'x-auth-token': token }
      });

    } catch (err) {
      console.error('Error sending message:', err);
      // Remove the optimistic message if it failed to save
      setMessages(prev => prev.filter(m => m.clientTempId !== clientTempId));
      alert('Failed to send message. Please try again.');
    }
  };

  // Toggle sidebar
  const toggleSidebar = () => {
    setShowSidebar(!showSidebar);
  };

  // Handle language change
  const handleLanguageChange = async (language) => {
    return await changeLanguage(language);
  };

  // Initialize peer connection
  const createPeerConnection = () => {
    const pc = new RTCPeerConnection({ iceServers: getIceServers() });

    pc.onicecandidate = (event) => {
      if (event.candidate && selectedUser) {
        socketManager.emit('iceCandidate', {
          to: selectedUser.id,
          candidate: event.candidate
        });
      }
    };

    pc.ontrack = (event) => {
      console.log('Received remote track:', event.track.kind);
      if (event.streams && event.streams[0]) {
        setRemoteStream(event.streams[0]);
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.log('ICE connection state:', pc.iceConnectionState);

      // Play connect beep when connection is established
      if (pc.iceConnectionState === 'connected') {
        callSoundPlayer.playConnect().catch(err => {
          console.log('Could not play connect sound:', err.message);
        });
      }

      if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed') {
        endCall();
      }
    };

    return pc;
  };

  // Create a silent audio track for WebRTC
  const createSilentAudioTrack = () => {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    const destination = audioContext.createMediaStreamDestination();

    oscillator.connect(gainNode);
    gainNode.connect(destination);
    gainNode.gain.value = 0; // Silent
    oscillator.start();

    return destination.stream.getAudioTracks()[0];
  };

  // Start call (private or group)
  const startCall = async (type) => {
    if (!selectedUser && !selectedRoom) {
      alert('Please select a user or group to call');
      return;
    }

    if (!socketManager.socket?.connected) {
      alert('Real-time connection not available.');
      return;
    }

    try {
      callSoundPlayer.enableUserInteraction();
      
      if (selectedRoom) {
        await startGroupCall(type);
        return;
      }

      setCallType(type);
      callSoundPlayer.playRingback().catch(() => {});

      const constraints = {
        audio: true,
        video: type === 'video' ? { width: { ideal: 1280 }, height: { ideal: 720 } } : false
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      setLocalStream(stream);
      setInCall(true);

      // Delegate to CallManager
      const targetLang = selectedUser?.preferredLanguage || 'hi';
      await callManager.startCall(selectedUser.id, type, stream, currentLanguage, targetLang);

      console.log('✓ Call initiated via CallManager');
    } catch (err) {
      console.error('Error starting call:', err);
      setInCall(false);
      callSoundPlayer.stopAll();
      alert('Failed to start call: ' + err.message);
    }
  };

  // Answer private call
  const answerCall = async () => {

    if (!incomingCall) return;

    try {
      setAcceptingCall(true);
      callSoundPlayer.stopAll();

      const constraints = {
        audio: true,
        video: incomingCall.callType === 'video' ? { width: { ideal: 1280 }, height: { ideal: 720 } } : false
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      setLocalStream(stream);
      setCallType(incomingCall.callType);
      setInCall(true);
      setIncomingCall(null);
      setAcceptingCall(false);

      // Delegate to CallManager
      const targetLang = incomingCall?.fromLanguage || 'en';
      await callManager.answerCall(stream, currentLanguage, targetLang);

      console.log('✓ Call answered via CallManager');
    } catch (err) {
      console.error('Error answering call:', err);
      setAcceptingCall(false);
      alert('Failed to answer call: ' + err.message);
    }
  };


  // Reject call
  const rejectCall = () => {
    console.log('📵 Rejecting incoming call');
    callSoundPlayer.stopAll();

    // Close any active notifications
    notificationManager.closeAllNotifications();

    if (incomingCall) {
      const endCallData = { to: incomingCall.from };
      if (incomingCall.roomId) {
        endCallData.roomId = incomingCall.roomId;
      }
      if (incomingCall.isGroupCall && incomingCall.callSessionId) {
        socketManager.emit('leaveCallSession', { callSessionId: incomingCall.callSessionId });
      } else {
        if (incomingCall.callSessionId) {
          endCallData.callSessionId = incomingCall.callSessionId;
          endCallData.callRoomId = incomingCall.callRoomId;
        }
        socketManager.emit('endCall', endCallData);
      }
    }

    // Safety cleanup
    setLocalStream(prevStream => {
      if (prevStream) prevStream.getTracks().forEach(track => track.stop());
      return null;
    });
    setRemoteStream(prevStream => {
      if (prevStream) prevStream.getTracks().forEach(track => track.stop());
      return null;
    });

    setIncomingCall(null);
  };

  // End call
  const endCall = () => {
    console.log('🛑 Ending call');
    callSoundPlayer.stopAll();
    
    setInCall(false);
    setIncomingCall(null);
    setLocalStream(null);
    setRemoteStream(null);
    
    if (selectedUser) {
      signalingService.emitEndCall({ to: selectedUser.id });
    }

    handleCallEndedLocally();
  };


  // Toggle mute
  const toggleMute = () => {
    if (localStream) {
      const audioTrack = localStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMuted(!audioTrack.enabled);
      }
    }
  };

  // Toggle camera
  const toggleCamera = () => {
    if (localStream && callType === 'video') {
      const videoTrack = localStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsCameraOff(!videoTrack.enabled);
      }
    }
  };

  // ==================== GROUP CALL FUNCTIONS ====================

  // Start group call
  const startGroupCall = async (type = 'video') => {
    if (!selectedRoom) {
      alert('Please select a group to call');
      return;
    }

    try {
      console.log(`📞 Starting group ${type} call for room:`, selectedRoom._id);

      const token = localStorage.getItem('token');
      const res = await axios.post(
        `${API_URL}/chat/group-call/initiate`,
        {
          roomId: selectedRoom._id,
          callType: type
        },
        {
          headers: { 'x-auth-token': token }
        }
      );

      const { call, alreadyActive } = res.data;

      if (!call) {
        throw new Error('Call details missing from server response');
      }

      if (alreadyActive) {
        console.log('ℹ️ Call already active, joining existing session');
        await joinGroupCall({
          callId: call._id || call.id,
          callRoomId: call.callRoomId,
          roomId: call.roomId?._id || call.roomId || selectedRoom._id,
          roomName: call.roomId?.name || selectedRoom.name,
          callType: call.callType || type
        });
        return;
      }

      setGroupCallData({
        callId: call._id || call.id,
        callRoomId: call.callRoomId,
        roomId: call.roomId?._id || call.roomId || selectedRoom._id,
        roomName: call.roomId?.name || selectedRoom.name,
        callType: call.callType || type
      });

      setInGroupCall(true);

      console.log('✅ Group call initiated:', call);
    } catch (error) {
      console.error('Error starting group call:', error);

      // If there's already an active call, offer to join it
      if (error.response?.data?.call) {
        const existingCall = error.response.data.call;
        console.log('ℹ️ Server indicated existing call, attempting to join');
        await joinGroupCall({
          callId: existingCall._id || existingCall.id,
          callRoomId: existingCall.callRoomId,
          roomId: existingCall.roomId?._id || existingCall.roomId || selectedRoom._id,
          roomName: existingCall.roomId?.name || selectedRoom.name,
          callType: existingCall.callType || type
        });
        return;
      } else {
        alert(error.response?.data?.message || 'Failed to start group call');
      }
    }
  };

  // Join group call
  const joinGroupCall = async (callData) => {
    try {
      console.log('📞 Joining group call:', callData);

      const token = localStorage.getItem('token');
      const res = await axios.post(
        `${API_URL}/chat/group-call/${callData.callId}/join`,
        {},
        {
          headers: { 'x-auth-token': token }
        }
      );

      const serverCall = res.data?.call;
      const mergedCall = serverCall || callData || {};
      const roomInfo = mergedCall.roomId || {};
      const normalizedRoomId = typeof roomInfo === 'string' ? roomInfo : roomInfo?._id;
      const normalizedRoomName = typeof roomInfo === 'object' ? roomInfo?.name : callData?.roomName;
      const normalizedCallType = mergedCall.callType || callData?.callType || 'video';
      const normalizedCallId = mergedCall._id || mergedCall.id || callData?.callId;
      const normalizedCallRoomId = mergedCall.callRoomId || callData?.callRoomId;
      const participants = serverCall?.participants || [];

      setGroupCallData({
        callId: normalizedCallId,
        callRoomId: normalizedCallRoomId,
        roomId: normalizedRoomId,
        roomName: normalizedRoomName || selectedRoom?.name,
        callType: normalizedCallType,
        participants
      });

      setInGroupCall(true);
      setIncomingGroupCall(null);
      callSoundPlayer.stopAll();

      // Close any active notifications
      notificationManager.closeAllNotifications();

      console.log('✅ Joined group call');
    } catch (error) {
      console.error('Error joining group call:', error);
      alert(error.response?.data?.message || 'Failed to join group call');
    }
  };

  // Decline group call
  const declineGroupCall = async (callData) => {
    try {
      // Close any active notifications
      notificationManager.closeAllNotifications();

      const token = localStorage.getItem('token');
      await axios.post(
        `${API_URL}/chat/group-call/${callData.callId}/decline`,
        {},
        {
          headers: { 'x-auth-token': token }
        }
      );

      setIncomingGroupCall(null);
      callSoundPlayer.stopAll();

      console.log('✅ Declined group call');
    } catch (error) {
      console.error('Error declining group call:', error);
    }
  };

  // End group call
  const endGroupCall = async () => {
    try {
      console.log('📴 Ending group call');

      callSoundPlayer.stopAll();
      callSoundPlayer.playDisconnect().catch(() => {
        console.log('Disconnect sound not played');
      });

      if (groupCallData?.callId) {
        const token = localStorage.getItem('token');
        await axios.post(
          `${API_URL}/chat/group-call/${groupCallData.callId}/leave`,
          {},
          {
            headers: { 'x-auth-token': token }
          }
        );
      }

      setInGroupCall(false);
      setGroupCallData(null);

      console.log('✅ Group call ended');
    } catch (error) {
      console.error('Error ending group call:', error);
      // Still clean up local state
      setInGroupCall(false);
      setGroupCallData(null);
    }
  };

  // ==================== END GROUP CALL FUNCTIONS ====================

  // ==================== END GROUP CALL FUNCTIONS ====================

  // Listen for server ack that a participant joined so initiator can send offer if needed
  useEffect(() => {
    if (!socketManager.socket) return;

    const handleParticipantAck = async (data) => {
      try {
        console.log('📣 participantJoinedAck received:', data);
        const { callSessionId } = data || {};
        if (!callSessionId) return;

        // Only initiator should respond by (re)sending an offer
        // Accept ack even if local `activeCallSession` isn't populated yet; use fallback data from server
        const initiatorId = activeCallSession?.initiator?.id || activeCallSession?.initiator;
        if (initiatorId) {
          if (initiatorId.toString() !== user?._id?.toString()) return;
        } else {
          // If we don't have activeCallSession, the ack is addressed to this socket (initiator), so proceed
        }

        // Avoid sending multiple offers for same session
        if (initiatorOfferSentRef.current.has(callSessionId)) {
          console.log('Offer already sent for session', callSessionId);
          return;
        }

        // Ensure we have a peer connection and local tracks
        let pc = peerConnectionRef.current;
        if (!pc) {
          pc = createPeerConnection();
          peerConnectionRef.current = pc;
        }

        // Use callType/roomId from activeCallSession if present, otherwise from ack
        const effectiveCallType = activeCallSession?.callType || data.callType || callType;
        const effectiveRoomId = activeCallSession?.roomId || data.roomId || activeCallSession?.roomId;

        if (!localStream) {
          // Acquire media (best-effort, similar to startCall)
          try {
            const constraints = {
              audio: true,
              video: effectiveCallType === 'video' ? { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' } : false
            };
            const stream = await navigator.mediaDevices.getUserMedia(constraints);
            setLocalStream(stream);
            stream.getTracks().forEach(track => {
              if (track.kind === 'audio') {
                const silentTrack = createSilentAudioTrack();
                pc.addTrack(silentTrack, stream);
              } else {
                pc.addTrack(track, stream);
              }
            });
          } catch (err) {
            console.warn('Failed to acquire media when resending offer:', err);
          }
        }

        // Create offer and emit to room
        try {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);

          const callData = {
            offer,
            callType: effectiveCallType,
            roomId: effectiveRoomId,
            callSessionId: callSessionId,
            callRoomId: activeCallSession?.callRoomId || data.callRoomId
          };

          socketManager.emit('callUser', callData);
          initiatorOfferSentRef.current.add(callSessionId);
          console.log('🔁 Initiator resent offer for session', callSessionId);
        } catch (err) {
          console.error('Failed to create/send offer on participantJoinedAck:', err);
        }
      } catch (err) {
        console.error('participantJoinedAck handler error:', err);
      }
    };

    socketManager.on('participantJoinedAck', handleParticipantAck);

    return () => {
      try { socketManager.off('participantJoinedAck', handleParticipantAck); } catch (e) { }
    };
  }, [activeCallSession, localStream, callType, user]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      endCall();
    };
  }, []);

  // Format time
  const formatTime = (timestamp) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  if (authLoading || loading) {
    return <Loader message={loadingMessage} />;
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="flex flex-col h-screen bg-[var(--color-bg-primary)]">
      {/* Header */}
      <Header
        user={user}
        toggleSidebar={toggleSidebar}
        handleLanguageChange={handleLanguageChange}
        onShowNotificationSettings={() => setShowNotificationSettings(true)}
      />

      {/* Main content - responsive layout */}
      <div className="flex flex-1 pt-16 overflow-hidden">
        {/* Sidebar - hidden on mobile, visible on lg */}
        <div className="hidden lg:flex lg:flex-col w-80 border-r border-[var(--color-border)] bg-[var(--color-bg-secondary)] overflow-y-auto">
          <ContactList
            users={users}
            rooms={rooms}
            selectedUser={selectedUser}
            selectedRoom={selectedRoom}
            selectUser={selectUser}
            selectRoom={selectRoom}
            createRoom={createRoom}
            showSidebar={showSidebar}
            onManageGroup={(room) => {
              setManagingRoom(room);
            }}
            user={user}
            onAddContact={() => {
              setAddContactPhone('');
              setAddContactStatus('');
              setShowAddContactModal(true);
            }}
            unreadByContact={unreadByContact}
            unreadByRoom={unreadByRoom}
            onInstantMeetingJoin={(callData) => {
              setGroupCallData(callData);
              setInGroupCall(true);
            }}
          />
        </div>

        {/* Mobile sidebar overlay */}
        {showSidebar && (
          <>
            <div
              className="fixed inset-0 bg-black/50 z-10 lg:hidden"
              onClick={() => setShowSidebar(false)}
            />
            <div className="fixed left-0 top-16 bottom-0 w-80 z-20 lg:hidden bg-[var(--color-bg-secondary)] overflow-y-auto shadow-xl">
              <ContactList
                users={users}
                rooms={rooms}
                selectedUser={selectedUser}
                selectedRoom={selectedRoom}
                selectUser={(user) => {
                  selectUser(user);
                  setShowSidebar(false);
                }}
                selectRoom={(room) => {
                  selectRoom(room);
                  setShowSidebar(false);
                }}
                createRoom={createRoom}
                showSidebar={showSidebar}
                onManageGroup={(room) => {
                  setManagingRoom(room);
                }}
                user={user}
                onAddContact={() => {
                  setAddContactPhone('');
                  setAddContactStatus('');
                  setShowAddContactModal(true);
                  setShowSidebar(false);
                }}
                unreadByContact={unreadByContact}
                unreadByRoom={unreadByRoom}
                onInstantMeetingJoin={(callData) => {
                  setGroupCallData(callData);
                  setInGroupCall(true);
                  setShowSidebar(false);
                }}
              />
            </div>
          </>
        )}

        {/* Main content area */}
        <div className="flex-1 flex flex-col overflow-hidden bg-[var(--color-bg-primary)]">
          {inGroupCall && groupCallData ? (
            <>
              {socketInstance ? (
                <GroupVideoCall
                  socket={socketInstance}
                  callRoomId={groupCallData.callRoomId}
                  roomName={groupCallData.roomName}
                  currentUserId={user?._id || user?.id}
                  onEndCall={endGroupCall}
                  callType={groupCallData.callType}
                />
              ) : (
                <Loader message="Preparing group call..." />
              )}
            </>
          ) : inCall ? (
            <VideoCall
              localStream={localStream}
              remoteStream={remoteStream}
              localVideoRef={localVideoRef}
              remoteVideoRef={remoteVideoRef}
              toggleMute={toggleMute}
              toggleCamera={toggleCamera}
              endCall={endCall}
              isMuted={isMuted}
              isCameraOff={isCameraOff}
              selectedUser={selectedUser}
              localOriginal={localOriginal}
              localTranslated={localTranslated}
              remoteOriginal={remoteOriginal}
              remoteTranslated={remoteTranslated}
            />
          ) : (selectedUser || selectedRoom) ? (
            <MessageSection
              selectedUser={selectedUser}
              selectedRoom={selectedRoom}
              messages={messages}
              sendMessage={sendMessage}
              isTyping={isTyping}
              user={user}
              startCall={startCall}
              formatTime={formatTime}
              onManageGroup={(room) => {
                setManagingRoom(room);
              }}
            />
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-8">
              <div className="text-center space-y-6">
                <div className="w-24 h-24 bg-gradient-to-br from-[var(--color-primary)] to-[var(--color-primary-dark)] rounded-2xl flex items-center justify-center mx-auto shadow-lg">
                  <svg className="w-12 h-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-[var(--color-text-primary)] mb-2">Welcome to Vaani!</h2>
                  <p className="text-[var(--color-text-secondary)]">Select a contact or group to start chatting</p>
                </div>
                <div className="flex gap-4 justify-center pt-4">
                  <Button
                    variant="primary"
                    onClick={() => {
                      setAddContactPhone('');
                      setAddContactStatus('');
                      setShowAddContactModal(true);
                    }}
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    Add Contact
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => setShowCreateGroupModal(true)}
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    Create Group
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Incoming call modal */}
      {incomingCall && !inCall && (
        <Modal
          isOpen={true}
          onClose={rejectCall}
          showCloseButton={false}
          closeOnBackdropClick={false}
          closeOnEscape={false}
          size="md"
        >
          <div className="text-center space-y-6">
            {/* Avatar */}
            <div className="flex justify-center">
              <div className="w-24 h-24 bg-gradient-to-br from-[var(--color-primary)] to-[var(--color-primary-dark)] rounded-full flex items-center justify-center shadow-lg">
                <span className="text-4xl font-bold text-white">
                  {incomingCall.fromName?.[0]?.toUpperCase() || 'U'}
                </span>
              </div>
            </div>

            {/* Call info */}
            <div>
              <h3 className="text-2xl font-bold text-[var(--color-text-primary)]">
                {incomingCall.fromName}
              </h3>
              <Badge variant="info" className="mt-2 inline-block">
                <span className="inline-flex gap-1 items-center">
                  <span className="w-2 h-2 bg-[var(--color-info)] rounded-full animate-pulse"></span>
                  Incoming {incomingCall.callType} call
                </span>
              </Badge>
            </div>

            {/* Action buttons */}
            <div className="flex gap-4 justify-center">
              <Button
                onClick={rejectCall}
                variant="danger"
                className="flex-1 h-12 flex items-center justify-center gap-2"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z" />
                </svg>
                Decline
              </Button>
              <Button
                onClick={answerCall}
                disabled={acceptingCall}
                loading={acceptingCall}
                className="flex-1 h-12 flex items-center justify-center gap-2"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z" />
                </svg>
                Accept
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Incoming group call modal */}
      {incomingGroupCall && !inGroupCall && (
        <Modal
          isOpen={true}
          onClose={() => declineGroupCall(incomingGroupCall)}
          showCloseButton={false}
          closeOnBackdropClick={false}
          closeOnEscape={false}
          size="md"
        >
          <div className="text-center space-y-6">
            {/* Avatar */}
            <div className="flex justify-center">
              <div className="w-24 h-24 bg-gradient-to-br from-[var(--color-primary)] to-[var(--color-primary-dark)] rounded-full flex items-center justify-center shadow-lg">
                <svg className="w-12 h-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.856-1.487M15 10a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
            </div>

            {/* Call info */}
            <div>
              <h3 className="text-2xl font-bold text-[var(--color-text-primary)]">
                {incomingGroupCall.initiator?.username || 'Someone'}
              </h3>
              <p className="text-[var(--color-text-secondary)] text-sm mt-1">
                invited you to: <span className="font-semibold text-[var(--color-text-primary)]">{incomingGroupCall.roomName}</span>
              </p>
              <Badge variant="success" className="mt-3 inline-block">
                <span className="inline-flex gap-1 items-center">
                  <span className="w-2 h-2 bg-[var(--color-success)] rounded-full animate-pulse"></span>
                  Group {incomingGroupCall.callType} call
                </span>
              </Badge>
            </div>

            {/* Action buttons */}
            <div className="flex gap-4 justify-center">
              <Button
                onClick={() => declineGroupCall(incomingGroupCall)}
                variant="danger"
                className="flex-1 h-12 flex items-center justify-center gap-2"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z" />
                </svg>
                Decline
              </Button>
              <Button
                onClick={() => joinGroupCall(incomingGroupCall)}
                className="flex-1 h-12 flex items-center justify-center gap-2"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z" />
                </svg>
                Join Call
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Modals */}
      {showCreateGroupModal && (
        <CreateGroupModal
          isOpen={showCreateGroupModal}
          onClose={() => setShowCreateGroupModal(false)}
          users={users}
          onCreateGroup={(newRoom) => {
            setShowCreateGroupModal(false);
            fetchRooms();
            selectRoom(newRoom);
          }}
        />
      )}

      {showAddContactModal && (
        <Modal
          isOpen={showAddContactModal}
          onClose={() => setShowAddContactModal(false)}
          title="Add Contact"
          size="md"
        >
          <form onSubmit={handleAddContact} className="space-y-4">
            <input
              type="tel"
              value={addContactPhone}
              onChange={(e) => setAddContactPhone(e.target.value)}
              placeholder="Enter mobile number"
              pattern="[0-9]{10}"
              className="w-full px-4 py-2 border border-[var(--color-border)] rounded-lg bg-[var(--color-bg-primary)] text-[var(--color-text-primary)] placeholder-[var(--color-text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
              required
            />
            {addContactStatus && (
              <div className={`p-3 rounded-lg text-sm ${
                addContactStatus.includes('successfully')
                  ? 'bg-[var(--color-success-bg)] text-[var(--color-success)]'
                  : 'bg-[var(--color-error-bg)] text-[var(--color-error)]'
              }`}>
                {addContactStatus}
              </div>
            )}
            <div className="flex gap-3">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setShowAddContactModal(false)}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="flex-1"
              >
                Add Contact
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {managingRoom && (
        <GroupManagementModal
          room={managingRoom}
          onClose={() => setManagingRoom(null)}
          onUpdate={() => {
            fetchRooms();
            setManagingRoom(null);
          }}
          currentUser={user}
        />
      )}

      {showNotificationSettings && (
        <NotificationSettings
          onClose={() => setShowNotificationSettings(false)}
        />
      )}


    </div>
  );
};

export default Dashboard;