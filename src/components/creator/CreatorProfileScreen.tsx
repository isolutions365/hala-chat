import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Edit3,
  Film,
  Heart,
  Loader2,
  Play,
  RefreshCw,
  UserCheck,
  UserPlus,
  X,
} from 'lucide-react';
import { Language } from '../../types';
import {
  fetchCreatorReels,
  subscribeToCreatorProfile,
  type CreatorProfile,
} from '../../services/creatorProfiles';
import {
  deleteReel,
  toggleFollowAuthor,
  watchFollowAuthor,
  type ReelModel,
} from '../../services/reels';
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
}

export const CreatorProfileScreen: React.FC<CreatorProfileScreenProps> = ({
  creatorUid,
  currentUserId,
  currentCreatorName,
  chatAvatarUrl = null,
  language,
  onBack,
  onOwnProfileUpdated,
}) => {
  const isRtl = language === 'ar';
  const BackIcon = isRtl ? ArrowRight : ArrowLeft;
  const isOwnProfile = creatorUid === currentUserId;

  const [profile, setProfile] = useState<CreatorProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [reels, setReels] = useState<ReelModel[]>([]);
  const [reelsLoading, setReelsLoading] = useState(true);
  const [reelsError, setReelsError] = useState('');

  const [isFollowing, setIsFollowing] = useState(false);
  const [optimisticFollowing, setOptimisticFollowing] = useState<boolean | null>(null);
  const [optimisticFollowerDelta, setOptimisticFollowerDelta] = useState(0);
  const [followBusy, setFollowBusy] = useState(false);
  const [followError, setFollowError] = useState('');

  const [isEditingOwn, setIsEditingOwn] = useState(false);
  const [activeReel, setActiveReel] = useState<ReelModel | null>(null);
  const [isReelMuted, setIsReelMuted] = useState(false);
  const [commentsReel, setCommentsReel] = useState<ReelModel | null>(null);

  useEffect(() => {
    setProfileLoading(true);
    setOptimisticFollowing(null);
    setOptimisticFollowerDelta(0);

    const unsub = subscribeToCreatorProfile(
      creatorUid,
      (loaded) => {
        setProfile(loaded);
        setProfileLoading(false);
        setOptimisticFollowerDelta(0);
      },
      () => {
        setProfileLoading(false);
      }
    );

    return () => unsub();
  }, [creatorUid]);

  useEffect(() => {
    if (isOwnProfile) {
      setIsFollowing(false);
      return;
    }
    return watchFollowAuthor(currentUserId, creatorUid, (next) => {
      setIsFollowing(next);
      setOptimisticFollowing(null);
    });
  }, [currentUserId, creatorUid, isOwnProfile]);

  const loadCreatorReels = async () => {
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
  };

  useEffect(() => {
    void loadCreatorReels();
  }, [creatorUid]);

  const effectiveIsFollowing = optimisticFollowing !== null ? optimisticFollowing : isFollowing;
  const displayedFollowersCount = Math.max(
    0,
    (profile?.followersCount ?? 0) + optimisticFollowerDelta
  );
  const displayedFollowingCount = profile?.followingCount ?? 0;
  const displayedReelsCount = Math.max(profile?.reelsCount ?? 0, reels.length);

  const handleToggleFollow = async () => {
    if (followBusy || isOwnProfile) return;
    const prevFollowing = effectiveIsFollowing;
    const nextFollowing = !prevFollowing;
    const delta = nextFollowing ? 1 : -1;

    setFollowError('');
    setFollowBusy(true);
    setOptimisticFollowing(nextFollowing);
    setOptimisticFollowerDelta((prev) => prev + delta);

    try {
      await toggleFollowAuthor(currentUserId, creatorUid);
    } catch {
      setOptimisticFollowing(prevFollowing);
      setOptimisticFollowerDelta((prev) => prev - delta);
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
                    <button
                      type="button"
                      disabled={followBusy}
                      onClick={() => void handleToggleFollow()}
                      aria-pressed={effectiveIsFollowing}
                      className={`min-h-[44px] px-5 py-2.5 rounded-xl text-sm font-bold inline-flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-60 shrink-0 ${
                        effectiveIsFollowing
                          ? 'bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-200'
                          : 'bg-[#087F75] hover:bg-[#06685F] text-white shadow-sm'
                      }`}
                    >
                      {effectiveIsFollowing ? (
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
                    </button>
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
                  <div className="px-2">
                    <p className="text-xl font-extrabold text-[#112330] tabular-nums">
                      {displayedReelsCount}
                    </p>
                    <p className="text-xs font-semibold text-slate-500 mt-0.5">
                      {isRtl ? 'الريلز' : 'Reels'}
                    </p>
                  </div>
                  <div className="px-2">
                    <p className="text-xl font-extrabold text-[#112330] tabular-nums">
                      {displayedFollowersCount}
                    </p>
                    <p className="text-xs font-semibold text-slate-500 mt-0.5">
                      {isRtl ? 'المتابعون' : (displayedFollowersCount === 1 ? 'Follower' : 'Followers')}
                    </p>
                  </div>
                  <div className="px-2">
                    <p className="text-xl font-extrabold text-[#112330] tabular-nums">
                      {displayedFollowingCount}
                    </p>
                    <p className="text-xs font-semibold text-slate-500 mt-0.5">
                      {isRtl ? 'يتابع' : 'Following'}
                    </p>
                  </div>
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
