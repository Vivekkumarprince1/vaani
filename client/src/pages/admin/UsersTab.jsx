import React, { useState } from 'react';
import axios from 'axios';

const UsersTab = ({ users, pagination, loading, isSuperAdmin, currentUserId, onRefresh, onPageChange, onSearch }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [actionLoading, setActionLoading] = useState({});
  const [actionError, setActionError] = useState('');

  const API_URL = import.meta.env.VITE_API_URL || '/api';

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    onSearch(searchTerm, roleFilter);
  };

  const handleRoleChange = async (userId, newRole) => {
    setActionLoading(prev => ({ ...prev, [userId]: true }));
    setActionError('');
    try {
      await axios.patch(`${API_URL}/admin/users/${userId}/role`, { role: newRole });
      if (onRefresh) onRefresh();
    } catch (err) {
      setActionError(err.response?.data?.error || 'Failed to update user role');
    } finally {
      setActionLoading(prev => ({ ...prev, [userId]: false }));
    }
  };

  const handleStatusToggle = async (userId, currentActive) => {
    setActionLoading(prev => ({ ...prev, [userId]: true }));
    setActionError('');
    try {
      await axios.patch(`${API_URL}/admin/users/${userId}/status`, { isActive: !currentActive });
      if (onRefresh) onRefresh();
    } catch (err) {
      setActionError(err.response?.data?.error || 'Failed to update user status');
    } finally {
      setActionLoading(prev => ({ ...prev, [userId]: false }));
    }
  };

  return (
    <div className="space-y-6">
      {/* Search & Filter Header */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
        <form onSubmit={handleSearchSubmit} className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by username or mobile number..."
              className="w-full pl-10 pr-4 py-2 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
            <svg className="w-4 h-4 text-gray-400 absolute left-3.5 top-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>

          <select
            value={roleFilter}
            onChange={(e) => {
              setRoleFilter(e.target.value);
              onSearch(searchTerm, e.target.value);
            }}
            className="px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            <option value="">All Roles</option>
            <option value="user">User</option>
            <option value="admin">Admin</option>
            <option value="superadmin">Superadmin</option>
          </select>

          <button
            type="submit"
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-semibold shadow-xs transition"
          >
            Filter
          </button>
        </form>
      </div>

      {actionError && (
        <div className="p-3.5 bg-red-50 border border-red-200 text-red-800 rounded-xl text-sm font-medium">
          ❌ {actionError}
        </div>
      )}

      {/* Users Table */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center p-12">
            <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-gray-600">
              <thead className="bg-gray-50 text-gray-700 uppercase font-semibold text-xs border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3.5">User</th>
                  <th className="px-6 py-3.5">Mobile Number</th>
                  <th className="px-6 py-3.5">Role</th>
                  <th className="px-6 py-3.5">Presence</th>
                  <th className="px-6 py-3.5">Account Status</th>
                  <th className="px-6 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {users && users.length > 0 ? (
                  users.map((u) => {
                    const isSelf = String(u._id) === String(currentUserId);
                    const isLoading = actionLoading[u._id];

                    return (
                      <tr key={u._id} className="hover:bg-gray-50/70 transition">
                        <td className="px-6 py-4">
                          <div className="flex items-center space-x-3">
                            <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-800 font-bold flex items-center justify-center text-xs">
                              {u.username?.[0]?.toUpperCase()}
                            </div>
                            <div>
                              <p className="font-bold text-gray-900">{u.username}</p>
                              <p className="text-[11px] text-gray-400">Lang: {u.preferredLanguage || 'en'}</p>
                            </div>
                          </div>
                        </td>

                        <td className="px-6 py-4 font-mono text-gray-800">
                          {u.mobileNumber}
                        </td>

                        <td className="px-6 py-4">
                          <span
                            className={`px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                              u.role === 'superadmin'
                                ? 'bg-purple-100 text-purple-800 border border-purple-200'
                                : u.role === 'admin'
                                ? 'bg-amber-100 text-amber-800 border border-amber-200'
                                : 'bg-gray-100 text-gray-700'
                            }`}
                          >
                            {u.role || 'user'}
                          </span>
                        </td>

                        <td className="px-6 py-4">
                          <span
                            className={`inline-flex items-center space-x-1.5 px-2 py-0.5 rounded-md text-xs font-semibold ${
                              u.status === 'online'
                                ? 'text-emerald-700 bg-emerald-50'
                                : 'text-gray-500 bg-gray-50'
                            }`}
                          >
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${
                                u.status === 'online' ? 'bg-emerald-500' : 'bg-gray-400'
                              }`}
                            ></span>
                            <span className="capitalize">{u.status || 'offline'}</span>
                          </span>
                        </td>

                        <td className="px-6 py-4">
                          <span
                            className={`px-2 py-0.5 rounded-md text-xs font-semibold ${
                              u.isActive !== false
                                ? 'bg-green-50 text-green-700 border border-green-200'
                                : 'bg-red-50 text-red-700 border border-red-200'
                            }`}
                          >
                            {u.isActive !== false ? 'Active' : 'Suspended'}
                          </span>
                        </td>

                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end space-x-2">
                            {/* Role Dropdown */}
                            <select
                              disabled={isSelf || isLoading || (!isSuperAdmin && u.role === 'superadmin')}
                              value={u.role || 'user'}
                              onChange={(e) => handleRoleChange(u._id, e.target.value)}
                              className="text-xs bg-gray-50 border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:opacity-50"
                            >
                              <option value="user">User</option>
                              <option value="admin">Admin</option>
                              {isSuperAdmin && <option value="superadmin">Superadmin</option>}
                            </select>

                            {/* Suspend/Activate Toggle */}
                            {!isSelf && (
                              <button
                                onClick={() => handleStatusToggle(u._id, u.isActive !== false)}
                                disabled={isLoading}
                                className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition ${
                                  u.isActive !== false
                                    ? 'text-red-600 hover:bg-red-50'
                                    : 'text-emerald-600 hover:bg-emerald-50'
                                }`}
                              >
                                {u.isActive !== false ? 'Suspend' : 'Activate'}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan="6" className="px-6 py-8 text-center text-gray-400">
                      No users found matching your search.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {pagination && pagination.totalPages > 1 && (
          <div className="px-6 py-3.5 bg-gray-50 border-t border-gray-200 flex items-center justify-between text-xs text-gray-500">
            <span>
              Showing page {pagination.page} of {pagination.totalPages} ({pagination.total} users)
            </span>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => onPageChange(pagination.page - 1)}
                disabled={pagination.page <= 1}
                className="px-3 py-1 bg-white border border-gray-200 rounded-lg disabled:opacity-50 hover:bg-gray-100 transition"
              >
                Previous
              </button>
              <button
                onClick={() => onPageChange(pagination.page + 1)}
                disabled={pagination.page >= pagination.totalPages}
                className="px-3 py-1 bg-white border border-gray-200 rounded-lg disabled:opacity-50 hover:bg-gray-100 transition"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default UsersTab;
