import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
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

export const MAX_REEL_DURATION_SECONDS = 60;
export const MAX_REEL_FILE_SIZE_BYTES = 100 * 1024 * 1024; // 100 MB
export const MAX_REEL_CAPTION_LENGTH = 2000;
export const MAX_REEL_COMMENT_LENGTH = 1000;

export interface ReelModel {
  id: string;
  authorId: string;
  videoUrl: string;
  thumbnailUrl: string;
  caption: string;
  likesCount: number;
  commentsCount: number;
  createdAt: Timestamp | null;
}

export interface ReelCommentModel {
  id: string;
  authorId: string;
  authorName: string;
  text: string;
  createdAt: Timestamp | null;
}

export interface ReelAuthorProfile {
  id: string;
  name: string;
  avatarUrl: string | null;
}

export interface ReelStorageUploadParams {
  uid: string;
  reelId: string;
  file: Blob | File;
  kind: 'video' | 'thumbnail';
  contentType: string;
  onProgress?: (percent: number) => void;
}

export interface ReelStorageAdapter {
  uploadMedia(params: ReelStorageUploadParams): Promise<string>;
  deleteReelMedia(params: { uid: string; reelId: string; videoUrl?: string; thumbnailUrl?: string }): Promise<void>;
}

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

function handleReelFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
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

function inferVideoContentType(file: File): string {
  if (file.type && file.type.startsWith('video/')) {
    return file.type;
  }
  const lower = file.name.toLowerCase();
  if (lower.endsWith('.webm')) return 'video/webm';
  if (lower.endsWith('.mov')) return 'video/quicktime';
  if (lower.endsWith('.m4v')) return 'video/x-m4v';
  return 'video/mp4';
}

function buildStorageObjectPath(uid: string, reelId: string, kind: 'video' | 'thumbnail'): string {
  return kind === 'video' ? `reels/${uid}/${reelId}_video` : `reels/${uid}/${reelId}_thumb`;
}

/**
 * Default Firebase Storage backend implementation.
 * Isolated behind ReelStorageAdapter so storage can be swapped without touching UI components.
 */
const firebaseReelStorageAdapter: ReelStorageAdapter = {
  uploadMedia({ uid, reelId, file, kind, contentType, onProgress }) {
    const storage = getFirebaseStorage();
    const path = buildStorageObjectPath(uid, reelId, kind);
    const targetRef = ref(storage, path);
    const task = uploadBytesResumable(targetRef, file, { contentType });

    return new Promise((resolve, reject) => {
      task.on(
        'state_changed',
        (snapshot) => {
          if (snapshot.totalBytes > 0) {
            onProgress?.(Math.min(99, Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100)));
          }
        },
        reject,
        async () => {
          try {
            const url = await getDownloadURL(task.snapshot.ref);
            onProgress?.(100);
            resolve(url);
          } catch (err) {
            reject(err);
          }
        }
      );
    });
  },

  async deleteReelMedia({ uid, reelId }) {
    const storage = getFirebaseStorage();
    const videoRef = ref(storage, buildStorageObjectPath(uid, reelId, 'video'));
    const thumbRef = ref(storage, buildStorageObjectPath(uid, reelId, 'thumbnail'));
    await Promise.allSettled([deleteObject(videoRef), deleteObject(thumbRef)]);
  },
};

let activeStorageAdapter: ReelStorageAdapter = firebaseReelStorageAdapter;

export function setReelStorageAdapter(adapter: ReelStorageAdapter): void {
  activeStorageAdapter = adapter;
}

export function resetReelStorageAdapter(): void {
  activeStorageAdapter = firebaseReelStorageAdapter;
}

/**
 * Parses optional media fragment `#t=start,end` attached to a trimmed reel videoUrl.
 */
export function parseVideoTimeFragment(videoUrl: string): { cleanUrl: string; startSec: number; endSec: number | null } {
  const hashIdx = videoUrl.indexOf('#');
  if (hashIdx === -1) {
    return { cleanUrl: videoUrl, startSec: 0, endSec: null };
  }
  const hash = videoUrl.slice(hashIdx + 1);
  const match = /^t=(\d+(?:\.\d+)?)(?:,(\d+(?:\.\d+)?))?$/.exec(hash);
  if (!match) {
    return { cleanUrl: videoUrl, startSec: 0, endSec: null };
  }
  const startSec = Number.parseFloat(match[1]) || 0;
  const endSec = match[2] ? Number.parseFloat(match[2]) : null;
  return {
    cleanUrl: videoUrl,
    startSec: Math.max(0, startSec),
    endSec: endSec !== null && Number.isFinite(endSec) && endSec > startSec ? endSec : null,
  };
}

export interface PublishReelInput {
  file: File;
  thumbnailBlob?: Blob | null;
  caption: string;
  trimStart?: number;
  trimEnd?: number;
  totalDuration?: number;
  onProgress?: (percent: number) => void;
}

export async function publishReel({
  file,
  thumbnailBlob,
  caption,
  trimStart = 0,
  trimEnd,
  totalDuration,
  onProgress,
}: PublishReelInput): Promise<ReelModel> {
  const auth = getFirebaseAuth();
  const uid = auth.currentUser?.uid;
  if (!uid) {
    throw new Error('Sign in required to publish a reel.');
  }
  if (file.size <= 0 || file.size > MAX_REEL_FILE_SIZE_BYTES) {
    throw new Error('Video file must be under 100 MB.');
  }

  const trimmedCaption = caption.trim().slice(0, MAX_REEL_CAPTION_LENGTH);
  const safeStart = Math.max(0, trimStart);
  const effectiveEnd =
    typeof trimEnd === 'number' && trimEnd > safeStart
      ? Math.min(trimEnd, safeStart + MAX_REEL_DURATION_SECONDS)
      : safeStart + MAX_REEL_DURATION_SECONDS;

  if (effectiveEnd - safeStart > MAX_REEL_DURATION_SECONDS + 0.05) {
    throw new Error('Reel duration cannot exceed 60 seconds.');
  }

  const db = getFirebaseDb();
  const reelRef = doc(collection(db, 'reels'));
  const reelId = reelRef.id;

  let thumbnailUrl = '';
  if (thumbnailBlob && thumbnailBlob.size > 0) {
    thumbnailUrl = await activeStorageAdapter.uploadMedia({
      uid,
      reelId,
      file: thumbnailBlob,
      kind: 'thumbnail',
      contentType: thumbnailBlob.type || 'image/jpeg',
      onProgress: (p) => onProgress?.(Math.round(p * 0.1)),
    });
  }

  const rawVideoUrl = await activeStorageAdapter.uploadMedia({
    uid,
    reelId,
    file,
    kind: 'video',
    contentType: inferVideoContentType(file),
    onProgress: (p) => {
      const base = thumbnailBlob ? 10 : 0;
      const weight = thumbnailBlob ? 0.88 : 0.98;
      onProgress?.(Math.min(98, Math.round(base + p * weight)));
    },
  });

  const isTrimmed =
    safeStart > 0.1 ||
    (typeof totalDuration === 'number' && totalDuration > 0 && effectiveEnd < totalDuration - 0.2) ||
    (typeof totalDuration === 'number' && totalDuration > MAX_REEL_DURATION_SECONDS);

  const videoUrl = isTrimmed
    ? `${rawVideoUrl}#t=${safeStart.toFixed(1)},${effectiveEnd.toFixed(1)}`
    : rawVideoUrl;

  const payload = {
    authorId: uid,
    videoUrl,
    thumbnailUrl,
    caption: trimmedCaption,
    likesCount: 0,
    commentsCount: 0,
    createdAt: serverTimestamp(),
  };

  try {
    await setDoc(reelRef, payload);
  } catch (error) {
    await activeStorageAdapter.deleteReelMedia({ uid, reelId, videoUrl: rawVideoUrl, thumbnailUrl });
    handleReelFirestoreError(error, OperationType.CREATE, `reels/${reelId}`);
  }

  onProgress?.(100);

  return {
    id: reelId,
    authorId: uid,
    videoUrl,
    thumbnailUrl,
    caption: trimmedCaption,
    likesCount: 0,
    commentsCount: 0,
    createdAt: null,
  };
}

export function subscribeToReels(
  countLimit: number,
  onData: (reels: ReelModel[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const db = getFirebaseDb();
  const safeLimit = Math.min(Math.max(countLimit, 1), 50);
  const q = query(collection(db, 'reels'), orderBy('createdAt', 'desc'), limit(safeLimit));

  return onSnapshot(
    q,
    (snap) => {
      const items: ReelModel[] = snap.docs.map((d) => {
        const data = d.data() || {};
        return {
          id: d.id,
          authorId: String(data.authorId || ''),
          videoUrl: String(data.videoUrl || ''),
          thumbnailUrl: String(data.thumbnailUrl || ''),
          caption: String(data.caption || ''),
          likesCount: typeof data.likesCount === 'number' ? data.likesCount : 0,
          commentsCount: typeof data.commentsCount === 'number' ? data.commentsCount : 0,
          createdAt: (data.createdAt as Timestamp) || null,
        };
      });
      onData(items);
    },
    (error) => {
      try {
        handleReelFirestoreError(error, OperationType.LIST, 'reels');
      } catch (wrapped) {
        onError?.(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    }
  );
}

const authorProfileCache = new Map<string, ReelAuthorProfile>();

export async function fetchReelAuthorProfile(authorId: string): Promise<ReelAuthorProfile> {
  if (!authorId) {
    return { id: '', name: 'Hala User', avatarUrl: null };
  }
  const cached = authorProfileCache.get(authorId);
  if (cached) return cached;

  const db = getFirebaseDb();
  try {
    const snap = await getDoc(doc(db, 'users_public', authorId));
    if (snap.exists()) {
      const data = snap.data() || {};
      const profile: ReelAuthorProfile = {
        id: authorId,
        name: String(data.name || 'Hala User'),
        avatarUrl: (data.avatar_url as string) || null,
      };
      authorProfileCache.set(authorId, profile);
      return profile;
    }
  } catch {
    // Non-fatal fallback
  }

  return { id: authorId, name: 'Hala User', avatarUrl: null };
}

export function watchReelLikeStatus(
  reelId: string,
  userId: string,
  onChange: (liked: boolean) => void
): Unsubscribe {
  if (!reelId || !userId) {
    onChange(false);
    return () => {};
  }
  const db = getFirebaseDb();
  const likeRef = doc(db, 'reels', reelId, 'likes', userId);
  return onSnapshot(
    likeRef,
    (snap) => {
      onChange(snap.exists());
    },
    () => {
      onChange(false);
    }
  );
}

export async function toggleReelLike(reelId: string, userId?: string): Promise<boolean> {
  const uid = userId || getFirebaseAuth().currentUser?.uid;
  if (!uid) throw new Error('Sign in required');

  const db = getFirebaseDb();
  const reelRef = doc(db, 'reels', reelId);
  const likeRef = doc(db, 'reels', reelId, 'likes', uid);

  try {
    return await runTransaction(db, async (tx) => {
      const [reelSnap, likeSnap] = await Promise.all([tx.get(reelRef), tx.get(likeRef)]);
      if (!reelSnap.exists()) {
        throw new Error('Reel no longer exists.');
      }
      const currentLikes = typeof reelSnap.data().likesCount === 'number' ? reelSnap.data().likesCount : 0;

      if (likeSnap.exists()) {
        tx.delete(likeRef);
        tx.update(reelRef, { likesCount: Math.max(0, currentLikes - 1) });
        return false;
      }

      tx.set(likeRef, {
        userId: uid,
        createdAt: serverTimestamp(),
      });
      tx.update(reelRef, { likesCount: currentLikes + 1 });
      return true;
    });
  } catch (error) {
    handleReelFirestoreError(error, OperationType.WRITE, `reels/${reelId}/likes/${uid}`);
  }
}

export function watchReelComments(
  reelId: string,
  onData: (comments: ReelCommentModel[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const db = getFirebaseDb();
  const q = query(
    collection(db, 'reels', reelId, 'comments'),
    orderBy('createdAt', 'desc'),
    limit(50)
  );
  return onSnapshot(
    q,
    (snap) => {
      const items: ReelCommentModel[] = snap.docs.map((d) => {
        const data = d.data() || {};
        return {
          id: d.id,
          authorId: String(data.authorId || ''),
          authorName: String(data.authorName || 'Hala User'),
          text: String(data.text || ''),
          createdAt: (data.createdAt as Timestamp) || null,
        };
      });
      onData(items);
    },
    (error) => {
      try {
        handleReelFirestoreError(error, OperationType.LIST, `reels/${reelId}/comments`);
      } catch (wrapped) {
        onError?.(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    }
  );
}

export async function addReelComment(reelId: string, authorName: string, text: string): Promise<void> {
  const uid = getFirebaseAuth().currentUser?.uid;
  if (!uid) throw new Error('Sign in required');

  const body = text.trim();
  if (!body || body.length > MAX_REEL_COMMENT_LENGTH) {
    throw new Error('Comment must be between 1 and 1000 characters.');
  }

  const safeAuthorName = authorName.trim().slice(0, 100) || 'Hala User';
  const db = getFirebaseDb();
  const reelRef = doc(db, 'reels', reelId);
  const commentRef = doc(collection(db, 'reels', reelId, 'comments'));

  try {
    await runTransaction(db, async (tx) => {
      const reelSnap = await tx.get(reelRef);
      if (!reelSnap.exists()) {
        throw new Error('Reel no longer exists.');
      }
      const currentCount =
        typeof reelSnap.data().commentsCount === 'number' ? reelSnap.data().commentsCount : 0;

      tx.set(commentRef, {
        authorId: uid,
        authorName: safeAuthorName,
        text: body,
        createdAt: serverTimestamp(),
      });
      tx.update(reelRef, { commentsCount: currentCount + 1 });
    });
  } catch (error) {
    handleReelFirestoreError(error, OperationType.CREATE, `reels/${reelId}/comments/${commentRef.id}`);
  }
}

export async function deleteReelComment(reelId: string, commentId: string): Promise<void> {
  const uid = getFirebaseAuth().currentUser?.uid;
  if (!uid) throw new Error('Sign in required');

  const db = getFirebaseDb();
  const reelRef = doc(db, 'reels', reelId);
  const commentRef = doc(db, 'reels', reelId, 'comments', commentId);

  try {
    await runTransaction(db, async (tx) => {
      const [reelSnap, commentSnap] = await Promise.all([tx.get(reelRef), tx.get(commentRef)]);
      if (!commentSnap.exists()) return;

      const currentCount =
        reelSnap.exists() && typeof reelSnap.data().commentsCount === 'number'
          ? reelSnap.data().commentsCount
          : 0;

      tx.delete(commentRef);
      if (reelSnap.exists()) {
        tx.update(reelRef, { commentsCount: Math.max(0, currentCount - 1) });
      }
    });
  } catch (error) {
    handleReelFirestoreError(error, OperationType.DELETE, `reels/${reelId}/comments/${commentId}`);
  }
}

export async function deleteReel(reel: ReelModel): Promise<void> {
  const uid = getFirebaseAuth().currentUser?.uid;
  if (!uid || uid !== reel.authorId) {
    throw new Error('Only the reel owner can delete this reel.');
  }

  const db = getFirebaseDb();
  try {
    await deleteDoc(doc(db, 'reels', reel.id));
  } catch (error) {
    handleReelFirestoreError(error, OperationType.DELETE, `reels/${reel.id}`);
  }

  await activeStorageAdapter.deleteReelMedia({
    uid,
    reelId: reel.id,
    videoUrl: reel.videoUrl,
    thumbnailUrl: reel.thumbnailUrl,
  });
}

export function watchFollowAuthor(
  followerId: string,
  followingId: string,
  onChange: (isFollowing: boolean) => void
): Unsubscribe {
  if (!followerId || !followingId || followerId === followingId) {
    onChange(false);
    return () => {};
  }
  const db = getFirebaseDb();
  const followRef = doc(db, 'follows', `${followerId}_${followingId}`);
  return onSnapshot(
    followRef,
    (snap) => onChange(snap.exists()),
    () => onChange(false)
  );
}

export async function toggleFollowAuthor(followerId: string, followingId: string): Promise<boolean> {
  const uid = getFirebaseAuth().currentUser?.uid || followerId;
  if (!uid || !followingId || uid === followingId) {
    throw new Error('Invalid follow target.');
  }
  const db = getFirebaseDb();
  const followDocId = `${uid}_${followingId}`;
  const followRef = doc(db, 'follows', followDocId);

  try {
    const existingSnap = await getDoc(followRef);
    if (existingSnap.exists()) {
      await deleteDoc(followRef);
      return false;
    }
    await setDoc(followRef, {
      followerId: uid,
      followingId,
      createdAt: serverTimestamp(),
    });
    return true;
  } catch (error) {
    handleReelFirestoreError(error, OperationType.WRITE, `follows/${followDocId}`);
  }
}
