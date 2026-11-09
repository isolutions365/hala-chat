import React, { useState } from 'react';
import { Play, Video as VideoIcon, Loader2 } from 'lucide-react';
import { Language } from '../types';

interface VideoMessageBubbleProps {
  videoUrl: string;
  duration?: number;
  isOwn: boolean;
  language: Language;
  onOpenViewer: () => void;
  isLoading?: boolean;
}

export const VideoMessageBubble: React.FC<VideoMessageBubbleProps> = ({
  videoUrl,
  duration = 0,
  isOwn,
  language,
  onOpenViewer,
  isLoading = false,
}) => {
  const [videoDuration, setVideoDuration] = useState<number>(duration);

  const handleLoadedMetadata = (e: React.SyntheticEvent<HTMLVideoElement, Event>) => {
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
      onClick={onOpenViewer}
      className="relative rounded-xl overflow-hidden cursor-pointer bg-slate-900 min-h-[140px] max-h-[300px] flex items-center justify-center group"
    >
      <video
        src={videoUrl || undefined}
        className="w-full h-auto max-h-[300px] object-cover rounded-xl"
        preload="metadata"
        playsInline
        muted
        onLoadedMetadata={handleLoadedMetadata}
      />

      {/* Play Overlay Button */}
      <div className="absolute inset-0 bg-black/25 group-hover:bg-black/35 transition-colors flex items-center justify-center">
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

      {/* Video Timing & Duration Badge (WhatsApp style pill) */}
      <div
        className="absolute bottom-2.5 left-2.5 px-2 py-0.5 bg-black/60 backdrop-blur-md rounded-md flex items-center gap-1.5 text-[11px] font-semibold text-white pointer-events-none shadow-sm"
        dir="ltr"
      >
        <VideoIcon className="w-3.5 h-3.5 text-white/90 shrink-0" />
        <span>{displayDuration}</span>
      </div>
    </div>
  );
};
