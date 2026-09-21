import React, { useState } from 'react';
import axios from 'axios';

const LiveRoomsTab = ({ rooms, loading, onRefresh }) => {
  const [terminatingId, setTerminatingId] = useState(null);
  const [confirmRoomId, setConfirmRoomId] = useState(null);
  const [actionError, setActionError] = useState('');

  const API_URL = import.meta.env.VITE_API_URL || '/api';

  const handleTerminate = async (callRoomId) => {
    setTerminatingId(callRoomId);
    setActionError('');
    try {
      await axios.delete(`${API_URL}/admin/rooms/${callRoomId}`);
      setConfirmRoomId(null);
      if (onRefresh) onRefresh();
    } catch (err) {
      setActionError(err.response?.data?.error || 'Failed to terminate room');
    } finally {
      setTerminatingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header and Refresh */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-800">Live Calls & SFU Rooms</h2>
          <p className="text-sm text-gray-500">Real-time room inspector and call termination</p>
        </div>
        <button
          onClick={onRefresh}
          className="flex items-center space-x-2 px-3 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 shadow-sm text-sm font-medium transition"
        >
          <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          <span>Refresh</span>
        </button>
      </div>

      {actionError && (
        <div className="p-3.5 bg-red-50 border border-red-200 text-red-800 rounded-xl text-sm font-medium">
          ❌ {actionError}
        </div>
      )}

      {/* Rooms Grid */}
      {rooms && rooms.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {rooms.map((room) => (
            <div
              key={room.id}
              className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 flex flex-col justify-between space-y-4 hover:shadow-md transition"
            >
              <div>
                <div className="flex items-start justify-between">
                  <div className="flex items-center space-x-2">
                    <span
                      className={`px-2.5 py-0.5 text-xs font-bold rounded-full ${
                        room.callType === 'video'
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-indigo-100 text-indigo-800'
                      }`}
                    >
                      {room.callType?.toUpperCase()}
                    </span>
                    <span
                      className={`px-2.5 py-0.5 text-xs font-semibold rounded-full flex items-center space-x-1 ${
                        room.status === 'active'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping"></span>
                      <span>{room.status}</span>
                    </span>
                  </div>

                  {room.livekitActive && (
                    <span className="text-[10px] bg-purple-50 text-purple-700 border border-purple-200 font-bold px-2 py-0.5 rounded-md">
                      SFU LIVE
                    </span>
                  )}
                </div>

                <div className="mt-3">
                  <p className="text-xs font-mono text-gray-400">Room ID</p>
                  <p className="text-sm font-bold text-gray-800 font-mono truncate" title={room.callRoomId}>
                    {room.callRoomId}
                  </p>
                </div>

                <div className="mt-3 space-y-1 text-xs text-gray-600">
                  <p>
                    <span className="font-semibold text-gray-700">Initiator:</span>{' '}
                    {room.initiator?.username || 'Unknown'} ({room.initiator?.mobileNumber || 'N/A'})
                  </p>
                  <p>
                    <span className="font-semibold text-gray-700">Started:</span>{' '}
                    {room.startedAt ? new Date(room.startedAt).toLocaleTimeString() : 'N/A'}
                  </p>
                  <p>
                    <span className="font-semibold text-gray-700">Participants ({room.participants?.length || 0}):</span>
                  </p>
                </div>

                {/* Participant Avatars */}
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {room.participants?.map((p, idx) => (
                    <span
                      key={idx}
                      className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] bg-gray-100 text-gray-700 font-medium"
                    >
                      {p.user?.username || 'User'} ({p.status})
                    </span>
                  ))}
                </div>
              </div>

              {/* Actions */}
              <div className="pt-3 border-t border-gray-100 flex justify-end">
                {confirmRoomId === room.callRoomId ? (
                  <div className="flex items-center space-x-2">
                    <span className="text-xs text-red-600 font-medium">End call for all?</span>
                    <button
                      onClick={() => handleTerminate(room.callRoomId)}
                      disabled={terminatingId === room.callRoomId}
                      className="px-2.5 py-1 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold transition"
                    >
                      {terminatingId === room.callRoomId ? 'Ending...' : 'Yes, End'}
                    </button>
                    <button
                      onClick={() => setConfirmRoomId(null)}
                      className="px-2.5 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-xs font-medium transition"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmRoomId(room.callRoomId)}
                    className="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-xl text-xs font-bold transition flex items-center space-x-1.5"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                    <span>Terminate Room</span>
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center text-gray-500">
          <svg className="w-12 h-12 text-gray-300 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
          <h4 className="text-base font-bold text-gray-700">No Active Calls Right Now</h4>
          <p className="text-sm text-gray-400 mt-1">Ongoing group calls and LiveKit rooms will appear here in real-time.</p>
        </div>
      )}
    </div>
  );
};

export default LiveRoomsTab;
