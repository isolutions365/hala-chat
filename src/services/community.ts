import {
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  startAfter,
  updateDoc,
  where,
  writeBatch,
  type DocumentSnapshot,
  type QueryDocumentSnapshot,
  type Timestamp,
  type Unsubscribe,
} from 'firebase/firestore';
import {
  deleteObject,
  getDownloadURL,
  ref,
  uploadBytesResumable,
} from 'firebase/storage';
import { getFirebaseAuth, getFirebaseDb, getFirebaseStorage } from '../lib/firebase';

export type CommunityMemberRole = 'admin' | 'moderator' | 'member';

export const MAX_COMMUNITY_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_COMMUNITY_POST_TEXT = 4000;
export const MAX_COMMUNITY_COMMENT_TEXT = 1000;
export const COMMUNITY_FEED_PAGE_SIZE = 10;

export interface CommunityGeoLocation {
  latitude: number;
  longitude: number;
  locationName: string;
}

export interface CommunityGroup {
  id: string;
  kind: 'community';
  name: string;
  description: string;
  coverUrl: string;
  isPublic: boolean;
  createdBy: string;
  memberCount: number;
  location: CommunityGeoLocation | null;
  createdAt: Timestamp | null;
}

export interface CommunityGroupMember {
  groupId: string;
  userId: string;
  role: CommunityMemberRole;
  userName: string;
  userAvatar: string | null;
  joinedAt: Timestamp | null;
}

export interface MyCommunityGroupItem {
  group: CommunityGroup;
  role: CommunityMemberRole;
}

export interface CommunityPollOption {
  id: string;
  text: string;
  votes: number;
}

export interface CommunityPostPoll {
  question: string;
  options: CommunityPollOption[];
  totalVotes: number;
}

export interface CommunityPost {
  id: string;
  authorId: string;
  authorName: string;
  authorAvatar: string | null;
  groupId: string;
  groupName: string;
  text: string;
  imageUrl: string;
  poll: CommunityPostPoll | null;
  location: CommunityGeoLocation | null;
  likesCount: number;
  commentsCount: number;
  createdAt: Timestamp | null;
}

export interface CommunityPostComment {
  id: string;
  authorId: string;
  authorName: string;
  authorAvatar: string | null;
  text: string;
  createdAt: Timestamp | null;
}

export interface CommunityAuthorProfile {
  id: string;
  name: string;
  avatarUrl: string | null;
}

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

function handleCommunityFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const auth = getFirebaseAuth();
  const currentUser = auth.currentUser;
  const errInfo = {
    error: error instanceof Error ? error.message : String(error),
    operationType,
    path,
    authInfo: {
      userId: currentUser?.uid,
      email: currentUser?.email,
      emailVerified: currentUser?.emailVerified,
      isAnonymous: currentUser?.isAnonymous,
      tenantId: currentUser?.tenantId,
      providerInfo:
        currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
  };
  const message = errInfo.error.toLowerCase();
  if (message.includes('permission') || message.includes('insufficient')) {
    console.error('Firestore Error: ', JSON.stringify(errInfo));
    throw new Error(JSON.stringify(errInfo));
  }
  throw error instanceof Error ? error : new Error(errInfo.error);
}

function createDocId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now()}_${rand}`;
}

function toMillis(ts: Timestamp | null | undefined): number {
  if (!ts) return 0;
  try {
    if (typeof ts.toMillis === 'function') return ts.toMillis();
  } catch {
    // ignore
  }
  return 0;
}

function inferImageContentType(file: File): string {
  if (file.type && file.type.startsWith('image/')) {
    return file.type;
  }
  const lower = file.name.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.gif')) return 'image/gif';
  return 'image/jpeg';
}

export async function uploadCommunityImage(
  file: File,
  onProgress?: (percent: number) => void
): Promise<string> {
  const auth = getFirebaseAuth();
  const uid = auth.currentUser?.uid;
  if (!uid) {
    throw new Error('Authentication required to upload images.');
  }
  if (file.size <= 0 || file.size > MAX_COMMUNITY_IMAGE_BYTES) {
    throw new Error('Image must be smaller than 10 MB.');
  }
  const contentType = inferImageContentType(file);
  if (!/^image\/(jpeg|png|webp|gif)$/i.test(contentType)) {
    throw new Error('Supported image formats: JPEG, PNG, WebP, or GIF.');
  }

  const storage = getFirebaseStorage();
  const assetId = `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const storageRef = ref(storage, `community/${uid}/${assetId}`);
  const task = uploadBytesResumable(storageRef, file, { contentType });

  return new Promise<string>((resolve, reject) => {
    task.on(
      'state_changed',
      (snapshot) => {
        if (snapshot.totalBytes > 0 && onProgress) {
          onProgress(Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100));
        }
      },
      (err) => reject(err),
      async () => {
        try {
          const url = await getDownloadURL(task.snapshot.ref);
          resolve(url);
        } catch (err) {
          reject(err);
        }
      }
    );
  });
}

export async function deleteCommunityImageByUrl(url: string): Promise<void> {
  if (!url) return;
  try {
    const storage = getFirebaseStorage();
    await deleteObject(ref(storage, url));
  } catch {
    // Non-fatal cleanup
  }
}

function sanitizeGeoLocation(raw: unknown): CommunityGeoLocation | null {
  if (!raw || typeof raw !== 'object') return null;
  const candidate = raw as {
    latitude?: unknown;
    longitude?: unknown;
    locationName?: unknown;
  };
  if (
    typeof candidate.latitude !== 'number' ||
    typeof candidate.longitude !== 'number' ||
    !Number.isFinite(candidate.latitude) ||
    !Number.isFinite(candidate.longitude) ||
    candidate.latitude < -90 ||
    candidate.latitude > 90 ||
    candidate.longitude < -180 ||
    candidate.longitude > 180
  ) {
    return null;
  }
  const locationName = String(candidate.locationName || '').trim().slice(0, 200);
  if (!locationName) return null;
  return {
    latitude: candidate.latitude,
    longitude: candidate.longitude,
    locationName,
  };
}

function mapGroupDoc(snap: DocumentSnapshot | QueryDocumentSnapshot): CommunityGroup {
  const d = snap.data() || {};
  return {
    id: String(d.id || snap.id),
    kind: 'community',
    name: String(d.name || ''),
    description: String(d.description || ''),
    coverUrl: String(d.coverUrl || ''),
    isPublic: Boolean(d.isPublic),
    createdBy: String(d.createdBy || ''),
    memberCount: typeof d.memberCount === 'number' ? d.memberCount : 0,
    location: sanitizeGeoLocation(d.location),
    createdAt: (d.createdAt as Timestamp | null) || null,
  };
}

function mapMemberDoc(snap: DocumentSnapshot | QueryDocumentSnapshot): CommunityGroupMember {
  const d = snap.data() || {};
  const role: CommunityMemberRole =
    d.role === 'admin' || d.role === 'moderator' ? d.role : 'member';
  return {
    groupId: String(d.groupId || ''),
    userId: String(d.userId || snap.id),
    role,
    userName: String(d.userName || 'Member'),
    userAvatar: typeof d.userAvatar === 'string' && d.userAvatar ? d.userAvatar : null,
    joinedAt: (d.joinedAt as Timestamp | null) || null,
  };
}

function mapPostDoc(snap: DocumentSnapshot | QueryDocumentSnapshot): CommunityPost {
  const d = snap.data() || {};
  let poll: CommunityPostPoll | null = null;
  if (d.poll && typeof d.poll === 'object' && Array.isArray(d.poll.options)) {
    poll = {
      question: String(d.poll.question || ''),
      options: d.poll.options.map((o: any, idx: number) => ({
        id: String(o?.id || `opt_${idx}`),
        text: String(o?.text || ''),
        votes: typeof o?.votes === 'number' ? o.votes : 0,
      })),
      totalVotes: typeof d.poll.totalVotes === 'number' ? d.poll.totalVotes : 0,
    };
  }
  return {
    id: snap.id,
    authorId: String(d.authorId || ''),
    authorName: String(d.authorName || 'Member'),
    authorAvatar: typeof d.authorAvatar === 'string' && d.authorAvatar ? d.authorAvatar : null,
    groupId: String(d.groupId || ''),
    groupName: String(d.groupName || ''),
    text: String(d.text || ''),
    imageUrl: String(d.imageUrl || ''),
    poll,
    location: sanitizeGeoLocation(d.location),
    likesCount: typeof d.likesCount === 'number' ? d.likesCount : 0,
    commentsCount: typeof d.commentsCount === 'number' ? d.commentsCount : 0,
    createdAt: (d.createdAt as Timestamp | null) || null,
  };
}

export async function createCommunityGroup(params: {
  name: string;
  description: string;
  coverFile?: File | null;
  isPublic: boolean;
  location?: CommunityGeoLocation | null;
  userProfile: CommunityAuthorProfile;
  onProgress?: (percent: number) => void;
}): Promise<CommunityGroup> {
  const db = getFirebaseDb();
  const auth = getFirebaseAuth();
  const uid = auth.currentUser?.uid || params.userProfile.id;
  if (!uid) throw new Error('Please sign in first.');

  const trimmedName = params.name.trim().slice(0, 100);
  if (!trimmedName) {
    throw new Error('Group name is required.');
  }
  const trimmedDesc = params.description.trim().slice(0, 1000);
  const cleanLocation = sanitizeGeoLocation(params.location);

  let coverUrl = '';
  if (params.coverFile) {
    coverUrl = await uploadCommunityImage(params.coverFile, params.onProgress);
  }

  const groupId = createDocId('grp');
  const groupRef = doc(db, 'groups', groupId);
  const memberRef = doc(db, 'groups', groupId, 'members', uid);

  const batch = writeBatch(db);
  batch.set(groupRef, {
    id: groupId,
    kind: 'community',
    name: trimmedName,
    description: trimmedDesc,
    coverUrl,
    isPublic: Boolean(params.isPublic),
    createdBy: uid,
    memberCount: 1,
    location: cleanLocation,
    createdAt: serverTimestamp(),
  });
  batch.set(memberRef, {
    groupId,
    userId: uid,
    role: 'admin',
    userName: (params.userProfile.name || 'Member').trim().slice(0, 100),
    userAvatar: params.userProfile.avatarUrl || null,
    joinedAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (err) {
    handleCommunityFirestoreError(err, OperationType.CREATE, `groups/${groupId}`);
  }

  return {
    id: groupId,
    kind: 'community',
    name: trimmedName,
    description: trimmedDesc,
    coverUrl,
    isPublic: Boolean(params.isPublic),
    createdBy: uid,
    memberCount: 1,
    location: cleanLocation,
    createdAt: null,
  };
}

export async function fetchMyCommunityGroups(uid: string): Promise<MyCommunityGroupItem[]> {
  const db = getFirebaseDb();
  const effectiveUid = getFirebaseAuth().currentUser?.uid || uid;
  if (!effectiveUid) return [];

  try {
    const membersQuery = query(
      collectionGroup(db, 'members'),
      where('userId', '==', effectiveUid),
      limit(50)
    );
    const snap = await getDocs(membersQuery);
    const items = await Promise.all(
      snap.docs.map(async (memberSnap) => {
        const memberData = mapMemberDoc(memberSnap);
        if (!memberData.groupId) return null;
        try {
          const groupSnap = await getDoc(doc(db, 'groups', memberData.groupId));
          if (!groupSnap.exists()) return null;
          const raw = groupSnap.data();
          if (raw?.kind !== 'community') return null;
          return {
            group: mapGroupDoc(groupSnap),
            role: memberData.role,
          } as MyCommunityGroupItem;
        } catch {
          return null;
        }
      })
    );
    const valid = items.filter((item): item is MyCommunityGroupItem => item !== null);
    valid.sort((a, b) => toMillis(b.group.createdAt) - toMillis(a.group.createdAt));
    return valid;
  } catch (err) {
    handleCommunityFirestoreError(err, OperationType.LIST, 'members');
  }
}

export async function fetchPublicCommunityGroups(maxCount = 50): Promise<CommunityGroup[]> {
  const db = getFirebaseDb();
  try {
    const q = query(
      collection(db, 'groups'),
      where('isPublic', '==', true),
      limit(Math.min(maxCount, 50))
    );
    const snap = await getDocs(q);
    const groups = snap.docs
      .filter((d) => d.data()?.kind === 'community')
      .map(mapGroupDoc);
    groups.sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
    return groups;
  } catch (err) {
    handleCommunityFirestoreError(err, OperationType.LIST, 'groups');
  }
}

export async function fetchCommunityGroupById(groupId: string): Promise<CommunityGroup | null> {
  const db = getFirebaseDb();
  try {
    const snap = await getDoc(doc(db, 'groups', groupId));
    if (!snap.exists()) return null;
    if (snap.data()?.kind !== 'community') return null;
    return mapGroupDoc(snap);
  } catch (err) {
    handleCommunityFirestoreError(err, OperationType.GET, `groups/${groupId}`);
  }
}

export async function fetchMyGroupMembership(
  groupId: string,
  uid: string
): Promise<CommunityGroupMember | null> {
  const db = getFirebaseDb();
  const effectiveUid = getFirebaseAuth().currentUser?.uid || uid;
  if (!effectiveUid) return null;
  try {
    const snap = await getDoc(doc(db, 'groups', groupId, 'members', effectiveUid));
    if (!snap.exists()) return null;
    return mapMemberDoc(snap);
  } catch (err) {
    handleCommunityFirestoreError(err, OperationType.GET, `groups/${groupId}/members/${effectiveUid}`);
  }
}

export async function joinCommunityGroup(
  groupId: string,
  userProfile: CommunityAuthorProfile
): Promise<void> {
  const db = getFirebaseDb();
  const uid = getFirebaseAuth().currentUser?.uid || userProfile.id;
  if (!uid) throw new Error('Please sign in first.');

  const groupRef = doc(db, 'groups', groupId);
  const memberRef = doc(db, 'groups', groupId, 'members', uid);

  try {
    await runTransaction(db, async (tx) => {
      const groupSnap = await tx.get(groupRef);
      if (!groupSnap.exists()) {
        throw new Error('Group not found.');
      }
      const memberSnap = await tx.get(memberRef);
      if (memberSnap.exists()) {
        return;
      }
      const currentCount =
        typeof groupSnap.data()?.memberCount === 'number' ? groupSnap.data().memberCount : 0;

      tx.set(memberRef, {
        groupId,
        userId: uid,
        role: 'member',
        userName: (userProfile.name || 'Member').trim().slice(0, 100),
        userAvatar: userProfile.avatarUrl || null,
        joinedAt: serverTimestamp(),
      });
      tx.update(groupRef, { memberCount: currentCount + 1 });
    });
  } catch (err) {
    handleCommunityFirestoreError(err, OperationType.WRITE, `groups/${groupId}/members/${uid}`);
  }
}

export async function leaveCommunityGroup(groupId: string, uid: string): Promise<void> {
  const db = getFirebaseDb();
  const effectiveUid = getFirebaseAuth().currentUser?.uid || uid;
  if (!effectiveUid) throw new Error('Please sign in first.');

  const groupRef = doc(db, 'groups', groupId);
  const memberRef = doc(db, 'groups', groupId, 'members', effectiveUid);

  try {
    const membersSnap = await getDocs(query(collection(db, 'groups', groupId, 'members'), limit(100)));
    const currentAdmins = membersSnap.docs.filter((d) => d.data()?.role === 'admin');
    const isLastAdmin =
      currentAdmins.length === 1 && currentAdmins[0].id === effectiveUid && membersSnap.docs.length > 1;
    if (isLastAdmin) {
      throw new Error('Promote another member to admin before leaving this group.');
    }

    await runTransaction(db, async (tx) => {
      const groupSnap = await tx.get(groupRef);
      const memberSnap = await tx.get(memberRef);
      if (!memberSnap.exists()) return;
      if (groupSnap.exists()) {
        const currentCount =
          typeof groupSnap.data()?.memberCount === 'number' ? groupSnap.data().memberCount : 1;
        tx.update(groupRef, { memberCount: Math.max(0, currentCount - 1) });
      }
      tx.delete(memberRef);
    });
  } catch (err) {
    handleCommunityFirestoreError(err, OperationType.DELETE, `groups/${groupId}/members/${effectiveUid}`);
  }
}

export async function addMemberToGroup(
  groupId: string,
  targetUser: { id: string; name: string; avatarUrl?: string | null },
  role: CommunityMemberRole = 'member'
): Promise<void> {
  const db = getFirebaseDb();
  const groupRef = doc(db, 'groups', groupId);
  const memberRef = doc(db, 'groups', groupId, 'members', targetUser.id);

  try {
    await runTransaction(db, async (tx) => {
      const groupSnap = await tx.get(groupRef);
      if (!groupSnap.exists()) throw new Error('Group not found.');
      const existingSnap = await tx.get(memberRef);
      if (existingSnap.exists()) return;
      const currentCount =
        typeof groupSnap.data()?.memberCount === 'number' ? groupSnap.data().memberCount : 0;

      tx.set(memberRef, {
        groupId,
        userId: targetUser.id,
        role,
        userName: (targetUser.name || 'Member').trim().slice(0, 100),
        userAvatar: targetUser.avatarUrl || null,
        joinedAt: serverTimestamp(),
      });
      tx.update(groupRef, { memberCount: currentCount + 1 });
    });
  } catch (err) {
    handleCommunityFirestoreError(err, OperationType.CREATE, `groups/${groupId}/members/${targetUser.id}`);
  }
}

export async function updateGroupMemberRole(
  groupId: string,
  targetUid: string,
  role: CommunityMemberRole
): Promise<void> {
  const db = getFirebaseDb();
  try {
    await updateDoc(doc(db, 'groups', groupId, 'members', targetUid), { role });
  } catch (err) {
    handleCommunityFirestoreError(err, OperationType.UPDATE, `groups/${groupId}/members/${targetUid}`);
  }
}

export async function removeGroupMember(groupId: string, targetUid: string): Promise<void> {
  const db = getFirebaseDb();
  const groupRef = doc(db, 'groups', groupId);
  const memberRef = doc(db, 'groups', groupId, 'members', targetUid);

  try {
    await runTransaction(db, async (tx) => {
      const groupSnap = await tx.get(groupRef);
      const memberSnap = await tx.get(memberRef);
      if (!memberSnap.exists()) return;
      if (groupSnap.exists()) {
        const currentCount =
          typeof groupSnap.data()?.memberCount === 'number' ? groupSnap.data().memberCount : 1;
        tx.update(groupRef, { memberCount: Math.max(0, currentCount - 1) });
      }
      tx.delete(memberRef);
    });
  } catch (err) {
    handleCommunityFirestoreError(err, OperationType.DELETE, `groups/${groupId}/members/${targetUid}`);
  }
}

export async function deleteCommunityGroup(groupId: string): Promise<void> {
  const db = getFirebaseDb();
  try {
    const membersSnap = await getDocs(query(collection(db, 'groups', groupId, 'members'), limit(100)));
    const batch = writeBatch(db);
    membersSnap.docs.forEach((memberDoc) => {
      batch.delete(memberDoc.ref);
    });
    batch.delete(doc(db, 'groups', groupId));
    await batch.commit();
  } catch (err) {
    handleCommunityFirestoreError(err, OperationType.DELETE, `groups/${groupId}`);
  }
}

export function watchGroupMembers(
  groupId: string,
  onData: (members: CommunityGroupMember[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const db = getFirebaseDb();
  const q = query(collection(db, 'groups', groupId, 'members'), limit(100));
  return onSnapshot(
    q,
    (snap) => {
      const rank: Record<CommunityMemberRole, number> = { admin: 0, moderator: 1, member: 2 };
      const list = snap.docs.map(mapMemberDoc);
      list.sort((a, b) => rank[a.role] - rank[b.role] || a.userName.localeCompare(b.userName));
      onData(list);
    },
    (err) => {
      if (onError) onError(err);
    }
  );
}

export interface PostsPageResult {
  posts: CommunityPost[];
  lastDoc: QueryDocumentSnapshot | null;
  hasMore: boolean;
}

export async function fetchCommunityPostsPage(params: {
  groupId?: string;
  cursor?: QueryDocumentSnapshot | null;
  pageSize?: number;
}): Promise<PostsPageResult> {
  const db = getFirebaseDb();
  const targetGroupId = params.groupId ?? '';
  const pageSize = Math.min(params.pageSize ?? COMMUNITY_FEED_PAGE_SIZE, 20);
  const colRef = collection(db, 'communityPosts');

  try {
    const q = params.cursor
      ? query(
          colRef,
          where('groupId', '==', targetGroupId),
          orderBy('createdAt', 'desc'),
          startAfter(params.cursor),
          limit(pageSize)
        )
      : query(
          colRef,
          where('groupId', '==', targetGroupId),
          orderBy('createdAt', 'desc'),
          limit(pageSize)
        );
    const snap = await getDocs(q);
    const posts = snap.docs.map(mapPostDoc);
    const lastDoc = snap.docs.length > 0 ? snap.docs[snap.docs.length - 1] : null;
    return {
      posts,
      lastDoc,
      hasMore: snap.docs.length === pageSize,
    };
  } catch (err: any) {
    const code = String(err?.code || '');
    const msg = String(err?.message || '').toLowerCase();
    // Fallback if composite index on (groupId, createdAt) is not yet provisioned
    if (code === 'failed-precondition' || msg.includes('index')) {
      if (params.cursor) {
        return { posts: [], lastDoc: null, hasMore: false };
      }
      try {
        const fallbackQ = query(
          colRef,
          where('groupId', '==', targetGroupId),
          limit(targetGroupId === '' ? 30 : 10)
        );
        const snap = await getDocs(fallbackQ);
        const posts = snap.docs.map(mapPostDoc);
        posts.sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
        return { posts, lastDoc: null, hasMore: false };
      } catch (fallbackErr) {
        handleCommunityFirestoreError(fallbackErr, OperationType.LIST, 'communityPosts');
      }
    }
    handleCommunityFirestoreError(err, OperationType.LIST, 'communityPosts');
  }
}

export async function createCommunityPost(params: {
  groupId?: string;
  groupName?: string;
  text: string;
  imageFile?: File | null;
  pollInput?: { question: string; options: string[] } | null;
  location?: CommunityGeoLocation | null;
  authorProfile: CommunityAuthorProfile;
  onProgress?: (percent: number) => void;
}): Promise<CommunityPost> {
  const db = getFirebaseDb();
  const uid = getFirebaseAuth().currentUser?.uid || params.authorProfile.id;
  if (!uid) throw new Error('Please sign in first.');

  const trimmedText = params.text.trim().slice(0, MAX_COMMUNITY_POST_TEXT);
  const cleanLocation = sanitizeGeoLocation(params.location);
  let imageUrl = '';
  if (params.imageFile) {
    imageUrl = await uploadCommunityImage(params.imageFile, params.onProgress);
  }

  let poll: CommunityPostPoll | null = null;
  if (params.pollInput) {
    const question = params.pollInput.question.trim().slice(0, 200);
    const cleanedOptions = params.pollInput.options
      .map((o) => o.trim().slice(0, 120))
      .filter((o) => o.length > 0)
      .slice(0, 4);
    if (!question || cleanedOptions.length < 2) {
      throw new Error('Polls require a question and at least 2 options.');
    }
    poll = {
      question,
      options: cleanedOptions.map((text, idx) => ({
        id: `opt_${idx + 1}`,
        text,
        votes: 0,
      })),
      totalVotes: 0,
    };
  }

  if (!trimmedText && !imageUrl && !poll && !cleanLocation) {
    throw new Error('Write something, add a photo, attach a poll, or tag a location.');
  }

  const postId = createDocId('post');
  const groupId = (params.groupId || '').trim().slice(0, 128);
  const groupName = groupId ? (params.groupName || '').trim().slice(0, 100) : '';
  const authorName = (params.authorProfile.name || 'Member').trim().slice(0, 100);
  const authorAvatar = params.authorProfile.avatarUrl || null;

  try {
    await setDoc(doc(db, 'communityPosts', postId), {
      authorId: uid,
      authorName,
      authorAvatar,
      groupId,
      groupName,
      text: trimmedText,
      imageUrl,
      poll,
      location: cleanLocation,
      likesCount: 0,
      commentsCount: 0,
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    handleCommunityFirestoreError(err, OperationType.CREATE, `communityPosts/${postId}`);
  }

  return {
    id: postId,
    authorId: uid,
    authorName,
    authorAvatar,
    groupId,
    groupName,
    text: trimmedText,
    imageUrl,
    poll,
    location: cleanLocation,
    likesCount: 0,
    commentsCount: 0,
    createdAt: null,
  };
}

export async function deleteCommunityPost(postId: string, imageUrl?: string): Promise<void> {
  const db = getFirebaseDb();
  try {
    await deleteDoc(doc(db, 'communityPosts', postId));
    if (imageUrl) {
      await deleteCommunityImageByUrl(imageUrl);
    }
  } catch (err) {
    handleCommunityFirestoreError(err, OperationType.DELETE, `communityPosts/${postId}`);
  }
}

export function watchPostLikeStatus(
  postId: string,
  uid: string,
  onChange: (liked: boolean) => void
): Unsubscribe {
  const db = getFirebaseDb();
  const effectiveUid = getFirebaseAuth().currentUser?.uid || uid;
  if (!effectiveUid) {
    onChange(false);
    return () => {};
  }
  return onSnapshot(
    doc(db, 'communityPosts', postId, 'likes', effectiveUid),
    (snap) => onChange(snap.exists()),
    () => onChange(false)
  );
}

export async function toggleCommunityPostLike(
  postId: string,
  uid: string
): Promise<{ liked: boolean; likesCount: number }> {
  const db = getFirebaseDb();
  const effectiveUid = getFirebaseAuth().currentUser?.uid || uid;
  if (!effectiveUid) throw new Error('Please sign in first.');

  const postRef = doc(db, 'communityPosts', postId);
  const likeRef = doc(db, 'communityPosts', postId, 'likes', effectiveUid);

  try {
    return await runTransaction(db, async (tx) => {
      const postSnap = await tx.get(postRef);
      if (!postSnap.exists()) throw new Error('Post not found.');
      const likeSnap = await tx.get(likeRef);
      const currentCount =
        typeof postSnap.data()?.likesCount === 'number' ? postSnap.data().likesCount : 0;

      if (likeSnap.exists()) {
        const nextCount = Math.max(0, currentCount - 1);
        tx.delete(likeRef);
        tx.update(postRef, { likesCount: nextCount });
        return { liked: false, likesCount: nextCount };
      } else {
        const nextCount = currentCount + 1;
        tx.set(likeRef, { userId: effectiveUid, createdAt: serverTimestamp() });
        tx.update(postRef, { likesCount: nextCount });
        return { liked: true, likesCount: nextCount };
      }
    });
  } catch (err) {
    handleCommunityFirestoreError(err, OperationType.WRITE, `communityPosts/${postId}/likes/${effectiveUid}`);
  }
}

export function watchPostPollVote(
  postId: string,
  uid: string,
  onChange: (optionId: string | null) => void
): Unsubscribe {
  const db = getFirebaseDb();
  const effectiveUid = getFirebaseAuth().currentUser?.uid || uid;
  if (!effectiveUid) {
    onChange(null);
    return () => {};
  }
  return onSnapshot(
    doc(db, 'communityPosts', postId, 'pollVotes', effectiveUid),
    (snap) => {
      if (!snap.exists()) {
        onChange(null);
      } else {
        onChange(String(snap.data()?.optionId || '') || null);
      }
    },
    () => onChange(null)
  );
}

export async function voteCommunityPoll(
  postId: string,
  optionId: string,
  uid: string
): Promise<CommunityPostPoll> {
  const db = getFirebaseDb();
  const effectiveUid = getFirebaseAuth().currentUser?.uid || uid;
  if (!effectiveUid) throw new Error('Please sign in first.');

  const postRef = doc(db, 'communityPosts', postId);
  const voteRef = doc(db, 'communityPosts', postId, 'pollVotes', effectiveUid);

  try {
    return await runTransaction(db, async (tx) => {
      const postSnap = await tx.get(postRef);
      if (!postSnap.exists()) throw new Error('Post not found.');
      const existingVote = await tx.get(voteRef);
      if (existingVote.exists()) {
        throw new Error('You have already voted on this poll.');
      }

      const rawPoll = postSnap.data()?.poll as CommunityPostPoll | null;
      if (!rawPoll || !Array.isArray(rawPoll.options)) {
        throw new Error('Poll not found on this post.');
      }

      let found = false;
      const nextOptions = rawPoll.options.map((opt) => {
        if (opt.id === optionId) {
          found = true;
          return { ...opt, votes: (opt.votes || 0) + 1 };
        }
        return opt;
      });
      if (!found) throw new Error('Invalid poll option.');

      const nextPoll: CommunityPostPoll = {
        question: rawPoll.question,
        options: nextOptions,
        totalVotes: (rawPoll.totalVotes || 0) + 1,
      };

      tx.set(voteRef, {
        userId: effectiveUid,
        optionId,
        createdAt: serverTimestamp(),
      });
      tx.update(postRef, { poll: nextPoll });
      return nextPoll;
    });
  } catch (err) {
    handleCommunityFirestoreError(err, OperationType.WRITE, `communityPosts/${postId}/pollVotes/${effectiveUid}`);
  }
}

export function watchCommunityComments(
  postId: string,
  onData: (comments: CommunityPostComment[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const db = getFirebaseDb();
  const q = query(
    collection(db, 'communityPosts', postId, 'comments'),
    orderBy('createdAt', 'asc'),
    limit(50)
  );
  return onSnapshot(
    q,
    (snap) => {
      const list: CommunityPostComment[] = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          authorId: String(data.authorId || ''),
          authorName: String(data.authorName || 'Member'),
          authorAvatar:
            typeof data.authorAvatar === 'string' && data.authorAvatar ? data.authorAvatar : null,
          text: String(data.text || ''),
          createdAt: (data.createdAt as Timestamp | null) || null,
        };
      });
      onData(list);
    },
    (err) => {
      if (onError) onError(err);
    }
  );
}

export async function addCommunityPostComment(
  postId: string,
  authorProfile: CommunityAuthorProfile,
  text: string
): Promise<void> {
  const db = getFirebaseDb();
  const uid = getFirebaseAuth().currentUser?.uid || authorProfile.id;
  if (!uid) throw new Error('Please sign in first.');
  const trimmed = text.trim().slice(0, MAX_COMMUNITY_COMMENT_TEXT);
  if (!trimmed) throw new Error('Comment cannot be empty.');

  const postRef = doc(db, 'communityPosts', postId);
  const commentId = createDocId('cmt');
  const commentRef = doc(db, 'communityPosts', postId, 'comments', commentId);

  try {
    await runTransaction(db, async (tx) => {
      const postSnap = await tx.get(postRef);
      if (!postSnap.exists()) throw new Error('Post not found.');
      const currentCount =
        typeof postSnap.data()?.commentsCount === 'number' ? postSnap.data().commentsCount : 0;

      tx.set(commentRef, {
        authorId: uid,
        authorName: (authorProfile.name || 'Member').trim().slice(0, 100),
        authorAvatar: authorProfile.avatarUrl || null,
        text: trimmed,
        createdAt: serverTimestamp(),
      });
      tx.update(postRef, { commentsCount: currentCount + 1 });
    });
  } catch (err) {
    handleCommunityFirestoreError(err, OperationType.CREATE, `communityPosts/${postId}/comments/${commentId}`);
  }
}

export async function deleteCommunityPostComment(
  postId: string,
  commentId: string
): Promise<void> {
  const db = getFirebaseDb();
  const postRef = doc(db, 'communityPosts', postId);
  const commentRef = doc(db, 'communityPosts', postId, 'comments', commentId);

  try {
    await runTransaction(db, async (tx) => {
      const postSnap = await tx.get(postRef);
      const commentSnap = await tx.get(commentRef);
      if (!commentSnap.exists()) return;
      if (postSnap.exists()) {
        const currentCount =
          typeof postSnap.data()?.commentsCount === 'number' ? postSnap.data().commentsCount : 1;
        tx.update(postRef, { commentsCount: Math.max(0, currentCount - 1) });
      }
      tx.delete(commentRef);
    });
  } catch (err) {
    handleCommunityFirestoreError(err, OperationType.DELETE, `communityPosts/${postId}/comments/${commentId}`);
  }
}
