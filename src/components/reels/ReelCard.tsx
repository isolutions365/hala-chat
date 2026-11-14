import React, { useEffect, useMemo, useRef, useState } from 'react';
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
  onOpenComments: (reel: ReelModel) => void;
  onShareReel: (reel: ReelModel) => void;
  onDeleteReel: (reel: ReelModel) => Promise<void>;
  onOpenCreatorProfile?: (authorId: string) => void;
  onFeedback?: (message: string) => void;
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
  const [optimisticFollowing, setOptimisticFollowing] = useState<boolean | null>(null);
  const [optimisticFollowerDelta, setOptimisticFollowerDelta] = useState(0);
  const [followBusy, setFollowBusy] = useState(false);
  const [isCaptionExpanded, setIsCaptionExpanded] = useState(false);
  const [showMuteOverlay, setShowMuteOverlay] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [playbackPausedNotice, setPlaybackPausedNotice] = useState(false);

  const { startSec, endSec } = useMemo(
    () => parseVideoTimeFragment(reel.videoUrl),
    [reel.videoUrl]
  );

  const isOwnReel = reel.authorId === currentUserId;
  const shouldPlay = isActive && isFeedVisible;
  const effectiveIsFollowing = optimisticFollowing !== null ? optimisticFollowing : isFollowing;
  const displayedFollowersCount = Math.max(0, author.followersCount + optimisticFollowerDelta);

  useEffect(() => {
    setOptimisticFollowerDelta(0);
    return subscribeToReelAuthorProfile(reel.authorId, (prof) => {
      setAuthor(prof);
      setOptimisticFollowerDelta(0);
    });
  }, [reel.authorId]);

  useEffect(() => {
    return watchReelLikeStatus(reel.id, currentUserId, setIsLiked);
  }, [reel.id, currentUserId]);

  useEffect(() => {
    if (isOwnReel) return;
    setOptimisticFollowing(null);
    return watchFollowAuthor(currentUserId, reel.authorId, (next) => {
      setIsFollowing(next);
      setOptimisticFollowing(null);
    });
  }, [currentUserId, reel.authorId, isOwnReel]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = isMuted;
  }, [isMuted]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (shouldPreload && !preloadedRef.current && video.readyState === 0) {
      preloadedRef.current = true;
      video.load();
    }

    if (shouldPlay) {
      if (startSec > 0 && video.currentTime < startSec) {
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
          .catch(() => {
            setPlaybackPausedNotice(true);
          });
      }
    } else {
      video.pause();
    }
  }, [shouldPlay, shouldPreload, startSec]);

  useEffect(() => {
    return () => {
      if (muteHintTimeoutRef.current) {
        clearTimeout(muteHintTimeoutRef.current);
      }
    };
  }, []);

  const handleVideoTap = () => {
    const video = videoRef.current;
    if (video && playbackPausedNotice && shouldPlay) {
      video.play().then(() => setPlaybackPausedNotice(false)).catch(() => {});
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

  const handleTimeUpdate = () => {
    const video = videoRef.current;
    if (!video || endSec === null) return;
    if (video.currentTime >= endSec) {
      video.currentTime = startSec;
      if (shouldPlay && video.paused) {
        video.play().catch(() => {});
      }
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
    const prevFollowing = effectiveIsFollowing;
    const nextFollowing = !prevFollowing;
    const delta = nextFollowing ? 1 : -1;

    setFollowBusy(true);
    setOptimisticFollowing(nextFollowing);
    setOptimisticFollowerDelta((prev) => prev + delta);
    try {
      await toggleFollowAuthor(currentUserId, reel.authorId);
    } catch {
      setOptimisticFollowing(prevFollowing);
      setOptimisticFollowerDelta((prev) => prev - delta);
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
          playsInline
          loop={endSec === null}
          muted={isMuted}
          preload={shouldPreload ? 'auto' : 'none'}
          onTimeUpdate={handleTimeUpdate}
          onClick={handleVideoTap}
          className="w-full h-full object-cover cursor-pointer"
        />

        {/* Top gradient scrim + audio status button */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/55 to-transparent" />
        <div className="absolute top-3 right-3 z-20 flex items-center gap-2">
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

        {/* Right-side actions: Like, Comment, Share, Follow (+ Delete for owner) */}
        <div
          className="absolute right-3 bottom-5 z-20 flex flex-col items-center gap-3.5"
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
            <button
              type="button"
              disabled={followBusy}
              onClick={handleFollowClick}
              aria-pressed={effectiveIsFollowing}
              aria-label={effectiveIsFollowing ? (isRtl ? 'إلغاء المتابعة' : 'Unfollow') : (isRtl ? 'متابعة' : 'Follow')}
              className="min-w-[44px] min-h-[44px] flex flex-col items-center justify-center gap-1 text-white cursor-pointer disabled:opacity-60"
            >
              <span
                className={`w-11 h-11 rounded-full flex items-center justify-center backdrop-blur-xs transition-colors active:scale-90 ${
                  effectiveIsFollowing
                    ? 'bg-white/25 text-[#8FE8D0]'
                    : 'bg-[#087F75] hover:bg-[#06685F] text-white'
                }`}
              >
                {effectiveIsFollowing ? <UserCheck className="w-5 h-5" /> : <UserPlus className="w-5 h-5" />}
              </span>
              <span className="text-[11px] font-semibold drop-shadow whitespace-nowrap">
                {effectiveIsFollowing
                  ? isRtl
                    ? 'متابَع'
                    : 'Following'
                  : isRtl
                  ? 'متابعة'
                  : 'Follow'}
              </span>
            </button>
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
          className="absolute left-4 right-20 bottom-5 z-10 text-white space-y-2"
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
