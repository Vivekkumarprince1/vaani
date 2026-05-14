
import React, { useRef, useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import socketManager from '../utils/socketManager';
import { useTranslation } from '../contexts/TranslationContext';
import CallButtons from './CallButtons';
import { uploadMedia, getMediaCategory, formatFileSize } from '../utils/uploadMedia';

const API_URL = import.meta.env.VITE_API_URL || '/api';

const MessageBubble = React.memo(({
    msg,
    isCurrentUser,
    messageId,
    translatedMessage,
    displayContent,
    isTranslated,
    isTranslating,
    formatTime
}) => {
    const isPdf = msg.media?.mimeType === 'application/pdf' || 
                  msg.media?.filename?.toLowerCase().endsWith('.pdf') || 
                  msg.media?.url?.toLowerCase()?.includes('.pdf');
    const isImage = (msg.media?.resourceType === 'image' || msg.media?.mimeType?.startsWith('image/')) && !isPdf;
    const isVideo = msg.media?.resourceType === 'video' && msg.media?.mimeType?.startsWith('video/');
    const isAudio = (msg.media?.resourceType === 'video' && msg.media?.mimeType?.startsWith('audio/')) || msg.media?.mimeType?.startsWith('audio/');
    
    const mediaDataUrl = msg.media?.data ? `data:${msg.media.mimeType};base64,${msg.media.data}` : null;
    const mediaUrl = msg.media?.url || mediaDataUrl;

    return (
        <div
            data-message-id={messageId}
            className={`flex ${isCurrentUser ? 'justify-end' : 'justify-start'} px-1`}
        >
            <div
                className={`max-w-[85%] sm:max-w-[70%] rounded-2xl px-3 sm:px-4 py-2 sm:py-3 ${isCurrentUser
                    ? 'bg-emerald-500 text-white rounded-br-none'
                    : 'bg-white text-gray-800 rounded-bl-none'
                    } shadow-md hover:shadow-lg transition-shadow duration-200`}
            >
                {/* Media display */}
                {msg.media && (
                    <div className="mb-2 w-full max-w-sm">
                        {/* Image */}
                        {isImage ? (
                            <img
                                src={mediaUrl}
                                alt={msg.media.filename || "shared media"}
                                className="w-full h-auto rounded-lg object-cover cursor-pointer hover:opacity-90 transition-opacity"
                                onClick={() => window.open(mediaUrl, '_blank')}
                                title="Click to view full size"
                            />
                        ) : 
                        /* Video */
                        isVideo ? (
                            <div className="relative rounded-lg overflow-hidden bg-black/10">
                                <video 
                                    src={mediaUrl} 
                                    controls 
                                    className="w-full max-h-64 object-contain"
                                    preload="metadata"
                                />
                            </div>
                        ) :
                        /* Audio */
                        isAudio ? (
                            <div className={`flex flex-col gap-2 p-3 rounded-lg ${
                                isCurrentUser ? 'bg-emerald-600/50' : 'bg-gray-100'
                            }`}>
                                <div className="flex items-center gap-3">
                                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                                        isCurrentUser ? 'bg-emerald-500 text-white' : 'bg-gray-200 text-gray-600'
                                    }`}>
                                        <svg className="w-5 h-5 ml-1" fill="currentColor" viewBox="0 0 20 20">
                                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                                        </svg>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <audio src={mediaUrl} controls className="w-full h-8 outline-none" />
                                    </div>
                                </div>
                                <div className="text-[10px] opacity-70 truncate px-1">
                                    {msg.media.filename} • {formatFileSize(msg.media.size)}
                                </div>
                            </div>
                        ) : 
                        /* PDF */
                        isPdf ? (
                            <div className="flex flex-col gap-2">
                                {msg.media.resourceType === 'image' && msg.media.url && (
                                    <div 
                                        className="w-full h-40 bg-gray-100 rounded-lg overflow-hidden border border-gray-200 cursor-pointer hover:opacity-90 transition-opacity"
                                        onClick={() => window.open(mediaUrl, '_blank')}
                                    >
                                        <img 
                                            src={msg.media.url.replace('/upload/', '/upload/w_400,h_500,c_fill,pg_1,f_auto,q_auto/')} 
                                            alt="PDF Preview" 
                                            className="w-full h-full object-cover"
                                            onError={(e) => e.target.style.display = 'none'}
                                        />
                                    </div>
                                )}
                                <div
                                    className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors ${
                                        isCurrentUser ? 'bg-red-500/10 hover:bg-red-500/20' : 'bg-red-50 hover:bg-red-100'
                                    } border border-red-100`}
                                    onClick={() => window.open(mediaUrl, '_blank')}
                                >
                                    <div className={`p-2 rounded-lg ${isCurrentUser ? 'bg-red-500 text-white' : 'bg-red-100 text-red-600'}`}>
                                        <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                                            <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
                                        </svg>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="text-sm font-medium truncate">{msg.media.filename}</div>
                                        <div className={`text-xs mt-0.5 ${isCurrentUser ? 'text-emerald-100' : 'text-gray-500'}`}>
                                            PDF • {formatFileSize(msg.media.size)}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ) : 
                        /* PPTX / Office / Other Document */
                        (
                            <a
                                href={mediaUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={`flex items-center gap-3 p-3 rounded-lg transition-colors ${
                                    isCurrentUser ? 'bg-black/10 hover:bg-black/20' : 'bg-gray-100 hover:bg-gray-200'
                                }`}
                            >
                                <div className={`p-2 rounded-lg ${isCurrentUser ? 'bg-white/20 text-white' : 'bg-white text-gray-500'}`}>
                                    <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                                        <path fillRule="evenodd" d="M8 4a3 3 0 00-3 3v4a5 5 0 0010 0V7a1 1 0 112 0v4a7 7 0 11-14 0V7a5 5 0 0110 0v4a3 3 0 11-6 0V7a1 1 0 012 0v4a1 1 0 102 0V7a3 3 0 00-3-3z" clipRule="evenodd" />
                                    </svg>
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="text-sm font-medium truncate">{msg.media.filename}</div>
                                    <div className={`text-xs mt-0.5 ${isCurrentUser ? 'text-emerald-100' : 'text-gray-500'}`}>
                                        {formatFileSize(msg.media.size)}
                                    </div>
                                </div>
                            </a>
                        )
}
                    </div>
                )}

                {/* Translation indicator */}
                {isTranslated && !isCurrentUser && (
                    <div className="flex items-center space-x-1 text-xs text-blue-600 mb-1 font-medium">
                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M7 2a1 1 0 011 1v1h3a1 1 0 110 2H9.578a18.87 18.87 0 01-1.724 4.78c.29.354.596.696.914 1.026a1 1 0 11-1.44 1.389c-.188-.196-.373-.396-.554-.6a19.098 19.098 0 01-3.107 3.567 1 1 0 01-1.334-1.49 17.087 17.087 0 003.13-3.733 18.992 18.992 0 01-1.487-2.494 1 1 0 111.79-.89c.234.47.489.928.764 1.372.417-.934.752-1.913.997-2.927H3a1 1 0 110-2h3V3a1 1 0 011-1zm6 6a1 1 0 01.894.553l2.991 5.982a.869.869 0 01.02.037l.99 1.98a1 1 0 11-1.79.895L15.383 16h-4.764l-.724 1.447a1 1 0 11-1.788-.894l.99-1.98.019-.038 2.99-5.982A1 1 0 0113 8zm-1.382 6h2.764L13 11.236 11.618 14z" clipRule="evenodd" />
                        </svg>
                        <span>Translated</span>
                    </div>
                )}

                {/* Text message content */}
                {msg.content && (
                    <div className="break-words text-sm sm:text-[15px] leading-relaxed whitespace-pre-wrap">
                        {isTranslated ? displayContent : msg.content}
                    </div>
                )}

                {/* Loading skeleton for translations */}
                {isTranslating && (
                    <div className="mt-2 pt-2 border-t border-gray-200/30">
                        <div className="animate-pulse flex space-x-2 items-center">
                            <div className="h-2 bg-gray-300 rounded w-16"></div>
                            <div className="h-2 bg-gray-300 rounded w-24"></div>
                        </div>
                    </div>
                )}

                {/* Original text on hover for translated */}
                {isTranslated && translatedMessage.originalContent && (
                    <div className="mt-2 pt-2 border-t border-gray-200/30">
                        <div className="text-xs opacity-70 italic">
                            Original: {translatedMessage.originalContent}
                        </div>
                    </div>
                )}

                {/* Timestamp and status */}
                <div className={`text-[10px] sm:text-[11px] mt-1 flex items-center justify-end space-x-1 ${isCurrentUser ? 'text-emerald-100' : 'text-gray-500'
                    }`}>
                    <span>{formatTime ? formatTime(msg.timestamp) : new Date(msg.timestamp).toLocaleTimeString()}</span>
                    {isCurrentUser && (() => {
                        const baseClass = "h-4 w-4 ml-1 transition-all duration-200";
                        const status = msg.status;

                        if (status === 'queued') {
                            return (
                                <svg xmlns="http://www.w3.org/2000/svg" className={`${baseClass} text-white/80`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l2 2" />
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 20.25A8.25 8.25 0 1112 3.75v0a8.25 8.25 0 010 16.5z" />
                                </svg>
                            );
                        }

                        if (status === 'sent' || !status) {
                            return (
                                <svg xmlns="http://www.w3.org/2000/svg" className={`${baseClass} text-white/80`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                </svg>
                            );
                        }

                        if (status === 'delivered') {
                            return (
                                <svg xmlns="http://www.w3.org/2000/svg" className={`${baseClass} text-white`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M2 13l4 4L16 3" />
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                </svg>
                            );
                        }

                        if (status === 'seen') {
                            return (
                                <svg xmlns="http://www.w3.org/2000/svg" className={`${baseClass} text-blue-400`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M2 13l4 4L16 3" />
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                </svg>
                            );
                        }

                        return (
                            <svg xmlns="http://www.w3.org/2000/svg" className={`${baseClass} text-white/80`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                        );
                    })()}
                </div>
            </div>
        </div>
    );
});

const MessageSection = ({
    selectedUser,
    selectedRoom,
    messages,
    sendMessage,
    handleFileChange,
    isTyping,
    user,
    startCall,
    startGroupCall,
    formatTime,
    onManageGroup
}) => {
    const { t, translateText, translateTexts, currentLanguage } = useTranslation();
    const fileInputRef = useRef(null);
    const messageInputRef = useRef(null);
    const messagesEndRef = useRef(null);
    const messagesContainerRef = useRef(null);

    // Internal state that prevents parent Dashboard from re-rendering on every keystroke
    const [message, setMessage] = useState('');
    const [shareLinkCopied, setShareLinkCopied] = useState(false);
    const shareLinkTimeoutRef = useRef(null);

    // Media upload state
    const [mediaPreview, setMediaPreview] = useState(null);
    const [previewFile, setPreviewFile] = useState(null);
    const [mediaCaption, setMediaCaption] = useState('');
    const [isUploading, setIsUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [showAttachmentMenu, setShowAttachmentMenu] = useState(false);

    // Close attachment menu when clicking outside
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (showAttachmentMenu && !e.target.closest('.attachment-menu-container')) {
                setShowAttachmentMenu(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [showAttachmentMenu]);

    const handleLocalFileChange = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        // Create local preview
        const reader = new FileReader();
        reader.onloadend = () => {
            setMediaPreview({
                url: reader.result,
                filename: file.name,
                mimeType: file.type,
                size: file.size,
                category: getMediaCategory(file.type, file.name)
            });
            setPreviewFile(file);
            setShowAttachmentMenu(false);
        };
        reader.readAsDataURL(file);
    };

    const handleSendMedia = async () => {
        if (!previewFile) return;

        try {
            setIsUploading(true);
            setUploadProgress(0);

            // 1. Upload to Cloudinary via backend
            const uploadedMedia = await uploadMedia(previewFile, (progress) => {
                setUploadProgress(progress);
            });

            // 2. Send message with Cloudinary URL
            await sendMessage({
                content: mediaCaption,
                media: uploadedMedia // { url, publicId, mimeType, filename, size, resourceType }
            });

            // 3. Clear preview state
            setMediaPreview(null);
            setPreviewFile(null);
            setMediaCaption('');
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
        } catch (error) {
            console.error('Failed to upload media:', error);
            alert(t('uploadFailed') || 'Failed to upload media. Please try again.');
        } finally {
            setIsUploading(false);
            setUploadProgress(0);
        }
    };

    const cancelMediaPreview = () => {
        setMediaPreview(null);
        setPreviewFile(null);
        setMediaCaption('');
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    const handleShareGroupLink = useCallback(async () => {
        if (!selectedRoom) return;
        try {
            const token = localStorage.getItem('token');
            const res = await axios.get(`${API_URL}/chat/room/${selectedRoom._id}/meeting-link`, {
                headers: { 'x-auth-token': token },
            });
            const { callRoomId } = res.data;
            const link = `${window.location.origin}/join/${callRoomId}`;
            navigator.clipboard.writeText(link).catch(() => {
                const el = document.createElement('textarea');
                el.value = link;
                document.body.appendChild(el);
                el.select();
                document.execCommand('copy');
                document.body.removeChild(el);
            });
            setShareLinkCopied(true);
            clearTimeout(shareLinkTimeoutRef.current);
            shareLinkTimeoutRef.current = setTimeout(() => setShareLinkCopied(false), 2000);
        } catch {
            alert('Could not generate meeting link.');
        }
    }, [selectedRoom]);

    // Track translated messages
    const [translatedMessages, setTranslatedMessages] = useState(new Map());
    const [visibleMessageIds, setVisibleMessageIds] = useState(new Set());
    const [translatingMessageIds, setTranslatingMessageIds] = useState(new Set());
    const observerRef = useRef(null);
    const translateTimerRef = useRef(null);

    // Debug logging
    useEffect(() => {
        // console.log('MessageSection re-rendered with:', {
        //     selectedUser: selectedUser?.name,
        //     selectedRoom: selectedRoom?.name,
        //     user: user?.username,
        //     onManageGroup: !!onManageGroup
        // });
    }, [selectedUser, selectedRoom, user, onManageGroup]);

    // Scroll to bottom
    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages, isTyping]);

    // Lazy batch translation effect using translateTexts from context
    useEffect(() => {
        if (!messages.length || typeof window === 'undefined') return;

        // Debounced translator to coalesce rapid visible-id changes
        const scheduleTranslate = () => {
            if (translateTimerRef.current) clearTimeout(translateTimerRef.current);
            translateTimerRef.current = setTimeout(async () => {
                // Find visible messages that are not yet translated and not in-flight
                const messagesToTranslate = messages.filter(msg => {
                    const messageId = msg._id || msg.id;
                    return visibleMessageIds.has(messageId) && !translatedMessages.has(messageId) && !translatingMessageIds.has(messageId);
                });

                if (messagesToTranslate.length === 0) return;

                try {
                    // Mark as in-flight
                    setTranslatingMessageIds(prev => {
                        const next = new Set(prev);
                        messagesToTranslate.forEach(m => next.add(m._id || m.id));
                        return next;
                    });

                    const texts = messagesToTranslate.map(m => m.content || '');
                    // Limit to 30 per call
                    const batch = texts.slice(0, 30);
                    const results = await translateTexts(batch, currentLanguage);

                    setTranslatedMessages(prev => {
                        const nextMap = new Map(prev);
                        messagesToTranslate.slice(0, results.length).forEach((msg, idx) => {
                            const messageId = msg._id || msg.id;
                            const translatedContent = results[idx] || msg.content;
                            nextMap.set(messageId, {
                                content: translatedContent,
                                originalContent: msg.content
                            });
                        });
                        return nextMap;
                    });

                    setTranslatingMessageIds(prev => {
                        const next = new Set(prev);
                        messagesToTranslate.slice(0, results.length).forEach(m => next.delete(m._id || m.id));
                        return next;
                    });

                    // If there were more messages beyond the sliced 30, schedule another run
                    if (messagesToTranslate.length > results.length) {
                        scheduleTranslate();
                    }
                } catch (error) {
                    console.error('Batch translation failed:', error);
                    setTranslatedMessages(prev => {
                        const nextMap = new Map(prev);
                        messagesToTranslate.forEach((msg) => {
                            const messageId = msg._id || msg.id;
                            nextMap.set(messageId, {
                                content: msg.content,
                                originalContent: msg.content
                            });
                        });
                        return nextMap;
                    });
                    setTranslatingMessageIds(prev => {
                        const next = new Set(prev);
                        messagesToTranslate.forEach(m => next.delete(m._id || m.id));
                        return next;
                    });
                }
            }, 120); // 120ms debounce to coalesce quick events
        };

        scheduleTranslate();

        return () => {
            if (translateTimerRef.current) {
                clearTimeout(translateTimerRef.current);
                translateTimerRef.current = null;
            }
        };
    }, [messages, visibleMessageIds, currentLanguage, translateText, translateTexts, translatedMessages]);

    // Intersection Observer setup
    useEffect(() => {
        if (!messagesContainerRef.current || typeof window === 'undefined') return;

        const observerOptions = {
            root: messagesContainerRef.current,
            rootMargin: '50px', // Start loading 50px before messages come into view
            threshold: 0.1
        };

        observerRef.current = new IntersectionObserver((entries) => {
            const newVisibleIds = new Set(visibleMessageIds);
            let hasChanges = false;

            entries.forEach(entry => {
                const messageId = entry.target.dataset.messageId;
                if (entry.isIntersecting) {
                    if (!newVisibleIds.has(messageId)) {
                        newVisibleIds.add(messageId);
                        hasChanges = true;
                    }
                }
            });

            if (hasChanges) {
                setVisibleMessageIds(newVisibleIds);
            }
        }, observerOptions);

        // Observe all message elements
        const messageElements = messagesContainerRef.current.querySelectorAll('[data-message-id]');
        messageElements.forEach(el => {
            observerRef.current.observe(el);
        });

        // Scroll handler for pagination: when user scrolls to top, request more messages
        const handleScroll = async (e) => {
            const el = e.target;
            if (el.scrollTop <= 50) {
                // Fire a custom event so parent can load older messages
                const loadEvent = new CustomEvent('loadOlderMessages');
                window.dispatchEvent(loadEvent);
            }
        };

        messagesContainerRef.current.addEventListener('scroll', handleScroll);

        return () => {
            if (observerRef.current) {
                observerRef.current.disconnect();
            }
            if (messagesContainerRef.current) {
                messagesContainerRef.current.removeEventListener('scroll', handleScroll);
            }
        };
    }, [messages, visibleMessageIds]);

    // Note: Status updates are now managed by Dashboard state updates, not here

    // Note: messageDelivered is now emitted from Dashboard's central receiveMessage handler
    // to avoid duplication. No need to emit here.

    // Emit messageSeen when messages become visible via IntersectionObserver
    useEffect(() => {
        if (!visibleMessageIds || visibleMessageIds.size === 0) return;

        const toMark = [];
        messages.forEach(m => {
            const id = m._id || m.id;
            if (!id) return;
            const fromOther = !(m.sender?._id === user?._id || m.sender === user?._id);
            const alreadySeen = (m.status === 'seen');
            if (visibleMessageIds.has(id) && fromOther && !alreadySeen) {
                toMark.push(id);
            }
        });

        if (toMark.length > 0) {
            try {
                console.log(`👁️ [MessageSection] Emitting messageSeen for ${toMark.length} messages:`, toMark);
                socketManager.emit('messageSeen', { messageIds: toMark });
            } catch (e) {
                console.error('❌ [MessageSection] Error emitting messageSeen:', e);
            }
        }
    }, [visibleMessageIds, messages, user]);

    // Reset translations when language changes
    useEffect(() => {
        setTranslatedMessages(new Map());
        setVisibleMessageIds(new Set());
    }, [currentLanguage]);

    const handleKeyPress = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage(message);
            setMessage('');
        }
    };

    return (
        <main className="flex-1 flex flex-col h-[calc(100vh-4rem)] overflow-hidden bg-gray-50">
            {/* Fixed header - responsive padding and sizing */}
            <div className="bg-white shadow-sm p-2 sm:p-4 flex items-center justify-between min-h-[60px] sm:min-h-[70px]">
                <div className="flex items-center space-x-2 sm:space-x-3 min-w-0 flex-1">
                    {selectedUser && (
                        <div className="relative flex-shrink-0">
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 text-white flex items-center justify-center text-sm sm:text-lg font-semibold">
                                {selectedUser.avatar}
                            </div>
                            {selectedUser.status === 'online' && (
                                <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-white"></div>
                            )}
                        </div>
                    )}
                    <div className="min-w-0 flex-1">
                        <h2 className="text-base sm:text-lg font-semibold text-gray-800 truncate">
                            {selectedUser?.name || selectedRoom?.name || t('chat')}
                        </h2>
                        {selectedUser && (
                            <div className="text-xs sm:text-sm text-gray-500">
                                {selectedUser.status === 'online' ? t('online') : t('offline')}
                            </div>
                        )}
                    </div>
                </div>
                {(selectedUser || selectedRoom) && (
                    <div className="flex items-center space-x-1 sm:space-x-2 flex-shrink-0">
                        {/* {console.log('MessageSection rendering - selectedRoom:', selectedRoom, 'onManageGroup:', !!onManageGroup)} */}
                        {selectedRoom && onManageGroup && (() => {
                            {/* console.log('MessageSection - selectedRoom:', selectedRoom);
                            console.log('MessageSection - user:', user);
                            console.log('MessageSection - onManageGroup:', !!onManageGroup);
                            console.log('MessageSection - room admins array:', selectedRoom.admins);
                            console.log('MessageSection - user id:', user?.id, 'user _id:', user?._id); */}

                            // Temporarily always show for testing
                            const isAdmin = true; // selectedRoom.admins?.some(admin => {
                            //     const adminId = admin._id || admin;
                            //     const adminIdStr = adminId.toString();
                            //     const userIdStr = (user?.id || user?._id)?.toString();
                            //     const match = adminIdStr === userIdStr;
                            //     console.log('Checking admin:', adminIdStr, 'vs user:', userIdStr, 'match:', match);
                            //     return match;
                            // });

                            {/* console.log('MessageSection - final isAdmin result:', isAdmin); */ }

                            return isAdmin ? (
                                <button
                                    onClick={() => {
                                        // console.log('Settings icon clicked in MessageSection');
                                        onManageGroup(selectedRoom);
                                    }}
                                    className="p-2 text-gray-500 hover:text-gray-700 rounded-full hover:bg-gray-100 transition-colors flex-shrink-0"
                                    title="Manage group"
                                >
                                    <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                    </svg>
                                </button>
                            ) : null;
                        })()}
                        {selectedRoom && (
                            <button
                                onClick={handleShareGroupLink}
                                title="Copy meeting link"
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                                    shareLinkCopied
                                        ? 'border-emerald-400 text-emerald-600 bg-emerald-50'
                                        : 'border-gray-300 text-gray-600 hover:bg-gray-100'
                                }`}
                            >
                                {shareLinkCopied ? (
                                    <>
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                        </svg>
                                        Copied!
                                    </>
                                ) : (
                                    <>
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                                        </svg>
                                        <span className="hidden sm:inline">Share Link</span>
                                    </>
                                )}
                            </button>
                        )}
                        <CallButtons
                            onAudioCall={() => {
                                if (selectedRoom && startGroupCall) {
                                    startGroupCall('audio');
                                } else if (startCall) {
                                    startCall('audio');
                                }
                            }}
                            onVideoCall={() => {
                                if (selectedRoom && startGroupCall) {
                                    startGroupCall('video');
                                } else if (startCall) {
                                    startCall('video');
                                }
                            }}
                        />
                    </div>
                )}
            </div>

            {/* Scrollable messages container */}
            <div ref={messagesContainerRef} className="flex-1 overflow-y-auto p-2 sm:p-4 space-y-3 sm:space-y-4 bg-gray-50">
                {messages.map((msg, index) => {
                    const isCurrentUser = msg.sender?._id === user?._id || msg.sender === user?._id;
                    const messageId = msg._id || msg.id || `temp-${index}`;
                    const translatedMessage = translatedMessages.get(messageId);
                    const displayContent = translatedMessage ? translatedMessage.content : msg.content;
                    const isTranslated = translatedMessage && translatedMessage.originalContent !== translatedMessage.content;
                    const isTranslating = translatingMessageIds.has(messageId) && !isCurrentUser;

                    return (
                        <MessageBubble
                            key={messageId}
                            messageId={messageId}
                            msg={msg}
                            isCurrentUser={isCurrentUser}
                            translatedMessage={translatedMessage}
                            displayContent={displayContent}
                            isTranslated={isTranslated}
                            isTranslating={isTranslating}
                            formatTime={formatTime}
                        />
                    );
                })}

                {isTyping && selectedUser && (
                    <div className="flex items-center space-x-2 text-gray-500">
                        <div className="bg-white rounded-full p-4 shadow-md">
                            <div className="flex space-x-1">
                                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                            </div>
                        </div>
                    </div>
                )}
                <div ref={messagesEndRef}></div>
            </div>

            {/* Media Preview Modal */}
            {mediaPreview && (
                <div className="absolute inset-0 z-50 bg-gray-100 flex flex-col p-4 sm:p-8 overflow-y-auto">
                    <div className="flex justify-between items-center mb-6">
                        <button onClick={cancelMediaPreview} className="p-2 bg-white rounded-full text-gray-600 hover:text-gray-900 shadow hover:shadow-md transition-all">
                            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                        <div className="font-semibold text-gray-800 text-lg">Send Media</div>
                        <div className="w-10"></div> {/* Spacer for centering */}
                    </div>

                    <div className="flex-1 flex flex-col items-center justify-center max-w-2xl mx-auto w-full">
                        <div className="bg-white p-4 sm:p-6 rounded-2xl shadow-xl w-full flex flex-col items-center space-y-6">
                            {/* Preview area */}
                            <div className="w-full bg-gray-50 rounded-xl overflow-hidden flex items-center justify-center min-h-[200px] max-h-[50vh] relative border border-gray-200">
                                {mediaPreview.category === 'image' && (
                                    <img src={mediaPreview.url} alt="Preview" className="max-w-full max-h-[50vh] object-contain" />
                                )}
                                {mediaPreview.category === 'video' && (
                                    <video src={mediaPreview.url} controls className="max-w-full max-h-[50vh] object-contain" />
                                )}
                                {mediaPreview.category === 'audio' && (
                                    <div className="p-8 w-full flex flex-col items-center gap-4">
                                        <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center">
                                            <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 20 20">
                                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                                            </svg>
                                        </div>
                                        <audio src={mediaPreview.url} controls className="w-full max-w-sm" />
                                    </div>
                                )}
                                {['pdf', 'pptx', 'docx', 'xlsx', 'file'].includes(mediaPreview.category) && (
                                    <div className="p-8 flex flex-col items-center gap-4 text-center">
                                        <div className={`p-4 rounded-2xl ${
                                            mediaPreview.category === 'pdf' ? 'bg-red-100 text-red-600' :
                                            mediaPreview.category === 'pptx' ? 'bg-orange-100 text-orange-600' :
                                            mediaPreview.category === 'docx' ? 'bg-blue-100 text-blue-600' :
                                            mediaPreview.category === 'xlsx' ? 'bg-green-100 text-green-600' :
                                            'bg-gray-200 text-gray-600'
                                        }`}>
                                            <svg className="w-16 h-16" fill="currentColor" viewBox="0 0 20 20">
                                                <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
                                            </svg>
                                        </div>
                                        <div>
                                            <p className="font-medium text-gray-800 break-all">{mediaPreview.filename}</p>
                                            <p className="text-sm text-gray-500 mt-1">{formatFileSize(mediaPreview.size)} • {mediaPreview.category.toUpperCase()}</p>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Caption input */}
                            <div className="w-full relative">
                                <input
                                    type="text"
                                    className="w-full bg-gray-100 border-none rounded-full px-6 py-4 pr-16 focus:ring-2 focus:ring-emerald-500 text-gray-800"
                                    placeholder="Add a caption..."
                                    value={mediaCaption}
                                    onChange={(e) => setMediaCaption(e.target.value)}
                                    onKeyPress={(e) => e.key === 'Enter' && !isUploading && handleSendMedia()}
                                    disabled={isUploading}
                                    autoFocus
                                />
                                <button
                                    onClick={handleSendMedia}
                                    disabled={isUploading}
                                    className={`absolute right-2 top-1/2 -translate-y-1/2 p-3 rounded-full text-white transition-all ${
                                        isUploading ? 'bg-emerald-400 cursor-not-allowed' : 'bg-emerald-500 hover:bg-emerald-600 shadow-md hover:shadow-lg hover:scale-105 active:scale-95'
                                    }`}
                                >
                                    {isUploading ? (
                                        <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                        </svg>
                                    ) : (
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                            <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
                                        </svg>
                                    )}
                                </button>
                            </div>

                            {/* Progress bar */}
                            {isUploading && (
                                <div className="w-full">
                                    <div className="flex justify-between text-xs text-gray-500 mb-1">
                                        <span>Uploading...</span>
                                        <span>{uploadProgress}%</span>
                                    </div>
                                    <div className="w-full bg-gray-200 rounded-full h-2">
                                        <div 
                                            className="bg-emerald-500 h-2 rounded-full transition-all duration-300"
                                            style={{ width: `${uploadProgress}%` }}
                                        ></div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Fixed input area at bottom */}
            <div className="bg-gray-100 p-2 sm:p-4 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] border-t border-gray-200 relative">
                <form
                    onSubmit={(e) => {
                        e.preventDefault();
                        if (message.trim()) {
                            sendMessage({ content: message });
                            setMessage('');
                        }
                    }}
                    className="flex items-end gap-2 sm:gap-3 max-w-5xl mx-auto"
                >
                    {/* Attachment Menu Container */}
                    <div className="relative attachment-menu-container">
                        <button
                            type="button"
                            onClick={() => setShowAttachmentMenu(!showAttachmentMenu)}
                            className={`p-3 text-gray-500 hover:text-gray-700 cursor-pointer rounded-full transition-colors flex-shrink-0 ${
                                showAttachmentMenu ? 'bg-gray-200' : 'hover:bg-gray-200'
                            }`}
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 transform rotate-45" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                            </svg>
                        </button>

                        {/* WhatsApp-style pop-up menu */}
                        {showAttachmentMenu && (
                            <div className="absolute bottom-full left-0 mb-4 bg-transparent z-40 flex flex-col-reverse gap-4 pb-2 w-14 animate-in slide-in-from-bottom-5 duration-200">
                                {/* Document */}
                                <div className="group relative flex items-center">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            fileInputRef.current.accept = ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt";
                                            fileInputRef.current.click();
                                        }}
                                        className="w-12 h-12 bg-indigo-500 rounded-full text-white flex items-center justify-center shadow-lg hover:scale-110 transition-transform"
                                    >
                                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                                        </svg>
                                    </button>
                                    <span className="absolute left-16 bg-gray-800 text-white text-xs px-3 py-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap shadow-md">Document</span>
                                </div>
                                
                                {/* Image / Video */}
                                <div className="group relative flex items-center">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            fileInputRef.current.accept = "image/*,video/*";
                                            fileInputRef.current.click();
                                        }}
                                        className="w-12 h-12 bg-pink-500 rounded-full text-white flex items-center justify-center shadow-lg hover:scale-110 transition-transform"
                                    >
                                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                        </svg>
                                    </button>
                                    <span className="absolute left-16 bg-gray-800 text-white text-xs px-3 py-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap shadow-md">Photos & Videos</span>
                                </div>

                                {/* Audio */}
                                <div className="group relative flex items-center">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            fileInputRef.current.accept = "audio/*";
                                            fileInputRef.current.click();
                                        }}
                                        className="w-12 h-12 bg-orange-500 rounded-full text-white flex items-center justify-center shadow-lg hover:scale-110 transition-transform"
                                    >
                                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                                        </svg>
                                    </button>
                                    <span className="absolute left-16 bg-gray-800 text-white text-xs px-3 py-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap shadow-md">Audio</span>
                                </div>
                            </div>
                        )}
                    </div>

                    <input
                        type="file"
                        className="hidden"
                        onChange={handleLocalFileChange}
                        ref={fileInputRef}
                    />
                    
                    <div className="relative flex-1 min-w-0 bg-white rounded-2xl border border-gray-300 focus-within:border-emerald-500 focus-within:ring-1 focus-within:ring-emerald-500 transition-all flex items-center p-1">
                        <input
                            type="text"
                            className="w-full bg-transparent pl-4 pr-12 py-2 sm:py-3 text-sm sm:text-base focus:outline-none text-gray-800"
                            placeholder={t('typeMessage')}
                            value={message}
                            onChange={(e) => setMessage(e.target.value)}
                            onKeyPress={handleKeyPress}
                            ref={messageInputRef}
                        />
                        <button
                            type="submit"
                            disabled={!message.trim()}
                            className={`absolute right-2 p-2.5 rounded-full transition-all shadow-sm flex-shrink-0 flex items-center justify-center ${
                                message.trim() 
                                    ? 'bg-emerald-500 text-white hover:bg-emerald-600 hover:shadow-md transform hover:scale-105 active:scale-95' 
                                    : 'bg-gray-100 text-gray-400 cursor-default'
                            }`}
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" style={{ marginLeft: '2px' }}>
                                <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
                            </svg>
                        </button>
                    </div>
                </form>
            </div>
        </main>
    );
};

export default React.memo(MessageSection);