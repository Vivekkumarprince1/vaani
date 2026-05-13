import React, { useEffect, useContext, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { AuthContext } from '../contexts/AuthContext';

const API_URL = import.meta.env.VITE_API_URL || '/api';

const JoinCall = () => {
  const { callRoomId } = useParams();
  const navigate = useNavigate();
  const { isAuthenticated, loading: authLoading } = useContext(AuthContext);

  // 'resolving' | 'lobby' | 'joining' | 'error'
  const [phase, setPhase] = useState('resolving');
  const [error, setError] = useState(null);

  // When there's no active call, we show a lobby so the user can choose call type
  const [lobbyData, setLobbyData] = useState(null); // { roomId, roomName }
  // When there's an active call already
  const [activeCallData, setActiveCallData] = useState(null);

  // Resolve the link on mount
  useEffect(() => {
    if (authLoading) return;

    if (!isAuthenticated) {
      sessionStorage.setItem('vaani_join_callRoomId', callRoomId);
      navigate('/login', { replace: true });
      return;
    }

    const resolve = async () => {
      try {
        const token = localStorage.getItem('token');
        const res = await axios.get(`${API_URL}/chat/group-call/by-room/${callRoomId}`, {
          headers: { 'x-auth-token': token },
        });

        if (res.data.hasActiveCall) {
          // Active call found — go straight to joining
          setActiveCallData(res.data.call);
          setPhase('lobby');
        } else if (res.data.room) {
          // No active call but room exists — show lobby
          setLobbyData(res.data.room);
          setPhase('lobby');
        } else {
          setError('This meeting link is invalid or expired.');
          setPhase('error');
        }
      } catch (err) {
        if (err.response?.status === 403) {
          setError('You are not a member of this group and cannot join the call.');
        } else if (err.response?.status === 404) {
          setError('This meeting link is invalid or expired.');
        } else {
          setError(err.response?.data?.message || 'Failed to resolve the meeting link.');
        }
        setPhase('error');
      }
    };

    resolve();
  }, [authLoading, isAuthenticated, callRoomId, navigate]);

  const handleJoin = useCallback(async (callType = 'video') => {
    setPhase('joining');
    try {
      const token = localStorage.getItem('token');

      if (activeCallData) {
        // Active call — just join it
        await axios.post(
          `${API_URL}/chat/group-call/${activeCallData._id}/join`,
          {},
          { headers: { 'x-auth-token': token } }
        );
        navigate('/dashboard', {
          replace: true,
          state: {
            autoJoinGroupCall: {
              callId: activeCallData._id,
              callRoomId: activeCallData.callRoomId,
              roomId: activeCallData.roomId?._id || activeCallData.roomId,
              roomName: activeCallData.roomId?.name || 'Group Call',
              callType: activeCallData.callType || callType,
            },
          },
        });
      } else if (lobbyData) {
        // No active call — initiate a new one
        const res = await axios.post(
          `${API_URL}/chat/group-call/initiate`,
          { roomId: lobbyData._id, callType },
          { headers: { 'x-auth-token': token } }
        );
        const call = res.data.call;
        navigate('/dashboard', {
          replace: true,
          state: {
            autoJoinGroupCall: {
              callId: call._id,
              callRoomId: call.callRoomId,
              roomId: call.roomId?._id || call.roomId || lobbyData._id,
              roomName: call.roomId?.name || lobbyData.name,
              callType: call.callType || callType,
            },
          },
        });
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to join. Please try again.');
      setPhase('error');
    }
  }, [activeCallData, lobbyData, navigate]);

  const roomName = activeCallData?.roomId?.name || lobbyData?.name || 'Group Call';
  const hasActiveCall = Boolean(activeCallData);

  // ── Resolving spinner ────────────────────────────────────────────────────
  if (phase === 'resolving') {
    return (
      <Screen>
        <Spinner />
        <p className="text-gray-400 mt-4 text-sm">Opening meeting...</p>
      </Screen>
    );
  }

  // ── Error ────────────────────────────────────────────────────────────────
  if (phase === 'error') {
    return (
      <Screen>
        <div className="w-16 h-16 bg-red-600/20 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </div>
        <h1 className="text-lg font-bold text-white mb-2">Can't join meeting</h1>
        <p className="text-red-400 text-sm mb-6">{error}</p>
        <button
          onClick={() => navigate('/dashboard', { replace: true })}
          className="px-6 py-2 bg-emerald-600 text-white rounded-full hover:bg-emerald-700 transition-colors text-sm"
        >
          Go to Dashboard
        </button>
      </Screen>
    );
  }

  // ── Joining spinner ──────────────────────────────────────────────────────
  if (phase === 'joining') {
    return (
      <Screen>
        <Spinner />
        <p className="text-gray-400 mt-4 text-sm">Joining {roomName}...</p>
      </Screen>
    );
  }

  // ── Lobby ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
      <div className="bg-gray-800 rounded-2xl p-8 max-w-sm w-full text-center shadow-2xl">
        {/* Icon */}
        <div className="w-16 h-16 bg-indigo-600 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
        </div>

        {/* Room info */}
        <p className="text-gray-400 text-xs uppercase tracking-widest mb-1">Vaani Meeting</p>
        <h1 className="text-xl font-bold text-white mb-1">{roomName}</h1>

        {hasActiveCall ? (
          <p className="text-emerald-400 text-sm mb-6">
            <span className="inline-block w-2 h-2 bg-emerald-400 rounded-full mr-1 animate-pulse" />
            Call in progress
          </p>
        ) : (
          <p className="text-gray-400 text-sm mb-6">No active call — you can start one</p>
        )}

        {/* Join buttons */}
        <div className="flex flex-col gap-3">
          <button
            onClick={() => handleJoin('video')}
            className="w-full flex items-center justify-center gap-2 px-5 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-medium transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 002 2v8a2 2 0 002 2z" />
            </svg>
            {hasActiveCall ? 'Join with Video' : 'Start with Video'}
          </button>

          <button
            onClick={() => handleJoin('audio')}
            className="w-full flex items-center justify-center gap-2 px-5 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-xl font-medium transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
            </svg>
            {hasActiveCall ? 'Join Audio Only' : 'Start Audio Only'}
          </button>
        </div>

        <button
          onClick={() => navigate('/dashboard', { replace: true })}
          className="mt-4 text-gray-500 hover:text-gray-300 text-xs transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
};

// ── Helpers ──────────────────────────────────────────────────────────────────

const Screen = ({ children }) => (
  <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
    <div className="bg-gray-800 rounded-2xl p-8 max-w-sm w-full text-center shadow-2xl">
      {children}
    </div>
  </div>
);

const Spinner = () => (
  <div className="flex justify-center">
    <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
  </div>
);

export default JoinCall;
