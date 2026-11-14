import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Globe,
  Loader2,
  Lock,
  MapPin,
  Plus,
  Search,
  Shield,
  ShieldCheck,
  Trash2,
  UserMinus,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import type { QueryDocumentSnapshot } from 'firebase/firestore';
import { Language } from '../../types';
import { buildGoogleMapsUrl } from '../../services/location';
import {
  getCreatorProfilesByIds,
  listCreatorProfiles,
  type CreatorProfile,
} from '../../services/creatorProfiles';
import {
  COMMUNITY_FEED_PAGE_SIZE,
  type CommunityAuthorProfile,
  type CommunityGroup,
  type CommunityGroupMember,
  type CommunityMemberRole,
  type CommunityPost,
  addMemberToGroup,
  deleteCommunityGroup,
  deleteCommunityPost,
  fetchCommunityGroupById,
  fetchCommunityPostsPage,
  fetchMyGroupMembership,
  joinCommunityGroup,
  leaveCommunityGroup,
  removeGroupMember,
  updateGroupMemberRole,
  watchGroupMembers,
} from '../../services/community';
import { CommunityPostCard } from './CommunityPostCard';

interface GroupDetailViewProps {
  groupId: string;
  initialGroup?: CommunityGroup | null;
  currentUser: CommunityAuthorProfile;
  language: Language;
  refreshSignal?: number;
  onBack: () => void;
  onGroupChanged: () => void;
  onOpenComments: (post: CommunityPost, isGroupStaff: boolean) => void;
  onSharePost: (post: CommunityPost) => void;
  onCreatePostInGroup?: (group: CommunityGroup) => void;
  onOpenCreatorProfile?: (authorId: string) => void;
}

export const GroupDetailView: React.FC<GroupDetailViewProps> = ({
  groupId,
  initialGroup = null,
  currentUser,
  language,
  refreshSignal = 0,
  onBack,
  onGroupChanged,
  onOpenComments,
  onSharePost,
  onCreatePostInGroup,
  onOpenCreatorProfile,
}) => {
  const isRtl = language === 'ar';
  const BackIcon = isRtl ? ArrowRight : ArrowLeft;

  const [group, setGroup] = useState<CommunityGroup | null>(initialGroup);
  const [membership, setMembership] = useState<CommunityGroupMember | null>(null);
  const [members, setMembers] = useState<CommunityGroupMember[]>([]);
  const [activeTab, setActiveTab] = useState<'feed' | 'members'>('feed');

  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [cursor, setCursor] = useState<QueryDocumentSnapshot | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [isLoadingInitial, setIsLoadingInitial] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const [isMembershipBusy, setIsMembershipBusy] = useState(false);
  const [confirmDeleteGroup, setConfirmDeleteGroup] = useState(false);
  const [isDeletingGroup, setIsDeletingGroup] = useState(false);
  const [statusError, setStatusError] = useState('');

  const [isAddMemberOpen, setIsAddMemberOpen] = useState(false);
  const [availableCreators, setAvailableCreators] = useState<CreatorProfile[]>([]);
  const [memberCreatorMap, setMemberCreatorMap] = useState<Record<string, CreatorProfile | null>>({});
  const [userSearch, setUserSearch] = useState('');
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [addingUserId, setAddingUserId] = useState<string | null>(null);

  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const myRole: CommunityMemberRole | null = membership?.role ?? null;
  const isMember = Boolean(membership);
  const isAdmin = myRole === 'admin';
  const isModerator = myRole === 'moderator';
  const isStaff = isAdmin || isModerator;

  const loadGroupHeader = useCallback(async () => {
    try {
      const [grp, myMem] = await Promise.all([
        fetchCommunityGroupById(groupId),
        fetchMyGroupMembership(groupId, currentUser.id),
      ]);
      setGroup(grp);
      setMembership(myMem);
    } catch (err: any) {
      setStatusError(err?.message || (isRtl ? 'تعذر تحميل بيانات المجموعة.' : 'Failed to load group.'));
    }
  }, [groupId, currentUser.id, isRtl]);

  const loadPosts = useCallback(
    async (reset: boolean, currentCursor: QueryDocumentSnapshot | null) => {
      if (!isMember) {
        setPosts([]);
        setHasMore(false);
        setIsLoadingInitial(false);
        return;
      }
      if (reset) {
        setIsLoadingInitial(true);
      } else {
        setIsLoadingMore(true);
      }
      try {
        const res = await fetchCommunityPostsPage({
          groupId,
          cursor: reset ? null : currentCursor,
          pageSize: COMMUNITY_FEED_PAGE_SIZE,
        });
        setPosts((prev) => (reset ? res.posts : [...prev, ...res.posts]));
        setCursor(res.lastDoc);
        setHasMore(res.hasMore);
      } catch (err: any) {
        setStatusError(err?.message || (isRtl ? 'تعذر تحميل المنشورات.' : 'Failed to load posts.'));
      } finally {
        setIsLoadingInitial(false);
        setIsLoadingMore(false);
      }
    },
    [groupId, isMember, isRtl]
  );

  useEffect(() => {
    void loadGroupHeader();
  }, [loadGroupHeader]);

  useEffect(() => {
    let active = true;
    if (isMember) {
      void loadPosts(true, null);
      const unsub = watchGroupMembers(groupId, (list) => {
        setMembers(list);
        const ids = list.map((m) => m.userId).filter(Boolean);
        if (ids.length > 0) {
          void getCreatorProfilesByIds(ids).then((map) => {
            if (active) setMemberCreatorMap((prev) => ({ ...prev, ...map }));
          });
        }
      });
      return () => {
        active = false;
        unsub();
      };
    } else {
      setMembers([]);
      setPosts([]);
      setIsLoadingInitial(false);
    }
    return () => {
      active = false;
    };
  }, [groupId, isMember, loadPosts, refreshSignal]);

  // Infinite scroll sentinel
  useEffect(() => {
    if (activeTab !== 'feed' || !hasMore || isLoadingMore || isLoadingInitial || !isMember) return;
    const node = sentinelRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          void loadPosts(false, cursor);
        }
      },
      { rootMargin: '220px' }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [activeTab, hasMore, isLoadingMore, isLoadingInitial, isMember, cursor, loadPosts]);

  const handleJoin = async () => {
    if (isMembershipBusy) return;
    setStatusError('');
    setIsMembershipBusy(true);
    try {
      await joinCommunityGroup(groupId, currentUser);
      await loadGroupHeader();
      onGroupChanged();
    } catch (err: any) {
      setStatusError(err?.message || (isRtl ? 'تعذر الانضمام للمجموعة.' : 'Could not join group.'));
    } finally {
      setIsMembershipBusy(false);
    }
  };

  const handleLeave = async () => {
    if (isMembershipBusy) return;
    setStatusError('');
    setIsMembershipBusy(true);
    try {
      await leaveCommunityGroup(groupId, currentUser.id);
      setMembership(null);
      await loadGroupHeader();
      onGroupChanged();
    } catch (err: any) {
      setStatusError(err?.message || (isRtl ? 'تعذر مغادرة المجموعة.' : 'Could not leave group.'));
    } finally {
      setIsMembershipBusy(false);
    }
  };

  const handleDeleteGroup = async () => {
    if (isDeletingGroup) return;
    setIsDeletingGroup(true);
    try {
      await deleteCommunityGroup(groupId);
      onGroupChanged();
      onBack();
    } catch (err: any) {
      setStatusError(err?.message || (isRtl ? 'تعذر حذف المجموعة.' : 'Failed to delete group.'));
      setIsDeletingGroup(false);
    }
  };

  const handleRoleChange = async (member: CommunityGroupMember, nextRole: CommunityMemberRole) => {
    if (!isAdmin || member.role === nextRole) return;
    setStatusError('');
    try {
      await updateGroupMemberRole(groupId, member.userId, nextRole);
    } catch (err: any) {
      setStatusError(err?.message || (isRtl ? 'تعذر تحديث الدور.' : 'Failed to update role.'));
    }
  };

  const handleRemoveMember = async (member: CommunityGroupMember) => {
    setStatusError('');
    try {
      await removeGroupMember(groupId, member.userId);
      await loadGroupHeader();
      onGroupChanged();
    } catch (err: any) {
      setStatusError(err?.message || (isRtl ? 'تعذر إزالة العضو.' : 'Failed to remove member.'));
    }
  };

  const openAddMemberPicker = async () => {
    setIsAddMemberOpen(true);
    setUserSearch('');
    setIsLoadingUsers(true);
    try {
      const creators = await listCreatorProfiles(30);
      setAvailableCreators(creators);
    } catch {
      setAvailableCreators([]);
    } finally {
      setIsLoadingUsers(false);
    }
  };

  const handleAddMember = async (creator: CreatorProfile) => {
    if (addingUserId) return;
    setAddingUserId(creator.uid);
    setStatusError('');
    try {
      await addMemberToGroup(groupId, {
        id: creator.uid,
        name: creator.displayName,
        avatarUrl: creator.avatarUrl || null,
      });
      await loadGroupHeader();
      onGroupChanged();
    } catch (err: any) {
      setStatusError(err?.message || (isRtl ? 'تعذر إضافة العضو.' : 'Failed to add member.'));
    } finally {
      setAddingUserId(null);
    }
  };

  const handleDeletePost = async (post: CommunityPost) => {
    await deleteCommunityPost(post.id, post.imageUrl);
    setPosts((prev) => prev.filter((p) => p.id !== post.id));
  };

  const memberIds = new Set(members.map((m) => m.userId));
  const filteredUsersToAdd = availableCreators.filter((c) => {
    if (memberIds.has(c.uid)) return false;
    const q = userSearch.trim().toLowerCase();
    if (!q) return true;
    return c.displayName.toLowerCase().includes(q) || c.username.toLowerCase().includes(q);
  });

  const roleLabel = (role: CommunityMemberRole) => {
    if (role === 'admin') return isRtl ? 'مدير' : 'Admin';
    if (role === 'moderator') return isRtl ? 'مشرف' : 'Moderator';
    return isRtl ? 'عضو' : 'Member';
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-slate-50" dir={isRtl ? 'rtl' : 'ltr'}>
      {/* Top Bar */}
      <div className="px-3 py-2.5 bg-white border-b border-slate-200 flex items-center justify-between gap-2 shrink-0">
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
              {group?.name || (isRtl ? 'مجموعة' : 'Group')}
            </h2>
            {group && (
              <p className="text-xs text-slate-500 flex items-center gap-1.5">
                {group.isPublic ? (
                  <Globe className="w-3 h-3 text-slate-400" />
                ) : (
                  <Lock className="w-3 h-3 text-slate-400" />
                )}
                <span>
                  {group.memberCount}{' '}
                  {isRtl ? 'أعضاء' : group.memberCount === 1 ? 'member' : 'members'}
                </span>
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {group && isMember && onCreatePostInGroup && (
            <button
              type="button"
              onClick={() => onCreatePostInGroup(group)}
              className="min-h-[40px] px-3 py-1.5 rounded-xl bg-[#087F75] hover:bg-[#06685F] text-white text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{isRtl ? 'منشور' : 'Post'}</span>
            </button>
          )}
          {isAdmin && (
            confirmDeleteGroup ? (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={isDeletingGroup}
                  onClick={handleDeleteGroup}
                  className="min-h-[36px] px-2.5 rounded-lg bg-rose-600 text-white text-xs font-bold cursor-pointer"
                >
                  {isDeletingGroup ? '...' : isRtl ? 'تأكيد' : 'Confirm'}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDeleteGroup(false)}
                  className="min-h-[36px] px-2 rounded-lg bg-slate-100 text-slate-700 text-xs font-semibold cursor-pointer"
                >
                  {isRtl ? 'إلغاء' : 'Cancel'}
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmDeleteGroup(true)}
                aria-label={isRtl ? 'حذف المجموعة' : 'Delete group'}
                className="min-w-[40px] min-h-[40px] rounded-xl flex items-center justify-center text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )
          )}
        </div>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {group && (
          <div className="bg-white border-b border-slate-200">
            {group.coverUrl ? (
              <div className="h-36 sm:h-44 w-full bg-slate-200 overflow-hidden">
                <img
                  src={group.coverUrl}
                  alt={group.name}
                  className="w-full h-full object-cover"
                />
              </div>
            ) : (
              <div className="h-24 w-full bg-gradient-to-r from-[#0d1c26] via-[#087F75] to-teal-600 flex items-center justify-center text-white/90">
                <Users className="w-8 h-8" />
              </div>
            )}

            <div className="p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <h3 className="text-lg font-extrabold text-[#112330]">{group.name}</h3>
                  {group.description && (
                    <p className="text-sm text-slate-600 leading-relaxed">{group.description}</p>
                  )}
                  <p className="text-xs font-medium text-slate-500">
                    {group.isPublic
                      ? isRtl
                        ? 'مجموعة عامة • يمكن لأي مستخدم الانضمام'
                        : 'Open Group • Anyone can join'
                      : isRtl
                      ? 'مجموعة خاصة • للأعضاء المضافين فقط'
                      : 'Members-Only Group'}
                  </p>
                  {group.location && (
                    <a
                      href={buildGoogleMapsUrl(group.location.latitude, group.location.longitude)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#087F75] hover:underline pt-0.5"
                    >
                      <MapPin className="w-3.5 h-3.5 shrink-0" />
                      <span>{group.location.locationName}</span>
                    </a>
                  )}
                </div>

                {isMember ? (
                  <button
                    type="button"
                    disabled={isMembershipBusy}
                    onClick={handleLeave}
                    className="min-h-[40px] px-3.5 py-2 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-bold shrink-0 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {isMembershipBusy ? '...' : isRtl ? 'مغادرة' : 'Leave'}
                  </button>
                ) : group.isPublic ? (
                  <button
                    type="button"
                    disabled={isMembershipBusy}
                    onClick={handleJoin}
                    className="min-h-[40px] px-4 py-2 rounded-xl bg-[#087F75] hover:bg-[#06685F] text-white text-xs font-bold shrink-0 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {isMembershipBusy ? '...' : isRtl ? 'انضمام للمجموعة' : 'Join Group'}
                  </button>
                ) : null}
              </div>

              {statusError && (
                <p className="text-xs font-medium text-rose-600 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">
                  {statusError}
                </p>
              )}

              {/* Segmented Control */}
              {isMember && (
                <div className="grid grid-cols-2 p-1 rounded-xl bg-slate-100">
                  <button
                    type="button"
                    onClick={() => setActiveTab('feed')}
                    className={`min-h-[40px] rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      activeTab === 'feed'
                        ? 'bg-white text-[#112330] shadow-2xs'
                        : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    {isRtl ? 'المنشورات' : 'Feed'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('members')}
                    className={`min-h-[40px] rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      activeTab === 'members'
                        ? 'bg-white text-[#112330] shadow-2xs'
                        : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    {isRtl ? `الأعضاء (${members.length})` : `Members (${members.length})`}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab Body */}
        <div className="p-4 max-w-2xl mx-auto space-y-3">
          {!isMember ? (
            <div className="bg-white border border-slate-200 rounded-2xl p-6 text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-600 flex items-center justify-center mx-auto">
                <Lock className="w-6 h-6" />
              </div>
              <h4 className="text-base font-bold text-[#112330]">
                {isRtl ? 'المحتوى للأعضاء فقط' : 'Members-Only Feed'}
              </h4>
              <p className="text-sm text-slate-600">
                {group?.isPublic
                  ? isRtl
                    ? 'انضم إلى هذه المجموعة لعرض المنشورات والمشاركة في النقاشات.'
                    : 'Join this group to view posts, vote in polls, and participate.'
                  : isRtl
                  ? 'هذه المجموعة خاصة. يجب أن يقوم أحد المشرفين بإضافتك.'
                  : 'This is a private group. An admin or moderator must add you.'}
              </p>
              {group?.isPublic && (
                <button
                  type="button"
                  disabled={isMembershipBusy}
                  onClick={handleJoin}
                  className="min-h-[44px] px-5 py-2.5 rounded-xl bg-[#087F75] hover:bg-[#06685F] text-white text-sm font-bold cursor-pointer"
                >
                  {isRtl ? 'انضمام الآن' : 'Join Group'}
                </button>
              )}
            </div>
          ) : activeTab === 'feed' ? (
            <>
              {isLoadingInitial ? (
                <div className="py-12 flex flex-col items-center justify-center gap-2 text-slate-400">
                  <Loader2 className="w-6 h-6 animate-spin text-[#087F75]" />
                  <span className="text-xs">{isRtl ? 'جاري تحميل المنشورات...' : 'Loading group feed...'}</span>
                </div>
              ) : posts.length === 0 ? (
                <div className="bg-white border border-slate-200 rounded-2xl p-6 text-center space-y-3">
                  <p className="text-sm text-slate-600">
                    {isRtl ? 'لا توجد منشورات في هذه المجموعة بعد.' : 'No posts in this group yet.'}
                  </p>
                  {group && onCreatePostInGroup && (
                    <button
                      type="button"
                      onClick={() => onCreatePostInGroup(group)}
                      className="min-h-[44px] px-4 py-2 rounded-xl bg-[#087F75] text-white text-xs font-bold cursor-pointer"
                    >
                      {isRtl ? 'اكتب أول منشور' : 'Write the First Post'}
                    </button>
                  )}
                </div>
              ) : (
                <>
                  {posts.map((post) => (
                    <CommunityPostCard
                      key={post.id}
                      post={post}
                      currentUserId={currentUser.id}
                      language={language}
                      isGroupAdmin={isAdmin}
                      onOpenComments={(p) => onOpenComments(p, isStaff)}
                      onOpenCreatorProfile={onOpenCreatorProfile}
                      onDeletePost={handleDeletePost}
                      onSharePost={onSharePost}
                      onPostUpdated={(updated) =>
                        setPosts((prev) => prev.map((item) => (item.id === updated.id ? updated : item)))
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
                          onClick={() => void loadPosts(false, cursor)}
                          className="min-h-[40px] px-4 py-2 rounded-xl bg-white border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
                        >
                          {isRtl ? 'تحميل المزيد' : 'Load more'}
                        </button>
                      )}
                    </div>
                  )}
                </>
              )}
            </>
          ) : (
            /* Members Tab */
            <div className="space-y-3">
              {isStaff && (
                <button
                  type="button"
                  onClick={openAddMemberPicker}
                  className="w-full min-h-[44px] px-4 py-2.5 rounded-2xl bg-white border border-slate-200 hover:border-[#087F75] text-[#087F75] text-xs font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer"
                >
                  <UserPlus className="w-4 h-4" />
                  <span>{isRtl ? 'إضافة عضو إلى المجموعة' : 'Add Member to Group'}</span>
                </button>
              )}

              <div className="bg-white border border-slate-200 rounded-2xl divide-y divide-slate-100 overflow-hidden">
                {members.map((member) => {
                  const isSelf = member.userId === currentUser.id;
                  const canRemove =
                    !isSelf && (isAdmin || (isModerator && member.role === 'member'));
                  const creator = memberCreatorMap[member.userId];
                  const memberName = creator?.displayName || (isRtl ? 'مبدع' : 'Creator');
                  const memberAvatar = creator?.avatarUrl || null;
                  return (
                    <div
                      key={member.userId}
                      className="px-4 py-3 flex items-center justify-between gap-3"
                    >
                      <button
                        type="button"
                        onClick={() => onOpenCreatorProfile?.(member.userId)}
                        className="flex items-center gap-3 min-w-0 text-start cursor-pointer group"
                      >
                        <div className="w-10 h-10 rounded-full bg-teal-700 text-white text-sm font-bold flex items-center justify-center shrink-0 overflow-hidden">
                          {memberAvatar ? (
                            <img
                              src={memberAvatar}
                              alt={memberName}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            memberName.charAt(0).toUpperCase()
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-bold text-[#112330] truncate group-hover:underline">
                            {memberName}
                            {isSelf ? (isRtl ? ' (أنت)' : ' (You)') : ''}
                          </div>
                          <div className="flex items-center gap-1 text-xs font-medium text-slate-500">
                            {member.role === 'admin' && (
                              <ShieldCheck className="w-3.5 h-3.5 text-[#087F75]" />
                            )}
                            {member.role === 'moderator' && (
                              <Shield className="w-3.5 h-3.5 text-amber-600" />
                            )}
                            <span>{roleLabel(member.role)}</span>
                          </div>
                        </div>
                      </button>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {isAdmin && !isSelf && (
                          <select
                            aria-label={isRtl ? 'دور العضو' : 'Member role'}
                            value={member.role}
                            onChange={(e) =>
                              void handleRoleChange(member, e.target.value as CommunityMemberRole)
                            }
                            className="min-h-[36px] px-2.5 py-1 rounded-xl border border-slate-200 bg-slate-50 text-xs font-semibold text-slate-700 focus:outline-none cursor-pointer"
                          >
                            <option value="member">{isRtl ? 'عضو' : 'Member'}</option>
                            <option value="moderator">{isRtl ? 'مشرف' : 'Moderator'}</option>
                            <option value="admin">{isRtl ? 'مدير' : 'Admin'}</option>
                          </select>
                        )}
                        {canRemove && (
                          <button
                            type="button"
                            onClick={() => void handleRemoveMember(member)}
                            aria-label={isRtl ? 'إزالة العضو' : 'Remove member'}
                            className="min-w-[36px] min-h-[36px] rounded-xl flex items-center justify-center text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                          >
                            <UserMinus className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Add Member Picker Modal */}
      {isAddMemberOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setIsAddMemberOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full sm:max-w-md max-h-[80vh] bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden"
          >
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
              <h4 className="text-base font-bold text-[#112330]">
                {isRtl ? 'إضافة أعضاء' : 'Add Members'}
              </h4>
              <button
                type="button"
                onClick={() => setIsAddMemberOpen(false)}
                className="min-w-[44px] min-h-[44px] rounded-full flex items-center justify-center text-slate-400 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-3 border-b border-slate-100">
              <div className="relative flex items-center">
                <Search className={`w-4 h-4 text-slate-400 absolute ${isRtl ? 'right-3' : 'left-3'}`} />
                <input
                  type="text"
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  placeholder={isRtl ? 'ابحث عن مستخدم...' : 'Search users...'}
                  className={`w-full min-h-[40px] ${
                    isRtl ? 'pr-9 pl-3' : 'pl-9 pr-3'
                  } py-2 rounded-xl bg-slate-100 text-sm text-slate-900 focus:outline-none`}
                />
              </div>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto divide-y divide-slate-100">
              {isLoadingUsers ? (
                <div className="py-10 flex justify-center">
                  <Loader2 className="w-5 h-5 animate-spin text-[#087F75]" />
                </div>
              ) : filteredUsersToAdd.length === 0 ? (
                <p className="py-10 text-center text-sm text-slate-500">
                  {isRtl ? 'لا يوجد مستخدمون متاحون للإضافة.' : 'No eligible users found.'}
                </p>
              ) : (
                filteredUsersToAdd.map((creator) => (
                  <div
                    key={creator.uid}
                    className="px-4 py-3 flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-full bg-teal-700 text-white text-xs font-bold flex items-center justify-center shrink-0 overflow-hidden">
                        {creator.avatarUrl ? (
                          <img src={creator.avatarUrl} alt={creator.displayName} className="w-full h-full object-cover" />
                        ) : (
                          creator.displayName.charAt(0).toUpperCase()
                        )}
                      </div>
                      <div className="min-w-0">
                        <span className="block text-sm font-semibold text-slate-800 truncate">
                          {creator.displayName}
                        </span>
                        {creator.username && (
                          <span className="block text-xs text-slate-500 truncate" dir="ltr">
                            @{creator.username}
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={addingUserId === creator.uid}
                      onClick={() => void handleAddMember(creator)}
                      className="min-h-[36px] px-3 py-1.5 rounded-xl bg-[#087F75] text-white text-xs font-bold hover:bg-[#06685F] cursor-pointer disabled:opacity-50"
                    >
                      {addingUserId === creator.uid ? '...' : isRtl ? 'إضافة' : 'Add'}
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
