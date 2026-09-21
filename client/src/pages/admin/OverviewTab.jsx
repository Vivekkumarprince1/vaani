import React from 'react';

const OverviewTab = ({ metrics, loading, onRefresh }) => {
  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  const statCards = [
    {
      title: 'Total Users',
      value: metrics?.metrics?.totalUsers ?? 0,
      icon: (
        <svg className="w-6 h-6 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
      ),
      bgColor: 'bg-blue-50',
      borderColor: 'border-blue-200'
    },
    {
      title: 'Online Users',
      value: metrics?.metrics?.onlineUsers ?? 0,
      icon: (
        <svg className="w-6 h-6 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.636 18.364a9 9 0 010-12.728m12.728 0a9 9 0 010 12.728m-9.9-2.829a5 5 0 010-7.07m7.072 0a5 5 0 010 7.07M13 12a1 1 0 11-2 0 1 1 0 012 0z" />
        </svg>
      ),
      bgColor: 'bg-emerald-50',
      borderColor: 'border-emerald-200'
    },
    {
      title: 'Admins & Staff',
      value: metrics?.metrics?.adminUsers ?? 0,
      icon: (
        <svg className="w-6 h-6 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        </svg>
      ),
      bgColor: 'bg-amber-50',
      borderColor: 'border-amber-200'
    },
    {
      title: 'Active Calls & Rooms',
      value: metrics?.metrics?.activeCalls ?? 0,
      icon: (
        <svg className="w-6 h-6 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
      ),
      bgColor: 'bg-purple-50',
      borderColor: 'border-purple-200'
    },
    {
      title: 'Total Chat Messages',
      value: metrics?.metrics?.totalMessages ?? 0,
      icon: (
        <svg className="w-6 h-6 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
        </svg>
      ),
      bgColor: 'bg-indigo-50',
      borderColor: 'border-indigo-200'
    }
  ];

  return (
    <div className="space-y-6">
      {/* Header and Refresh */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-800">System Overview & Analytics</h2>
          <p className="text-sm text-gray-500">Live platform status and active provider routing</p>
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

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        {statCards.map((card, idx) => (
          <div
            key={idx}
            className={`p-5 rounded-2xl border ${card.borderColor} ${card.bgColor} bg-opacity-40 shadow-sm flex flex-col justify-between`}
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold uppercase tracking-wider text-gray-600">{card.title}</span>
              <div className="p-2 bg-white rounded-xl shadow-xs">{card.icon}</div>
            </div>
            <div className="text-3xl font-extrabold text-gray-900">{card.value}</div>
          </div>
        ))}
      </div>

      {/* Active Pipeline Architecture Banner */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-gray-100">
          <div>
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Active System Pipeline</span>
            <h3 className="text-lg font-bold text-gray-900 mt-0.5">
              {metrics?.activeProviders?.pipeline === 'versionA_realtime' ? (
                <span className="text-emerald-600 flex items-center space-x-2">
                  <span>⚡ Version A — Fastest MVP</span>
                  <span className="text-xs px-2.5 py-0.5 bg-emerald-100 text-emerald-800 rounded-full font-bold">Direct Speech-to-Speech</span>
                </span>
              ) : (
                <span className="text-blue-600 flex items-center space-x-2">
                  <span>🛠️ Version B — Maximum Control</span>
                  <span className="text-xs px-2.5 py-0.5 bg-blue-100 text-blue-800 rounded-full font-bold">Modular Multi-Stage</span>
                </span>
              )}
            </h3>
          </div>
          <div className="text-xs text-gray-500 max-w-sm">
            {metrics?.activeProviders?.pipeline === 'versionA_realtime'
              ? 'Real-time bidirectional audio streaming via GPT Realtime Speech-to-Speech.'
              : 'Multi-stage streaming pipeline: Streaming STT (Groq/Deepgram/NVIDIA/Azure) → Translation LLM (Groq/OpenRouter/NVIDIA/GPT/Azure) → Streaming TTS (ElevenLabs/NVIDIA/Azure/OpenAI).'}
          </div>
        </div>

        <h3 className="text-base font-bold text-gray-800 mt-6 mb-4 flex items-center space-x-2">
          <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
          </svg>
          <span>Active Provider Routing Status</span>
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="p-4 rounded-xl border border-gray-100 bg-gray-50 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase">Translation Service</p>
              <p className="text-sm font-bold text-gray-800 capitalize mt-1">
                {metrics?.activeProviders?.translation || 'Azure'}
              </p>
            </div>
            <span className="px-2 py-1 text-xs font-semibold rounded-full bg-emerald-100 text-emerald-800">Active</span>
          </div>

          <div className="p-4 rounded-xl border border-gray-100 bg-gray-50 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase">Voice Recognition (STT)</p>
              <p className="text-sm font-bold text-gray-800 capitalize mt-1">
                {metrics?.activeProviders?.stt || 'Azure'}
              </p>
            </div>
            <span className="px-2 py-1 text-xs font-semibold rounded-full bg-emerald-100 text-emerald-800">Active</span>
          </div>

          <div className="p-4 rounded-xl border border-gray-100 bg-gray-50 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase">Speech Synthesis (TTS)</p>
              <p className="text-sm font-bold text-gray-800 capitalize mt-1">
                {metrics?.activeProviders?.tts || 'Azure'}
              </p>
            </div>
            <span className="px-2 py-1 text-xs font-semibold rounded-full bg-emerald-100 text-emerald-800">Active</span>
          </div>

          <div className="p-4 rounded-xl border border-gray-100 bg-gray-50 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase">Video & Audio SFU</p>
              <p className="text-sm font-bold text-gray-800 capitalize mt-1">
                {metrics?.activeProviders?.sfu || 'LiveKit'}
              </p>
            </div>
            <span className="px-2 py-1 text-xs font-semibold rounded-full bg-emerald-100 text-emerald-800">Active</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OverviewTab;
