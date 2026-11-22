import React, { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowLeft,
  ArrowRight,
  ChevronRight,
  Edit3,
  Film,
  Heart,
  Loader2,
  Play,
  RefreshCw,
  UserCheck,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { getFirebaseAuth } from '../../lib/firebase';
import { Language } from '../../types';
import {
  fetchCreatorReels,
  subscribeCreatorFollowUsers,
  subscribeOwnFollowCounts,
  subscribeToCreatorProfile,
  type CreatorProfile,
  type FollowUserItem,
} from '../../services/creatorProfiles';
import {
  deleteReel,
  subscribeToReelAuthorProfile,
  toggleFollowAuthor,
  watchFollowAuthor,
  type ReelModel,
} from '../../services/reels';
import { FollowButton } from '../discover/FollowButton';
import { LazyImage } from '../LazyImage';
import { ReelCard } from '../reels/ReelCard';
import { ReelCommentsSheet } from '../reels/ReelCommentsSheet';
import { CreatorProfileSetupScreen } from './CreatorProfileSetupScreen';

interface CreatorProfileScreenProps {
  creatorUid: string;
  currentUserId: string;
  currentCreatorName: string;
  chatAvatarUrl?: string | null;
  language: Language;
  onBack: () => void;
  onOwnProfileUpdated?: (profile: CreatorProfile) => void;
  onOpenCreatorProfile?: (uid: string) => void;
}

function formatFollowedDate(ts: FollowUserItem['followedAt'], isRtl: boolean): string {
  if (!ts) return '';
  try {
    const date = typeof ts.toDate === 'function' ? ts.toDate() : null;
    if (!date) return '';
    return date.toLocaleDateString(isRtl ? 'ar' : 'en-US', {
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return '';
  }
}

export const CreatorProfileScreen: React.FC<CreatorProfileScreenProps> = ({
  creatorUid,
  currentUserId,
  currentCreatorName,
  chatAvatarUrl = null,
  language,
  onBack,
  onOwnProfileUpdated,
  onOpenCreatorProfile,
}) => {
  const isRtl = language === 'ar';
  const BackIcon = isRtl ? ArrowRight : ArrowLeft;
  const authUid = getFirebaseAuth().currentUser?.uid || '';
  const isOwnProfile = creatorUid === currentUserId || (Boolean(authUid) && creatorUid === authUid);

  const [profile, setProfile] = useState<CreatorProfile | null>(null);
  const [liveFollowersCount, setLiveFollowersCount] = useState<number | null>(null);
  const [ownExactCounts, setOwnExactCounts] = useState<{
    followersCount: number | null;
    followingCount: number | null;
  }>({ followersCount: null, followingCount: null });
  const [profileLoading, setProfileLoading] = useState(true);
  const [reels, setReels] = useState<ReelModel[]>([]);
  const [reelsLoading, setReelsLoading] = useState(true);
  const [reelsError, setReelsError] = useState('');

  const [isFollowing, setIsFollowing] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);
  const [followPulseKey, setFollowPulseKey] = useState(0);
  const [followError, setFollowError] = useState('');

  const [followModalMode, setFollowModalMode] = useState<'followers' | 'following' | null>(null);
  const [followUsers, setFollowUsers] = useState<FollowUserItem[]>([]);
  const [followListLoading, setFollowListLoading] = useState(false);
  const [followListError, setFollowListError] = useState('');
  const [followListRetryKey, setFollowListRetryKey] = useState(0);

  const [isEditingOwn, setIsEditingOwn] = useState(false);
  const [activeReel, setActiveReel] = useState<ReelModel | null>(null);
  const [isReelMuted, setIsReelMuted] = useState(false);
  const [commentsReel, setCommentsReel] = useState<ReelModel | null>(null);

  useEffect(() => {
    setProfileLoading(true);
    setLiveFollowersCount(null);
    setFollowModalMode(null);
    setFollowUsers([]);
    setFollowListError('');

    const unsubProfile = subscribeToCreatorProfile(
      creatorUid,
      (loaded) => {
        setProfile(loaded);
        setProfileLoading(false);
      },
      () => {
        setProfileLoading(false);
      }
    );

    const unsubAuthor = subscribeToReelAuthorProfile(creatorUid, (author) => {
      setLiveFollowersCount(author.followersCount);
    });

    const unsubOwnCounts = isOwnProfile
      ? subscribeOwnFollowCounts(creatorUid, (counts) => {
          setOwnExactCounts(counts);
        })
      : () => {};

    return () => {
      unsubProfile();
      unsubAuthor();
      unsubOwnCounts();
    };
  }, [creatorUid, isOwnProfile]);

  useEffect(() => {
    if (isOwnProfile) {
      setIsFollowing(false);
      return;
    }
    return watchFollowAuthor(currentUserId, creatorUid, (next) => {
      setIsFollowing(next);
    });
  }, [currentUserId, creatorUid, isOwnProfile]);

  const loadCreatorReels = useCallback(async () => {
    setReelsLoading(true);
    setReelsError('');
    try {
      const items = await fetchCreatorReels(creatorUid, 30);
      setReels(items);
    } catch {
      setReelsError(isRtl ? 'تعذر تحميل مقاطع الريلز.' : 'Could not load creator reels.');
    } finally {
      setReelsLoading(false);
    }
  }, [creatorUid, isRtl]);

  useEffect(() => {
    void loadCreatorReels();
  }, [loadCreatorReels]);

  useEffect(() => {
    if (!followModalMode || !isOwnProfile) return;
    setFollowListLoading(true);
    setFollowListError('');

    const unsub = subscribeCreatorFollowUsers(
      creatorUid,
      followModalMode,
      (list) => {
        setFollowUsers(list);
        setFollowListLoading(false);
      },
      () => {
        setFollowListError(
          isRtl
            ? 'تعذر تحميل القائمة الآن. حاول مرة أخرى.'
            : 'Could not load list right now. Please try again.'
        );
        setFollowListLoading(false);
      }
    );

    return () => unsub();
  }, [followModalMode, creatorUid, isOwnProfile, isRtl, followListRetryKey]);

  const openFollowModal = (mode: 'followers' | 'following') => {
    if (!isOwnProfile) return;
    setFollowModalMode(mode);
  };

  useEffect(() => {
    if (!followModalMode) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setFollowModalMode(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [followModalMode]);

  const displayedFollowersCount = Math.max(
    0,
    isOwnProfile && ownExactCounts.followersCount !== null
      ? ownExactCounts.followersCount
      : (liveFollowersCount ?? profile?.followersCount ?? 0)
  );
  const displayedFollowingCount = Math.max(
    0,
    isOwnProfile && ownExactCounts.followingCount !== null
      ? ownExactCounts.followingCount
      : (profile?.followingCount ?? 0)
  );
  const displayedReelsCount = Math.max(profile?.reelsCount ?? 0, reels.length);

  const handleToggleFollow = async () => {
    if (followBusy || isOwnProfile) return;

    setFollowPulseKey((k) => k + 1);
    setFollowError('');
    setFollowBusy(true);

    try {
      await toggleFollowAuthor(currentUserId, creatorUid);
    } catch {
      setFollowError(isRtl ? 'تعذر تحديث المتابعة.' : 'Could not update follow status.');
    } finally {
      setFollowBusy(false);
    }
  };

  const handleDeleteOwnReel = async (target: ReelModel) => {
    await deleteReel(target);
    setReels((prev) => prev.filter((r) => r.id !== target.id));
    setActiveReel(null);
  };

  const handleShareReel = async (reel: ReelModel) => {
    const shareUrl =
      typeof window !== 'undefined'
        ? `${window.location.origin}/?reel=${encodeURIComponent(reel.id)}`
        : reel.videoUrl;
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({
          title: profile?.displayName || 'Hala Reel',
          text: reel.caption.slice(0, 120),
          url: shareUrl,
        });
        return;
      } catch {
        // user cancelled or unsupported
      }
    }
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(shareUrl).catch(() => {});
    }
  };

  if (isEditingOwn && profile) {
    return (
      <CreatorProfileSetupScreen
        currentUserId={currentUserId}
        chatAvatarUrl={chatAvatarUrl}
        existingProfile={profile}
        language={language}
        onCancel={() => setIsEditingOwn(false)}
        onSaved={(updated) => {
          setProfile(updated);
          setIsEditingOwn(false);
          onOwnProfileUpdated?.(updated);
        }}
      />
    );
  }

  return (
    <div
      className="flex-1 min-h-0 flex flex-col bg-slate-50 text-slate-900 overflow-hidden"
      dir={isRtl ? 'rtl' : 'ltr'}
    >
      {/* Top App Bar */}
      <header className="px-3.5 py-2.5 bg-white border-b border-slate-200/80 flex items-center justify-between gap-2 shrink-0 min-h-[56px]">
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            onClick={onBack}
            aria-label={isRtl ? 'رجوع' : 'Back'}
            className="min-w-[44px] min-h-[44px] rounded-xl flex items-center justify-center text-slate-700 hover:bg-slate-100 cursor-pointer shrink-0"
          >
            <BackIcon className="w-5 h-5" />
          </button>
          <div className="min-w-0">
            <h2 className="text-base font-bold text-[#112330] truncate">
              {profile?.username
                ? `@${profile.username}`
                : profile?.displayName || (isRtl ? 'ملف المبدع' : 'Creator Profile')}
            </h2>
          </div>
        </div>

        {isOwnProfile && profile && (
          <button
            type="button"
            onClick={() => setIsEditingOwn(true)}
            className="min-h-[40px] px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer shrink-0"
          >
            <Edit3 className="w-3.5 h-3.5 text-[#087F75]" />
            <span>{isRtl ? 'تعديل' : 'Edit'}</span>
          </button>
        )}
      </header>

      {/* Main Scrollable Content */}
      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-5 pb-[max(24px,env(safe-area-inset-bottom))]">
        <div className="max-w-4xl mx-auto space-y-5">
          {profileLoading ? (
            <div className="py-16 flex flex-col items-center justify-center gap-2 text-slate-400">
              <Loader2 className="w-6 h-6 animate-spin text-[#087F75]" />
              <span className="text-xs">
                {isRtl ? 'جارٍ تحميل الملف التعريفي…' : 'Loading profile…'}
              </span>
            </div>
          ) : (
            <>
              {/* Creator Summary Card */}
              <section className="bg-white border border-slate-200/80 rounded-3xl p-5 space-y-5 shadow-2xs">
                <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                  <div className="w-20 h-20 rounded-3xl bg-[#087F75] text-white font-bold text-2xl flex items-center justify-center overflow-hidden shrink-0 border border-slate-200">
                    {profile?.avatarUrl ? (
                      <LazyImage
                        src={profile.avatarUrl}
                        alt={profile.displayName}
                        aspectRatio="1/1"
                        containerClassName="w-full h-full rounded-3xl"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span>{(profile?.displayName || 'C').charAt(0).toUpperCase()}</span>
                    )}
                  </div>

                  <div className="min-w-0 flex-1 space-y-1">
                    <h3 className="text-xl font-extrabold text-[#112330] truncate">
                      {profile?.displayName || (isRtl ? 'مبدع هلا' : 'Hala Creator')}
                    </h3>
                    {profile?.username && (
                      <p className="text-xs font-semibold text-[#087F75]" dir="ltr">
                        @{profile.username}
                      </p>
                    )}
                    {profile?.bio ? (
                      <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap pt-1" dir="auto">
                        {profile.bio}
                      </p>
                    ) : (
                      !profile && (
                        <p className="text-xs text-slate-400 pt-1">
                          {isRtl ? 'لم يُنشئ هذا المبدع ملفه التعريفي بعد.' : 'Creator profile not set up yet.'}
                        </p>
                      )
                    )}
                  </div>

                  {!isOwnProfile ? (
                    <div className="relative shrink-0">
                      {followPulseKey > 0 && (
                        <motion.span
                          key={`profile-pulse-${followPulseKey}`}
                          initial={{ scale: 0.92, opacity: 0.65 }}
                          animate={{ scale: 1.32, opacity: 0 }}
                          transition={{ duration: 0.45, ease: 'easeOut' }}
                          className={`pointer-events-none absolute inset-0 rounded-xl ring-2 ${
                            isFollowing ? 'ring-[#087F75]/60' : 'ring-[#087F75]'
                          }`}
                        />
                      )}
                      <motion.button
                        key={`profile-btn-${followPulseKey}`}
                        type="button"
                        disabled={followBusy}
                        whileTap={{ scale: 0.92 }}
                        initial={followPulseKey > 0 ? { scale: 0.94 } : false}
                        animate={followPulseKey > 0 ? { scale: [0.94, 1.07, 0.98, 1] } : { scale: 1 }}
                        transition={{ duration: 0.34, ease: 'easeOut' }}
                        onClick={() => void handleToggleFollow()}
                        aria-pressed={isFollowing}
                        className={`relative min-h-[44px] px-5 py-2.5 rounded-xl text-sm font-bold inline-flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-80 shrink-0 ${
                          isFollowing
                            ? 'bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-200'
                            : 'bg-[#087F75] hover:bg-[#06685F] text-white shadow-sm'
                        }`}
                      >
                        {isFollowing ? (
                          <>
                            <UserCheck className="w-4 h-4 text-[#087F75]" />
                            <span>{isRtl ? 'متابَع' : 'Following'}</span>
                          </>
                        ) : (
                          <>
                            <UserPlus className="w-4 h-4" />
                            <span>{isRtl ? 'متابعة' : 'Follow'}</span>
                          </>
                        )}
                      </motion.button>
                    </div>
                  ) : profile ? (
                    <button
                      type="button"
                      onClick={() => setIsEditingOwn(true)}
                      className="min-h-[44px] px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-bold inline-flex items-center justify-center gap-2 transition-colors cursor-pointer shrink-0"
                    >
                      <Edit3 className="w-4 h-4" />
                      <span>{isRtl ? 'تعديل الملف' : 'Edit Profile'}</span>
                    </button>
                  ) : null}
                </div>

                {followError && (
                  <p role="alert" className="text-xs font-medium text-rose-600">
                    {followError}
                  </p>
                )}

                {/* Counts Strip */}
                <div className="grid grid-cols-3 divide-x divide-slate-200/80 rtl:divide-x-reverse border-t border-slate-100 pt-4 text-center">
                  <div className="px-2 py-1">
                    <p className="text-xl font-extrabold text-[#112330] tabular-nums">
                      {displayedReelsCount}
                    </p>
                    <p className="text-xs font-semibold text-slate-500 mt-0.5">
                      {isRtl ? 'الريلز' : 'Reels'}
                    </p>
                  </div>

                  {isOwnProfile ? (
                    <button
                      type="button"
                      onClick={() => openFollowModal('followers')}
                      className="px-2 py-1 rounded-2xl hover:bg-slate-50 active:bg-slate-100 transition-colors cursor-pointer group"
                      aria-label={isRtl ? 'عرض المتابعين' : 'View followers list'}
                    >
                      <p className="text-xl font-extrabold text-[#112330] tabular-nums group-hover:text-[#087F75] transition-colors">
                        {displayedFollowersCount}
                      </p>
                      <p className="text-xs font-semibold text-[#087F75] mt-0.5 inline-flex items-center justify-center gap-0.5">
                        <span>{isRtl ? 'المتابعون' : (displayedFollowersCount === 1 ? 'Follower' : 'Followers')}</span>
                        <ChevronRight className={`w-3 h-3 ${isRtl ? 'rotate-180' : ''}`} />
                      </p>
                    </button>
                  ) : (
                    <div className="px-2 py-1">
                      <p className="text-xl font-extrabold text-[#112330] tabular-nums">
                        {displayedFollowersCount}
                      </p>
                      <p className="text-xs font-semibold text-slate-500 mt-0.5">
                        {isRtl ? 'المتابعون' : (displayedFollowersCount === 1 ? 'Follower' : 'Followers')}
                      </p>
                    </div>
                  )}

                  {isOwnProfile ? (
                    <button
                      type="button"
                      onClick={() => openFollowModal('following')}
                      className="px-2 py-1 rounded-2xl hover:bg-slate-50 active:bg-slate-100 transition-colors cursor-pointer group"
                      aria-label={isRtl ? 'عرض من تتابعهم' : 'View following list'}
                    >
                      <p className="text-xl font-extrabold text-[#112330] tabular-nums group-hover:text-[#087F75] transition-colors">
                        {displayedFollowingCount}
                      </p>
                      <p className="text-xs font-semibold text-[#087F75] mt-0.5 inline-flex items-center justify-center gap-0.5">
                        <span>{isRtl ? 'يتابع' : 'Following'}</span>
                        <ChevronRight className={`w-3 h-3 ${isRtl ? 'rotate-180' : ''}`} />
                      </p>
                    </button>
                  ) : (
                    <div className="px-2 py-1">
                      <p className="text-xl font-extrabold text-[#112330] tabular-nums">
                        {displayedFollowingCount}
                      </p>
                      <p className="text-xs font-semibold text-slate-500 mt-0.5">
                        {isRtl ? 'يتابع' : 'Following'}
                      </p>
                    </div>
                  )}
                </div>
              </section>

              {/* Creator Reels Grid */}
              <section className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                    <Film className="w-4 h-4 text-[#087F75]" />
                    <span>{isRtl ? 'مقاطع الريلز' : 'Reels'}</span>
                  </h4>
                  <button
                    type="button"
                    onClick={() => void loadCreatorReels()}
                    aria-label={isRtl ? 'تحديث' : 'Refresh'}
                    className="min-h-[36px] px-2.5 text-xs font-semibold text-slate-500 hover:text-[#087F75] inline-flex items-center gap-1 cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>{isRtl ? 'تحديث' : 'Refresh'}</span>
                  </button>
                </div>

                {reelsLoading ? (
                  <div className="py-12 flex justify-center">
                    <Loader2 className="w-6 h-6 animate-spin text-[#087F75]" />
                  </div>
                ) : reelsError ? (
                  <div className="bg-white border border-rose-200 rounded-2xl p-5 text-center space-y-2.5">
                    <p className="text-xs font-semibold text-rose-600">{reelsError}</p>
                    <button
                      type="button"
                      onClick={() => void loadCreatorReels()}
                      className="min-h-[40px] px-4 py-2 rounded-xl bg-[#087F75] text-white text-xs font-bold cursor-pointer"
                    >
                      {isRtl ? 'إعادة المحاولة' : 'Retry'}
                    </button>
                  </div>
                ) : reels.length === 0 ? (
                  <div className="bg-white border border-slate-200/80 rounded-2xl p-8 text-center space-y-2">
                    <Film className="w-8 h-8 text-slate-300 mx-auto" />
                    <p className="text-sm font-semibold text-slate-600">
                      {isRtl ? 'لا توجد مقاطع ريلز بعد' : 'No Reels posted yet'}
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                    {reels.map((reel) => (
                      <button
                        key={reel.id}
                        type="button"
                        onClick={() => setActiveReel(reel)}
                        className="relative aspect-[9/16] rounded-2xl overflow-hidden bg-slate-900 border border-slate-200/70 group cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#087F75]"
                      >
                        {reel.thumbnailUrl ? (
                          <img
                            src={reel.thumbnailUrl}
                            alt={reel.caption || 'Reel thumbnail'}
                            loading="lazy"
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-slate-900 text-white/60">
                            <Play className="w-7 h-7 fill-current" />
                          </div>
                        )}
                        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-black/75 to-transparent" />
                        <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between text-white text-[11px] font-semibold">
                          <span className="inline-flex items-center gap-1 tabular-nums">
                            <Heart className="w-3 h-3 fill-white" />
                            <span>{reel.likesCount}</span>
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </section>
            </>
          )}
        </div>
      </div>

      {/* Followers / Following Modal Sheet for Creator Owner */}
      <AnimatePresence>
        {followModalMode && isOwnProfile && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setFollowModalMode(null)}
            className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-end sm:items-center justify-center sm:p-4"
            role="dialog"
            aria-modal="true"
            aria-label={
              followModalMode === 'followers'
                ? isRtl
                  ? 'قائمة المتابعين'
                  : 'Followers list'
                : isRtl
                ? 'قائمة المتابَعين'
                : 'Following list'
            }
          >
            <motion.div
              initial={{ y: 28, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 28, opacity: 0 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              onClick={(e) => e.stopPropagation()}
              className="w-full sm:max-w-md max-h-[82vh] bg-white rounded-t-3xl sm:rounded-3xl border border-slate-200 shadow-2xl flex flex-col overflow-hidden"
            >
              <div className="px-4 py-3.5 border-b border-slate-100 flex items-center justify-between gap-2 shrink-0">
                <div className="flex items-center gap-2 min-w-0">
                  <Users className="w-4 h-4 text-[#087F75] shrink-0" />
                  <h3 className="text-sm font-extrabold text-[#112330] truncate">
                    {followModalMode === 'followers'
                      ? `${isRtl ? 'المتابعون' : 'Followers'} (${displayedFollowersCount})`
                      : `${isRtl ? 'يتابع' : 'Following'} (${displayedFollowingCount})`}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setFollowModalMode(null)}
                  aria-label={isRtl ? 'إغلاق' : 'Close'}
                  className="min-w-[36px] min-h-[36px] rounded-xl flex items-center justify-center text-slate-500 hover:bg-slate-100 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-1.5">
                {followListLoading ? (
                  <div className="py-12 flex flex-col items-center justify-center gap-2 text-slate-400">
                    <Loader2 className="w-6 h-6 animate-spin text-[#087F75]" />
                    <span className="text-xs font-medium">
                      {isRtl ? 'جارٍ التحميل…' : 'Loading…'}
                    </span>
                  </div>
                ) : followListError ? (
                  <div className="py-8 px-4 text-center space-y-2.5">
                    <p className="text-xs font-semibold text-rose-600">{followListError}</p>
                    <button
                      type="button"
                      onClick={() => setFollowListRetryKey((k) => k + 1)}
                      className="min-h-[36px] px-4 py-1.5 rounded-xl bg-[#087F75] text-white text-xs font-bold cursor-pointer"
                    >
                      {isRtl ? 'إعادة المحاولة' : 'Retry'}
                    </button>
                  </div>
                ) : followUsers.length === 0 ? (
                  <div className="py-12 px-4 text-center space-y-2 text-slate-400">
                    <Users className="w-8 h-8 mx-auto text-slate-300" />
                    <p className="text-sm font-semibold text-slate-600">
                      {followModalMode === 'followers'
                        ? isRtl
                          ? 'لا يوجد متابعون بعد'
                          : 'No followers yet'
                        : isRtl
                        ? 'لا تتابع أحداً بعد'
                        : 'Not following anyone yet'}
                    </p>
                  </div>
                ) : (
                  followUsers.map((item) => {
                    const dateLabel = formatFollowedDate(item.followedAt, isRtl);
                    return (
                      <div
                        key={item.uid}
                        onClick={() => {
                          setFollowModalMode(null);
                          onOpenCreatorProfile?.(item.uid);
                        }}
                        className="flex items-center justify-between gap-3 p-2.5 rounded-2xl hover:bg-slate-50 transition-colors cursor-pointer"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-11 h-11 rounded-2xl bg-[#087F75] text-white font-bold text-sm flex items-center justify-center overflow-hidden shrink-0">
                            {item.avatarUrl ? (
                              <LazyImage
                                src={item.avatarUrl}
                                alt={item.displayName}
                                aspectRatio="1/1"
                                containerClassName="w-full h-full rounded-2xl"
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <span>{item.displayName.charAt(0).toUpperCase()}</span>
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-[#112330] truncate">
                              {item.displayName}
                            </p>
                            <div className="flex items-center gap-1.5 text-xs text-slate-500 truncate">
                              {item.username && (
                                <span className="text-[#087F75] font-medium truncate" dir="ltr">
                                  @{item.username}
                                </span>
                              )}
                              {dateLabel && (
                                <span className="text-slate-400 shrink-0">
                                  {item.username ? '· ' : ''}
                                  {dateLabel}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
                          <FollowButton followingId={item.uid} isRtl={isRtl} />
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Inline Fullscreen Reel Player Modal */}
      {activeReel && (
        <div className="fixed inset-0 z-50 bg-black flex flex-col">
          <button
            type="button"
            onClick={() => setActiveReel(null)}
            aria-label={isRtl ? 'إغلاق الفيديو' : 'Close player'}
            className="absolute top-3 left-3 z-40 min-w-[44px] min-h-[44px] rounded-full bg-black/55 hover:bg-black/75 text-white backdrop-blur-xs flex items-center justify-center cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex-1 min-h-0 w-full">
            <ReelCard
              reel={activeReel}
              index={0}
              isActive={true}
              isFeedVisible={!commentsReel}
              shouldPreload={true}
              isMuted={isReelMuted}
              currentUserId={currentUserId}
              language={language}
              registerCardRef={() => {}}
              onToggleMute={() => setIsReelMuted((m) => !m)}
              onOpenComments={(target) => setCommentsReel(target)}
              onShareReel={(target) => void handleShareReel(target)}
              onDeleteReel={handleDeleteOwnReel}
            />
          </div>
        </div>
      )}

      <ReelCommentsSheet
        isOpen={Boolean(commentsReel)}
        reelId={commentsReel?.id || null}
        reelAuthorId={commentsReel?.authorId || ''}
        commentsCount={commentsReel?.commentsCount || 0}
        currentUserId={currentUserId}
        currentUserName={currentCreatorName}
        language={language}
        onClose={() => setCommentsReel(null)}
      />
    </div>
  );
};
