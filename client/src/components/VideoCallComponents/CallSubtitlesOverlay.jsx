import React, { useState, useEffect, useRef } from 'react';

/**
 * CallSubtitlesOverlay
 * High-craft floating live caption HUD for 1:1 video and audio calls.
 * Displays both the original spoken transcript and the real-time translated text
 * with speaker identification, language pills, animated speech wave indicator,
 * and auto-dismiss after speech ends.
 */
const CallSubtitlesOverlay = ({
  localTranscript = '',
  localTranslated = '',
  remoteTranscript = '',
  remoteTranslated = '',
  yourLanguage = 'en',
  yourLanguageName = 'English',
  remoteUserName = 'Remote Caller',
  isSpeaking = false,
  isAudioDucked = false,
  visible = true
}) => {
  const [activeCaption, setActiveCaption] = useState(null);
  const [isFadingOut, setIsFadingOut] = useState(false);
  const dismissTimerRef = useRef(null);

  // Update caption whenever remote speech arrives
  useEffect(() => {
    if (remoteTranscript || remoteTranslated) {
      setActiveCaption({
        speaker: remoteUserName || 'Caller',
        isLocal: false,
        original: remoteTranscript,
        translated: remoteTranslated,
        timestamp: Date.now(),
      });
      setIsFadingOut(false);

      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
      // Auto-dismiss caption after 6 seconds of silence
      dismissTimerRef.current = setTimeout(() => {
        setIsFadingOut(true);
        dismissTimerRef.current = setTimeout(() => {
          setActiveCaption(null);
          setIsFadingOut(false);
        }, 400); // match fade transition
      }, 6000);
    }
  }, [remoteTranscript, remoteTranslated, remoteUserName]);

  // Update caption when local speech arrives (if remote isn't actively speaking)
  useEffect(() => {
    if (localTranscript || localTranslated) {
      // If remote caption was very recent (< 2s ago), keep remote priority; otherwise show local
      const isRemoteFresh = activeCaption && !activeCaption.isLocal && (Date.now() - activeCaption.timestamp < 2000);
      if (!isRemoteFresh) {
        setActiveCaption({
          speaker: 'You',
          isLocal: true,
          original: localTranscript,
          translated: localTranslated,
          timestamp: Date.now(),
        });
        setIsFadingOut(false);

        if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
        dismissTimerRef.current = setTimeout(() => {
          setIsFadingOut(true);
          dismissTimerRef.current = setTimeout(() => {
            setActiveCaption(null);
            setIsFadingOut(false);
          }, 400);
        }, 5000);
      }
    }
  }, [localTranscript, localTranslated]);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
    };
  }, []);

  if (!visible || !activeCaption) return null;

  const hasTranslation = Boolean(activeCaption.translated && activeCaption.translated !== activeCaption.original);

  return (
    <div
      className={`absolute bottom-24 left-1/2 -translate-x-1/2 z-30 w-full max-w-xl px-4 pointer-events-none transition-all duration-300 ${
        isFadingOut ? 'opacity-0 translate-y-2' : 'opacity-100 translate-y-0'
      }`}
    >
      <div className="relative overflow-hidden rounded-2xl border border-white/15 bg-black/75 p-4 shadow-2xl backdrop-blur-xl">
        {/* Animated speaking audio glow bar on top */}
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-emerald-400 to-transparent opacity-80 animate-pulse" />

        {/* Header: Speaker Badge + Language Flow */}
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                activeCaption.isLocal
                  ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                  : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-current animate-ping" />
              {activeCaption.speaker}
            </span>

            {/* Speaking Waveform Indicator */}
            {(isSpeaking || isAudioDucked) && (
              <span className="flex items-center gap-0.5 text-emerald-400" title="Audio playing">
                <span className="w-0.5 h-2 bg-emerald-400 rounded animate-pulse" style={{ animationDelay: '0ms' }} />
                <span className="w-0.5 h-3.5 bg-emerald-400 rounded animate-pulse" style={{ animationDelay: '150ms' }} />
                <span className="w-0.5 h-2 bg-emerald-400 rounded animate-pulse" style={{ animationDelay: '300ms' }} />
              </span>
            )}
          </div>

          {/* Subtitle tag */}
          <div className="flex items-center gap-1.5 text-[11px] text-gray-400 font-mono">
            <span>LIVE CC</span>
            {hasTranslation && (
              <span className="text-emerald-400 font-semibold">• TRANSLATED</span>
            )}
          </div>
        </div>

        {/* Captions Body */}
        <div className="space-y-1.5">
          {/* Original Speech */}
          {activeCaption.original && (
            <div className="text-gray-200 text-sm md:text-base leading-relaxed font-normal">
              {activeCaption.original}
            </div>
          )}

          {/* Translated Speech */}
          {hasTranslation && (
            <div className="flex items-start gap-2 pt-1 border-t border-white/10">
              <span className="text-emerald-400 text-sm mt-0.5 select-none">🌐</span>
              <div className="text-emerald-300 text-base md:text-lg font-medium leading-snug drop-shadow-sm">
                {activeCaption.translated}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CallSubtitlesOverlay;
