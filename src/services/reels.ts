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
  type FirebaseStorage,
  type UploadTask,
} from 'firebase/storage';
import { getFirebaseAuth, getFirebaseDb, getFirebaseStorage } from '../lib/firebase';

export const MAX_REEL_DURATION_SECONDS = 90;
export const MAX_REEL_FILE_SIZE_BYTES = 200 * 1024 * 1024; // 200 MB safety net
export const REEL_UPLOAD_STALL_TIMEOUT_MS = 90 * 1000; // 90 seconds without progress
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

export interface ReelResumableSession {
  reelId: string;
  uploadUrl?: string;
  bytesTransferred: number;
}

export interface ReelStorageUploadParams {
  uid: string;
  reelId: string;
  file: Blob | File;
  kind: 'video' | 'thumbnail';
  contentType: string;
  onProgress?: (percent: number) => void;
  onTaskCreated?: (task: UploadTask) => void;
  onSessionUpdate?: (session: { uploadUrl?: string; bytesTransferred: number }) => void;
  resumeUploadUrl?: string;
  resumeBytesTransferred?: number;
  signal?: AbortSignal;
}

export interface ReelStorageAdapter {
  uploadMedia(params: ReelStorageUploadParams): Promise<string>;
  deleteReelMedia(params: {
    uid: string;
    reelId: string;
    videoUrl?: string;
    thumbnailUrl?: string;
    onlyThumbnail?: boolean;
  }): Promise<void>;
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

function inferVideoContentType(file: File | Blob): string {
  if (file.type && file.type.startsWith('video/')) {
    return file.type;
  }
  const name = 'name' in file ? (file as File).name.toLowerCase() : '';
  if (name.endsWith('.webm')) return 'video/webm';
  if (name.endsWith('.mov')) return 'video/quicktime';
  if (name.endsWith('.m4v')) return 'video/x-m4v';
  return 'video/mp4';
}

function buildStorageObjectPath(uid: string, reelId: string, kind: 'video' | 'thumbnail'): string {
  return kind === 'video' ? `reels/${uid}/${reelId}_video` : `reels/${uid}/${reelId}_thumb`;
}

function extractResumableUploadUrl(task: UploadTask | null | undefined): string | undefined {
  if (!task) return undefined;
  const rawTask = (task as any)?._delegate || (task as any);
  return typeof rawTask?._uploadUrl === 'string' && rawTask._uploadUrl.length > 0
    ? rawTask._uploadUrl
    : undefined;
}

function cancelUploadTaskSafely(task: UploadTask | null | undefined): void {
  if (!task) return;
  try {
    // Firebase UploadTask.cancel() ignores 'paused' tasks unless resumed first
    if (task.snapshot?.state === 'paused' && typeof task.resume === 'function') {
      task.resume();
    }
    task.cancel();
  } catch {
    // ignore
  }
}

/**
 * 3. Raise the retry window for uploads and operations.
 */
export function setMaxUploadRetryTime(storage: FirebaseStorage | any, timeMs: number): void {
  try {
    if (typeof storage?.setMaxUploadRetryTime === 'function') {
      storage.setMaxUploadRetryTime(timeMs);
    }
  } catch {
    // ignore
  }
  try {
    if (storage && typeof storage === 'object') {
      storage.maxUploadRetryTime = timeMs;
    }
  } catch {
    // ignore
  }
}

export function setMaxOperationRetryTime(storage: FirebaseStorage | any, timeMs: number): void {
  try {
    if (typeof storage?.setMaxOperationRetryTime === 'function') {
      storage.setMaxOperationRetryTime(timeMs);
    }
  } catch {
    // ignore
  }
  try {
    if (storage && typeof storage === 'object') {
      storage.maxOperationRetryTime = timeMs;
    }
  } catch {
    // ignore
  }
}

function runResumableTask({
  targetRef,
  file,
  contentType,
  onProgress,
  onTaskCreated,
  onSessionUpdate,
  resumeUploadUrl,
  resumeBytesTransferred,
  signal,
}: {
  targetRef: ReturnType<typeof ref>;
  file: Blob | File;
  contentType: string;
  onProgress?: (percent: number) => void;
  onTaskCreated?: (task: UploadTask) => void;
  onSessionUpdate?: (session: { uploadUrl?: string; bytesTransferred: number }) => void;
  resumeUploadUrl?: string;
  resumeBytesTransferred?: number;
  signal?: AbortSignal;
}): Promise<string> {
  const task = uploadBytesResumable(targetRef, file, { contentType });
  const rawTask = (task as any)?._delegate || (task as any);

  let waitingForInitialResume = false;
  if (
    resumeUploadUrl &&
    rawTask &&
    rawTask._resumable === true &&
    typeof task.pause === 'function' &&
    typeof task.resume === 'function'
  ) {
    // Pause synchronously before _resolveToken finishes so _createResumable is bypassed,
    // then attach the existing GCS resumable upload URL to query byte offset and continue!
    waitingForInitialResume = task.pause();
    rawTask._uploadUrl = resumeUploadUrl;
    rawTask._needToFetchStatus = true;
    if (typeof resumeBytesTransferred === 'number' && resumeBytesTransferred > 0) {
      rawTask._transferred = resumeBytesTransferred;
    }
  }

  onTaskCreated?.(task);

  let settled = false;
  let lastBytesTransferred = -1;
  let stallTimer: ReturnType<typeof setTimeout> | null = null;

  const clearStallTimer = () => {
    if (stallTimer !== null) {
      clearTimeout(stallTimer);
      stallTimer = null;
    }
  };

  return new Promise<string>((resolve, reject) => {
    const onAbort = () => {
      settled = true;
      clearStallTimer();
      waitingForInitialResume = false;
      cancelUploadTaskSafely(task);
    };

    const resetStallTimer = () => {
      clearStallTimer();
      if (settled) return;
      stallTimer = setTimeout(() => {
        if (settled) return;
        settled = true;
        clearStallTimer();
        if (signal) signal.removeEventListener('abort', onAbort);
        const sessionUrl = extractResumableUploadUrl(task);
        if (sessionUrl || (task.snapshot?.bytesTransferred || 0) > 0) {
          onSessionUpdate?.({
            uploadUrl: sessionUrl,
            bytesTransferred: task.snapshot?.bytesTransferred || 0,
          });
        }
        cancelUploadTaskSafely(task);
        const stallErr: any = new Error('Upload stalled for 90 seconds with no progress. Tap Retry to resume.');
        stallErr.code = 'storage/stalled';
        reject(stallErr);
      }, REEL_UPLOAD_STALL_TIMEOUT_MS);
    };

    if (signal) {
      if (signal.aborted) {
        onAbort();
      } else {
        signal.addEventListener('abort', onAbort, { once: true });
      }
    }

    if (!settled) {
      resetStallTimer();
    }

    task.on(
      'state_changed',
      (snapshot) => {
        if (settled) return;
        if (waitingForInitialResume && snapshot.state === 'paused') {
          waitingForInitialResume = false;
          task.resume();
          resetStallTimer();
          return;
        }
        if (snapshot.state === 'paused') {
          clearStallTimer();
          return;
        }
        if (snapshot.bytesTransferred > lastBytesTransferred || lastBytesTransferred === -1) {
          lastBytesTransferred = snapshot.bytesTransferred;
          resetStallTimer();
        }
        const sessionUrl = extractResumableUploadUrl(task);
        if (sessionUrl || snapshot.bytesTransferred > 0) {
          onSessionUpdate?.({
            uploadUrl: sessionUrl,
            bytesTransferred: snapshot.bytesTransferred,
          });
        }
        if (snapshot.totalBytes > 0) {
          onProgress?.(Math.min(99, Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100)));
        }
      },
      (err) => {
        if (settled) return;
        settled = true;
        clearStallTimer();
        if (signal) signal.removeEventListener('abort', onAbort);
        const sessionUrl = extractResumableUploadUrl(task);
        if (sessionUrl) {
          onSessionUpdate?.({
            uploadUrl: sessionUrl,
            bytesTransferred: task.snapshot?.bytesTransferred || 0,
          });
        }
        reject(err);
      },
      async () => {
        if (signal) signal.removeEventListener('abort', onAbort);
        try {
          const url = await getDownloadURL(task.snapshot.ref);
          if (settled) return;
          settled = true;
          clearStallTimer();
          onProgress?.(100);
          resolve(url);
        } catch (err) {
          if (settled) return;
          settled = true;
          clearStallTimer();
          reject(err);
        }
      }
    );
  });
}

/**
 * Default Firebase Storage backend implementation.
 * Isolated behind ReelStorageAdapter so storage can be swapped without touching UI components.
 */
const firebaseReelStorageAdapter: ReelStorageAdapter = {
  async uploadMedia({
    uid,
    reelId,
    file,
    kind,
    contentType,
    onProgress,
    onTaskCreated,
    onSessionUpdate,
    resumeUploadUrl,
    resumeBytesTransferred,
    signal,
  }) {
    const storage = getFirebaseStorage();
    // 3. Raise the retry window: 10 minutes for uploads, 2 minutes for operations
    setMaxUploadRetryTime(storage, 10 * 60 * 1000);
    setMaxOperationRetryTime(storage, 2 * 60 * 1000);

    const path = buildStorageObjectPath(uid, reelId, kind);
    const targetRef = ref(storage, path);

    if (resumeUploadUrl && kind === 'video') {
      try {
        return await runResumableTask({
          targetRef,
          file,
          contentType,
          onProgress,
          onTaskCreated,
          onSessionUpdate,
          resumeUploadUrl,
          resumeBytesTransferred,
          signal,
        });
      } catch (resumeErr: any) {
        if (signal?.aborted || resumeErr?.code === 'storage/canceled') {
          throw resumeErr;
        }
        // If the previous resumable session URL expired or was invalidated (e.g. 404/410),
        // fall back once to a fresh resumable upload session unless retry limit itself expired again.
        const code = String(resumeErr?.code || '');
        if (code === 'storage/retry-limit-exceeded' || code === 'storage/unauthorized' || code === 'storage/stalled') {
          throw resumeErr;
        }
        console.warn('[Reels] Previous resumable upload session could not be resumed, starting new session:', resumeErr);
        onSessionUpdate?.({ uploadUrl: undefined, bytesTransferred: 0 });
      }
    }

    return runResumableTask({
      targetRef,
      file,
      contentType,
      onProgress,
      onTaskCreated,
      onSessionUpdate,
      signal,
    });
  },

  async deleteReelMedia({ uid, reelId, onlyThumbnail }) {
    const storage = getFirebaseStorage();
    setMaxUploadRetryTime(storage, 10 * 60 * 1000);
    setMaxOperationRetryTime(storage, 2 * 60 * 1000);

    const thumbRef = ref(storage, buildStorageObjectPath(uid, reelId, 'thumbnail'));
    if (onlyThumbnail) {
      await Promise.allSettled([deleteObject(thumbRef)]);
      return;
    }

    const videoRef = ref(storage, buildStorageObjectPath(uid, reelId, 'video'));
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

export interface ReelPublishController {
  cancel: () => void;
  pause: () => boolean;
  resume: () => boolean;
  isPaused: () => boolean;
  getTask: () => UploadTask | null;
}

export interface PublishReelInput {
  file: File;
  thumbnailBlob?: Blob | null;
  caption: string;
  trimStart?: number;
  trimEnd?: number;
  totalDuration?: number;
  onProgress?: (percent: number, stage?: string) => void;
  onStageChange?: (stage: 'thumbnail' | 'video' | 'saving' | 'done') => void;
  onTaskCreated?: (task: UploadTask, controller: ReelPublishController) => void;
  onResumableSession?: (session: ReelResumableSession) => void;
  controllerRef?: { current: ReelPublishController | null };
  existingThumbnailUrl?: string | null;
  existingReelId?: string | null;
  resumeUploadUrl?: string;
  resumeBytesTransferred?: number;
}

export async function publishReel({
  file,
  thumbnailBlob,
  caption,
  trimStart = 0,
  trimEnd,
  totalDuration,
  onProgress,
  onStageChange,
  onTaskCreated,
  onResumableSession,
  controllerRef,
  existingThumbnailUrl,
  existingReelId,
  resumeUploadUrl,
  resumeBytesTransferred,
}: PublishReelInput): Promise<ReelModel> {
  const auth = getFirebaseAuth();
  const uid = auth.currentUser?.uid;
  if (!uid) {
    throw new Error('Sign in required to publish a reel.');
  }

  // Keep the 200 MB limit as a safety net
  if (file.size <= 0 || file.size > MAX_REEL_FILE_SIZE_BYTES) {
    throw new Error('Video file must be under 200 MB.');
  }

  const storage = getFirebaseStorage();
  // Raise the retry window: 10 minutes for uploads, 2 minutes for operations
  setMaxUploadRetryTime(storage, 10 * 60 * 1000);
  setMaxOperationRetryTime(storage, 2 * 60 * 1000);

  const trimmedCaption = caption.trim().slice(0, MAX_REEL_CAPTION_LENGTH);
  const safeStart = Math.max(0, trimStart);
  const rawClipDuration =
    typeof trimEnd === 'number' && trimEnd > safeStart
      ? trimEnd - safeStart
      : typeof totalDuration === 'number' && totalDuration > 0
      ? totalDuration - safeStart
      : 0;

  if (rawClipDuration > MAX_REEL_DURATION_SECONDS + 0.05) {
    throw new Error('Reel duration cannot exceed 90 seconds.');
  }

  const effectiveEnd =
    typeof trimEnd === 'number' && trimEnd > safeStart
      ? Math.min(trimEnd, safeStart + MAX_REEL_DURATION_SECONDS)
      : typeof totalDuration === 'number' && totalDuration > 0
      ? Math.min(totalDuration, safeStart + MAX_REEL_DURATION_SECONDS)
      : safeStart + MAX_REEL_DURATION_SECONDS;

  const db = getFirebaseDb();
  const reelId = existingReelId || doc(collection(db, 'reels')).id;
  const reelRef = doc(db, 'reels', reelId);

  const abortController = new AbortController();
  let currentTask: UploadTask | null = null;
  let isTaskPaused = false;

  const controller: ReelPublishController = {
    cancel: () => {
      abortController.abort();
      cancelUploadTaskSafely(currentTask);
    },
    pause: () => {
      if (currentTask && typeof currentTask.pause === 'function') {
        const ok = currentTask.pause();
        isTaskPaused = ok;
        return ok;
      }
      return false;
    },
    resume: () => {
      if (currentTask && typeof currentTask.resume === 'function') {
        const ok = currentTask.resume();
        isTaskPaused = !ok;
        return ok;
      }
      return false;
    },
    isPaused: () => isTaskPaused,
    getTask: () => currentTask,
  };

  if (controllerRef) {
    controllerRef.current = controller;
  }

  // Upload original selected video file as-is (no in-browser re-encoding)
  const videoContentTypeToUpload = inferVideoContentType(file);

  // 1. Upload thumbnail
  let thumbnailUrl = existingThumbnailUrl || '';
  if (!thumbnailUrl && thumbnailBlob && thumbnailBlob.size > 0) {
    onStageChange?.('thumbnail');
    onProgress?.(1, 'thumbnail');
    try {
      thumbnailUrl = await activeStorageAdapter.uploadMedia({
        uid,
        reelId,
        file: thumbnailBlob,
        kind: 'thumbnail',
        contentType: thumbnailBlob.type || 'image/jpeg',
        onProgress: (p) => onProgress?.(p, 'thumbnail'),
        onTaskCreated: (task) => {
          currentTask = task;
          onTaskCreated?.(task, controller);
        },
        signal: abortController.signal,
      });
    } catch (thumbErr) {
      if (abortController.signal.aborted) {
        throw new Error('Reel publish canceled.');
      }
      throw thumbErr;
    }
  }

  if (abortController.signal.aborted) {
    if (thumbnailUrl) {
      await activeStorageAdapter.deleteReelMedia({ uid, reelId, onlyThumbnail: true }).catch(() => {});
    }
    throw new Error('Reel publish canceled.');
  }

  // 2. Upload original video file with uploadBytesResumable (resuming existing session on Retry)
  let rawVideoUrl = '';
  try {
    onStageChange?.('video');
    const initialPct =
      resumeBytesTransferred && file.size > 0
        ? Math.max(1, Math.min(99, Math.round((resumeBytesTransferred / file.size) * 100)))
        : 1;
    onProgress?.(initialPct, 'video');

    rawVideoUrl = await activeStorageAdapter.uploadMedia({
      uid,
      reelId,
      file,
      kind: 'video',
      contentType: videoContentTypeToUpload,
      resumeUploadUrl,
      resumeBytesTransferred,
      onProgress: (p) => {
        onProgress?.(p, 'video');
      },
      onTaskCreated: (task) => {
        currentTask = task;
        onTaskCreated?.(task, controller);
      },
      onSessionUpdate: ({ uploadUrl, bytesTransferred }) => {
        onResumableSession?.({
          reelId,
          uploadUrl,
          bytesTransferred,
        });
      },
      signal: abortController.signal,
    });
  } catch (videoUploadError: any) {
    // If the video upload fails, delete the already-uploaded thumbnail so no orphan files remain
    if (thumbnailUrl) {
      try {
        await activeStorageAdapter.deleteReelMedia({ uid, reelId, onlyThumbnail: true });
        console.log(`[Reels] Deleted orphan thumbnail after video upload failure: reels/${uid}/${reelId}_thumb`);
      } catch (cleanErr) {
        console.warn('[Reels] Failed to delete orphan thumbnail:', cleanErr);
      }
    }
    if (abortController.signal.aborted || videoUploadError?.code === 'storage/canceled') {
      throw new Error('Reel publish canceled.');
    }
    throw videoUploadError;
  }

  if (abortController.signal.aborted) {
    await activeStorageAdapter.deleteReelMedia({ uid, reelId }).catch(() => {});
    throw new Error('Reel publish canceled.');
  }

  // 3. Save to Firestore with #t=start,end fragment when trimmed
  onStageChange?.('saving');
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
  } catch (firestoreError) {
    await activeStorageAdapter.deleteReelMedia({ uid, reelId }).catch(() => {});
    handleReelFirestoreError(firestoreError, OperationType.CREATE, `reels/${reelId}`);
  }

  onStageChange?.('done');
  onProgress?.(100, 'done');

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
