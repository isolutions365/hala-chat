import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  Compass,
  Globe,
  LayoutList,
  Loader2,
  Lock,
  MapPin,
  Plus,
  RefreshCw,
  Search,
  Users,
  X,
} from 'lucide-react';
import type { QueryDocumentSnapshot } from 'firebase/firestore';
import { Language } from '../../types';
import {
  COMMUNITY_FEED_PAGE_SIZE,
  type CommunityAuthorProfile,
  type CommunityGroup,
  type CommunityPost,
  type MyCommunityGroupItem,
  deleteCommunityPost,
  fetchCommunityPostsPage,
  fetchMyCommunityGroups,
  fetchPublicCommunityGroups,
  joinCommunityGroup,
} from '../../services/community';
import { CommunityPostCard } from './CommunityPostCard';
import { CommunityCommentsSheet } from './CommunityCommentsSheet';
import { CreateGroupModal } from './CreateGroupModal';
import { GroupDetailView } from './GroupDetailView';
import { NearbyCommunityMap } from '../maps/NearbyCommunityMap';

interface CommunityTabProps {
  currentUser: CommunityAuthorProfile;
  language: Language;
  refreshSignal?: number;
  onRequestCreatePost?: (preselectedGroupId?: string) => void;
}

export const CommunityTab: React.FC<CommunityTabProps> = ({
  currentUser,
  language,
  refreshSignal = 0,
  onRequestCreatePost,
}) => {
  const isRtl = language === 'ar';

  const [searchQuery, setSearchQuery] = useState('');
  const [myGroups, setMyGroups] = useState<MyCommunityGroupItem[]>([]);
  const [publicGroups, setPublicGroups] = useState<CommunityGroup[]>([]);
  const [isLoadingGroups, setIsLoadingGroups] = useState(true);
  const [joiningGroupId, setJoiningGroupId] = useState<string | null>(null);

  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [cursor, setCursor] = useState<QueryDocumentSnapshot | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [isLoadingFeed, setIsLoadingFeed] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [feedError, setFeedError] = useState('');

  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'feed' | 'map'>('feed');
  const [isCreateGroupOpen, setIsCreateGroupOpen] = useState(false);
  const [commentsTarget, setCommentsTarget] = useState<{
    post: CommunityPost;
    isGroupStaff: boolean;
  } | null>(null);
  const [shareFeedback, setShareFeedback] = useState('');

  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const loadGroups = useCallback(async () => {
    setIsLoadingGroups(true);
    try {
      const [mine, pub] = await Promise.all([
        fetchMyCommunityGroups(currentUser.id),
        fetchPublicCommunityGroups(50),
      ]);
      setMyGroups(mine);
      setPublicGroups(pub);
    } catch {
      // keep existing groups if partial failure
    } finally {
      setIsLoadingGroups(false);
    }
  }, [currentUser.id]);

  const loadFeed = useCallback(
    async (reset: boolean, currentCursor: QueryDocumentSnapshot | null) => {
      if (reset) {
        setIsLoadingFeed(true);
        setFeedError('');
      } else {
        setIsLoadingMore(true);
      }
      try {
        const res = await fetchCommunityPostsPage({
          groupId: '',
          cursor: reset ? null : currentCursor,
          pageSize: COMMUNITY_FEED_PAGE_SIZE,
        });
        setPosts((prev) => (reset ? res.posts : [...prev, ...res.posts]));
        setCursor(res.lastDoc);
        setHasMore(res.hasMore);
      } catch (err: any) {
        setFeedError(
          err?.message || (isRtl ? 'تعذر تحميل منشورات المجتمع.' : 'Failed to load community feed.')
        );
      } finally {
        setIsLoadingFeed(false);
        setIsLoadingMore(false);
      }
    },
    [isRtl]
  );

  useEffect(() => {
    void loadGroups();
  }, [loadGroups, refreshSignal]);

  useEffect(() => {
    void loadFeed(true, null);
  }, [loadFeed, refreshSignal]);

  // Infinite scroll observer
  useEffect(() => {
    if (selectedGroupId || !hasMore || isLoadingMore || isLoadingFeed) return;
    const node = sentinelRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          void loadFeed(false, cursor);
        }
      },
      { rootMargin: '220px' }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [selectedGroupId, hasMore, isLoadingMore, isLoadingFeed, cursor, loadFeed]);

  const myGroupIds = useMemo(
    () => new Set(myGroups.map((item) => item.group.id)),
    [myGroups]
  );

  const normalizedQuery = searchQuery.trim().toLowerCase();

  const filteredMyGroups = useMemo(() => {
    if (!normalizedQuery) return myGroups;
    return myGroups.filter(
      ({ group }) =>
        group.name.toLowerCase().includes(normalizedQuery) ||
        group.description.toLowerCase().includes(normalizedQuery) ||
        (group.location?.locationName || '').toLowerCase().includes(normalizedQuery)
    );
  }, [myGroups, normalizedQuery]);

  const discoverGroups = useMemo(() => {
    const unjoined = publicGroups.filter((g) => !myGroupIds.has(g.id));
    if (!normalizedQuery) return unjoined;
    return unjoined.filter(
      (g) =>
        g.name.toLowerCase().includes(normalizedQuery) ||
        g.description.toLowerCase().includes(normalizedQuery) ||
        (g.location?.locationName || '').toLowerCase().includes(normalizedQuery)
    );
  }, [publicGroups, myGroupIds, normalizedQuery]);

  const filteredPosts = useMemo(() => {
    if (!normalizedQuery) return posts;
    return posts.filter(
      (p) =>
        p.text.toLowerCase().includes(normalizedQuery) ||
        p.authorName.toLowerCase().includes(normalizedQuery) ||
        p.groupName.toLowerCase().includes(normalizedQuery) ||
        (p.poll?.question || '').toLowerCase().includes(normalizedQuery) ||
        (p.location?.locationName || '').toLowerCase().includes(normalizedQuery)
    );
  }, [posts, normalizedQuery]);

  const allCombinedGroups = useMemo(() => {
    const byId: Record<string, CommunityGroup> = {};
    publicGroups.forEach((grp) => {
      byId[grp.id] = grp;
    });
    myGroups.forEach(({ group }) => {
      byId[group.id] = group;
    });
    const combined = Object.values(byId);
    if (!normalizedQuery) return combined;
    return combined.filter(
      (g) =>
        g.name.toLowerCase().includes(normalizedQuery) ||
        g.description.toLowerCase().includes(normalizedQuery) ||
        (g.location?.locationName || '').toLowerCase().includes(normalizedQuery)
    );
  }, [publicGroups, myGroups, normalizedQuery]);

  const handleJoinGroup = async (group: CommunityGroup) => {
    if (joiningGroupId) return;
    setJoiningGroupId(group.id);
    try {
      await joinCommunityGroup(group.id, currentUser);
      await loadGroups();
      setSelectedGroupId(group.id);
    } finally {
      setJoiningGroupId(null);
    }
  };

  const handleDeletePost = async (post: CommunityPost) => {
    await deleteCommunityPost(post.id, post.imageUrl);
    setPosts((prev) => prev.filter((item) => item.id !== post.id));
  };

  const handleSharePost = async (post: CommunityPost) => {
    const shareText = [
      post.authorName,
      post.text,
      post.poll ? `Poll: ${post.poll.question}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    try {
      if (navigator.share) {
        await navigator.share({
          title: post.groupName || 'Hala Community',
          text: shareText || 'Check out this post on Hala Community',
          url: window.location.href,
        });
        return;
      }
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareText || window.location.href);
        setShareFeedback(isRtl ? 'تم نسخ رابط المنشور.' : 'Post copied to clipboard.');
        setTimeout(() => setShareFeedback(''), 2400);
      }
    } catch {
      // User dismissed native share sheet
    }
  };

  const handleCommentCountChanged = (postId: string, delta: number) => {
    setPosts((prev) =>
      prev.map((p) =>
        p.id === postId
          ? { ...p, commentsCount: Math.max(0, p.commentsCount + delta) }
          : p
      )
    );
  };

  const selectedGroupInitial = useMemo(() => {
    if (!selectedGroupId) return null;
    const fromMine = myGroups.find((m) => m.group.id === selectedGroupId)?.group;
    if (fromMine) return fromMine;
    return publicGroups.find((g) => g.id === selectedGroupId) || null;
  }, [selectedGroupId, myGroups, publicGroups]);

  if (selectedGroupId) {
    return (
      <>
        <GroupDetailView
          groupId={selectedGroupId}
          initialGroup={selectedGroupInitial}
          currentUser={currentUser}
          language={language}
          refreshSignal={refreshSignal}
          onBack={() => setSelectedGroupId(null)}
          onGroupChanged={() => void loadGroups()}
          onOpenComments={(post, isGroupStaff) =>
            setCommentsTarget({ post, isGroupStaff })
          }
          onSharePost={(post) => void handleSharePost(post)}
          onCreatePostInGroup={
            onRequestCreatePost
              ? (grp) => onRequestCreatePost(grp.id)
              : undefined
          }
        />

        {commentsTarget && (
          <CommunityCommentsSheet
            post={commentsTarget.post}
            currentUser={currentUser}
            language={language}
            isGroupStaff={commentsTarget.isGroupStaff}
            onClose={() => setCommentsTarget(null)}
            onCommentCountChanged={handleCommentCountChanged}
          />
        )}
      </>
    );
  }

  return (
    <div
      className="flex-1 min-h-0 flex flex-col bg-slate-50 text-slate-900 relative"
      dir={isRtl ? 'rtl' : 'ltr'}
    >
      {/* Top Search & My Groups Header */}
      <div className="bg-white border-b border-slate-200/80 px-4 pt-3 pb-3.5 space-y-3 shrink-0">
        {/* Search Input */}
        <div className="relative flex items-center">
          <Search
            className={`w-4 h-4 text-slate-400 absolute ${isRtl ? 'right-3.5' : 'left-3.5'}`}
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={
              isRtl ? 'ابحث في المجموعات والمنشورات...' : 'Search groups & posts...'
            }
            className={`w-full min-h-[44px] ${
              isRtl ? 'pr-10 pl-10' : 'pl-10 pr-10'
            } py-2 rounded-2xl bg-slate-100 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#087F75]/30 focus:bg-white transition-colors`}
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              aria-label={isRtl ? 'مسح البحث' : 'Clear search'}
              className={`absolute ${
                isRtl ? 'left-2' : 'right-2'
              } w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:bg-slate-200/70 cursor-pointer`}
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Feed vs Nearby Map View Toggle */}
        <div className="grid grid-cols-2 gap-1.5 p-1 rounded-2xl bg-slate-100">
          <button
            type="button"
            onClick={() => setViewMode('feed')}
            className={`min-h-[40px] rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              viewMode === 'feed'
                ? 'bg-white text-[#112330] shadow-xs'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <LayoutList className="w-4 h-4 text-[#087F75]" />
            <span>{isRtl ? 'آخر المنشورات' : 'Feed'}</span>
          </button>

          <button
            type="button"
            onClick={() => setViewMode('map')}
            className={`min-h-[40px] rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              viewMode === 'map'
                ? 'bg-white text-[#112330] shadow-xs'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <MapPin className="w-4 h-4 text-[#087F75]" />
            <span>{isRtl ? 'خريطة القريبين' : 'Nearby Map'}</span>
          </button>
        </div>

        {/* My Groups Row */}
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-500">
              {isRtl ? 'مجموعاتي' : 'My Groups'}
            </h3>
            <button
              type="button"
              onClick={() => setIsCreateGroupOpen(true)}
              className="text-xs font-bold text-[#087F75] hover:underline inline-flex items-center gap-1 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{isRtl ? 'مجموعة جديدة' : 'New Group'}</span>
            </button>
          </div>

          <div className="flex items-stretch gap-2.5 overflow-x-auto no-scrollbar pb-0.5">
            {/* Quick Create Group Tile */}
            <button
              type="button"
              onClick={() => setIsCreateGroupOpen(true)}
              className="w-24 shrink-0 rounded-2xl border border-dashed border-slate-300 bg-slate-50 hover:bg-teal-50/60 hover:border-[#087F75]/50 p-2.5 flex flex-col items-center justify-center gap-1.5 text-center transition-colors cursor-pointer"
            >
              <span className="w-8 h-8 rounded-xl bg-teal-100 text-[#087F75] flex items-center justify-center">
                <Plus className="w-4 h-4" />
              </span>
              <span className="text-[11px] font-bold text-slate-700 line-clamp-1">
                {isRtl ? 'إنشاء' : 'Create'}
              </span>
            </button>

            {isLoadingGroups && filteredMyGroups.length === 0 ? (
              <div className="flex items-center px-3 text-xs text-slate-400">
                <Loader2 className="w-4 h-4 animate-spin text-[#087F75]" />
              </div>
            ) : (
              filteredMyGroups.map(({ group, role }) => (
                <button
                  key={group.id}
                  type="button"
                  onClick={() => setSelectedGroupId(group.id)}
                  className="w-40 shrink-0 rounded-2xl border border-slate-200/90 bg-white hover:border-[#087F75]/50 p-2.5 text-start flex items-center gap-2.5 transition-colors cursor-pointer"
                >
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#087F75] to-teal-700 text-white font-bold text-sm flex items-center justify-center shrink-0 overflow-hidden">
                    {group.coverUrl ? (
                      <img
                        src={group.coverUrl}
                        alt={group.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      group.name.charAt(0).toUpperCase()
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-[#112330] truncate">{group.name}</p>
                    <p className="text-[11px] text-slate-500 flex items-center gap-1 truncate">
                      {!group.isPublic && <Lock className="w-2.5 h-2.5 shrink-0" />}
                      <span className="truncate">
                        {role === 'admin'
                          ? isRtl
                            ? 'مدير'
                            : 'Admin'
                          : role === 'moderator'
                          ? isRtl
                            ? 'مشرف'
                            : 'Mod'
                          : `${group.memberCount} ${isRtl ? 'عضو' : 'mem'}`}
                      </span>
                    </p>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Main Scrollable Content (Feed or Nearby Map) */}
      <div className="flex-1 min-h-0 overflow-y-auto px-3 sm:px-4 py-4">
        <div className="max-w-xl mx-auto space-y-4">
          {viewMode === 'map' ? (
            <NearbyCommunityMap
              posts={filteredPosts}
              groups={allCombinedGroups}
              language={language}
              onOpenGroup={(gid) => setSelectedGroupId(gid)}
              onSelectPost={(post) => setCommentsTarget({ post, isGroupStaff: false })}
              onRequestCreatePost={onRequestCreatePost ? () => onRequestCreatePost() : undefined}
            />
          ) : (
            <>
          {/* Discover Public Groups Strip (when unjoined public groups exist or searching) */}
          {discoverGroups.length > 0 && (
            <section className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                  <Compass className="w-3.5 h-3.5 text-[#087F75]" />
                  <span>{isRtl ? 'اكتشف المجموعات' : 'Discover Groups'}</span>
                </h3>
              </div>

              <div className="flex items-stretch gap-2.5 overflow-x-auto no-scrollbar pb-1">
                {discoverGroups.map((grp) => (
                  <div
                    key={grp.id}
                    className="w-52 shrink-0 rounded-2xl border border-slate-200 bg-white p-3 flex flex-col justify-between gap-2.5 shadow-2xs"
                  >
                    <button
                      type="button"
                      onClick={() => setSelectedGroupId(grp.id)}
                      className="flex items-center gap-2.5 text-start cursor-pointer min-w-0"
                    >
                      <div className="w-10 h-10 rounded-xl bg-slate-800 text-white font-bold text-sm flex items-center justify-center shrink-0 overflow-hidden">
                        {grp.coverUrl ? (
                          <img
                            src={grp.coverUrl}
                            alt={grp.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          grp.name.charAt(0).toUpperCase()
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold text-[#112330] truncate">{grp.name}</p>
                        <p className="text-[11px] text-slate-500 flex items-center gap-1">
                          <Globe className="w-3 h-3 shrink-0" />
                          <span>
                            {grp.memberCount}{' '}
                            {isRtl ? 'أعضاء' : grp.memberCount === 1 ? 'member' : 'members'}
                          </span>
                        </p>
                      </div>
                    </button>

                    <button
                      type="button"
                      disabled={joiningGroupId === grp.id}
                      onClick={() => void handleJoinGroup(grp)}
                      className="w-full min-h-[36px] rounded-xl bg-teal-50 hover:bg-[#087F75] text-[#087F75] hover:text-white text-xs font-bold transition-colors cursor-pointer disabled:opacity-50"
                    >
                      {joiningGroupId === grp.id
                        ? '...'
                        : isRtl
                        ? 'انضمام'
                        : 'Join Group'}
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Community Posts Feed */}
          <section className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-500">
                {normalizedQuery
                  ? isRtl
                    ? 'نتائج المنشورات'
                    : 'Matching Posts'
                  : isRtl
                  ? 'آخر المنشورات'
                  : 'Latest Posts'}
              </h3>
              <button
                type="button"
                onClick={() => {
                  void loadGroups();
                  void loadFeed(true, null);
                }}
                aria-label={isRtl ? 'تحديث' : 'Refresh'}
                className="text-xs font-semibold text-slate-500 hover:text-[#087F75] inline-flex items-center gap-1 cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>{isRtl ? 'تحديث' : 'Refresh'}</span>
              </button>
            </div>

            {isLoadingFeed ? (
              <div className="py-12 flex flex-col items-center justify-center gap-2 text-slate-400">
                <Loader2 className="w-6 h-6 animate-spin text-[#087F75]" />
                <span className="text-xs">{isRtl ? 'جاري تحميل المنشورات...' : 'Loading feed...'}</span>
              </div>
            ) : feedError ? (
              <div className="bg-white border border-rose-200 rounded-2xl p-5 text-center space-y-2.5">
                <p className="text-xs font-semibold text-rose-600">{feedError}</p>
                <button
                  type="button"
                  onClick={() => void loadFeed(true, null)}
                  className="min-h-[40px] px-4 py-2 rounded-xl bg-[#087F75] text-white text-xs font-bold cursor-pointer"
                >
                  {isRtl ? 'إعادة المحاولة' : 'Retry'}
                </button>
              </div>
            ) : filteredPosts.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-2xl p-6 text-center space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-teal-50 text-[#087F75] flex items-center justify-center mx-auto">
                  <Users className="w-6 h-6" />
                </div>
                <h4 className="text-base font-bold text-[#112330]">
                  {normalizedQuery
                    ? isRtl
                      ? 'لا توجد منشورات مطابقة'
                      : 'No matching posts found'
                    : isRtl
                    ? 'لا توجد منشورات في المجتمع بعد'
                    : 'No community posts yet'}
                </h4>
                <p className="text-sm text-slate-600">
                  {normalizedQuery
                    ? isRtl
                      ? 'جرب كلمة بحث مختلفة.'
                      : 'Try searching for a different keyword or group name.'
                    : isRtl
                    ? 'ابدأ بمشاركة منشور أو استطلاع رأي عبر زر (+).'
                    : 'Share an update, photo, or poll using the Create (+) button.'}
                </p>
                {!normalizedQuery && onRequestCreatePost && (
                  <button
                    type="button"
                    onClick={() => onRequestCreatePost()}
                    className="min-h-[44px] px-5 py-2.5 rounded-xl bg-[#087F75] hover:bg-[#06685F] text-white text-xs font-bold cursor-pointer"
                  >
                    {isRtl ? 'إنشاء أول منشور' : 'Create First Post'}
                  </button>
                )}
              </div>
            ) : (
              <>
                {filteredPosts.map((post) => (
                  <CommunityPostCard
                    key={post.id}
                    post={post}
                    currentUserId={currentUser.id}
                    language={language}
                    onOpenComments={(p) => setCommentsTarget({ post: p, isGroupStaff: false })}
                    onOpenGroup={(gid) => setSelectedGroupId(gid)}
                    onDeletePost={handleDeletePost}
                    onSharePost={handleSharePost}
                    onPostUpdated={(updated) =>
                      setPosts((prev) =>
                        prev.map((item) => (item.id === updated.id ? updated : item))
                      )
                    }
                  />
                ))}

                {hasMore && (
                  <div ref={sentinelRef} className="py-4 flex justify-center">
                    {isLoadingMore ? (
                      <Loader2 className="w-5 h-5 animate-spin text-[#087F75]" />
                    ) : (
                      <button
                        type="button"
                        onClick={() => void loadFeed(false, cursor)}
                        className="min-h-[40px] px-4 py-2 rounded-xl bg-white border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
                      >
                        {isRtl ? 'تحميل المزيد' : 'Load more'}
                      </button>
                    )}
                  </div>
                )}
              </>
            )}
          </section>
            </>
          )}
        </div>
      </div>

      {/* Share confirmation toast */}
      {shareFeedback && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-40 px-4 py-2 rounded-full bg-slate-900 text-white text-xs font-semibold shadow-lg flex items-center gap-1.5">
          <Check className="w-3.5 h-3.5 text-emerald-400" />
          <span>{shareFeedback}</span>
        </div>
      )}

      {isCreateGroupOpen && (
        <CreateGroupModal
          currentUser={currentUser}
          language={language}
          onClose={() => setIsCreateGroupOpen(false)}
          onCreated={(group) => {
            setIsCreateGroupOpen(false);
            void loadGroups();
            setSelectedGroupId(group.id);
          }}
        />
      )}

      {commentsTarget && (
        <CommunityCommentsSheet
          post={commentsTarget.post}
          currentUser={currentUser}
          language={language}
          isGroupStaff={commentsTarget.isGroupStaff}
          onClose={() => setCommentsTarget(null)}
          onCommentCountChanged={handleCommentCountChanged}
        />
      )}
    </div>
  );
};
