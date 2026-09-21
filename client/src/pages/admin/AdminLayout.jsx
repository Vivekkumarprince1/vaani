import React, { useState, useEffect, useContext, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { AuthContext } from '../../contexts/AuthContext';
import OverviewTab from './OverviewTab';
import ProvidersTab from './ProvidersTab';
import LiveRoomsTab from './LiveRoomsTab';
import UsersTab from './UsersTab';

const AdminLayout = () => {
  const navigate = useNavigate();
  const { user, isAdmin, isSuperAdmin } = useContext(AuthContext);
  const [activeTab, setActiveTab] = useState('overview');

  // Tab Data States
  const [metrics, setMetrics] = useState(null);
  const [configs, setConfigs] = useState(null);
  const [rooms, setRooms] = useState([]);
  const [users, setUsers] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const API_URL = import.meta.env.VITE_API_URL || '/api';

  // Fetch metrics
  const fetchMetrics = useCallback(async () => {
    try {
      setLoading(true);
      const res = await axios.get(`${API_URL}/admin/metrics`);
      setMetrics(res.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load metrics');
    } finally {
      setLoading(false);
    }
  }, [API_URL]);

  // Fetch provider configs
  const fetchConfigs = useCallback(async () => {
    try {
      setLoading(true);
      const res = await axios.get(`${API_URL}/admin/providers`);
      setConfigs(res.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load provider configs');
    } finally {
      setLoading(false);
    }
  }, [API_URL]);

  // Fetch live rooms
  const fetchRooms = useCallback(async () => {
    try {
      setLoading(true);
      const res = await axios.get(`${API_URL}/admin/rooms`);
      setRooms(res.data.rooms || []);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load rooms');
    } finally {
      setLoading(false);
    }
  }, [API_URL]);

  // Fetch users
  const fetchUsers = useCallback(async (search = '', role = '', page = 1) => {
    try {
      setLoading(true);
      const params = { search, role, page, limit: 15 };
      const res = await axios.get(`${API_URL}/admin/users`, { params });
      setUsers(res.data.users || []);
      setPagination(res.data.pagination);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load users');
    } finally {
      setLoading(false);
    }
  }, [API_URL]);

  // Load data according to active tab
  useEffect(() => {
    setError('');
    if (activeTab === 'overview') {
      fetchMetrics();
    } else if (activeTab === 'providers') {
      fetchConfigs();
    } else if (activeTab === 'rooms') {
      fetchRooms();
    } else if (activeTab === 'users') {
      fetchUsers();
    }
  }, [activeTab, fetchMetrics, fetchConfigs, fetchRooms, fetchUsers]);

  const navItems = [
    {
      id: 'overview',
      label: 'Overview & Metrics',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
        </svg>
      )
    },
    {
      id: 'providers',
      label: 'Providers & API Keys',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      )
    },
    {
      id: 'rooms',
      label: 'Live Calls & Rooms',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
      )
    },
    {
      id: 'users',
      label: 'User Management',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      )
    }
  ];

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Top Navbar */}
      <header className="bg-gradient-to-r from-gray-900 via-gray-800 to-gray-900 text-white h-16 px-4 sm:px-8 flex items-center justify-between shadow-md border-b border-gray-700">
        <div className="flex items-center space-x-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center font-black text-white shadow-sm">
            V
          </div>
          <div>
            <h1 className="text-base font-bold tracking-wide flex items-center space-x-2">
              <span>Vaani Control Center</span>
              <span
                className={`text-[10px] uppercase font-extrabold px-2 py-0.5 rounded-full ${
                  isSuperAdmin
                    ? 'bg-purple-500/20 text-purple-300 border border-purple-400/30'
                    : 'bg-amber-500/20 text-amber-300 border border-amber-400/30'
                }`}
              >
                {user?.role || 'Admin'}
              </span>
            </h1>
          </div>
        </div>

        <div className="flex items-center space-x-4">
          <button
            onClick={() => navigate('/dashboard')}
            className="flex items-center space-x-2 px-3.5 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-200 rounded-xl text-xs font-semibold border border-gray-700 transition"
          >
            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            <span>Back to Vaani App</span>
          </button>
        </div>
      </header>

      {/* Main Layout Body */}
      <div className="flex-1 flex flex-col md:flex-row max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 gap-6">
        {/* Sidebar Navigation */}
        <aside className="w-full md:w-64 flex-shrink-0">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-3 space-y-1">
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all ${
                  activeTab === item.id
                    ? 'bg-emerald-50 text-emerald-700 shadow-xs'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`}
              >
                <div className={activeTab === item.id ? 'text-emerald-600' : 'text-gray-400'}>
                  {item.icon}
                </div>
                <span>{item.label}</span>
              </button>
            ))}
          </div>

          <div className="mt-4 p-4 bg-emerald-50/60 rounded-2xl border border-emerald-100 text-xs text-emerald-900 space-y-1">
            <p className="font-bold">Vaani Platform v1.2</p>
            <p className="text-emerald-700">Dynamic Multi-Provider Engine & RBAC active.</p>
          </div>
        </aside>

        {/* Tab Content Panel */}
        <main className="flex-1 min-w-0">
          {error && (
            <div className="mb-4 p-4 bg-red-50 border border-red-200 text-red-800 rounded-2xl text-sm font-medium">
              ❌ {error}
            </div>
          )}

          {activeTab === 'overview' && (
            <OverviewTab
              metrics={metrics}
              loading={loading}
              onRefresh={fetchMetrics}
            />
          )}

          {activeTab === 'providers' && (
            <ProvidersTab
              configs={configs}
              isSuperAdmin={isSuperAdmin}
              onConfigUpdated={fetchConfigs}
            />
          )}

          {activeTab === 'rooms' && (
            <LiveRoomsTab
              rooms={rooms}
              loading={loading}
              onRefresh={fetchRooms}
            />
          )}

          {activeTab === 'users' && (
            <UsersTab
              users={users}
              pagination={pagination}
              loading={loading}
              isSuperAdmin={isSuperAdmin}
              currentUserId={user?._id || user?.id}
              onRefresh={() => fetchUsers()}
              onPageChange={(page) => fetchUsers('', '', page)}
              onSearch={(search, role) => fetchUsers(search, role, 1)}
            />
          )}
        </main>
      </div>
    </div>
  );
};

export default AdminLayout;
