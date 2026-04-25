import React, { useState, useEffect, useContext, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { AuthContext } from '../contexts/AuthContext';
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

const API_URL = import.meta.env.VITE_API_URL || '/api';

const Dashboard = () => {
  const navigate = useNavigate();
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
  const [incomingCall, setIncomingCall] = useState(null);
  const [acceptingCall, setAcceptingCall] = useState(false);
  const [activeCallSession, setActiveCallSession] = useState(null);
  // Caller-side ringing state (UI: show callee/device as ringing)
  const [callerRinging, setCallerRinging] = useState(false);
  const [remoteRingingUser, setRemoteRingingUser] = useState(null);
  const [showCreateGroupModal, setShowCreateGroupModal] = useState(false);
  const [managingRoom, setManagingRoom] = useState(null);

  // Group call state
  const [inGroupCall, setInGroupCall] = useState(false);
  const [groupCallData, setGroupCallData] = useState(null);
  const [pendingGroupCalls, setPendingGroupCalls] = useState([]);
  const [incomingGroupCall, setIncomingGroupCall] = useState(null);

  // Notification settings
  const [showNotificationSettings, setShowNotificationSettings] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState('default');

  const socketInstance = socketManager.getSocket();

  // Refs to hold latest selection for socket handlers (avoid stale closures)
  const selectedUserRef = useRef(selectedUser);
  const selectedRoomRef = useRef(selectedRoom);
  const roomsRef = useRef([]);
  const currentLanguageRef = useRef(currentLanguage);
  const userRef = useRef(user);

  // Refs
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const initiatorOfferSentRef = useRef(new Set()); // track callSessionIds we've sent offers for

  // Check authentication
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

  // Keep refs up to date to avoid stale closures in socket listeners
  useEffect(() => {
    selectedUserRef.current = selectedUser;
    selectedRoomRef.current = selectedRoom;
    currentLanguageRef.current = currentLanguage;
    userRef.current = user;
  }, [selectedUser, selectedRoom, currentLanguage, user]);

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

    try {
      const socket = socketManager.initialize(token);

      // Wait for socket to connect, then send initial language preference
      const sendLanguagePreference = () => {
        if (currentLanguage) {
          socket.emit('updateLanguagePreference', { language: currentLanguage });
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

      // Listen for real-time messages
      socketManager.on('receiveMessage', async (msg) => {
        console.log('💬 [RECEIVE_MESSAGE EVENT] Received:', msg);

        // Use refs to avoid stale closures (selectedUser/selectedRoom may change)
        const selUser = selectedUserRef.current;
        const selRoom = selectedRoomRef.current;

        // Debug: Log what we're comparing
        const senderIdFromMsg = msg.sender?._id || msg.sender?.id || msg.sender;
        const selectedUserId = selUser?.id || selUser?._id;

        console.log(`   � Message details:`, {
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
        console.log('📣 New room created via socket:', newRoom);
        setRooms(prev => {
          // Avoid duplicates
          if (prev.some(r => r._id === newRoom._id)) return prev;
          return [newRoom, ...prev];
        });
      });

      console.log('Socket.IO initialization attempted');
      console.log('Current user ID:', user?._id || user?.id);

      const handleGroupCallIncoming = (payload = {}) => {
        console.log('🔔 [DEBUG] handleGroupCallIncoming called with payload:', payload);

        try {
          const currentUserId = user?._id || user?.id;
          if (!currentUserId) {
            console.warn('⚠️ No current user ID, ignoring group call invitation');
            return;
          }

          console.log(`   👤 Current user: ${currentUserId}`);

          const participantIds = (payload.participants || []).map(p =>
            typeof p === 'string' ? p : p?.userId || p?.id
          ).filter(Boolean);

          console.log(`   👥 Participant IDs in call:`, participantIds);

          if (!participantIds.some(id => id?.toString() === currentUserId.toString())) {
            console.warn('⚠️ Current user is not in participant list, ignoring call');
            return;
          }

          const invitation = {
            callId: payload.callId,
            callRoomId: payload.callRoomId,
            roomId: payload.roomId,
            roomName: payload.roomName,
            callType: payload.callType || 'video',
            initiator: payload.initiator
          };

          console.log('✅ Received group call invitation:', invitation);
          setIncomingGroupCall(invitation);
          callSoundPlayer.playRingtone().catch(() => {
            console.log('Ringtone not played for group call invitation');
          });

          // Show browser notification if window is not focused
          if (document.hidden) {
            const initiatorName = invitation.initiator?.username || invitation.initiator?.name || 'Someone';
            notificationManager.showIncomingCallNotification({
              fromName: initiatorName,
              callType: invitation.callType,
              isGroupCall: true,
              roomName: invitation.roomName,
              callId: invitation.callId
            }, () => {
              // On accept from notification
              window.focus();
              joinGroupCall(invitation);
            }, () => {
              // On reject from notification
              window.focus();
              declineGroupCall(invitation);
            });
          }
        } catch (err) {
          console.error('❌ Failed to handle group call incoming payload:', err);
        }
      };

      // Deprecated event support
      const handleGroupCallInvitation = (invitation) => {
        if (!invitation) return;
        console.log('📣 Received group call invitation (deprecated event):', invitation);
        handleGroupCallIncoming(invitation);
      };

      console.log('🎧 Registering socket listeners for group calls...');
      socketManager.on('groupCallIncoming', handleGroupCallIncoming);
      socketManager.on('groupCallInvitation', handleGroupCallInvitation);
      // Backwards compatibility: listen to different event name variants
      socketManager.on('groupCallInitiated', (payload) => {
        console.log('🔔 Received groupCallInitiated event (old name), converting to groupCallIncoming');
        handleGroupCallIncoming(payload);
      });
      socketManager.on('group_incoming_call', (payload) => {
        console.log('🔔 Received group_incoming_call (new unified name)');
        handleGroupCallIncoming(payload);
      });
      console.log('✅ Socket listeners registered');

      // Participant events (join/disconnect)
      socketManager.on('participant_joined', (data) => {
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
          if (inGroupCall) {
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
          if (inGroupCall) {
            setInGroupCall(false);
            setGroupCallData(null);
          }

          // If there was an incoming call modal, dismiss it
          if (incomingGroupCall) setIncomingGroupCall(null);

        } catch (e) {
          console.error('Error handling group_call_ended:', e);
        }
      });

      // -------------------------------------------------------------
      // WebRTC Call Listeners
      // -------------------------------------------------------------

      const handleIncomingCall = (data) => {
        console.log('📞 Incoming private call from:', data.fromName);
        callSoundPlayer.playRingtone().catch(() => {
          console.log('Ringtone not played - showing visual notification instead');
        });

        if (document.hidden) {
          notificationManager.showIncomingCallNotification({
            fromName: data.fromName,
            callType: data.callType,
            isGroupCall: Boolean(data.roomId),
            roomName: data.roomName,
            callId: data.callSessionId
          }, () => {
            window.focus();
            // Need to set incoming call first so answerCall finds it
            setIncomingCall(data);
            // We can't safely call answerCall here directly due to closures, 
            // user will have to click the regular accept button once focused.
          }, () => {
            window.focus();
            setIncomingCall(data);
            // reject
          });
        }

        try {
          // Ack the incoming call receipt back to caller
          socketManager.emit('incomingCallAck', {
            from: data.from,
            to: userRef.current?.id || userRef.current?._id,
            callSessionId: data.callSessionId
          });
        } catch (e) {
          console.warn('Failed to send incomingCallAck:', e);
        }
        setIncomingCall(data);
      };

      const handleIncomingCallAck = (data) => {
        try {
          console.log('📣 incomingCallAck received:', data);
          const selUser = selectedUserRef.current;
          if (selUser && data && data.from && selUser.id && data.from.toString() === selUser.id.toString()) {
            setCallerRinging(true);
            setRemoteRingingUser(selUser);
            callSoundPlayer.playRingback().catch(() => { });
          }
        } catch (e) {
          console.warn('Error in incomingCallAck handler:', e);
        }
      };

      const handleCallAnswered = async (data) => {
        console.log('✓ Call answered by:', data.from);
        try { callSoundPlayer.stopAll(); } catch (e) { }

        if (data.callSessionId) {
          setActiveCallSession(prev => {
            if (prev?.callSessionId) return prev;
            return {
              callSessionId: data.callSessionId,
              callRoomId: data.callRoomId,
              callType: callType || data.callType,
              from: data.from
            };
          });
        }

        if (peerConnectionRef.current) {
          try {
            await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(data.answer));
            console.log('✓ Remote description set successfully');
          } catch (err) {
            console.error('Error setting remote description:', err);
          }
        }
      };

      const handleIceCandidate = async (data) => {
        console.log('🧊 Received ICE candidate');
        if (peerConnectionRef.current) {
          try {
            await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(data.candidate));
            console.log('✓ ICE candidate added successfully');
          } catch (err) {
            console.error('Error adding ICE candidate:', err);
          }
        }
      };

      const handleCallEnded = () => {
        console.log(' Call ended by remote peer');
        // Have to use state updater or ref because endCall closure might be stale
        try { callSoundPlayer.stopAll(); } catch (e) { }
        setInCall(false);
        setIncomingCall(null);
        setCallerRinging(false);
        setRemoteRingingUser(null);
        setActiveCallSession(null);

        if (peerConnectionRef.current) {
          peerConnectionRef.current.close();
          peerConnectionRef.current = null;
        }

        setLocalStream(prevStream => {
          if (prevStream) {
            prevStream.getTracks().forEach(track => {
              console.log('Stopping local stream track:', track.kind);
              track.stop();
            });
          }
          return null;
        });

        setRemoteStream(null);
      };

      socketManager.on('incomingCall', handleIncomingCall);
      socketManager.on('incomingCallAck', handleIncomingCallAck);
      socketManager.on('callAnswered', handleCallAnswered);
      socketManager.on('iceCandidate', handleIceCandidate);
      socketManager.on('callEnded', handleCallEnded);

      // Fetch pending group calls on socket connection
      // This is already handled concurrently in loadData, so we skip the duplicate fetch here
      // const fetchPendingCallInvitations = async () => { ... };
      // fetchPendingCallInvitations();
    } catch (error) {
      console.warn('Socket.IO initialization failed:', error.message);
      // Continue without real-time features
    }

    // Don't cleanup socket on component unmount - let it persist
    // Only cleanup if explicitly logging out
    return () => {
      // Clean up event listeners if navigating away
      try {
        // Don't fully cleanup; just remove specific listeners we added
        // socketManager.cleanup() is too aggressive - it disconnects the socket
      } catch (error) {
        console.warn('Socket listener cleanup error:', error);
      }
    };
  }, [isAuthenticated, user]);

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
  const sendMessage = async (messageText) => {
    if (!messageText.trim()) return;

    try {
      const token = localStorage.getItem('token');
      // clientTempId helps correlate optimistic UI messages with the server-emitted saved message
      const clientTempId = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      // Create optimistic (queued) message in local state so UI shows queued immediately
      const optimisticMessage = {
        _id: clientTempId, // temporary id until server provides real _id
        id: clientTempId,
        clientTempId,
        sender: { _id: user?._id || user?.id, username: user?.username || user?.name },
        content: messageText,
        originalContent: messageText,
        timestamp: new Date().toISOString(),
        status: 'queued',
        room: selectedRoom?._id || null,
        receiver: selectedUser?.id || null,
        isGroupMessage: Boolean(selectedRoom)
      };
      setMessages(prev => [...prev, optimisticMessage]);

      const payload = {
        content: messageText,
        clientTempId,
        ...(selectedUser ? { receiverId: selectedUser.id } : { roomId: selectedRoom._id })
      };

      // Note: avoid emitting a pre-save socket message here.
      // The API will save the message and emit the saved/populated message to sockets.

      // Save to database via API (always). We'll prefer the server-emitted socket message which includes _id.
      const resPromise = axios.post(`${API_URL}/chat/message`, payload, {
        headers: { 'x-auth-token': token }
      });

      // Wait briefly for the server to emit the saved message via socket (which includes the _id and clientTempId)
      const savedViaSocket = await new Promise((resolve) => {
        let resolved = false;
        const timeout = setTimeout(async () => {
          if (resolved) return;
          resolved = true;
          try {
            const res = await resPromise;
            resolve(res.data);
          } catch (err) {
            resolve(null);
          }
        }, 700); // 700ms timeout to prefer socket delivery

        const handler = (msg) => {
          if (msg && msg.clientTempId === clientTempId) {
            if (!resolved) {
              resolved = true;
              clearTimeout(timeout);
              resolve(msg);
            }
          }
        };

        // Listen temporarily for socket-delivered saved message
        socketManager.on('receiveMessage', handler);
      });

      if (savedViaSocket) {
        // Server already emitted the saved message; append it (dedupe in handler will ignore duplicates)
        // Remove optimistic queued message if present (handler dedupe will avoid duplicates; still clear input)
        setMessage('');
      } else {
        // Fallback: use API response
        try {
          const res = await resPromise;
          setMessages(prev => {
            const id = res.data._id || res.data.id || `${res.data.timestamp}-${res.data.sender}`;
            if (prev.some(m => (m._id || m.id) === id)) return prev;
            return [...prev, res.data];
          });
        } catch (err) {
          console.error('Error saving message fallback:', err);
        }
        setMessage('');
      }
    } catch (err) {
      console.error('Error sending message:', err);
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

  // Handle file change
  const handleFileChange = (e) => {
    console.log('File selected:', e.target.files[0]);
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

    // Check if Socket.IO is connected
    if (!socketManager.socket?.connected) {
      alert('Real-time connection not available. Please refresh the page and try again.');
      return;
    }

    try {
      // Enable audio playback (user has interacted by clicking call button)
      callSoundPlayer.enableUserInteraction();

      // For group/room calls, use the new group call feature
      if (selectedRoom) {
        await startGroupCall(type);
        return;
      } else {
        setActiveCallSession(null);
      }

      setCallType(type);

      // Play ringback sound (non-blocking)
      callSoundPlayer.playRingback().catch(() => {
        console.log('Ringback sound not played - user interaction may be required');
      });

      // Get user media
      const constraints = {
        audio: true,
        video: type === 'video' ? {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'user'
        } : false
      };

      const targetName = selectedUser ? selectedUser.name : selectedRoom.name;
      console.log(`📞 Starting ${type} call to ${targetName}...`);
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      setLocalStream(stream);

      // Create peer connection
      const pc = createPeerConnection();
      peerConnectionRef.current = pc;

      // Add tracks to peer connection
      // For audio: use a silent track (original voice won't be sent)
      // For video: use the actual video track
      stream.getTracks().forEach(track => {
        if (track.kind === 'audio') {
          // Replace with silent audio track - original voice won't be sent
          const silentTrack = createSilentAudioTrack();
          pc.addTrack(silentTrack, stream);
          console.log(`✓ Added SILENT audio track to peer connection (original voice muted)`);
        } else {
          // Add video track normally
          pc.addTrack(track, stream);
          console.log(`✓ Added ${track.kind} track to peer connection`);
        }
      });

      // Create and send offer
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const callData = {
        offer: offer,
        callType: type
      };

      if (selectedRoom) {
        // Group call
        callData.roomId = selectedRoom._id;
        socketManager.emit('callUser', callData);
        console.log('✓ Group call offer sent successfully');
      } else {
        // Private call
        callData.to = selectedUser.id;

        // Start a delivery timeout: if we don't get an `incomingCallDelivered` ack
        // within X ms, consider the user unavailable and cleanup the call attempt.
        const DELIVERY_TIMEOUT_MS = 5000;
        let deliveryTimer = null;

        const onDelivered = (data) => {
          try {
            if (data && data.to === selectedUser.id) {
              console.log('✓ incomingCallDelivered ack received for', data);
              if (deliveryTimer) {
                clearTimeout(deliveryTimer);
                deliveryTimer = null;
              }
              // Remove temporary listeners
              try { socketManager.off('incomingCallDelivered', onDelivered); } catch (e) { }
              try { socketManager.off('userUnavailable', onUserUnavailable); } catch (e) { }
              // keep callerRinging unchanged here; we'll wait for app-level ack to mark ringing
            }
          } catch (e) { /* ignore */ }
        };

        const onUserUnavailable = (payload) => {
          try {
            if (payload && payload.to === selectedUser.id) {
              console.log('⚠️ userUnavailable received for', payload);
              if (deliveryTimer) {
                clearTimeout(deliveryTimer);
                deliveryTimer = null;
              }
              // Cleanup call UI
              callSoundPlayer.stopAll();
              setInCall(false);
              setCallType(null);
              // Clear caller ringing state if any
              setCallerRinging(false);
              setRemoteRingingUser(null);
              alert('User is unavailable or offline.');
              try { socketManager.off('incomingCallDelivered', onDelivered); } catch (e) { }
              try { socketManager.off('userUnavailable', onUserUnavailable); } catch (e) { }
            }
          } catch (e) { /* ignore */ }
        };

        // Attach temporary handlers
        socketManager.on('incomingCallDelivered', onDelivered);
        socketManager.on('userUnavailable', onUserUnavailable);

        // Start timer
        deliveryTimer = setTimeout(() => {
          deliveryTimer = null;
          console.warn('No incomingCallDelivered ack received - treating as unavailable');
          callSoundPlayer.stopAll();
          setInCall(false);
          setCallType(null);
          // Clear caller ringing state if any
          setCallerRinging(false);
          setRemoteRingingUser(null);
          alert('No answer from recipient (timeout).');
          try { socketManager.off('incomingCallDelivered', onDelivered); } catch (e) { }
          try { socketManager.off('userUnavailable', onUserUnavailable); } catch (e) { }
        }, DELIVERY_TIMEOUT_MS);

        socketManager.emit('callUser', callData);
        console.log('✓ Private call offer sent successfully (waiting for delivery ack)');
      }

      setInCall(true);
    } catch (err) {
      console.error('Error starting call:', err);
      callSoundPlayer.stopAll();

      if (err.name === 'NotAllowedError') {
        alert('❌ Camera/microphone access denied. Please allow access in your browser settings and try again.');
      } else if (err.name === 'NotFoundError') {
        alert('❌ Camera/microphone not found. Please check your devices and try again.');
      } else if (err.name === 'NotReadableError') {
        alert('❌ Camera/microphone is already in use by another application. Please close other apps and try again.');
      } else {
        alert('❌ Failed to start call: ' + err.message);
      }
      endCall();
    }
  };

  // Answer call
  const answerCall = async () => {
    if (!incomingCall) return;

    try {
      console.log('answerCall invoked, incomingCall:', incomingCall);
      console.log('Socket connected?', !!socketManager.socket?.connected, 'socket id:', socketManager.socket?.id);

      // Enable audio playback (user has interacted by clicking answer)
      callSoundPlayer.enableUserInteraction();

      // Close any active notifications
      notificationManager.closeAllNotifications();

      setAcceptingCall(true);
      callSoundPlayer.stopAll();
      setCallType(incomingCall.callType);

      if (incomingCall.callSessionId) {
        setActiveCallSession(incomingCall);
        socketManager.emit('joinCallSession', { callSessionId: incomingCall.callSessionId });
      } else {
        setActiveCallSession(null);
      }

      // Get user media
      const constraints = {
        audio: true,
        video: incomingCall.callType === 'video' ? {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'user'
        } : false
      };

      console.log(`📞 Answering ${incomingCall.callType} call from ${incomingCall.fromName}...`);
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      setLocalStream(stream);

      // Create peer connection
      const pc = createPeerConnection();
      peerConnectionRef.current = pc;

      // Add tracks to peer connection
      // For audio: use a silent track (original voice won't be sent)
      // For video: use the actual video track
      stream.getTracks().forEach(track => {
        if (track.kind === 'audio') {
          // Replace with silent audio track - original voice won't be sent
          const silentTrack = createSilentAudioTrack();
          pc.addTrack(silentTrack, stream);
          console.log(`✓ Added SILENT audio track to peer connection (original voice muted)`);
        } else {
          // Add video track normally
          pc.addTrack(track, stream);
          console.log(`✓ Added ${track.kind} track to peer connection`);
        }
      });

      // If there's no SDP offer (invitation-only group call), join the call session
      // and wait for a real incoming offer to arrive. Otherwise proceed normally.
      const waitingForOffer = !incomingCall.offer && !!incomingCall.callSessionId;

      if (waitingForOffer) {
        // Join call session so server marks us as active participant
        socketManager.emit('joinCallSession', { callSessionId: incomingCall.callSessionId });

        const handleOffer = async (data) => {
          try {
            // Ensure it's for the same session
            if (data.callSessionId && data.callSessionId !== incomingCall.callSessionId) return;
            if (!data.offer) return;

            await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);

            socketManager.emit('answerCall', {
              to: data.from,
              answer: answer,
              roomId: data.roomId,
              callSessionId: data.callSessionId,
              callRoomId: data.callRoomId
            });

            console.log('✓ Call answered successfully (after deferred offer)');

            // Play connect beep sound
            callSoundPlayer.playConnect().catch(err => {
              console.log('Could not play connect sound:', err.message);
            });

            setInCall(true);
            // Ensure sounds are stopped when the call becomes active
            try { callSoundPlayer.stopAll(); } catch (e) { /* ignore */ }
            setIncomingCall(null);
          } catch (err) {
            console.error('Error answering deferred offer:', err);
            rejectCall();
          } finally {
            socketManager.off('incomingCall', handleOffer);
          }
        };

        socketManager.on('incomingCall', handleOffer);

        // Safety timeout to avoid hanging forever (shorter during testing)
        setTimeout(() => {
          try { socketManager.off('incomingCall', handleOffer); } catch (e) { }
          console.warn('No offer received for deferred call; aborting');
          setAcceptingCall(false);
          rejectCall();
        }, 8000);
      } else {
        // Normal answer flow with an offer
        await pc.setRemoteDescription(new RTCSessionDescription(incomingCall.offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        socketManager.emit('answerCall', {
          to: incomingCall.from,
          answer: answer,
          roomId: incomingCall.roomId,
          callSessionId: incomingCall.callSessionId,
          callRoomId: incomingCall.callRoomId
        });

        console.log('✓ Call answered successfully');

        // Play connect beep sound
        callSoundPlayer.playConnect().catch(err => {
          console.log('Could not play connect sound:', err.message);
        });

        setInCall(true);
        // Defensive: stop any remaining ringing/ringback
        try { callSoundPlayer.stopAll(); } catch (e) { /* ignore */ }
        setIncomingCall(null);
        setAcceptingCall(false);
      }
    } catch (err) {
      console.error('Error answering call:', err);
      callSoundPlayer.stopAll();

      if (err.name === 'NotAllowedError') {
        alert('❌ Camera/microphone access denied. Please allow access and try again.');
      } else if (err.name === 'NotFoundError') {
        alert('❌ Camera/microphone not found. Please check your devices.');
      } else if (err.name === 'NotReadableError') {
        alert('❌ Camera/microphone is already in use. Please close other apps and try again.');
      } else {
        alert('❌ Failed to answer call: ' + err.message);
      }
      setAcceptingCall(false);
      rejectCall();
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
    console.log('📴 Ending call');

    // Stop all sounds first
    callSoundPlayer.stopAll();

    // Close any active notifications
    notificationManager.closeAllNotifications();

    // Play disconnect sound (non-blocking, allow failures)
    callSoundPlayer.playDisconnect().catch(() => {
      console.log('Disconnect sound not played');
    });

    // Stop all tracks using state callbacks to avoid stale closures
    setLocalStream(prevStream => {
      if (prevStream) {
        prevStream.getTracks().forEach(track => {
          track.stop();
          console.log(`✓ Stopped ${track.kind} track`);
        });
      }
      return null;
    });

    setRemoteStream(prevStream => {
      if (prevStream) {
        prevStream.getTracks().forEach(track => track.stop());
      }
      return null;
    });

    // Close peer connection
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      console.log('✓ Peer connection closed');
    }

    // Notify other peer
    if (activeCallSession?.callSessionId) {
      socketManager.emit('leaveCallSession', { callSessionId: activeCallSession.callSessionId });
    }

    if (inCall) {
      if (selectedRoom) {
        socketManager.emit('endCall', { roomId: selectedRoom._id, callSessionId: activeCallSession?.callSessionId });
      } else if (selectedUser) {
        socketManager.emit('endCall', { to: selectedUser.id, callSessionId: activeCallSession?.callSessionId });
      }
    }

    // Reset state
    setInCall(false);
    setCallType(null);
    setIsMuted(false);
    setIsCameraOff(false);
    peerConnectionRef.current = null;
    setActiveCallSession(null);

    console.log('✓ Call ended successfully');
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
    <div className="flex flex-col bg-gray-100">
      {/* Header */}
      <Header
        user={user}
        toggleSidebar={toggleSidebar}
        handleLanguageChange={handleLanguageChange}
        onShowNotificationSettings={() => setShowNotificationSettings(true)}
      />

      {/* Main content - responsive layout */}
      <div className="flex flex-1 pt-16">
        {/* Sidebar - hidden on mobile, visible on lg */}
        <div className="hidden lg:flex lg:flex-col w-80 border-r border-gray-200">
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
              console.log('Opening group management for room:', room);
              console.log('Current user:', user);
              setManagingRoom(room);
            }}
            user={user}
            unreadByContact={unreadByContact}
            unreadByRoom={unreadByRoom}
          />
        </div>

        {/* Mobile sidebar overlay */}
        {showSidebar && (
          <>
            <div
              className="fixed inset-0 bg-opacity-50 z-10 lg:hidden"
              onClick={() => setShowSidebar(false)}
            />
            <div className="fixed left-0 top-16 bottom-0 w-80 z-20 lg:hidden">
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
                  console.log('Opening group management for room:', room);
                  console.log('Current user:', user);
                  setManagingRoom(room);
                }}
                user={user}
                unreadByContact={unreadByContact}
                unreadByRoom={unreadByRoom}
              />
            </div>
          </>
        )}

        {/* Main chat area or video call */}
        {inGroupCall && groupCallData ? (
          <div className="flex-1 flex flex-col">
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
          </div>
        ) : inCall ? (
          <div className="flex-1 flex flex-col">
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
              peerConnection={peerConnectionRef.current}
              socket={socketManager.socket}
              selectedUser={selectedUser}
              activeCallSession={activeCallSession}
            />
          </div>
        ) : (selectedUser || selectedRoom) ? (
          <MessageSection
            selectedUser={selectedUser}
            selectedRoom={selectedRoom}
            messages={messages}
            sendMessage={sendMessage}
            handleFileChange={handleFileChange}
            isTyping={isTyping}
            user={user}
            startCall={startCall}
            formatTime={formatTime}
            onManageGroup={(room) => {
              // console.log('Opening group management from chat header for room:', room);
              // console.log('Current user in dashboard:', user);
              // console.log('User ID:', user?.id, 'User _id:', user?._id);
              setManagingRoom(room);
            }}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center bg-gray-50">
            <div className="text-center">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-24 w-24 mx-auto text-gray-300 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              <p className="text-xl text-gray-500 mb-2">Welcome to Vani!</p>
              <p className="text-gray-400">Select a contact to start chatting</p>
            </div>
          </div>
        )}
      </div>

      {/* Incoming call notification */}
      {incomingCall && !inCall && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-8 max-w-md w-full mx-4 shadow-2xl">
            <div className="text-center">
              <div className="mb-4">
                <div className="w-20 h-20 bg-blue-500 rounded-full flex items-center justify-center mx-auto mb-4">
                  <span className="text-3xl font-bold text-white">
                    {incomingCall.fromName?.[0]?.toUpperCase() || 'U'}
                  </span>
                </div>
                <h3 className="text-2xl font-semibold text-gray-800 mb-2">
                  {incomingCall.fromName}
                </h3>
                <p className="text-gray-600 mb-4">
                  Incoming {incomingCall.callType} call...
                </p>
              </div>

              <div className="flex gap-4 justify-center">
                <button
                  onClick={rejectCall}
                  className="px-6 py-3 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors flex items-center gap-2"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  Decline
                </button>
                <button
                  onClick={answerCall}
                  className="px-6 py-3 bg-green-500 text-white rounded-full hover:bg-green-600 transition-colors flex items-center gap-2"
                  disabled={acceptingCall}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                  </svg>
                  {acceptingCall ? 'Joining...' : 'Accept'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Incoming group call notification */}
      {incomingGroupCall && !inGroupCall && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-8 max-w-md w-full mx-4 shadow-2xl">
            <div className="text-center">
              <div className="mb-4">
                <div className="w-20 h-20 bg-purple-500 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                </div>
                <h3 className="text-2xl font-semibold text-gray-800 mb-2">
                  {incomingGroupCall.roomName}
                </h3>
                <p className="text-gray-600 mb-2">
                  Incoming group {incomingGroupCall.callType} call
                </p>
                <p className="text-sm text-gray-500 mb-4">
                  from {incomingGroupCall.initiator?.username}
                </p>
              </div>

              <div className="flex gap-4 justify-center">
                <button
                  onClick={() => declineGroupCall(incomingGroupCall)}
                  className="px-6 py-3 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors flex items-center gap-2"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  Decline
                </button>
                <button
                  onClick={() => joinGroupCall(incomingGroupCall)}
                  className="px-6 py-3 bg-green-500 text-white rounded-full hover:bg-green-600 transition-colors flex items-center gap-2"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  Join Call
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Socket connection status */}
      <SocketStatus />

      {/* Notification Settings Modal */}
      {showNotificationSettings && (
        <div className="fixed bottom-4 right-4 z-50 max-w-md">
          <NotificationSettings
            onClose={() => {
              setShowNotificationSettings(false);
              setNotificationPermission(notificationManager.getPermissionStatus());
            }}
          />
        </div>
      )}

      <CreateGroupModal
        isOpen={showCreateGroupModal}
        onClose={() => setShowCreateGroupModal(false)}
        users={users}
        onCreateGroup={handleCreateGroup}
      />

      <GroupManagementModal
        isOpen={!!managingRoom}
        onClose={() => setManagingRoom(null)}
        room={managingRoom}
        users={users}
        currentUserId={user?._id?.toString()}
        onRoomUpdate={handleRoomUpdate}
      />
    </div>
  );
};

export default Dashboard;