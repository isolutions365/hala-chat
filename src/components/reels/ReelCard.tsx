import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import {
  Heart,
  MessageCircle,
  Share2,
  UserPlus,
  UserCheck,
  Volume2,
  VolumeX,
  Trash2,
  Play,
  RefreshCw,
} from 'lucide-react';
import { Language } from '../../types';
import {
  parseVideoTimeFragment,
  ReelAuthorProfile,
  ReelModel,
  subscribeToReelAuthorProfile,
  toggleFollowAuthor,
  toggleReelLike,
  watchFollowAuthor,
  watchReelLikeStatus,
} from '../../services/reels';
import { LazyImage } from '../LazyImage';

interface ReelCardProps {
  reel: ReelModel;
  index: number;
  isActive: boolean;
  isFeedVisible: boolean;
  shouldPreload: boolean;
  isMuted: boolean;
  currentUserId: string;
  language: Language;
  registerCardRef: (index: number, el: HTMLElement | null) => void;
  onToggleMute: () => void;
  onForceMute?: () => void;
  onOpenComments: (reel: ReelModel) => void;
  onShareReel: (reel: ReelModel) => void;
  onDeleteReel: (reel: ReelModel) => Promise<void>;
  onOpenCreatorProfile?: (authorId: string) => void;
  onFeedback?: (message: string) => void;
}

function formatReelTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0:00';
  const whole = Math.floor(seconds);
  const mins = Math.floor(whole / 60);
  const secs = whole % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export const ReelCard: React.FC<ReelCardProps> = ({
  reel,
  index,
  isActive,
  isFeedVisible,
  shouldPreload,
  isMuted,
  currentUserId,
  language,
  registerCardRef,
  onToggleMute,
  onForceMute,
  onOpenComments,
  onShareReel,
  onDeleteReel,
  onOpenCreatorProfile,
  onFeedback,
}) => {
  const isRtl = language === 'ar';
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const preloadedRef = useRef(false);
  const muteHintTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [author, setAuthor] = useState<ReelAuthorProfile>({
    id: reel.authorId,
    name: isRtl ? 'مبدع' : 'Creator',
    username: '',
    avatarUrl: null,
    bio: '',
    followersCount: 0,
    followingCount: 0,
    reelsCount: 0,
  });
  const [isLiked, setIsLiked] = useState(false);
  const [likeBusy, setLikeBusy] = useState(false);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);
  const [followPulseKey, setFollowPulseKey] = useState(0);
  const [isCaptionExpanded, setIsCaptionExpanded] = useState(false);
  const [showMuteOverlay, setShowMuteOverlay] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [playbackPausedNotice, setPlaybackPausedNotice] = useState(false);
  const [videoError, setVideoError] = useState(false);
  const [isInViewport, setIsInViewport] = useState(isActive);
  const [playbackProgress, setPlaybackProgress] = useState(0);
  const [currentTimeSec, setCurrentTimeSec] = useState(0);
  const [durationSec, setDurationSec] = useState(0);
  const [isScrubbing, setIsScrubbing] = useState(false);

  useEffect(() => {
    setVideoError(false);
  }, [reel.videoUrl]);

  const progressBarRef = useRef<HTMLDivElement | null>(null);
  const isScrubbingRef = useRef(false);
  const wasPlayingBeforeScrubRef = useRef(false);

  const { startSec, endSec } = useMemo(
    () => parseVideoTimeFragment(reel.videoUrl),
    [reel.videoUrl]
  );

  const isOwnReel = reel.authorId === currentUserId;
  const shouldPlay = isActive && isFeedVisible && isInViewport;
  const displayedFollowersCount = author.followersCount;

  useEffect(() => {
    return subscribeToReelAuthorProfile(reel.authorId, (prof) => {
      setAuthor(prof);
    });
  }, [reel.authorId]);

  useEffect(() => {
    return watchReelLikeStatus(reel.id, currentUserId, setIsLiked);
  }, [reel.id, currentUserId]);

  useEffect(() => {
    if (isOwnReel) {
      setIsFollowing(false);
      return;
    }
    return watchFollowAuthor(currentUserId, reel.authorId, (next) => {
      setIsFollowing(next);
    });
  }, [currentUserId, reel.authorId, isOwnReel]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.defaultMuted = isMuted;
    video.muted = isMuted;
  }, [isMuted]);

  const attemptPlay = React.useCallback(
    (forceWhenVisible = false) => {
      const video = videoRef.current;
      if (!video || (!shouldPlay && !forceWhenVisible)) return;

      video.defaultMuted = isMuted;
      video.muted = isMuted;

      if (startSec > 0 && video.readyState >= 1 && video.currentTime < startSec) {
        try {
          video.currentTime = startSec;
        } catch {}
      }

      const playPromise = video.play();
      if (playPromise && typeof playPromise.then === 'function') {
        playPromise
          .then(() => {
            setPlaybackPausedNotice(false);
          })
          .catch((err: unknown) => {
            const errName = (err as { name?: string } | null)?.name;
            if (!video.muted) {
              video.defaultMuted = true;
              video.muted = true;
              onForceMute?.();
              video
                .play()
                .then(() => setPlaybackPausedNotice(false))
                .catch((mutedErr: unknown) => {
                  const mutedErrName = (mutedErr as { name?: string } | null)?.name;
                  if (mutedErrName !== 'AbortError') {
                    setPlaybackPausedNotice(true);
                  }
                });
            } else if (errName !== 'AbortError') {
              setPlaybackPausedNotice(true);
            }
          });
      }
    },
    [shouldPlay, isMuted, startSec, onForceMute]
  );

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (shouldPlay) {
      attemptPlay();
    } else {
      video.pause();
      setPlaybackPausedNotice(false);
      if (shouldPreload && !preloadedRef.current && video.readyState === 0) {
        preloadedRef.current = true;
        video.load();
      }
    }
  }, [shouldPlay, shouldPreload, attemptPlay]);

  // Trigger play() when the video element enters the viewport and pause() as it exits
  useEffect(() => {
    const video = videoRef.current;
    if (!video || typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.target !== video) continue;
          const visible = entry.isIntersecting && entry.intersectionRatio >= 0.5;
          setIsInViewport(visible);
          if (visible) {
            if (isFeedVisible && isActive) {
              attemptPlay(true);
            }
          } else {
            video.pause();
            setPlaybackPausedNotice(false);
          }
        }
      },
      { threshold: [0, 0.5, 0.75] }
    );

    observer.observe(video);
    return () => observer.disconnect();
  }, [isActive, isFeedVisible, attemptPlay]);

  useEffect(() => {
    return () => {
      if (muteHintTimeoutRef.current) {
        clearTimeout(muteHintTimeoutRef.current);
      }
    };
  }, []);

  const handleVideoTap = () => {
    const video = videoRef.current;
    if (video && shouldPlay && (playbackPausedNotice || video.paused)) {
      video.defaultMuted = isMuted;
      video.muted = isMuted;
      video
        .play()
        .then(() => setPlaybackPausedNotice(false))
        .catch(() => {
          video.defaultMuted = true;
          video.muted = true;
          onForceMute?.();
          video.play().then(() => setPlaybackPausedNotice(false)).catch(() => {});
        });
      return;
    }
    const nextMuted = !isMuted;
    if (video) {
      video.muted = nextMuted;
      video.defaultMuted = nextMuted;
    }
    onToggleMute();
    setShowMuteOverlay(true);
    if (muteHintTimeoutRef.current) {
      clearTimeout(muteHintTimeoutRef.current);
    }
    muteHintTimeoutRef.current = setTimeout(() => {
      setShowMuteOverlay(false);
    }, 850);
  };

  const getEffectiveTimeBounds = React.useCallback(
    (video: HTMLVideoElement) => {
      const effectiveStart = startSec > 0 ? startSec : 0;
      const effectiveEnd =
        endSec !== null && endSec > effectiveStart
          ? endSec
          : Number.isFinite(video.duration) && video.duration > effectiveStart
          ? video.duration
          : 0;
      const span = Math.max(0, effectiveEnd - effectiveStart);
      return { effectiveStart, effectiveEnd, span };
    },
    [startSec, endSec]
  );

  const syncPlaybackProgress = React.useCallback(() => {
    const video = videoRef.current;
    if (!video || isScrubbingRef.current) return;
    const { effectiveStart, span } = getEffectiveTimeBounds(video);
    setDurationSec(span);
    if (span <= 0) {
      setCurrentTimeSec(0);
      setPlaybackProgress(0);
      return;
    }
    const elapsed = Math.min(span, Math.max(0, video.currentTime - effectiveStart));
    const pct = Math.min(100, Math.max(0, (elapsed / span) * 100));
    setCurrentTimeSec(elapsed);
    setPlaybackProgress(pct);
  }, [getEffectiveTimeBounds]);

  useEffect(() => {
    if (!shouldPlay) return;
    let rafId = 0;
    const tick = () => {
      syncPlaybackProgress();
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [shouldPlay, syncPlaybackProgress]);

  const handleTimeUpdate = () => {
    const video = videoRef.current;
    if (!video) return;
    if (endSec !== null && video.currentTime >= endSec && !isScrubbingRef.current) {
      video.currentTime = startSec;
      if (shouldPlay && video.paused) {
        video.play().catch(() => {});
      }
    }
    syncPlaybackProgress();
  };

  const getScrubRatioFromClientX = (clientX: number): number => {
    const bar = progressBarRef.current;
    if (!bar) return 0;
    const rect = bar.getBoundingClientRect();
    if (rect.width <= 0) return 0;
    return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
  };

  const seekToRatio = (ratio: number) => {
    const video = videoRef.current;
    if (!video) return;
    const { effectiveStart, span } = getEffectiveTimeBounds(video);
    if (span <= 0) return;
    const clampedRatio = Math.min(1, Math.max(0, ratio));
    const relativeSec = clampedRatio * span;
    const targetTime = effectiveStart + relativeSec;
    try {
      video.currentTime = targetTime;
    } catch {}
    setCurrentTimeSec(relativeSec);
    setDurationSec(span);
    setPlaybackProgress(clampedRatio * 100);
  };

  const handleProgressPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    const video = videoRef.current;
    if (!video) return;
    const { span } = getEffectiveTimeBounds(video);
    if (span <= 0) return;

    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}

    wasPlayingBeforeScrubRef.current = !video.paused;
    if (!video.paused) {
      video.pause();
    }
    isScrubbingRef.current = true;
    setIsScrubbing(true);
    seekToRatio(getScrubRatioFromClientX(e.clientX));
  };

  const handleProgressPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isScrubbingRef.current) return;
    e.stopPropagation();
    seekToRatio(getScrubRatioFromClientX(e.clientX));
  };

  const handleProgressPointerEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isScrubbingRef.current) return;
    e.stopPropagation();
    isScrubbingRef.current = false;
    setIsScrubbing(false);
    try {
      if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {}
    if (wasPlayingBeforeScrubRef.current && shouldPlay) {
      attemptPlay();
    }
  };

  const handleProgressKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const video = videoRef.current;
    if (!video) return;
    const { span } = getEffectiveTimeBounds(video);
    if (span <= 0) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      e.preventDefault();
      e.stopPropagation();
      seekToRatio((currentTimeSec + 2) / span);
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      e.preventDefault();
      e.stopPropagation();
      seekToRatio((currentTimeSec - 2) / span);
    }
  };

  const handleLikeClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (likeBusy) return;
    setLikeBusy(true);
    try {
      await toggleReelLike(reel.id, currentUserId);
    } catch {
      onFeedback?.(isRtl ? 'تعذر تحديث الإعجاب.' : 'Could not update like.');
    } finally {
      setLikeBusy(false);
    }
  };

  const handleFollowClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (followBusy || isOwnReel) return;

    setFollowPulseKey((k) => k + 1);
    setFollowBusy(true);
    try {
      await toggleFollowAuthor(currentUserId, reel.authorId);
    } catch {
      onFeedback?.(isRtl ? 'تعذر تحديث المتابعة.' : 'Could not update follow status.');
    } finally {
      setFollowBusy(false);
    }
  };

  const handleConfirmDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (deleting) return;
    setDeleting(true);
    try {
      await onDeleteReel(reel);
    } catch {
      onFeedback?.(isRtl ? 'تعذر حذف الريل.' : 'Could not delete reel.');
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  return (
    <article
      ref={(el) => registerCardRef(index, el)}
      data-reel-index={index}
      className="w-full h-full min-h-full snap-start snap-always relative bg-black flex items-center justify-center overflow-hidden select-none"
      aria-label={`${isRtl ? 'ريل من' : 'Reel by'} ${author.name}`}
    >
      <div className="relative w-full h-full sm:max-w-[460px] mx-auto bg-black overflow-hidden">
        <video
          ref={videoRef}
          src={reel.videoUrl}
          poster={reel.thumbnailUrl || undefined}
          autoPlay={shouldPlay}
          playsInline
          loop={endSec === null}
          muted={isMuted}
          preload={shouldPreload || isActive ? 'auto' : 'metadata'}
          onLoadedMetadata={() => {
            const video = videoRef.current;
            if (!video) return;
            if (startSec > 0 && video.currentTime < startSec) {
              try {
                video.currentTime = startSec;
              } catch {}
            }
            syncPlaybackProgress();
            if (shouldPlay && video.paused) {
              attemptPlay();
            }
          }}
          onDurationChange={syncPlaybackProgress}
          onLoadedData={() => {
            syncPlaybackProgress();
            if (shouldPlay && videoRef.current?.paused) {
              attemptPlay();
            }
          }}
          onCanPlay={() => {
            if (shouldPlay && videoRef.current?.paused) {
              attemptPlay();
            }
          }}
          onPlaying={() => {
            setPlaybackPausedNotice(false);
            setVideoError(false);
          }}
          onError={() => {
            if (reel.videoUrl) setVideoError(true);
          }}
          onTimeUpdate={handleTimeUpdate}
          onClick={handleVideoTap}
          className="w-full h-full object-cover cursor-pointer"
        />

        {videoError && (
          <div
            onClick={(e) => e.stopPropagation()}
            className="absolute inset-0 z-30 bg-black/75 flex flex-col items-center justify-center gap-3 p-6 text-center text-white"
          >
            <p className="text-sm font-medium text-slate-200">
              {isRtl ? 'تعذر تشغيل الفيديو' : 'Could not load video'}
            </p>
            <button
              type="button"
              onClick={() => {
                setVideoError(false);
                const video = videoRef.current;
                if (video) {
                  video.load();
                  video.play().catch(() => setVideoError(true));
                }
              }}
              className="min-h-[44px] px-5 py-2 rounded-xl bg-[#087F75] hover:bg-[#06685F] text-white text-xs font-bold inline-flex items-center gap-2 cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" />
              <span>{isRtl ? 'إعادة المحاولة' : 'Retry'}</span>
            </button>
          </div>
        )}

        {/* Top gradient scrim + audio status button */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/55 to-transparent" />
        <div className="absolute top-[max(12px,env(safe-area-inset-top))] right-3 z-20 flex items-center gap-2">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleVideoTap();
            }}
            aria-label={
              isMuted
                ? isRtl
                  ? 'تشغيل الصوت'
                  : 'Unmute video'
                : isRtl
                ? 'كتم الصوت'
                : 'Mute video'
            }
            className="min-w-[44px] min-h-[44px] rounded-full bg-black/50 hover:bg-black/70 text-white backdrop-blur-xs flex items-center justify-center transition-colors cursor-pointer"
          >
            {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
          </button>
        </div>

        {/* Center tap-to-unmute or autoplay-blocked cue */}
        {(showMuteOverlay || playbackPausedNotice) && (
          <button
            type="button"
            onClick={handleVideoTap}
            aria-label={isRtl ? 'تبديل الصوت' : 'Toggle audio'}
            className="absolute inset-0 m-auto w-16 h-16 rounded-full bg-black/60 text-white flex items-center justify-center backdrop-blur-xs transition-opacity z-20 cursor-pointer"
          >
            {playbackPausedNotice ? (
              <Play className="w-7 h-7 fill-current ml-0.5" />
            ) : isMuted ? (
              <VolumeX className="w-7 h-7" />
            ) : (
              <Volume2 className="w-7 h-7" />
            )}
          </button>
        )}

        {/* Bottom contrast scrim */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-56 bg-gradient-to-t from-black/85 via-black/40 to-transparent" />

        {/* Interactive Facebook-style playback progress bar with time display */}
        <div
          dir="ltr"
          onClick={(e) => e.stopPropagation()}
          className="absolute inset-x-3 bottom-1 z-30 select-none"
        >
          {isScrubbing && durationSec > 0 && (
            <div className="flex justify-center mb-2 pointer-events-none">
              <div className="px-3 py-1 rounded-full bg-black/80 text-white text-xs font-bold tabular-nums shadow-lg border border-white/15 backdrop-blur-xs">
                {formatReelTime(currentTimeSec)} / {formatReelTime(durationSec)}
              </div>
            </div>
          )}

          <div className="flex items-center justify-between text-[11px] font-semibold tabular-nums text-white/90 drop-shadow px-0.5 pointer-events-none">
            <span>{formatReelTime(currentTimeSec)}</span>
            <span>{formatReelTime(durationSec)}</span>
          </div>

          <div
            ref={progressBarRef}
            role="slider"
            tabIndex={0}
            aria-label={isRtl ? 'شريط تقدم الفيديو' : 'Reel playback progress'}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(playbackProgress)}
            aria-valuetext={`${formatReelTime(currentTimeSec)} of ${formatReelTime(durationSec)}`}
            onPointerDown={handleProgressPointerDown}
            onPointerMove={handleProgressPointerMove}
            onPointerUp={handleProgressPointerEnd}
            onPointerCancel={handleProgressPointerEnd}
            onKeyDown={handleProgressKeyDown}
            className="w-full h-6 flex items-center cursor-pointer touch-none group focus:outline-hidden"
          >
            <div
              className={`w-full rounded-full bg-white/30 relative transition-all duration-150 ${
                isScrubbing ? 'h-[6px]' : 'h-[3.5px] group-hover:h-[5px]'
              }`}
            >
              <div
                className="h-full rounded-full bg-white relative"
                style={{ width: `${playbackProgress.toFixed(2)}%` }}
              >
                <span
                  className={`absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 rounded-full bg-white shadow-md transition-transform ${
                    isScrubbing
                      ? 'w-4 h-4 scale-110 ring-4 ring-white/25'
                      : 'w-2.5 h-2.5 opacity-90 group-hover:scale-125'
                  }`}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Right-side actions: Like, Comment, Share, Follow (+ Delete for owner) */}
        <div
          className="absolute right-3 bottom-10 z-20 flex flex-col items-center gap-3.5"
          dir="ltr"
        >
          <button
            type="button"
            disabled={likeBusy}
            onClick={handleLikeClick}
            aria-pressed={isLiked}
            aria-label={isRtl ? 'إعجاب' : 'Like'}
            className="min-w-[44px] min-h-[44px] flex flex-col items-center justify-center gap-1 text-white cursor-pointer disabled:opacity-60"
          >
            <span
              className={`w-11 h-11 rounded-full flex items-center justify-center backdrop-blur-xs transition-transform active:scale-90 ${
                isLiked ? 'bg-rose-500/25 text-rose-400' : 'bg-black/45 hover:bg-black/65 text-white'
              }`}
            >
              <Heart className={`w-5 h-5 ${isLiked ? 'fill-rose-500 text-rose-500' : ''}`} />
            </span>
            <span className="text-xs font-semibold tabular-nums drop-shadow">
              {reel.likesCount}
            </span>
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenComments(reel);
            }}
            aria-label={isRtl ? 'التعليقات' : 'Comments'}
            className="min-w-[44px] min-h-[44px] flex flex-col items-center justify-center gap-1 text-white cursor-pointer"
          >
            <span className="w-11 h-11 rounded-full bg-black/45 hover:bg-black/65 backdrop-blur-xs flex items-center justify-center transition-transform active:scale-90">
              <MessageCircle className="w-5 h-5" />
            </span>
            <span className="text-xs font-semibold tabular-nums drop-shadow">
              {reel.commentsCount}
            </span>
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onShareReel(reel);
            }}
            aria-label={isRtl ? 'مشاركة' : 'Share'}
            className="min-w-[44px] min-h-[44px] flex flex-col items-center justify-center gap-1 text-white cursor-pointer"
          >
            <span className="w-11 h-11 rounded-full bg-black/45 hover:bg-black/65 backdrop-blur-xs flex items-center justify-center transition-transform active:scale-90">
              <Share2 className="w-5 h-5" />
            </span>
            <span className="text-[11px] font-semibold drop-shadow">
              {isRtl ? 'مشاركة' : 'Share'}
            </span>
          </button>

          {!isOwnReel ? (
            <motion.button
              type="button"
              disabled={followBusy}
              onClick={handleFollowClick}
              whileTap={{ scale: 0.88 }}
              aria-pressed={isFollowing}
              aria-label={isFollowing ? (isRtl ? 'إلغاء المتابعة' : 'Unfollow') : (isRtl ? 'متابعة' : 'Follow')}
              className="min-w-[44px] min-h-[44px] flex flex-col items-center justify-center gap-0.5 text-white cursor-pointer disabled:opacity-80"
            >
              <span className="relative w-11 h-11 flex items-center justify-center">
                {followPulseKey > 0 && (
                  <motion.span
                    key={`pulse-${followPulseKey}`}
                    initial={{ scale: 0.85, opacity: 0.75 }}
                    animate={{ scale: 1.85, opacity: 0 }}
                    transition={{ duration: 0.5, ease: 'easeOut' }}
                    className={`pointer-events-none absolute inset-0 rounded-full ring-2 ${
                      isFollowing ? 'ring-[#8FE8D0]' : 'ring-white/80'
                    }`}
                  />
                )}
                <motion.span
                  key={`icon-${followPulseKey}`}
                  initial={followPulseKey > 0 ? { scale: 0.85 } : false}
                  animate={followPulseKey > 0 ? { scale: [0.85, 1.24, 0.94, 1] } : { scale: 1 }}
                  transition={{ duration: 0.36, ease: 'easeOut' }}
                  className={`relative w-11 h-11 rounded-full flex items-center justify-center backdrop-blur-xs transition-colors ${
                    isFollowing
                      ? 'bg-white/25 text-[#8FE8D0] ring-1 ring-[#8FE8D0]/60'
                      : 'bg-[#087F75] hover:bg-[#06685F] text-white'
                  }`}
                >
                  {isFollowing ? <UserCheck className="w-5 h-5" /> : <UserPlus className="w-5 h-5" />}
                </motion.span>
              </span>
              <span className="text-[11px] font-semibold drop-shadow whitespace-nowrap">
                {isFollowing
                  ? isRtl
                    ? 'متابَع'
                    : 'Following'
                  : isRtl
                  ? 'متابعة'
                  : 'Follow'}
              </span>
              <span className="text-[10px] font-semibold tabular-nums text-white/80 drop-shadow leading-none">
                {displayedFollowersCount}
              </span>
            </motion.button>
          ) : (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setConfirmDelete(true);
              }}
              aria-label={isRtl ? 'حذف الريل' : 'Delete reel'}
              className="min-w-[44px] min-h-[44px] flex flex-col items-center justify-center gap-1 text-white cursor-pointer"
            >
              <span className="w-11 h-11 rounded-full bg-black/45 hover:bg-rose-600/80 backdrop-blur-xs flex items-center justify-center transition-colors">
                <Trash2 className="w-5 h-5" />
              </span>
              <span className="text-[11px] font-semibold drop-shadow">
                {isRtl ? 'حذف' : 'Delete'}
              </span>
            </button>
          )}
        </div>

        {/* Bottom-left Author, Caption & Quiet Counts */}
        <div
          className="absolute left-4 right-20 bottom-10 z-10 text-white space-y-2"
          dir={isRtl ? 'rtl' : 'ltr'}
        >
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (reel.authorId) {
                onOpenCreatorProfile?.(reel.authorId);
              }
            }}
            className="flex items-center gap-2.5 min-w-0 min-h-[44px] text-start cursor-pointer group"
          >
            <div className="w-10 h-10 rounded-2xl bg-[#087F75] text-white flex items-center justify-center overflow-hidden font-bold text-sm shrink-0 border border-white/25 group-hover:border-white/60 transition-colors">
              {author.avatarUrl ? (
                <LazyImage
                  src={author.avatarUrl}
                  alt={author.name}
                  aspectRatio="1/1"
                  containerClassName="w-full h-full rounded-2xl"
                  className="w-full h-full object-cover"
                />
              ) : (
                <span>{author.name.charAt(0).toUpperCase()}</span>
              )}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 min-w-0">
                <p className="text-sm font-bold text-white truncate drop-shadow group-hover:underline">
                  {author.name}
                </p>
                {author.username && (
                  <span className="text-xs text-white/75 truncate drop-shadow" dir="ltr">
                    @{author.username}
                  </span>
                )}
              </div>
              <p className="text-xs text-white/80 tabular-nums drop-shadow">
                {displayedFollowersCount} {displayedFollowersCount === 1 ? (isRtl ? 'متابع' : 'follower') : (isRtl ? 'متابعون' : 'followers')} ·{' '}
                {reel.likesCount} {reel.likesCount === 1 ? (isRtl ? 'إعجاب' : 'like') : (isRtl ? 'إعجابات' : 'likes')} · {reel.commentsCount}{' '}
                {reel.commentsCount === 1 ? (isRtl ? 'تعليق' : 'comment') : (isRtl ? 'تعليقات' : 'comments')}
              </p>
            </div>
          </button>

          {reel.caption && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsCaptionExpanded((v) => !v);
              }}
              className="block text-start w-full cursor-pointer"
            >
              <p
                dir="auto"
                className={`text-sm text-white/95 leading-snug drop-shadow ${
                  isCaptionExpanded ? 'whitespace-pre-wrap' : 'line-clamp-2'
                }`}
              >
                {reel.caption}
              </p>
            </button>
          )}
        </div>

        {/* Delete confirmation overlay for owner */}
        {confirmDelete && (
          <div
            onClick={(e) => e.stopPropagation()}
            dir={isRtl ? 'rtl' : 'ltr'}
            className="absolute inset-0 z-30 bg-black/75 backdrop-blur-xs flex items-center justify-center p-6"
          >
            <div className="w-full max-w-xs rounded-2xl bg-slate-900 border border-slate-700 p-5 text-white space-y-4">
              <h4 className="text-sm font-bold">
                {isRtl ? 'حذف هذا الريل نهائياً؟' : 'Delete this reel permanently?'}
              </h4>
              <p className="text-xs text-slate-300 leading-relaxed">
                {isRtl
                  ? 'سيتم حذف الفيديو والتعليقات والإعجابات المرتبطة به.'
                  : 'This will remove your reel video and its metadata.'}
              </p>
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  disabled={deleting}
                  onClick={() => setConfirmDelete(false)}
                  className="min-h-[40px] px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold cursor-pointer"
                >
                  {isRtl ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="button"
                  disabled={deleting}
                  onClick={handleConfirmDelete}
                  className="min-h-[40px] px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-xs font-semibold text-white cursor-pointer disabled:opacity-60"
                >
                  {deleting ? (isRtl ? 'جارٍ الحذف…' : 'Deleting…') : isRtl ? 'حذف' : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </article>
  );
};
