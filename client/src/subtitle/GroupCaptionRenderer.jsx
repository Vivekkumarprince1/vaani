import { useState, useEffect, useRef } from 'react';
import SubtitleSyncManager from './SubtitleSyncManager';

/**
 * GroupCaptionRenderer
 * Single responsibility: render live subtitles from SubtitleSyncManager.
 *
 * Shows speaker name + original text + translated text (when available).
 * Auto-clears per SubtitleSyncManager TTL. Designed to overlay the video grid.
 *
 * @param {object} socket - Socket.IO client
 * @param {string} currentUserId - local user's ID (to label self differently)
 */
const GroupCaptionRenderer = ({ socket, currentUserId }) => {
  const [subtitles, setSubtitles] = useState([]);
  const managerRef = useRef(null);

  useEffect(() => {
    if (!socket) return;

    const manager = new SubtitleSyncManager({ ttlMs: 4000 });
    managerRef.current = manager;

    manager.attach(socket);
    const unsubscribe = manager.subscribe(setSubtitles);

    return () => {
      unsubscribe();
      manager.detach();
      managerRef.current = null;
    };
  }, [socket]);

  if (subtitles.length === 0) return null;

  return (
    <div className="absolute bottom-28 left-1/2 -translate-x-1/2 w-full max-w-2xl px-4 space-y-1 pointer-events-none">
      {subtitles.slice(-3).map((subtitle) => {
        const isMe = subtitle.speakerId === currentUserId;
        return (
          <div
            key={subtitle.id}
            className="bg-black/70 rounded-lg px-4 py-2 text-center animate-fade-in"
          >
            <div className="text-xs text-indigo-300 font-semibold mb-0.5">
              {isMe ? 'You' : subtitle.speakerName}
              {subtitle.lang && (
                <span className="ml-1 text-gray-400">→ {subtitle.lang.toUpperCase()}</span>
              )}
            </div>

            {/* Original text */}
            <div className="text-white text-sm leading-snug">
              {subtitle.original}
            </div>

            {/* Translated text (shown below when available and different from original) */}
            {subtitle.translated && subtitle.translated !== subtitle.original && (
              <div className="text-emerald-300 text-sm leading-snug mt-0.5 italic">
                {subtitle.translated}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default GroupCaptionRenderer;
