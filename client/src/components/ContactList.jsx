
import React, { useState, useCallback, useEffect } from 'react';
import axios from 'axios';
import { useTranslation } from '../contexts/TranslationContext';
import socketManager from '../utils/socketManager';

const API_URL = import.meta.env.VITE_API_URL || '/api';

const ContactList = ({
    users,
    rooms,
    selectedUser,
    selectedRoom,
    selectUser,
    selectRoom,
    createRoom,
    showSidebar,
    onManageGroup,
    user,
    onAddContact,
    unreadByContact = {},
    unreadByRoom = {},
    onInstantMeetingJoin,
}) => {
    const { t } = useTranslation();

    // Tabs state: show groups or contacts
    const [showGroups, setShowGroups] = useState(false);

    // Instant meeting state
    const [showMeetingModal, setShowMeetingModal] = useState(false);
    const [meetingName, setMeetingName] = useState('');
    const [meetingLink, setMeetingLink] = useState(null);
    const [meetingData, setMeetingData] = useState(null);
    const [meetingLoading, setMeetingLoading] = useState(false);
    const [meetingLinkCopied, setMeetingLinkCopied] = useState(false);

    // Prevent body scroll when modal is open
    useEffect(() => {
        if (showMeetingModal) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = 'unset';
        }
        return () => {
            document.body.style.overflow = 'unset';
        };
    }, [showMeetingModal]);

    const handleStartMeeting = useCallback(async () => {
        setMeetingLoading(true);
        try {
            const token = localStorage.getItem('token');
            const res = await axios.post(
                `${API_URL}/chat/instant-meeting`,
                { meetingName: meetingName.trim() || undefined, callType: 'video' },
                { headers: { 'x-auth-token': token } }
            );
            const full = `${window.location.origin}${res.data.joinLink}`;
            setMeetingLink(full);
            setMeetingData(res.data);
        } catch (err) {
            alert(err.response?.data?.message || 'Failed to create meeting');
        } finally {
            setMeetingLoading(false);
        }
    }, [meetingName]);

    const handleCopyMeetingLink = useCallback(() => {
        if (!meetingLink) return;
        navigator.clipboard.writeText(meetingLink).catch(() => {
            const el = document.createElement('textarea');
            el.value = meetingLink;
            document.body.appendChild(el);
            el.select();
            document.execCommand('copy');
            document.body.removeChild(el);
        });
        setMeetingLinkCopied(true);
        setTimeout(() => setMeetingLinkCopied(false), 2000);
    }, [meetingLink]);

    const handleJoinOwnMeeting = useCallback(() => {
        if (!meetingData) return;
        setShowMeetingModal(false);
        setMeetingLink(null);
        setMeetingData(null);
        setMeetingName('');
        onInstantMeetingJoin?.({
            callId: meetingData.callId,
            callRoomId: meetingData.callRoomId,
            roomId: meetingData.roomId,
            roomName: meetingData.roomName,
            callType: meetingData.callType,
        });
    }, [meetingData, onInstantMeetingJoin]);

    const handleCloseMeetingModal = () => {
        setShowMeetingModal(false);
        setMeetingLink(null);
        setMeetingData(null);
        setMeetingName('');
        setMeetingLoading(false);
    };

    // Helper function to format last seen time
    const formatLastSeen = (lastSeen) => {
        if (!lastSeen) return '';
        
        const date = new Date(lastSeen);
        const now = new Date();
        const diffInMinutes = Math.floor((now - date) / (1000 * 60));
        
        if (diffInMinutes < 1) return 'Just now';
        if (diffInMinutes < 60) return `${diffInMinutes} min ago`;
        if (diffInMinutes < 1440) return `${Math.floor(diffInMinutes / 60)} hours ago`;
        if (diffInMinutes < 10080) return `${Math.floor(diffInMinutes / 1440)} days ago`;
        return date.toLocaleDateString();
    };

    return (
        <aside className={`fixed lg:static w-80 bg-white h-full z-20 transform transition-transform duration-300 ease-in-out ${showSidebar ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'} shadow-lg`}>
            <div className="flex flex-col h-full">
                <div className="p-4 bg-gray-50 border-b">
                    {/* Tabs: Contacts / Groups */}
                    <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                            <button
                                className={`px-3 py-1 rounded-md text-sm font-semibold ${!showGroups ? 'text-gray-800' : 'text-gray-500'}`}
                                onClick={() => setShowGroups(false)}
                            >
                                {t('contacts')}
                            </button>
                            <button
                                className={`px-3 py-1 rounded-md text-sm font-semibold ${showGroups ? 'text-gray-800' : 'text-gray-500'}`}
                                onClick={() => setShowGroups(true)}
                            >
                                {t('groups')}
                            </button>
                        </div>
                        <div className="flex items-center gap-2">
                            {/* Mobile: New Meeting button */}
                            <button 
                                className="lg:hidden w-9 h-9 bg-indigo-600 text-white rounded-full flex items-center justify-center hover:bg-indigo-700 transition-colors shadow-md hover:shadow-lg transform hover:scale-105 active:scale-95"
                                onClick={() => setShowMeetingModal(true)}
                                title="New Meeting"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 002 2v8a2 2 0 002 2z" />
                                </svg>
                            </button>
                            {/* Create group button only shown on Groups tab */}
                            {showGroups ? (
                                <button 
                                    className="w-9 h-9 bg-emerald-600 text-white rounded-full flex items-center justify-center hover:bg-emerald-700 transition-colors shadow-md hover:shadow-lg transform hover:scale-105 active:scale-95"
                                    onClick={createRoom}
                                    title="Create group"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                    </svg>
                                </button>
                            ) : (
                                <button 
                                    className="w-9 h-9 bg-blue-600 text-white rounded-full flex items-center justify-center hover:bg-blue-700 transition-colors shadow-md hover:shadow-lg transform hover:scale-105 active:scale-95"
                                    onClick={onAddContact}
                                    title="Add Contact"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                                    </svg>
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto">
                    {/* Search bar */}
                    <div className="p-3">
                        <div className="relative">
                            <input
                                type="text"
                                placeholder="Search..."
                                className="w-full pl-10 pr-4 py-2 bg-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                            />
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-400 absolute left-3 top-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                            </svg>
                        </div>
                    </div>

                    {/* Conditional: show Contacts or Groups */}
                    {!showGroups ? (
                        <div className="px-2">
                            <ul className="space-y-0.5">
                                {users.map(contact => {
                                    const contactId = String(contact.id || contact._id || '');
                                    const currentUserId = String(user?.id || user?._id || '');
                                    const isSelf = contactId !== '' && currentUserId !== '' && contactId === currentUserId;

                                    const displayStatus = isSelf ? (socketManager.isSocketConnected() ? 'online' : 'offline') : (contact.status || 'offline');
                                    const lastSeen = contact.lastSeen || contact.lastActive || contact.last_activity;
                                    const unreadCount = unreadByContact[contactId] || 0;

                                    return (
                                    <li
                                        key={contact.id || contact._id}
                                        className={`flex items-center p-3 rounded-xl cursor-pointer transition-all duration-200 hover:bg-gray-100 ${
                                            selectedUser?.id === contact.id ? 'bg-emerald-50 hover:bg-emerald-100' : ''
                                        }`}
                                        onClick={() => selectUser(contact)}
                                    >
                                        <div className="relative">
                                            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 text-white flex items-center justify-center text-lg font-semibold shadow-md">
                                                {contact.avatar}
                                            </div>
                                            {unreadCount > 0 && (
                                                <div className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center shadow-lg">
                                                    {unreadCount > 9 ? '9+' : unreadCount}
                                                </div>
                                            )}
                                        </div>
                                        <div className="ml-3 flex-1">
                                            <div className="flex items-center justify-between">
                                                <div className="font-semibold text-gray-900">{contact.name}</div>
                                                <div className="text-xs text-gray-500">
                                                    {displayStatus === 'online' ? t('online') : formatLastSeen(lastSeen)}
                                                </div>
                                            </div>
                                            <div className="text-sm text-gray-500 flex items-center space-x-1">
                                                {displayStatus === 'online' ? (
                                                    <>
                                                        <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                                                        <span>{t('online')}</span>
                                                    </>
                                                ) : (
                                                    <>
                                                        <span className="w-2 h-2 bg-gray-300 rounded-full"></span>
                                                        <span>{t('offline')}</span>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    </li>
                                    );
                                })}
                            </ul>
                        </div>
                    ) : (
                        <div className="px-2 mt-4">
                            <ul className="space-y-0.5">
                                {rooms.map(room => {
                                    const isAdmin = room.admins?.some(admin => 
                                        admin.toString() === user?.id || admin._id?.toString() === user?.id
                                    );
                                    const unreadCount = unreadByRoom[room._id] || 0;

                                    return (
                                    <li
                                        key={room._id}
                                        className={`flex items-center p-3 rounded-xl cursor-pointer transition-all duration-200 hover:bg-gray-100 ${
                                            selectedRoom?._id === room._id ? 'bg-emerald-50 hover:bg-emerald-100' : ''
                                        }`}
                                        onClick={() => selectRoom(room)}
                                    >
                                        <div className="relative">
                                            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 text-white flex items-center justify-center text-lg font-semibold shadow-md">
                                                {room.name?.[0]?.toUpperCase() || 'G'}
                                            </div>
                                            {unreadCount > 0 && (
                                                <div className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center shadow-lg">
                                                    {unreadCount > 9 ? '9+' : unreadCount}
                                                </div>
                                            )}
                                        </div>
                                        <div className="ml-3 flex-1">
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-2">
                                                    <div className="font-semibold text-gray-900">{room.name}</div>
                                                    {isAdmin && (
                                                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                                            Admin
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="flex items-center space-x-2">
                                                    <div className="text-xs text-gray-500">{formatLastSeen(room.lastActivity)}</div>
                                                    {isAdmin && (
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            onManageGroup(room);
                                                        }}
                                                        className="text-gray-500 hover:text-gray-700 p-2 rounded-full hover:bg-gray-200 transition-colors bg-red-100"
                                                        title="Manage group"
                                                    >
                                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                                        </svg>
                                                    </button>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="text-sm text-gray-500">{room.participants?.length || 0} members</div>
                                        </div>
                                    </li>
                                    );
                                })}
                            </ul>
                        </div>
                    )}
                </div>

                {/* Floating "Start Meeting" button - desktop only */}
                <div className="hidden lg:block p-4 border-t border-gray-100">
                    <button
                        onClick={() => setShowMeetingModal(true)}
                        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-medium text-sm transition-colors shadow-md"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                        New Meeting
                    </button>
                </div>
            </div>

            {/* Instant Meeting Modal */}
            {showMeetingModal && (
                <div className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-black bg-opacity-40 lg:bg-opacity-60 overflow-hidden">
                    <div className="bg-white rounded-3xl shadow-2xl w-full sm:max-w-sm max-h-[95vh] overflow-hidden flex flex-col">
                        {/* Header */}
                        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
                            <div className="flex items-center gap-2">
                                <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                    </svg>
                                </div>
                                <h2 className="text-base font-semibold text-gray-800">New Meeting</h2>
                            </div>
                            <button onClick={handleCloseMeetingModal} className="text-gray-400 hover:text-gray-600 transition-colors flex-shrink-0">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        <div className="p-6 overflow-y-auto flex-1">
                            {!meetingLink ? (
                                /* Step 1 — name + create */
                                <>
                                    <p className="text-sm text-gray-500 mb-4">Create an instant meeting and share the link with anyone.</p>
                                    <div className="mb-4">
                                        <label className="block text-xs font-medium text-gray-600 mb-1">Meeting name (optional)</label>
                                        <input
                                            type="text"
                                            value={meetingName}
                                            onChange={e => setMeetingName(e.target.value)}
                                            onKeyDown={e => e.key === 'Enter' && !meetingLoading && handleStartMeeting()}
                                            placeholder={`Meeting by ${user?.username || 'me'}`}
                                            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                                            autoFocus
                                        />
                                    </div>
                                    <button
                                        onClick={handleStartMeeting}
                                        disabled={meetingLoading}
                                        className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white rounded-xl font-medium text-sm transition-colors flex items-center justify-center gap-2"
                                    >
                                        {meetingLoading ? (
                                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                        ) : (
                                            <>
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                                                </svg>
                                                Create Meeting
                                            </>
                                        )}
                                    </button>
                                </>
                            ) : (
                                /* Step 2 — share link */
                                <>
                                    <p className="text-sm text-gray-500 mb-3">Share this link with people you want to meet with.</p>

                                    {/* Link box */}
                                    <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 mb-4">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                                        </svg>
                                        <span className="text-xs text-gray-700 truncate flex-1 select-all">{meetingLink}</span>
                                        <button
                                            onClick={handleCopyMeetingLink}
                                            className={`flex-shrink-0 text-xs font-medium px-2 py-1 rounded-md transition-colors ${meetingLinkCopied ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-200 hover:bg-gray-300 text-gray-600'}`}
                                        >
                                            {meetingLinkCopied ? 'Copied!' : 'Copy'}
                                        </button>
                                    </div>

                                    {/* Action buttons */}
                                    <button
                                        onClick={handleJoinOwnMeeting}
                                        className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-medium text-sm transition-colors flex items-center justify-center gap-2 mb-2"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 002 2v8a2 2 0 002 2z" />
                                        </svg>
                                        Start Meeting Now
                                    </button>
                                    <button
                                        onClick={handleCloseMeetingModal}
                                        className="w-full py-2 text-gray-500 hover:text-gray-700 text-sm transition-colors"
                                    >
                                        Share later
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </aside>
    );
};

// Memoized: ContactList renders the full contact/room sidebar and is expensive.
// Dashboard re-renders frequently (caption/call/typing state); memo keeps the
// sidebar from re-rendering unless its own props actually change. Note: this
// only pays off once the callbacks Dashboard passes are stabilized (useCallback).
export default React.memo(ContactList);