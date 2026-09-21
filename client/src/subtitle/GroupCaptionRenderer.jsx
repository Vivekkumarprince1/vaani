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
const GroupCaptionRenderer = ({ socket, currentUserId, visible = true }) => {
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

  if (!visible || subtitles.length === 0) return null;

  return (
    <div className="absolute bottom-28 left-1/2 -translate-x-1/2 w-full max-w-2xl px-4 space-y-2 pointer-events-none z-30">
      {subtitles.slice(-3).map((subtitle) => {
        const isMe = subtitle.speakerId === currentUserId;
        const hasTranslation = Boolean(subtitle.translated && subtitle.translated !== subtitle.original);
        return (
          <div
            key={subtitle.id}
            className="rounded-2xl border border-white/15 bg-black/75 p-3.5 shadow-2xl backdrop-blur-xl animate-fade-in"
          >
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                  isMe
                    ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                    : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-current animate-ping" />
                {isMe ? 'You' : subtitle.speakerName}
                {subtitle.lang && (
                  <span className="text-gray-300 font-normal">({subtitle.lang.toUpperCase()})</span>
                )}
              </span>

              <span className="text-[10px] text-gray-400 font-mono">LIVE CC</span>
            </div>

            {/* Original text */}
            <div className="text-gray-200 text-sm leading-snug">
              {subtitle.original}
            </div>

            {/* Translated text */}
            {hasTranslation && (
              <div className="flex items-start gap-1.5 pt-1.5 mt-1 border-t border-white/10">
                <span className="text-emerald-400 text-xs select-none">🌐</span>
                <div className="text-emerald-300 text-sm md:text-base font-medium leading-snug">
                  {subtitle.translated}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default GroupCaptionRenderer;
