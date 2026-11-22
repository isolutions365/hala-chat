import React, { useState, useEffect } from 'react';
import { Phone, Video, Maximize2 } from 'lucide-react';
import { CallModel, Language } from '../types';

interface PersistentCallBannerProps {
  call: CallModel;
  language: Language;
  onRestore: () => void;
}

export const PersistentCallBanner: React.FC<PersistentCallBannerProps> = ({ call, language, onRestore }) => {
  const isRtl = language === 'ar';
  const [seconds, setSeconds] = useState<number>(0);

  useEffect(() => {
    const started = new Date(call.startedAt || Date.now()).getTime();
    const interval = setInterval(() => {
      const diff = Math.floor((Date.now() - started) / 1000);
      setSeconds(diff > 0 ? diff : 0);
    }, 1000);
    return () => clearInterval(interval);
  }, [call.startedAt]);

  const formatDuration = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const remainingSecs = sec % 60;
    const hours = Math.floor(mins / 60);
    const remainMins = mins % 60;
    if (hours > 0) {
      return `${hours}:${remainMins.toString().padStart(2, '0')}:${remainingSecs.toString().padStart(2, '0')}`;
    }
    return `${mins.toString().padStart(2, '0')}:${remainingSecs.toString().padStart(2, '0')}`;
  };

  const isVideo = call.type === 'video';
  const targetName = call.callerName || (isRtl ? 'مكالمة جارية' : 'Ongoing Call');

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onRestore}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onRestore();
      }}
      className="w-full bg-gradient-to-r from-emerald-600 via-teal-700 to-cyan-700 text-white px-3.5 py-2 flex items-center justify-between gap-3 shadow-md cursor-pointer hover:brightness-105 transition-all select-none z-30 shrink-0"
      dir={isRtl ? 'rtl' : 'ltr'}
      title={isRtl ? 'انقر للعودة إلى شاشة المكالمة النشطة' : 'Tap to return to active call screen'}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="relative flex items-center justify-center shrink-0">
          <span className="w-3 h-3 rounded-full bg-emerald-400 animate-ping absolute" />
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 relative z-10 shadow-xs" />
        </div>
        <div className="flex items-center gap-1.5 min-w-0 truncate">
          {isVideo ? (
            <Video className="w-4 h-4 text-emerald-200 shrink-0" />
          ) : (
            <Phone className="w-4 h-4 text-emerald-200 shrink-0 animate-bounce" />
          )}
          <span className="text-xs font-bold truncate">
            {targetName}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <span className="px-2 py-0.5 rounded-full bg-black/20 font-mono text-[11px] font-bold tracking-wider">
          {formatDuration(seconds)}
        </span>
        <div className="flex items-center gap-1 bg-white/15 hover:bg-white/25 px-2.5 py-1 rounded-xl text-[11px] font-bold transition-all shadow-2xs">
          <Maximize2 className="w-3.5 h-3.5" />
          <span className="hidden min-[380px]:inline">{isRtl ? 'تكبير' : 'Restore'}</span>
        </div>
      </div>
    </div>
  );
};
