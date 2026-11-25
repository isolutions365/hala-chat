import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  Compass,
  Globe,
  LayoutList,
  Loader2,
  LocateFixed,
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
  DEFAULT_NEARBY_RADIUS_KM,
  type CommunityAuthorProfile,
  type CommunityGroup,
  type CommunityPost,
  type MyCommunityGroupItem,
  type NearbyCommunityItem,
  deleteCommunityPost,
  fetchCommunityPostsPage,
  fetchMyCommunityGroups,
  fetchNearbyCommunityItems,
  fetchPublicCommunityGroups,
  getCachedCommunityCoords,
  joinCommunityGroup,
  requestCommunityBrowserCoords,
} from '../../services/community';
import { formatDistanceLabel } from '../../services/location';
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
  onOpenCreatorProfile?: (authorId: string) => void;
}

export const CommunityTab: React.FC<CommunityTabProps> = ({
  currentUser,
  language,
  refreshSignal = 0,
  onRequestCreatePost,
  onOpenCreatorProfile,
}) => {
  const isRtl = language === 'ar';

  const [searchQuery, setSearchQuery] = useState('');
  const [myGroups, setMyGroups] = useState<MyCommunityGroupItem[]>([]);
  const [publicGroups, setPublicGroups] = useState<CommunityGroup[]>([]);
  const [isLoadingGroups, setIsLoadingGroups] = useState(true);
  const [joiningGroupId, setJoiningGroupId] = useState<string | null>(null);
  const [joinError, setJoinError] = useState('');

  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [cursor, setCursor] = useState<QueryDocumentSnapshot | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [isLoadingFeed, setIsLoadingFeed] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [feedError, setFeedError] = useState('');

  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'feed' | 'nearby' | 'map'>('feed');
  const [isCreateGroupOpen, setIsCreateGroupOpen] = useState(false);
  const [commentsTarget, setCommentsTarget] = useState<{
    post: CommunityPost;
    isGroupStaff: boolean;
  } | null>(null);
  const [shareFeedback, setShareFeedback] = useState('');

  const [nearbyCoords, setNearbyCoords] = useState<{ lat: number; lng: number } | null>(() =>
    getCachedCommunityCoords()
  );
  const [nearbyItems, setNearbyItems] = useState<NearbyCommunityItem[]>([]);
  const [isLoadingNearby, setIsLoadingNearby] = useState(false);
  const [nearbyError, setNearbyError] = useState('');
  const [nearbyLocationMissing, setNearbyLocationMissing] = useState(false);

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

  const loadNearby = useCallback(
    async (explicitPrompt = false) => {
      setIsLoadingNearby(true);
      setNearbyError('');
      setNearbyLocationMissing(false);
      try {
        let coords = nearbyCoords || getCachedCommunityCoords();
        if (!coords || explicitPrompt) {
          coords = await requestCommunityBrowserCoords();
        }
        if (!coords) {
          setNearbyLocationMissing(true);
          setNearbyItems([]);
          return;
        }
        setNearbyCoords(coords);
        const items = await fetchNearbyCommunityItems({
          latitude: coords.lat,
          longitude: coords.lng,
          radiusKm: DEFAULT_NEARBY_RADIUS_KM,
          myGroupIds: myGroups.map((m) => m.group.id),
          myGroupsWithLocation: myGroups.map((m) => m.group).filter((g) => Boolean(g.location)),
        });
        setNearbyItems(items);
      } catch (err: any) {
        setNearbyError(
          err?.message || (isRtl ? 'تعذر تحميل العناصر القريبة.' : 'Failed to load nearby items.')
        );
      } finally {
        setIsLoadingNearby(false);
      }
    },
    [nearbyCoords, myGroups, isRtl]
  );

  useEffect(() => {
    if (viewMode === 'nearby' && !selectedGroupId) {
      void loadNearby(false);
    }
  }, [viewMode, selectedGroupId, refreshSignal, loadNearby]);

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

  const filteredNearbyItems = useMemo(() => {
    if (!normalizedQuery) return nearbyItems;
    return nearbyItems.filter((item) => {
      if (item.kind === 'group') {
        const g = item.group;
        return (
          g.name.toLowerCase().includes(normalizedQuery) ||
          g.description.toLowerCase().includes(normalizedQuery) ||
          (g.location?.locationName || '').toLowerCase().includes(normalizedQuery)
        );
      }
      const p = item.post;
      return (
        p.text.toLowerCase().includes(normalizedQuery) ||
        p.authorName.toLowerCase().includes(normalizedQuery) ||
        p.groupName.toLowerCase().includes(normalizedQuery) ||
        (p.poll?.question || '').toLowerCase().includes(normalizedQuery) ||
        (p.location?.locationName || '').toLowerCase().includes(normalizedQuery)
      );
    });
  }, [nearbyItems, normalizedQuery]);

  const handleJoinGroup = async (group: CommunityGroup) => {
    if (joiningGroupId) return;
    setJoiningGroupId(group.id);
    setJoinError('');
    try {
      await joinCommunityGroup(group.id, currentUser);
      await loadGroups();
      setSelectedGroupId(group.id);
    } catch (err: any) {
      let detail = '';
      const rawMsg = typeof err?.message === 'string' ? err.message.trim() : '';
      if (rawMsg.startsWith('{')) {
        try {
          const parsed = JSON.parse(rawMsg);
          if (typeof parsed?.error === 'string') detail = parsed.error;
        } catch {
          detail = rawMsg;
        }
      } else {
        detail = rawMsg;
      }
      const fallback = isRtl
        ? 'تعذر الانضمام إلى المجموعة. حاول مرة أخرى.'
        : 'Could not join group. Please try again.';
      setJoinError(detail ? `${fallback} (${detail})` : fallback);
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
          onOpenCreatorProfile={onOpenCreatorProfile}
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
            onOpenCreatorProfile={onOpenCreatorProfile}
          />
        )}
      </>
    );
  }

  return (
    <div
      className="flex-1 min-h-0 flex flex-col bg-slate-50 dark:bg-[#0B141A] text-slate-900 dark:text-slate-100 relative"
      dir={isRtl ? 'rtl' : 'ltr'}
    >
      {/* Top Search & My Groups Header */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200/80 dark:border-slate-800 px-4 pt-3 pb-3.5 space-y-3 shrink-0">
        {/* Search Input + My Creator Profile shortcut */}
        <div className="flex items-center gap-2">
          <div className="relative flex items-center flex-1 min-w-0">
            <Search
              className={`w-4 h-4 text-slate-400 dark:text-slate-500 absolute ${isRtl ? 'right-3.5' : 'left-3.5'}`}
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
              } py-2 rounded-2xl bg-slate-100 dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-[#087F75]/30 focus:bg-white dark:focus:bg-slate-900 transition-colors`}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                aria-label={isRtl ? 'مسح البحث' : 'Clear search'}
                className={`absolute ${
                  isRtl ? 'left-2' : 'right-2'
                } w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:bg-slate-200/70 dark:hover:bg-slate-700 cursor-pointer`}
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          {onOpenCreatorProfile && (
            <button
              type="button"
              onClick={() => onOpenCreatorProfile(currentUser.id)}
              aria-label={isRtl ? 'ملفي الشخصي للمبدع' : 'My Creator Profile'}
              className="w-11 h-11 rounded-2xl bg-teal-700 text-white font-bold text-sm flex items-center justify-center overflow-hidden shrink-0 border border-slate-200 dark:border-slate-700 hover:ring-2 hover:ring-[#087F75]/40 transition-all cursor-pointer"
            >
              {currentUser.avatarUrl ? (
                <img
                  src={currentUser.avatarUrl}
                  alt={currentUser.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                currentUser.name.charAt(0).toUpperCase()
              )}
            </button>
          )}
        </div>

        {/* Feed vs Nearby vs Nearby Map View Toggle */}
        <div className="grid grid-cols-3 gap-1.5 p-1 rounded-2xl bg-slate-100 dark:bg-slate-800">
          <button
            type="button"
            onClick={() => setViewMode('feed')}
            className={`min-h-[40px] rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              viewMode === 'feed'
                ? 'bg-white dark:bg-slate-900 text-[#112330] dark:text-slate-100 shadow-xs'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
            }`}
          >
            <LayoutList className="w-4 h-4 text-[#087F75] dark:text-teal-400" />
            <span>{isRtl ? 'المنشورات' : 'Feed'}</span>
          </button>

          <button
            type="button"
            onClick={() => setViewMode('nearby')}
            className={`min-h-[40px] rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              viewMode === 'nearby'
                ? 'bg-white dark:bg-slate-900 text-[#112330] dark:text-slate-100 shadow-xs'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
            }`}
          >
            <LocateFixed className="w-4 h-4 text-[#087F75] dark:text-teal-400" />
            <span>{isRtl ? 'القريبين' : 'Nearby'}</span>
          </button>

          <button
            type="button"
            onClick={() => setViewMode('map')}
            className={`min-h-[40px] rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              viewMode === 'map'
                ? 'bg-white dark:bg-slate-900 text-[#112330] dark:text-slate-100 shadow-xs'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
            }`}
          >
            <MapPin className="w-4 h-4 text-[#087F75] dark:text-teal-400" />
            <span>{isRtl ? 'الخريطة' : 'Nearby Map'}</span>
          </button>
        </div>

        {/* My Groups Row */}
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              {isRtl ? 'مجموعاتي' : 'My Groups'}
            </h3>
            <button
              type="button"
              onClick={() => setIsCreateGroupOpen(true)}
              className="text-xs font-bold text-[#087F75] dark:text-teal-400 hover:underline inline-flex items-center gap-1 cursor-pointer"
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
              className="w-24 shrink-0 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 hover:bg-teal-50/60 dark:hover:bg-teal-950/40 hover:border-[#087F75]/50 p-2.5 flex flex-col items-center justify-center gap-1.5 text-center transition-colors cursor-pointer"
            >
              <span className="w-8 h-8 rounded-xl bg-teal-100 dark:bg-teal-950/60 text-[#087F75] dark:text-teal-400 flex items-center justify-center">
                <Plus className="w-4 h-4" />
              </span>
              <span className="text-[11px] font-bold text-slate-700 dark:text-slate-200 line-clamp-1">
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
                  className="w-40 shrink-0 rounded-2xl border border-slate-200/90 dark:border-slate-700 bg-white dark:bg-slate-800/80 hover:border-[#087F75]/50 p-2.5 text-start flex items-center gap-2.5 transition-colors cursor-pointer"
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
                    <p className="text-xs font-bold text-[#112330] dark:text-slate-100 truncate">{group.name}</p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1 truncate">
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
      <div className="flex-1 min-h-0 overflow-y-auto px-3 sm:px-4 pt-4 pb-28">
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
          ) : viewMode === 'nearby' ? (
            <section className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                  <LocateFixed className="w-3.5 h-3.5 text-[#087F75] dark:text-teal-400" />
                  <span>
                    {isRtl
                      ? `المجموعات والمنشورات ضمن ${DEFAULT_NEARBY_RADIUS_KM} كم`
                      : `Within ${DEFAULT_NEARBY_RADIUS_KM} km`}
                  </span>
                </h3>
                <button
                  type="button"
                  onClick={() => void loadNearby(true)}
                  disabled={isLoadingNearby}
                  className="text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-[#087F75] dark:hover:text-teal-400 inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isLoadingNearby ? 'animate-spin' : ''}`} />
                  <span>{isRtl ? 'تحديث الموقع' : 'Refresh'}</span>
                </button>
              </div>

              {isLoadingNearby ? (
                <div className="py-12 flex flex-col items-center justify-center gap-2 text-slate-400">
                  <Loader2 className="w-6 h-6 animate-spin text-[#087F75]" />
                  <span className="text-xs">
                    {isRtl ? 'جاري البحث عن المجموعات والمنشورات القريبة...' : 'Finding nearby groups & posts...'}
                  </span>
                </div>
              ) : nearbyLocationMissing ? (
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 text-center space-y-3">
                  <div className="w-12 h-12 rounded-2xl bg-teal-50 dark:bg-teal-950/60 text-[#087F75] dark:text-teal-400 flex items-center justify-center mx-auto">
                    <LocateFixed className="w-6 h-6" />
                  </div>
                  <h4 className="text-base font-bold text-[#112330] dark:text-slate-100">
                    {isRtl ? 'فعّل الموقع لعرض القريبين' : 'Enable location to see nearby activity'}
                  </h4>
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    {isRtl
                      ? 'اسمح بالوصول إلى موقعك لعرض المجموعات والمنشورات القريبة منك ضمن 50 كم.'
                      : 'Allow location access to discover community groups and posts within 50 km.'}
                  </p>
                  <button
                    type="button"
                    onClick={() => void loadNearby(true)}
                    className="min-h-[44px] px-5 py-2.5 rounded-xl bg-[#087F75] hover:bg-[#06685F] text-white text-xs font-bold cursor-pointer"
                  >
                    {isRtl ? 'تفعيل الموقع' : 'Enable Location'}
                  </button>
                </div>
              ) : nearbyError ? (
                <div className="bg-white dark:bg-slate-900 border border-rose-200 dark:border-rose-900/60 rounded-2xl p-5 text-center space-y-2.5">
                  <p className="text-xs font-semibold text-rose-600 dark:text-rose-400">{nearbyError}</p>
                  <button
                    type="button"
                    onClick={() => void loadNearby(true)}
                    className="min-h-[40px] px-4 py-2 rounded-xl bg-[#087F75] text-white text-xs font-bold cursor-pointer"
                  >
                    {isRtl ? 'إعادة المحاولة' : 'Retry'}
                  </button>
                </div>
              ) : filteredNearbyItems.length === 0 ? (
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 text-center space-y-3">
                  <div className="w-12 h-12 rounded-2xl bg-teal-50 dark:bg-teal-950/60 text-[#087F75] dark:text-teal-400 flex items-center justify-center mx-auto">
                    <MapPin className="w-6 h-6" />
                  </div>
                  <h4 className="text-base font-bold text-[#112330] dark:text-slate-100">
                    {isRtl ? 'لا يوجد محتوى قريب حالياً' : 'Nothing nearby within 50 km yet'}
                  </h4>
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    {isRtl
                      ? 'أنشئ مجموعة أو منشوراً مع موقع ليظهر للأعضاء القريبين منك.'
                      : 'Create a group or post with your location attached so people nearby can see it.'}
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredNearbyItems.map((item) =>
                    item.kind === 'group' ? (
                      <div
                        key={`nearby-group-${item.group.id}`}
                        className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-4 shadow-2xs flex items-center justify-between gap-3"
                      >
                        <button
                          type="button"
                          onClick={() => setSelectedGroupId(item.group.id)}
                          className="flex items-center gap-3 min-w-0 flex-1 text-start cursor-pointer"
                        >
                          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-[#087F75] to-teal-700 text-white font-bold text-sm flex items-center justify-center shrink-0 overflow-hidden">
                            {item.group.coverUrl ? (
                              <img
                                src={item.group.coverUrl}
                                alt={item.group.name}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              item.group.name.charAt(0).toUpperCase()
                            )}
                          </div>
                          <div className="min-w-0 flex-1 space-y-0.5">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-bold text-[#112330] dark:text-slate-100 truncate">
                                {item.group.name}
                              </span>
                              <span className="px-1.5 py-0.5 rounded-md bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 text-[10px] font-bold">
                                {isRtl ? 'مجموعة' : 'Group'}
                              </span>
                            </div>
                            {item.group.description && (
                              <p className="text-xs text-slate-600 dark:text-slate-400 line-clamp-1">
                                {item.group.description}
                              </p>
                            )}
                            <p className="text-[11px] font-semibold text-[#087F75] dark:text-teal-400 flex items-center gap-1">
                              <MapPin className="w-3 h-3 shrink-0" />
                              <span>{formatDistanceLabel(item.distanceKm, isRtl)}</span>
                              <span className="text-slate-400 dark:text-slate-500">•</span>
                              <span className="text-slate-500 dark:text-slate-400">
                                {item.group.memberCount}{' '}
                                {isRtl ? 'أعضاء' : item.group.memberCount === 1 ? 'member' : 'members'}
                              </span>
                            </p>
                          </div>
                        </button>

                        {myGroupIds.has(item.group.id) ? (
                          <button
                            type="button"
                            onClick={() => setSelectedGroupId(item.group.id)}
                            className="min-h-[38px] px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold shrink-0 cursor-pointer"
                          >
                            {isRtl ? 'فتح' : 'Open'}
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={joiningGroupId === item.group.id}
                            onClick={() => void handleJoinGroup(item.group)}
                            className="min-h-[38px] px-3 py-1.5 rounded-xl bg-teal-50 dark:bg-teal-950/60 hover:bg-[#087F75] text-[#087F75] dark:text-teal-300 hover:text-white text-xs font-bold shrink-0 transition-colors cursor-pointer disabled:opacity-50"
                          >
                            {joiningGroupId === item.group.id
                              ? '...'
                              : isRtl
                              ? 'انضمام'
                              : 'Join'}
                          </button>
                        )}
                      </div>
                    ) : (
                      <div key={`nearby-post-${item.post.id}`} className="space-y-1">
                        <div className="px-2 flex items-center gap-1.5 text-[11px] font-bold text-[#087F75]">
                          <MapPin className="w-3 h-3 shrink-0" />
                          <span>{formatDistanceLabel(item.distanceKm, isRtl)}</span>
                        </div>
                        <CommunityPostCard
                          post={item.post}
                          currentUserId={currentUser.id}
                          language={language}
                          onOpenComments={(p) => setCommentsTarget({ post: p, isGroupStaff: false })}
                          onOpenGroup={(gid) => setSelectedGroupId(gid)}
                          onOpenCreatorProfile={onOpenCreatorProfile}
                          onDeletePost={async (p) => {
                            await handleDeletePost(p);
                            setNearbyItems((prev) =>
                              prev.filter((it) => !(it.kind === 'post' && it.post.id === p.id))
                            );
                          }}
                          onSharePost={handleSharePost}
                          onPostUpdated={(updated) => {
                            setPosts((prev) =>
                              prev.map((it) => (it.id === updated.id ? updated : it))
                            );
                            setNearbyItems((prev) =>
                              prev.map((it) =>
                                it.kind === 'post' && it.post.id === updated.id
                                  ? { ...it, post: updated }
                                  : it
                              )
                            );
                          }}
                        />
                      </div>
                    )
                  )}
                </div>
              )}
            </section>
          ) : (
            <>
          {joinError && (
            <div
              role="alert"
              className="bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-rose-700 dark:text-rose-300 rounded-2xl px-3.5 py-2.5 text-xs font-semibold flex items-center justify-between gap-2"
            >
              <span>{joinError}</span>
              <button
                type="button"
                onClick={() => setJoinError('')}
                aria-label={isRtl ? 'إغلاق' : 'Dismiss'}
                className="p-1 rounded-lg hover:bg-rose-100 dark:hover:bg-rose-900/50 text-rose-600 dark:text-rose-300 cursor-pointer shrink-0"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Discover Public Groups Strip (when unjoined public groups exist or searching) */}
          {discoverGroups.length > 0 && (
            <section className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                  <Compass className="w-3.5 h-3.5 text-[#087F75] dark:text-teal-400" />
                  <span>{isRtl ? 'اكتشف المجموعات' : 'Discover Groups'}</span>
                </h3>
              </div>

              <div className="flex items-stretch gap-2.5 overflow-x-auto no-scrollbar pb-1">
                {discoverGroups.map((grp) => (
                  <div
                    key={grp.id}
                    className="w-52 shrink-0 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 flex flex-col justify-between gap-2.5 shadow-2xs"
                  >
                    <button
                      type="button"
                      onClick={() => setSelectedGroupId(grp.id)}
                      className="flex items-center gap-2.5 text-start cursor-pointer min-w-0"
                    >
                      <div className="w-10 h-10 rounded-xl bg-slate-800 dark:bg-slate-700 text-white font-bold text-sm flex items-center justify-center shrink-0 overflow-hidden">
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
                        <p className="text-xs font-bold text-[#112330] dark:text-slate-100 truncate">{grp.name}</p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1">
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
                      className="w-full min-h-[36px] rounded-xl bg-teal-50 dark:bg-teal-950/60 hover:bg-[#087F75] text-[#087F75] dark:text-teal-300 hover:text-white text-xs font-bold transition-colors cursor-pointer disabled:opacity-50"
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
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">
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
                className="text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-[#087F75] dark:hover:text-teal-400 inline-flex items-center gap-1 cursor-pointer"
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
              <div className="bg-white dark:bg-slate-900 border border-rose-200 dark:border-rose-900/60 rounded-2xl p-5 text-center space-y-2.5">
                <p className="text-xs font-semibold text-rose-600 dark:text-rose-400">{feedError}</p>
                <button
                  type="button"
                  onClick={() => void loadFeed(true, null)}
                  className="min-h-[40px] px-4 py-2 rounded-xl bg-[#087F75] text-white text-xs font-bold cursor-pointer"
                >
                  {isRtl ? 'إعادة المحاولة' : 'Retry'}
                </button>
              </div>
            ) : filteredPosts.length === 0 ? (
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 text-center space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-teal-50 dark:bg-teal-950/60 text-[#087F75] dark:text-teal-400 flex items-center justify-center mx-auto">
                  <Users className="w-6 h-6" />
                </div>
                <h4 className="text-base font-bold text-[#112330] dark:text-slate-100">
                  {normalizedQuery
                    ? isRtl
                      ? 'لا توجد منشورات مطابقة'
                      : 'No matching posts found'
                    : isRtl
                    ? 'لا توجد منشورات في المجتمع بعد'
                    : 'No community posts yet'}
                </h4>
                <p className="text-sm text-slate-600 dark:text-slate-400">
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
                    onOpenCreatorProfile={onOpenCreatorProfile}
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
                        className="min-h-[40px] px-4 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
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
          onOpenCreatorProfile={onOpenCreatorProfile}
        />
      )}
    </div>
  );
};
