import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Film, Loader2, Plus, RefreshCw } from 'lucide-react';
import { Language } from '../../types';
import {
  deleteReel,
  ReelModel,
  subscribeToReels,
} from '../../services/reels';
import { ReelCard } from './ReelCard';
import { ReelCommentsSheet } from './ReelCommentsSheet';

interface ReelsFeedProps {
  language: Language;
  currentUserId: string;
  currentUserName: string;
  isActive: boolean;
  canCreateReel?: boolean;
  onRequestCreateReel?: () => void;
}

export const ReelsFeed: React.FC<ReelsFeedProps> = ({
  language,
  currentUserId,
  currentUserName,
  isActive,
  canCreateReel = true,
  onRequestCreateReel,
}) => {
  const isRtl = language === 'ar';
  const containerRef = useRef<HTMLDivElement | null>(null);
  const cardRefs = useRef<Map<number, HTMLElement>>(new Map());
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [reels, setReels] = useState<ReelModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [limitCount, setLimitCount] = useState(20);
  const [retryTick, setRetryTick] = useState(0);

  const [activeIndex, setActiveIndex] = useState(0);
  const [isMuted, setIsMuted] = useState(true);
  const [isDocumentHidden, setIsDocumentHidden] = useState<boolean>(
    typeof document !== 'undefined' ? document.hidden : false
  );
  const [commentsReelId, setCommentsReelId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState('');

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => {
      setToastMessage('');
    }, 2400);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const handleVisibility = () => {
      setIsDocumentHidden(document.hidden);
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, []);

  useEffect(() => {
    setLoading(true);
    setLoadError(false);

    const unsubscribe = subscribeToReels(
      limitCount,
      (items) => {
        setReels(items);
        setLoading(false);
        setActiveIndex((prev) => (items.length === 0 ? 0 : Math.min(prev, items.length - 1)));
      },
      () => {
        setLoadError(true);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [limitCount, retryTick]);

  const registerCardRef = useCallback((index: number, el: HTMLElement | null) => {
    if (el) {
      cardRefs.current.set(index, el);
    } else {
      cardRefs.current.delete(index);
    }
  }, []);

  // Observe visible reel inside the scroll-snap container
  useEffect(() => {
    const rootEl = containerRef.current;
    if (!rootEl || reels.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.6) {
            const rawIdx = (entry.target as HTMLElement).dataset.reelIndex;
            const parsed = rawIdx !== undefined ? Number.parseInt(rawIdx, 10) : NaN;
            if (!Number.isNaN(parsed)) {
              setActiveIndex(parsed);
              if (parsed >= reels.length - 2 && reels.length >= limitCount && limitCount < 50) {
                setLimitCount((prev) => Math.min(50, prev + 10));
              }
            }
          }
        }
      },
      {
        root: rootEl,
        threshold: [0.6],
      }
    );

    cardRefs.current.forEach((el) => observer.observe(el));

    return () => observer.disconnect();
  }, [reels, limitCount]);

  const handleShareReel = async (reel: ReelModel) => {
    const shareUrl =
      typeof window !== 'undefined'
        ? `${window.location.origin}/?reel=${encodeURIComponent(reel.id)}`
        : reel.videoUrl;
    const shareTitle = isRtl ? 'ريل على هلا' : 'Hala Reel';
    const shareText = reel.caption ? reel.caption.slice(0, 120) : shareTitle;

    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: shareTitle, text: shareText, url: shareUrl });
        return;
      } catch (err: any) {
        if (err?.name === 'AbortError') return;
      }
    }

    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl);
        showToast(isRtl ? 'تم نسخ رابط الريل' : 'Reel link copied');
        return;
      }
    } catch {}

    showToast(isRtl ? 'تعذر نسخ الرابط' : 'Could not copy link');
  };

  const handleDeleteReel = async (reel: ReelModel) => {
    await deleteReel(reel);
    showToast(isRtl ? 'تم حذف الريل' : 'Reel deleted');
  };

  const commentsTargetReel = reels.find((r) => r.id === commentsReelId) || null;
  const isFeedVisible = isActive && !isDocumentHidden;

  if (loading && reels.length === 0) {
    return (
      <div
        className="flex-1 min-h-0 h-full w-full bg-black text-white flex flex-col items-center justify-center gap-3 p-6"
        dir={isRtl ? 'rtl' : 'ltr'}
      >
        <Loader2 className="w-7 h-7 animate-spin text-[#8FE8D0]" />
        <p className="text-xs font-medium text-slate-300">
          {isRtl ? 'جارٍ تحميل الريلز…' : 'Loading Reels…'}
        </p>
      </div>
    );
  }

  if (loadError && reels.length === 0) {
    return (
      <div
        className="flex-1 min-h-0 h-full w-full bg-black text-white flex flex-col items-center justify-center gap-4 p-6 text-center"
        dir={isRtl ? 'rtl' : 'ltr'}
      >
        <p className="text-sm text-slate-300">
          {isRtl ? 'تعذر تحميل مقاطع الريلز. تحقق من الاتصال وحاول مجدداً.' : 'Could not load Reels. Check your connection and try again.'}
        </p>
        <button
          type="button"
          onClick={() => setRetryTick((n) => n + 1)}
          className="min-h-[44px] px-5 py-2.5 rounded-xl bg-[#087F75] hover:bg-[#06685F] text-white text-xs font-semibold inline-flex items-center gap-2 cursor-pointer"
        >
          <RefreshCw className="w-4 h-4" />
          <span>{isRtl ? 'إعادة المحاولة' : 'Retry'}</span>
        </button>
      </div>
    );
  }

  if (reels.length === 0) {
    return (
      <div
        className="flex-1 min-h-0 h-full w-full bg-[#071318] text-white flex flex-col items-center justify-center p-6 text-center"
        dir={isRtl ? 'rtl' : 'ltr'}
      >
        <div className="max-w-xs w-full space-y-4">
          <div className="w-16 h-16 rounded-3xl bg-white/10 border border-white/15 text-[#8FE8D0] flex items-center justify-center mx-auto">
            <Film className="w-8 h-8" />
          </div>
          <h2 className="text-lg font-bold">
            {isRtl ? 'لا توجد مقاطع ريلز بعد' : 'No Reels yet'}
          </h2>
          <p className="text-xs text-slate-300 leading-relaxed">
            {isRtl
              ? 'كن أول من يشارك فيديو قصير مع مجتمع هلا.'
              : 'Be the first to share a short video reel with the community.'}
          </p>
          {canCreateReel && onRequestCreateReel && (
            <button
              type="button"
              onClick={onRequestCreateReel}
              className="min-h-[44px] px-5 py-2.5 rounded-xl bg-[#087F75] hover:bg-[#06685F] text-white text-sm font-semibold inline-flex items-center gap-2 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>{isRtl ? 'إنشاء ريل' : 'Create Reel'}</span>
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 h-full w-full relative bg-black overflow-hidden">
      <div
        ref={containerRef}
        className="h-full w-full overflow-y-scroll snap-y snap-mandatory no-scrollbar scroll-smooth"
        aria-label={isRtl ? 'مقاطع الريلز' : 'Reels feed'}
      >
        {reels.map((reel, idx) => (
          <ReelCard
            key={reel.id}
            reel={reel}
            index={idx}
            isActive={idx === activeIndex}
            isFeedVisible={isFeedVisible}
            shouldPreload={idx === activeIndex || idx === activeIndex + 1}
            isMuted={isMuted}
            currentUserId={currentUserId}
            language={language}
            registerCardRef={registerCardRef}
            onToggleMute={() => setIsMuted((m) => !m)}
            onOpenComments={(target) => setCommentsReelId(target.id)}
            onShareReel={handleShareReel}
            onDeleteReel={handleDeleteReel}
            onFeedback={showToast}
          />
        ))}
      </div>

      {toastMessage && (
        <div
          role="status"
          aria-live="polite"
          className="absolute top-4 left-1/2 -translate-x-1/2 z-30 px-4 py-2 rounded-xl bg-slate-900/90 text-white text-xs font-semibold shadow-lg border border-white/10 pointer-events-none"
        >
          {toastMessage}
        </div>
      )}

      <ReelCommentsSheet
        isOpen={Boolean(commentsTargetReel)}
        reelId={commentsTargetReel?.id || null}
        reelAuthorId={commentsTargetReel?.authorId || ''}
        commentsCount={commentsTargetReel?.commentsCount || 0}
        currentUserId={currentUserId}
        currentUserName={currentUserName}
        language={language}
        onClose={() => setCommentsReelId(null)}
      />
    </div>
  );
};
