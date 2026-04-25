import React, { useState, useRef, useEffect, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { LanguagePreferences } from './LanguagePreferences';
import { useTranslation } from '../contexts/TranslationContext';
import { AuthContext } from '../contexts/AuthContext';
import socketManager from '../utils/socketManager';
import notificationManager from '../utils/notificationManager';
import axios from 'axios';

const Header = ({ user, toggleSidebar, handleLanguageChange, onShowNotificationSettings }) => {
    const navigate = useNavigate();
    const { t, currentLanguage } = useTranslation();
    const { logout: authLogout } = useContext(AuthContext);
    const [showUserMenu, setShowUserMenu] = useState(false);
    const [showLanguageMenu, setShowLanguageMenu] = useState(false);
    const [notificationStatus, setNotificationStatus] = useState('default');
    const [languages, setLanguages] = useState([]);
    const [loadingLanguages, setLoadingLanguages] = useState(false);
    const menuRef = useRef(null);
    const languageMenuRef = useRef(null);

    const logout = async (token) => {
        // Cleanup socket connection and notify server
        socketManager.handleLogout();
        
        // Call AuthContext logout to clear state and call backend API
        await authLogout();

        localStorage.removeItem('token');
        delete axios.defaults.headers.common['x-auth-token'];
        
        // Navigate to login
        navigate('/login');
    };

    // Close menu when clicking outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (menuRef.current && !menuRef.current.contains(event.target)) {
                setShowUserMenu(false);
            }
            if (languageMenuRef.current && !languageMenuRef.current.contains(event.target)) {
                setShowLanguageMenu(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Check notification permission on mount
    useEffect(() => {
        if (typeof window !== 'undefined') {
            setNotificationStatus(notificationManager.getPermissionStatus());
        }
    }, []);

    // Fetch languages on mount for mobile menu
    useEffect(() => {
        const fetchLanguages = async () => {
            try {
                const API_URL = import.meta.env.VITE_API_URL || '/api';
                const response = await axios.get(`${API_URL}/translator/languages`);
                const formattedLanguages = Object.entries(response.data).map(([code, details]) => ({
                    value: code,
                    label: details.name,
                    nativeName: details.nativeName
                }));
                setLanguages(formattedLanguages);
            } catch (error) {
                console.error('Error fetching languages:', error);
            }
        };

        fetchLanguages();
    }, []);

    return (
        <header className="fixed top-0 left-0 right-0 bg-gradient-to-r from-emerald-600 to-emerald-500 text-white z-30 h-16 flex items-center justify-between px-3 sm:px-6 shadow-lg border-b border-emerald-700">
            {/* Left section - Logo and Sidebar toggle */}
            <div className="flex items-center space-x-2 sm:space-x-4 min-w-0 flex-shrink-0">
                <button
                    className="lg:hidden p-2 hover:bg-emerald-700 rounded-lg transition-all duration-200 hover:scale-110 active:scale-95"
                    onClick={toggleSidebar}
                    aria-label={t('toggleSidebar')}
                >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                    </svg>
                </button>
                <div className="flex items-center space-x-2">
                    {/* <div className="w-8 h-8 rounded-full bg-white bg-opacity-20 flex items-center justify-center text-lg font-bold backdrop-blur-sm">
                        <span>V</span>
                    </div> */}
                    <h1 className="hidden sm:block text-lg font-bold tracking-wider">{t('welcome')}</h1>
                </div>
            </div>

            {/* Middle section - Empty for now, can add search or other elements */}
            <div className="flex-1"></div>

            {/* Right section - Controls */}
            <div className="flex items-center justify-end space-x-1 sm:space-x-3 flex-shrink-0">
                {/* Desktop Language Selector */}
                <div className="hidden sm:block">
                    <LanguagePreferences
                        selectedLanguage={currentLanguage}
                        onLanguageChange={handleLanguageChange}
                    />
                </div>

                {/* Mobile Language Selector - Beautiful Dropdown */}
                <div className="sm:hidden relative" ref={languageMenuRef}>
                    <button 
                        className="relative p-2.5 hover:bg-emerald-700 rounded-lg transition-all duration-200 hover:scale-110 active:scale-95 group"
                        onClick={() => setShowLanguageMenu(!showLanguageMenu)}
                        title="Change language"
                    >
                        <svg className="w-5 h-5 transition-transform group-hover:scale-110" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" />
                        </svg>
                        <span className="absolute bottom-0 right-0 w-2 h-2 bg-yellow-300 rounded-full animate-pulse"></span>
                    </button>

                    {/* Language Dropdown Menu */}
                    {showLanguageMenu && (
                        <div className="absolute top-full right-0 mt-2 w-56 bg-white text-gray-800 rounded-xl shadow-2xl z-50 overflow-hidden border border-gray-100 animate-in fade-in slide-in-from-top-2">
                            {/* Header */}
                            <div className="bg-gradient-to-r from-emerald-600 to-emerald-500 text-white px-4 py-3 font-semibold text-sm flex items-center space-x-2">
                                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                                </svg>
                                <span>{t('selectLanguage') || 'Select Language'}</span>
                            </div>

                            {/* Language List */}
                            <div className="max-h-64 overflow-y-auto">
                                {languages.length > 0 ? (
                                    languages.map((lang) => (
                                        <button
                                            key={lang.value}
                                            onClick={() => {
                                                handleLanguageChange(lang.value);
                                                setShowLanguageMenu(false);
                                            }}
                                            className={`w-full text-left px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors border-b border-gray-100 last:border-b-0 ${
                                                currentLanguage === lang.value ? 'bg-emerald-50 border-l-4 border-l-emerald-600' : ''
                                            }`}
                                        >
                                            <div className="flex flex-col">
                                                <span className="font-medium text-sm">{lang.label}</span>
                                                <span className="text-xs text-gray-500">{lang.nativeName}</span>
                                            </div>
                                            {currentLanguage === lang.value && (
                                                <svg className="w-5 h-5 text-emerald-600" fill="currentColor" viewBox="0 0 20 20">
                                                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                                </svg>
                                            )}
                                        </button>
                                    ))
                                ) : (
                                    <div className="px-4 py-4 text-center text-sm text-gray-500">
                                        {t('loading') || 'Loading languages...'}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* Notification Bell Icon */}
                {onShowNotificationSettings && (
                    <button
                        onClick={onShowNotificationSettings}
                        className="relative p-2.5 hover:bg-emerald-700 rounded-lg transition-all duration-200 hover:scale-110 active:scale-95"
                        title={notificationStatus === 'granted' ? 'Notifications enabled' : 'Enable notifications'}
                    >
                        <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                        </svg>
                        {notificationStatus === 'granted' && (
                            <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 bg-green-400 rounded-full border-2 border-white animate-pulse"></span>
                        )}
                        {notificationStatus === 'default' && (
                            <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 bg-yellow-300 rounded-full border-2 border-white animate-pulse"></span>
                        )}
                        {notificationStatus === 'denied' && (
                            <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 bg-red-400 rounded-full border-2 border-white"></span>
                        )}
                    </button>
                )}

                {/* Desktop User Section */}
                <div className="hidden sm:flex items-center space-x-4 pl-4 border-l border-emerald-700">
                    <div className="flex items-center space-x-3">
                        <div className="w-9 h-9 rounded-full bg-emerald-700 bg-opacity-20 flex items-center justify-center text-sm font-bold backdrop-blur-sm hover:bg-opacity-30 transition-all">
                            {user?.username?.[0]?.toUpperCase()}
                        </div>
                        <div className="hidden sm:block">
                            <p className="text-sm font-medium">{user?.username}</p>
                            <p className="text-xs text-emerald-100">Online</p>
                        </div>
                    </div>
                    <button 
                        onClick={logout}
                        className="px-3 py-1.5 bg-red-500 hover:bg-red-600 active:bg-red-700 rounded-lg text-xs sm:text-sm font-semibold transition-all duration-200 flex items-center space-x-1.5 shadow-md hover:shadow-lg transform hover:scale-105 active:scale-95"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                        </svg>
                        <span className="hidden md:inline">{t('logout')}</span>
                    </button>
                </div>

                {/* Mobile User Menu */}
                <div className="sm:hidden relative" ref={menuRef}>
                    <button
                        onClick={() => setShowUserMenu(!showUserMenu)}
                        className="w-9 h-9 rounded-full bg-emerald-700 bg-opacity-20 flex items-center justify-center text-sm font-bold hover:bg-opacity-30 transition-all hover:scale-110 active:scale-95 backdrop-blur-sm"
                    >
                        {user?.username?.[0]?.toUpperCase()}
                    </button>

                    {/* User Dropdown Menu */}
                    {showUserMenu && (
                        <div className="absolute right-0 mt-2 w-56 bg-white text-gray-800 rounded-xl shadow-2xl z-50 overflow-hidden border border-gray-100 animate-in fade-in slide-in-from-top-2">
                            {/* User Info Header */}
                            <div className="bg-gradient-to-r from-emerald-600 to-emerald-500 text-white px-4 py-3">
                                <div className="flex items-center space-x-3">
                                    <div className="w-10 h-10 rounded-full bg-white bg-opacity-20 flex items-center justify-center text-lg font-bold">
                                        {user?.username?.[0]?.toUpperCase()}
                                    </div>
                                    <div>
                                        <p className="font-semibold text-sm">{user?.username}</p>
                                        <p className="text-xs text-emerald-100">Active now</p>
                                    </div>
                                </div>
                            </div>

                            {/* Menu Items */}
                            <div className="py-1">
                                <button
                                    onClick={logout}
                                    className="w-full text-left px-4 py-3 text-sm text-red-600 hover:bg-red-50 flex items-center space-x-3 border-t border-gray-100 transition-colors font-medium"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                                    </svg>
                                    <span>{t('logout')}</span>
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </header>
    );
};

export default Header;