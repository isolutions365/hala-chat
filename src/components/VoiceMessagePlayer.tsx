import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, ShieldAlert, Sparkles, Loader2 } from 'lucide-react';
import { Language } from '../types';

interface VoiceMessagePlayerProps {
  audioUrl: string;
  duration?: number;
  isOwn: boolean;
  language: Language;
  uploadProgress?: number;
  status?: string;
  isRestricted?: boolean;
  senderAvatar?: string | null;
  mediaStatus?: 'idle' | 'loading' | 'ready' | 'error';
  onRetry?: () => void;
  transcription?: { transcription: string, translation?: string, isLoading: boolean };
}

// Generate consistent fallback waveform heights based on audio URL
function generateFallbackWaveformHeights(seed: string, count = 32): number[] {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }

  const heights: number[] = [];
  for (let i = 0; i < count; i++) {
    const pseudoRandom = Math.abs(Math.sin(hash + i * 13.37));
    const centerFactor = Math.sin((i / count) * Math.PI);
    const heightPercent = Math.max(20, Math.round((pseudoRandom * 0.7 + centerFactor * 0.3) * 80 + 20));
    heights.push(heightPercent);
  }
  return heights;
}

export const VoiceMessagePlayer: React.FC<VoiceMessagePlayerProps> = ({
  audioUrl,
  duration = 0,
  isOwn,
  language,
  uploadProgress,
  status,
  isRestricted = false,
  senderAvatar,
  mediaStatus = 'ready',
  onRetry,
  transcription,
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(duration || 0);
  const [isLoading, setIsLoading] = useState(false);
  const [playbackError, setPlaybackError] = useState(false);
  const [hoverProgress, setHoverProgress] = useState<number | null>(null);
  const [hoverTimeStr, setHoverTimeStr] = useState<string>('');
  const [hasManualConfirmed, setHasManualConfirmed] = useState(!isRestricted);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const waveformRef = useRef<HTMLDivElement>(null);

  const isRtl = language === 'ar';

  const effectiveDur = audioDuration || duration || 5;
  const barCount = effectiveDur > 20 ? 38 : effectiveDur > 10 ? 30 : 24;

  // Render a deterministic waveform immediately. Do not fetch/decode the audio
  // a second time just to draw decorative bars.
  const waveformBars = generateFallbackWaveformHeights(audioUrl || 'default-audio-waveform', barCount);

  // Ensure only one voice message plays at a time globally across the conversation
  useEffect(() => {
    const handleGlobalPause = (e: Event) => {
      const customEvt = e as CustomEvent;
      if (customEvt.detail?.currentUrl !== audioUrl) {
        if (audioRef.current) {
          audioRef.current.pause();
        }
        setIsPlaying(false);
      }
    };

    window.addEventListener('hala_pause_all_voice_audio', handleGlobalPause);
    return () => {
      window.removeEventListener('hala_pause_all_voice_audio', handleGlobalPause);
    };
  }, [audioUrl]);

  useEffect(() => {
    setPlaybackError(false);
    if (!audioUrl) return;

    const audio = new Audio();
    audioRef.current = audio;
    if (audioUrl.startsWith('blob:') || audioUrl.startsWith('/') || (typeof window !== 'undefined' && audioUrl.startsWith(window.location.origin))) {
      audio.crossOrigin = 'anonymous';
    }
    audio.preload = 'none';
    audio.src = audioUrl;
    audio.load();

    if (duration > 0) {
      setAudioDuration(duration);
    }

    const handleLoadedMetadata = () => {
      if (audio.duration && !isNaN(audio.duration) && isFinite(audio.duration)) {
        const dur = Math.round(audio.duration);
        if (dur > 0) {
          setAudioDuration(dur);
        }
      }
      setIsLoading(false);
      setPlaybackError(false);
    };

    const handleCanPlay = () => {
      setIsLoading(false);
      setPlaybackError(false);
      if (audio.duration && !isNaN(audio.duration) && isFinite(audio.duration)) {
        setAudioDuration(Math.round(audio.duration));
      }
    };

    const handleDurationChange = () => {
      if (audio.duration && !isNaN(audio.duration) && isFinite(audio.duration)) {
        setAudioDuration(Math.round(audio.duration));
      }
    };

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
      if (audio.duration && !isNaN(audio.duration) && isFinite(audio.duration) && audio.duration !== audioDuration) {
        setAudioDuration(Math.round(audio.duration));
      }
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    const handlePause = () => {
      setIsPlaying(false);
    };

    const handlePlay = () => {
      setIsPlaying(true);
      setIsLoading(false);
      setPlaybackError(false);
    };

    const handleError = (e: any) => {
      const audioErr = audio.error;
      console.error(
        '[VoiceMessagePlayer Audio Error]:',
        {
          code: audioErr?.code,
          message: audioErr?.message,
          networkState: audio.networkState,
          readyState: audio.readyState,
          urlPrefix: audioUrl?.slice(0, 60),
        },
        e
      );
      setIsLoading(false);
      setIsPlaying(false);
      setPlaybackError(true);
    };

    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('canplay', handleCanPlay);
    audio.addEventListener('durationchange', handleDurationChange);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('play', handlePlay);
    audio.addEventListener('error', handleError);

    return () => {
      audio.pause();
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('canplay', handleCanPlay);
      audio.removeEventListener('durationchange', handleDurationChange);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('error', handleError);
      audio.src = '';
      audioRef.current = null;
    };
  }, [audioUrl, duration]);

  const togglePlay = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!audioUrl) return;

    if (isRestricted && !hasManualConfirmed) {
      setHasManualConfirmed(true);
    }

    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      window.dispatchEvent(
        new CustomEvent('hala_pause_all_voice_audio', {
          detail: { currentUrl: audioUrl },
        })
      );

      setIsLoading(true);
      try {
        if (audio.ended || (audio.duration && audio.currentTime >= audio.duration)) {
          audio.currentTime = 0;
        }
        await audio.play();
        setIsLoading(false);
        setIsPlaying(true);
      } catch (err) {
        console.warn('Audio playback start error:', err);
        setIsLoading(false);
        setIsPlaying(false);
      }
    }
  };

  const isDraggingRef = useRef(false);

  const handlePointerDown = (e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) => {
    e.stopPropagation();
    isDraggingRef.current = true;
    updateSeekFromEvent(e);

    const handlePointerMove = (moveEvent: MouseEvent | TouchEvent) => {
      if (!isDraggingRef.current) return;
      updateSeekFromEvent(moveEvent);
    };

    const handlePointerUp = () => {
      isDraggingRef.current = false;
      window.removeEventListener('mousemove', handlePointerMove as any);
      window.removeEventListener('mouseup', handlePointerUp);
      window.removeEventListener('touchmove', handlePointerMove as any);
      window.removeEventListener('touchend', handlePointerUp);
    };

    window.addEventListener('mousemove', handlePointerMove as any);
    window.addEventListener('mouseup', handlePointerUp);
    window.addEventListener('touchmove', handlePointerMove as any, { passive: true });
    window.addEventListener('touchend', handlePointerUp);
  };

  const updateSeekFromEvent = (e: MouseEvent | TouchEvent | React.MouseEvent | React.TouchEvent) => {
    if (!waveformRef.current || !audioRef.current) return;
    const clientX = 'clientX' in e ? e.clientX : (e as TouchEvent).touches?.[0]?.clientX;
    if (clientX === undefined) return;

    if (isRestricted && !hasManualConfirmed) {
      setHasManualConfirmed(true);
    }

    const rect = waveformRef.current.getBoundingClientRect();
    const clickX = clientX - rect.left;
    const progress = Math.max(0, Math.min(1, clickX / rect.width));
    const effectiveDuration = audioDuration || audioRef.current.duration || 1;
    const newTime = progress * effectiveDuration;

    audioRef.current.currentTime = newTime;
    setCurrentTime(newTime);
  };

  const handleWaveformMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!waveformRef.current) return;
    const rect = waveformRef.current.getBoundingClientRect();
    const hoverX = e.clientX - rect.left;
    const prog = Math.max(0, Math.min(1, hoverX / rect.width));
    const totalSecs = audioDuration || duration || 0;
    const targetSecs = prog * totalSecs;
    setHoverProgress(prog);
    setHoverTimeStr(formatTime(targetSecs));
  };

  const handleWaveformMouseLeave = () => {
    setHoverProgress(null);
  };

  const formatTime = (secs: number) => {
    const total = Math.max(0, Math.floor(secs));
    const minutes = Math.floor(total / 60);
    const remainingSeconds = total % 60;
    return `${minutes}:${remainingSeconds < 10 ? '0' : ''}${remainingSeconds}`;
  };

  const displayTime = isPlaying
    ? formatTime(currentTime)
    : formatTime(audioDuration || duration || 0);

  const playbackProgress =
    audioDuration > 0 ? Math.min(1, currentTime / audioDuration) : 0;

  if (mediaStatus === 'loading' && !audioUrl) {
    return (
      <div className="flex items-center gap-2 py-2 px-3 text-xs text-slate-500 bg-slate-100 rounded-xl" dir="ltr">
        <div className="w-4 h-4 border-2 border-[#087F75] border-t-transparent rounded-full animate-spin shrink-0" />
        <span>{isRtl ? 'جاري تحميل الصوت...' : 'Loading audio...'}</span>
      </div>
    );
  }

  if (mediaStatus === 'error' || playbackError) {
    return (
      <div className="flex items-center justify-between gap-3 py-2 px-3 text-xs text-rose-600 bg-rose-50 border border-rose-100 rounded-xl min-w-[200px]" dir="ltr">
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-4 h-4" />
          <span>{isRtl ? 'فشل تحميل الصوت — إعادة' : "Couldn't load — Retry"}</span>
        </div>
        <button 
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setPlaybackError(false);
            if (onRetry) {
              onRetry();
            } else if (audioRef.current) {
              audioRef.current.load();
              audioRef.current.play().catch(() => setPlaybackError(true));
            }
          }}
          className="px-2 py-1 bg-rose-600 text-white rounded-lg font-bold hover:bg-rose-700 active:scale-95 transition-all cursor-pointer"
        >
          {isRtl ? 'إعادة' : 'Retry'}
        </button>
      </div>
    );
  }

  if (!audioUrl && status !== 'sending' && uploadProgress === undefined) {
    return (
      <div className="flex items-center gap-2 py-2 px-3 text-xs text-slate-500 bg-slate-100 rounded-xl" dir="ltr">
        <div className="w-4 h-4 border-2 border-[#087F75] border-t-transparent rounded-full animate-spin shrink-0" />
        <span>{isRtl ? 'جاري الانتظار...' : 'Waiting for audio...'}</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1 w-full min-w-[210px] sm:min-w-[250px] select-none" dir="ltr">
      {/* Manual Confirmation Badge if Restricted Setting Active on Incoming Voice Note */}
      {isRestricted && (
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-50 border border-amber-300/80 text-amber-900 text-[10px] font-bold shadow-2xs">
          <ShieldAlert className="w-3.5 h-3.5 text-amber-600 shrink-0" />
          <span>
            {isRtl ? 'رسالة صوتية مقيدة · يتطلب تأكيداً يدوياً' : 'Restricted Voice Note · Manual Confirmation Required'}
          </span>
        </div>
      )}

      <div className="flex items-center gap-3 py-0.5 px-1 min-w-0">
        {/* Play / Pause Circular Button or Upload Progress Ring */}
        {status === 'sending' || (uploadProgress !== undefined && uploadProgress < 100) ? (
          <div className={`relative w-10 h-10 rounded-full flex items-center justify-center shrink-0 shadow-xs ${
            isOwn ? 'bg-white text-[#087F75]' : 'bg-[#087F75] text-white'
          }`}>
            <svg className="w-8 h-8 -rotate-90">
              <circle
                cx="16"
                cy="16"
                r="13"
                className="stroke-current opacity-20"
                strokeWidth="2"
                fill="transparent"
              />
              <circle
                cx="16"
                cy="16"
                r="13"
                className="stroke-current transition-all duration-300"
                strokeWidth="2.5"
                fill="transparent"
                strokeDasharray={`${2 * Math.PI * 13}`}
                strokeDashoffset={`${2 * Math.PI * 13 * (1 - (uploadProgress || 10) / 100)}`}
              />
            </svg>
            <span className="absolute text-[10px] font-bold leading-none">
              {uploadProgress !== undefined ? `${Math.round(uploadProgress)}%` : '10%'}
            </span>
          </div>
        ) : (
          <button
            type="button"
            onClick={togglePlay}
            className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 shadow-xs transition-transform active:scale-95 cursor-pointer ${
              isOwn
                ? 'bg-white text-[#087F75] hover:bg-slate-50'
                : 'bg-[#087F75] text-white hover:bg-[#06685F]'
            }`}
            aria-label={isPlaying ? 'Pause voice message' : 'Play voice message'}
          >
            {isLoading ? (
              <div
                className={`w-4 h-4 border-2 rounded-full animate-spin ${
                  isOwn ? 'border-[#087F75] border-t-transparent' : 'border-white border-t-transparent'
                }`}
              />
            ) : isPlaying ? (
              <Pause className="w-5 h-5 fill-current" />
            ) : (
              <Play className="w-5 h-5 fill-current ml-0.5" />
            )}
          </button>
        )}

        {/* Waveform & Duration Column */}
        <div className="flex-1 flex flex-col justify-center gap-1 min-w-0">
          <div
            ref={waveformRef}
            onMouseDown={handlePointerDown}
            onTouchStart={handlePointerDown}
            onMouseMove={handleWaveformMouseMove}
            onMouseLeave={handleWaveformMouseLeave}
            className="h-8 flex items-center gap-[2px] sm:gap-[2.5px] cursor-pointer py-1 group relative touch-none"
            title="Tap or drag to seek audio"
          >
            {hoverProgress !== null && (
              <div
                className="absolute -top-6 px-1.5 py-0.5 bg-slate-900/90 text-white rounded text-[9px] font-mono pointer-events-none -translate-x-1/2 z-20 shadow-md"
                style={{ left: `${hoverProgress * 100}%` }}
              >
                {hoverTimeStr}
              </div>
            )}

            {playbackProgress > 0 && playbackProgress < 1 && (
              <div
                className={`absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full z-10 shadow-xs transition-all pointer-events-none -translate-x-1/2 ${
                  isOwn ? 'bg-white' : 'bg-[#087F75]'
                }`}
                style={{ left: `${playbackProgress * 100}%` }}
              />
            )}

            {waveformBars.map((height, i) => {
              const barProgress = i / waveformBars.length;
              const isPlayed = barProgress <= playbackProgress;
              const isCurrentActive = isPlaying && Math.abs(barProgress - playbackProgress) < (1 / waveformBars.length) * 1.8;

              const wavePulse = isPlaying ? Math.sin(currentTime * 12 + i * 0.4) * 18 : 0;
              const dynamicHeight = Math.min(100, Math.max(15, height + (isCurrentActive ? 30 : 0) + wavePulse));

              return (
                <div
                  key={i}
                  className="flex-1 min-w-[2px] rounded-full transition-all duration-75 ease-out"
                  style={{
                    height: `${dynamicHeight}%`,
                    backgroundColor: isOwn
                      ? isPlayed
                        ? 'rgba(255, 255, 255, 0.98)'
                        : 'rgba(255, 255, 255, 0.38)'
                      : isPlayed
                      ? '#087F75'
                      : '#CBD5E1',
                    transform: isCurrentActive ? 'scaleY(1.2)' : 'scaleY(1)',
                  }}
                />
              );
            })}
          </div>

          <div
            className={`flex items-center justify-start text-[11px] font-medium leading-none ${
              isOwn ? 'text-white/80' : 'text-slate-500'
            }`}
          >
            <span>{displayTime}</span>
          </div>
        </div>

        {senderAvatar && (
          <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full overflow-hidden shrink-0 border border-slate-200/40 shadow-xs bg-slate-200">
            <img src={senderAvatar} alt="Sender avatar" className="w-full h-full object-cover" />
          </div>
        )}
      </div>

      {transcription && (
        <div className={`mt-1.5 px-3 py-2 rounded-xl border ${
          isOwn ? 'bg-white/10 border-white/20 text-white' : 'bg-slate-50 border-slate-100 text-slate-700'
        } transition-all animate-in fade-in slide-in-from-top-1 duration-300`}>
          <div className="flex items-center gap-1.5 mb-1.5 opacity-80">
            <Sparkles className={`w-3 h-3 ${isOwn ? 'text-teal-200' : 'text-[#087F75]'}`} />
            <span className="text-[10px] font-bold uppercase tracking-wider">
              {isRtl ? 'نسخ وتحليل ذكي' : 'AI Transcription & Translation'}
            </span>
            {transcription.isLoading && <Loader2 className="w-3 h-3 animate-spin" />}
          </div>
          
          <div className="space-y-2">
            {transcription.isLoading ? (
              <div className="flex flex-col gap-1.5 py-1">
                <div className={`h-2.5 rounded-full animate-pulse ${isOwn ? 'bg-white/20' : 'bg-slate-200'} w-3/4`} />
                <div className={`h-2.5 rounded-full animate-pulse ${isOwn ? 'bg-white/20' : 'bg-slate-200'} w-1/2`} />
              </div>
            ) : (
              <>
                {transcription.transcription && (
                  <p className="text-xs font-medium leading-relaxed italic opacity-90">
                    "{transcription.transcription}"
                  </p>
                )}
                {transcription.translation && (
                  <div className={`pt-1.5 border-t ${isOwn ? 'border-white/10' : 'border-slate-200'}`}>
                    <p className="text-xs font-bold leading-relaxed">
                      {transcription.translation}
                    </p>
                  </div>
                )}
                {!transcription.transcription && !transcription.translation && !transcription.isLoading && (
                  <p className="text-[10px] italic opacity-60">
                    {isRtl ? 'لم يتم العثور على نص واضح' : 'No clear speech detected'}
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
