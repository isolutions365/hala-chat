import React, { useState, useEffect } from 'react';
import { Play, Video as VideoIcon, Loader2, ShieldAlert, RotateCcw } from 'lucide-react';
import { Language } from '../types';

interface VideoMessageBubbleProps {
  videoUrl: string;
  duration?: number;
  isOwn: boolean;
  language: Language;
  onOpenViewer: () => void;
  onRetry?: () => void;
  isLoading?: boolean;
  loop?: boolean;
}

export const VideoMessageBubble: React.FC<VideoMessageBubbleProps> = ({
  videoUrl,
  duration = 0,
  isOwn,
  language,
  onOpenViewer,
  onRetry,
  isLoading = false,
  loop = false,
}) => {
  const isRtl = language === 'ar';
  const [videoDuration, setVideoDuration] = useState<number>(duration);
  const [videoError, setVideoError] = useState(false);

  useEffect(() => {
    setVideoError(false);
  }, [videoUrl]);

  const handleLoadedMetadata = (e: React.SyntheticEvent<HTMLVideoElement, Event>) => {
    setVideoError(false);
    const dur = e.currentTarget.duration;
    if (dur && !isNaN(dur) && isFinite(dur) && dur > 0) {
      setVideoDuration(Math.round(dur));
    }
  };

  const formatDuration = (secs: number) => {
    const total = Math.max(0, Math.floor(secs));
    const minutes = Math.floor(total / 60);
    const remainingSeconds = total % 60;
    return `${minutes}:${remainingSeconds < 10 ? '0' : ''}${remainingSeconds}`;
  };

  const displayDuration = formatDuration(videoDuration || duration || 0);

  return (
    <div
      onClick={() => {
        if (!videoError) onOpenViewer();
      }}
      className="relative w-full h-full overflow-hidden cursor-pointer bg-slate-900 min-h-[140px] max-h-[300px] flex items-center justify-center group"
    >
      <video
        key={videoUrl || 'empty'}
        src={videoUrl || undefined}
        className="w-full h-full max-h-[300px] object-cover"
        preload="metadata"
        playsInline
        muted
        loop={loop}
        onLoadedMetadata={handleLoadedMetadata}
        onError={() => {
          if (videoUrl) setVideoError(true);
        }}
      />

      {videoError ? (
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute inset-0 bg-slate-900/90 flex flex-col items-center justify-center gap-2 text-white px-4 text-center z-10"
        >
          <ShieldAlert className="w-6 h-6 text-rose-400" />
          <span className="text-[11px] font-bold">
            {isRtl ? 'تعذر تشغيل الفيديو' : "Couldn't play video"}
          </span>
          {onRetry && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setVideoError(false);
                onRetry();
              }}
              className="px-3 py-1.5 bg-white text-slate-900 rounded-lg text-[11px] font-bold hover:bg-slate-100 transition-colors cursor-pointer inline-flex items-center gap-1.5"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>{isRtl ? 'إعادة المحاولة' : 'Retry'}</span>
            </button>
          )}
        </div>
      ) : (
        /* Play Overlay Button */
        <div className="absolute inset-0 bg-black/20 group-hover:bg-black/30 transition-colors flex items-center justify-center">
          {isLoading ? (
            <div className="w-12 h-12 rounded-full bg-white/90 text-[#087F75] flex items-center justify-center shadow-lg">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          ) : (
            <div className="w-12 h-12 rounded-full bg-white/90 group-hover:bg-white text-slate-900 group-hover:scale-105 transition-all flex items-center justify-center shadow-lg">
              <Play className="w-5 h-5 fill-current ml-0.5" />
            </div>
          )}
        </div>
      )}

      {/* Video Timing & Duration Badge */}
      <div
        className="absolute top-2.5 left-2.5 px-2 py-0.5 bg-black/55 backdrop-blur-md rounded-full flex items-center gap-1.5 text-[11px] font-semibold text-white pointer-events-none shadow-xs"
        dir="ltr"
      >
        <VideoIcon className="w-3 h-3 text-white/90 shrink-0" />
        <span>{displayDuration}</span>
      </div>
    </div>
  );
};
