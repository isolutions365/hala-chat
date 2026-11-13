import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  ExternalLink,
  Heart,
  Loader2,
  MapPin,
  MessageCircle,
  Share2,
  Trash2,
  Users,
} from 'lucide-react';
import { Language } from '../../types';
import {
  type CommunityPost,
  type CommunityPostPoll,
  toggleCommunityPostLike,
  voteCommunityPoll,
  watchPostLikeStatus,
  watchPostPollVote,
} from '../../services/community';
import { buildGoogleMapsUrl } from '../../services/location';
import { LazyImage } from '../LazyImage';
import { LocationMapPreview } from '../maps/LocationMapPreview';

interface CommunityPostCardProps {
  post: CommunityPost;
  currentUserId: string;
  language: Language;
  isGroupAdmin?: boolean;
  onOpenComments: (post: CommunityPost) => void;
  onOpenGroup?: (groupId: string) => void;
  onDeletePost: (post: CommunityPost) => Promise<void> | void;
  onSharePost: (post: CommunityPost) => Promise<void> | void;
  onPostUpdated?: (updatedPost: CommunityPost) => void;
}

function formatPostTime(post: CommunityPost, isRtl: boolean): string {
  const ts = post.createdAt;
  if (!ts || typeof ts.toDate !== 'function') {
    return isRtl ? 'الآن' : 'Just now';
  }
  const date = ts.toDate();
  const diffSec = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (diffSec < 60) return isRtl ? 'الآن' : 'Just now';
  if (diffSec < 3600) {
    const mins = Math.floor(diffSec / 60);
    return isRtl ? `منذ ${mins} د` : `${mins}m ago`;
  }
  if (diffSec < 86400) {
    const hrs = Math.floor(diffSec / 3600);
    return isRtl ? `منذ ${hrs} س` : `${hrs}h ago`;
  }
  const days = Math.floor(diffSec / 86400);
  if (days < 7) {
    return isRtl ? `منذ ${days} ي` : `${days}d ago`;
  }
  return date.toLocaleDateString(isRtl ? 'ar-SA' : 'en-US', {
    month: 'short',
    day: 'numeric',
  });
}

export const CommunityPostCard: React.FC<CommunityPostCardProps> = ({
  post,
  currentUserId,
  language,
  isGroupAdmin = false,
  onOpenComments,
  onOpenGroup,
  onDeletePost,
  onSharePost,
  onPostUpdated,
}) => {
  const isRtl = language === 'ar';
  const [liked, setLiked] = useState(false);
  const [likesCount, setLikesCount] = useState(post.likesCount);
  const [isTogglingLike, setIsTogglingLike] = useState(false);

  const [poll, setPoll] = useState<CommunityPostPoll | null>(post.poll);
  const [votedOptionId, setVotedOptionId] = useState<string | null>(null);
  const [isVoting, setIsVoting] = useState(false);
  const [voteError, setVoteError] = useState('');

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isImagePreviewOpen, setIsImagePreviewOpen] = useState(false);
  const [showLocationPreview, setShowLocationPreview] = useState(false);

  useEffect(() => {
    setLikesCount(post.likesCount);
  }, [post.likesCount]);

  useEffect(() => {
    setPoll(post.poll);
  }, [post.poll]);

  useEffect(() => {
    const unsubLike = watchPostLikeStatus(post.id, currentUserId, setLiked);
    let unsubVote = () => {};
    if (post.poll) {
      unsubVote = watchPostPollVote(post.id, currentUserId, setVotedOptionId);
    }
    return () => {
      unsubLike();
      unsubVote();
    };
  }, [post.id, post.poll, currentUserId]);

  const canDelete = post.authorId === currentUserId || (Boolean(post.groupId) && isGroupAdmin);

  const handleToggleLike = async () => {
    if (isTogglingLike) return;
    const optimisticLiked = !liked;
    const optimisticCount = Math.max(0, likesCount + (optimisticLiked ? 1 : -1));
    setLiked(optimisticLiked);
    setLikesCount(optimisticCount);
    setIsTogglingLike(true);

    try {
      const res = await toggleCommunityPostLike(post.id, currentUserId);
      setLiked(res.liked);
      setLikesCount(res.likesCount);
      onPostUpdated?.({ ...post, likesCount: res.likesCount, poll });
    } catch {
      setLiked(!optimisticLiked);
      setLikesCount(post.likesCount);
    } finally {
      setIsTogglingLike(false);
    }
  };

  const handleVote = async (optionId: string) => {
    if (!poll || votedOptionId || isVoting) return;
    setVoteError('');
    setIsVoting(true);
    try {
      const updatedPoll = await voteCommunityPoll(post.id, optionId, currentUserId);
      setPoll(updatedPoll);
      setVotedOptionId(optionId);
      onPostUpdated?.({ ...post, likesCount, poll: updatedPoll });
    } catch (err: any) {
      setVoteError(err?.message || (isRtl ? 'تعذر تسجيل التصويت.' : 'Failed to submit vote.'));
    } finally {
      setIsVoting(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (isDeleting) return;
    setIsDeleting(true);
    try {
      await onDeletePost(post);
    } finally {
      setIsDeleting(false);
      setConfirmDelete(false);
    }
  };

  return (
    <article
      className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-2xs space-y-3"
      dir={isRtl ? 'rtl' : 'ltr'}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-full bg-teal-700 text-white font-bold flex items-center justify-center shrink-0 overflow-hidden text-sm">
            {post.authorAvatar ? (
              <LazyImage
                src={post.authorAvatar}
                alt={post.authorName}
                aspectRatio="1/1"
                containerClassName="w-full h-full rounded-full"
              />
            ) : (
              post.authorName.charAt(0).toUpperCase()
            )}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-sm font-bold text-[#112330] truncate">
                {post.authorName}
              </span>
              {post.groupId && post.groupName && (
                <>
                  <span className="text-slate-400 text-xs">•</span>
                  <button
                    type="button"
                    onClick={() => onOpenGroup?.(post.groupId)}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-[#087F75] hover:underline cursor-pointer truncate max-w-[170px]"
                  >
                    <Users className="w-3 h-3 shrink-0" />
                    <span className="truncate">{post.groupName}</span>
                  </button>
                </>
              )}
            </div>
            <p className="text-xs text-slate-500">{formatPostTime(post, isRtl)}</p>
          </div>
        </div>

        {canDelete && (
          <div className="shrink-0">
            {confirmDelete ? (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={handleConfirmDelete}
                  className="min-h-[36px] px-2.5 py-1 rounded-lg bg-rose-600 text-white text-xs font-semibold hover:bg-rose-700 transition-colors cursor-pointer disabled:opacity-60"
                >
                  {isDeleting ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : isRtl ? (
                    'حذف'
                  ) : (
                    'Delete'
                  )}
                </button>
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={() => setConfirmDelete(false)}
                  className="min-h-[36px] px-2.5 py-1 rounded-lg bg-slate-100 text-slate-600 text-xs font-semibold hover:bg-slate-200 transition-colors cursor-pointer"
                >
                  {isRtl ? 'إلغاء' : 'Cancel'}
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                aria-label={isRtl ? 'حذف المنشور' : 'Delete post'}
                className="min-w-[40px] min-h-[40px] rounded-xl flex items-center justify-center text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Text body */}
      {post.text && (
        <p className="text-sm text-slate-800 whitespace-pre-wrap leading-relaxed break-words">
          {post.text}
        </p>
      )}

      {/* Photo attachment */}
      {post.imageUrl && (
        <button
          type="button"
          onClick={() => setIsImagePreviewOpen(true)}
          className="block w-full overflow-hidden rounded-2xl border border-slate-100 bg-slate-100 cursor-pointer"
        >
          <img
            src={post.imageUrl}
            alt={post.text ? post.text.slice(0, 60) : 'Post image'}
            loading="lazy"
            className="w-full max-h-[420px] object-cover"
          />
        </button>
      )}

      {/* Tagged Location Attachment */}
      {post.location && (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2 rounded-xl bg-slate-50 border border-slate-200/80 px-3 py-2">
            <button
              type="button"
              onClick={() => setShowLocationPreview((prev) => !prev)}
              className="flex items-center gap-2 min-w-0 text-start cursor-pointer flex-1"
            >
              <MapPin className="w-4 h-4 text-[#087F75] shrink-0" />
              <span className="text-xs font-semibold text-slate-700 truncate">
                {post.location.locationName}
              </span>
              <span className="text-[11px] font-bold text-[#087F75] shrink-0">
                {showLocationPreview
                  ? isRtl
                    ? 'إخفاء الخريطة'
                    : 'Hide map'
                  : isRtl
                  ? 'عرض الخريطة'
                  : 'View map'}
              </span>
            </button>
            <a
              href={buildGoogleMapsUrl(post.location.latitude, post.location.longitude)}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={isRtl ? 'فتح في خرائط جوجل' : 'Open in Google Maps'}
              className="p-1 text-slate-400 hover:text-[#087F75] shrink-0"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>

          {showLocationPreview && (
            <LocationMapPreview
              latitude={post.location.latitude}
              longitude={post.location.longitude}
              locationName={post.location.locationName}
              mapsUrl={buildGoogleMapsUrl(post.location.latitude, post.location.longitude)}
              isRtl={isRtl}
            />
          )}
        </div>
      )}

      {/* Interactive Poll */}
      {poll && (
        <div className="rounded-2xl bg-slate-50 border border-slate-200/80 p-3.5 space-y-2.5">
          <div className="flex items-start justify-between gap-2">
            <h4 className="text-sm font-bold text-[#112330]">{poll.question}</h4>
            <span className="text-[11px] font-medium text-slate-500 shrink-0">
              {poll.totalVotes} {isRtl ? 'صوت' : poll.totalVotes === 1 ? 'vote' : 'votes'}
            </span>
          </div>

          <div className="space-y-2">
            {poll.options.map((opt) => {
              const hasVoted = Boolean(votedOptionId);
              const isSelected = votedOptionId === opt.id;
              const pct =
                poll.totalVotes > 0 ? Math.round((opt.votes / poll.totalVotes) * 100) : 0;
              return (
                <button
                  key={opt.id}
                  type="button"
                  disabled={hasVoted || isVoting}
                  onClick={() => handleVote(opt.id)}
                  className={`relative w-full min-h-[44px] rounded-xl border text-start overflow-hidden transition-all ${
                    isSelected
                      ? 'border-[#087F75] bg-teal-50/40'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  } ${hasVoted ? 'cursor-default' : 'cursor-pointer active:scale-[0.99]'}`}
                >
                  {hasVoted && (
                    <div
                      className={`absolute inset-y-0 ${isRtl ? 'right-0' : 'left-0'} ${
                        isSelected ? 'bg-[#087F75]/18' : 'bg-slate-200/60'
                      } transition-all duration-300`}
                      style={{ width: `${pct}%` }}
                    />
                  )}
                  <div className="relative px-3.5 py-2.5 flex items-center justify-between gap-2 text-xs font-semibold">
                    <span className="flex items-center gap-1.5 text-slate-800 truncate">
                      {isSelected && (
                        <CheckCircle2 className="w-3.5 h-3.5 text-[#087F75] shrink-0" />
                      )}
                      <span className="truncate">{opt.text}</span>
                    </span>
                    {hasVoted && (
                      <span className="text-slate-600 font-bold shrink-0">{pct}%</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
          {voteError && <p className="text-xs text-rose-600 font-medium">{voteError}</p>}
        </div>
      )}

      {/* Action Footer */}
      <div className="pt-2 border-t border-slate-100 grid grid-cols-3 gap-1">
        <button
          type="button"
          onClick={handleToggleLike}
          className={`min-h-[44px] rounded-xl flex items-center justify-center gap-1.5 text-xs font-semibold transition-colors cursor-pointer ${
            liked
              ? 'text-rose-600 bg-rose-50 hover:bg-rose-100/70'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Heart className={`w-4 h-4 ${liked ? 'fill-rose-600' : ''}`} />
          <span>{likesCount > 0 ? likesCount : isRtl ? 'إعجاب' : 'Like'}</span>
        </button>

        <button
          type="button"
          onClick={() => onOpenComments(post)}
          className="min-h-[44px] rounded-xl flex items-center justify-center gap-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
        >
          <MessageCircle className="w-4 h-4" />
          <span>
            {post.commentsCount > 0
              ? post.commentsCount
              : isRtl
              ? 'تعليق'
              : 'Comment'}
          </span>
        </button>

        <button
          type="button"
          onClick={() => onSharePost(post)}
          className="min-h-[44px] rounded-xl flex items-center justify-center gap-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
        >
          <Share2 className="w-4 h-4" />
          <span>{isRtl ? 'مشاركة' : 'Share'}</span>
        </button>
      </div>

      {/* Fullscreen Image Lightbox */}
      {isImagePreviewOpen && post.imageUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setIsImagePreviewOpen(false)}
        >
          <img
            src={post.imageUrl}
            alt="Full size attachment"
            className="max-w-full max-h-[88vh] rounded-2xl object-contain"
          />
        </div>
      )}
    </article>
  );
};
