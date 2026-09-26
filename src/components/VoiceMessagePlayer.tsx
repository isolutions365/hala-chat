import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause } from 'lucide-react';
import { Language } from '../types';

interface VoiceMessagePlayerProps {
  audioUrl: string;
  duration?: number;
  isOwn: boolean;
  language: Language;
  uploadProgress?: number;
  status?: string;
}

// Generate consistent waveform heights based on audio URL
function generateWaveformHeights(seed: string, count = 28): number[] {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }

  const heights: number[] = [];
  for (let i = 0; i < count; i++) {
    const pseudoRandom = Math.abs(Math.sin(hash + i * 13.37));
    // Height between 20% and 100%
    const heightPercent = Math.max(20, Math.round(pseudoRandom * 80 + 20));
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
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(duration || 0);
  const [isLoading, setIsLoading] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const waveformRef = useRef<HTMLDivElement>(null);

  const isRtl = language === 'ar';
  const waveformBars = generateWaveformHeights(audioUrl || 'default-audio-waveform', 26);

  useEffect(() => {
    const audio = new Audio();
    audioRef.current = audio;
    audio.preload = 'metadata';
    audio.src = audioUrl;

    const handleLoadedMetadata = () => {
      if (audio.duration && !isNaN(audio.duration) && isFinite(audio.duration)) {
        setAudioDuration(Math.round(audio.duration));
      }
      setIsLoading(false);
    };

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
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
    };

    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('play', handlePlay);

    return () => {
      audio.pause();
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('play', handlePlay);
      audioRef.current = null;
    };
  }, [audioUrl]);

  const togglePlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!audioRef.current) return;

    if (isPlaying) {
      audioRef.current.pause();
    } else {
      setIsLoading(true);
      audioRef.current
        .play()
        .then(() => {
          setIsLoading(false);
          setIsPlaying(true);
        })
        .catch((err) => {
          console.warn('Audio playback error:', err);
          setIsLoading(false);
          setIsPlaying(false);
        });
    }
  };

  const handleWaveformClick = (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (!waveformRef.current || !audioRef.current) return;

    const rect = waveformRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const progress = Math.max(0, Math.min(1, clickX / rect.width));
    const effectiveDuration = audioDuration || audioRef.current.duration || 1;
    const newTime = progress * effectiveDuration;

    audioRef.current.currentTime = newTime;
    setCurrentTime(newTime);
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

  return (
    <div
      className="flex items-center gap-3 py-1 px-1 min-w-[200px] sm:min-w-[240px] select-none"
      dir="ltr"
    >
      {/* Play / Pause Circular Button or Upload Progress Ring */}
      {status === 'sending' || (uploadProgress !== undefined && uploadProgress < 100) ? (
        <div className={`relative w-10 h-10 rounded-full flex items-center justify-center shrink-0 shadow-xs ${
          isOwn ? 'bg-white text-[#D85A30]' : 'bg-[#D85A30] text-white'
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
              ? 'bg-white text-[#D85A30] hover:bg-slate-50'
              : 'bg-[#D85A30] text-white hover:bg-[#c44e27]'
          }`}
          aria-label={isPlaying ? 'Pause voice message' : 'Play voice message'}
        >
          {isLoading ? (
            <div
              className={`w-4 h-4 border-2 rounded-full animate-spin ${
                isOwn ? 'border-[#D85A30] border-t-transparent' : 'border-white border-t-transparent'
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
        {/* Interactive Waveform Container */}
        <div
          ref={waveformRef}
          onClick={handleWaveformClick}
          className="h-7 flex items-center gap-[2.5px] cursor-pointer py-1 group relative"
          title="Tap to seek audio"
        >
          {waveformBars.map((height, i) => {
            const barProgress = i / waveformBars.length;
            const isPlayed = barProgress <= playbackProgress;

            return (
              <div
                key={i}
                className="flex-1 min-w-[2px] rounded-full transition-all duration-75"
                style={{
                  height: `${height}%`,
                  backgroundColor: isOwn
                    ? isPlayed
                      ? 'rgba(255, 255, 255, 0.95)'
                      : 'rgba(255, 255, 255, 0.4)'
                    : isPlayed
                    ? '#D85A30'
                    : '#CBD5E1',
                }}
              />
            );
          })}
        </div>

        {/* Duration / Timer & Progress text */}
        <div
          className={`flex items-center justify-between text-[11px] font-medium leading-none ${
            isOwn ? 'text-white/80' : 'text-slate-500'
          }`}
        >
          <span>{displayTime}</span>
          <span className="text-[10px] opacity-75">
            {isRtl ? 'صوتية' : 'Voice'}
          </span>
        </div>
      </div>
    </div>
  );
};
