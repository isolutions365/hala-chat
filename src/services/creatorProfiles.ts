import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type DocumentSnapshot,
  type QueryDocumentSnapshot,
  type Timestamp,
  type Unsubscribe,
} from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytesResumable } from 'firebase/storage';
import { getFirebaseAuth, getFirebaseDb, getFirebaseStorage } from '../lib/firebase';
import { compressImage } from '../lib/imageCompression';
import type { ReelModel } from './reels';

export const MAX_CREATOR_DISPLAY_NAME = 60;
export const MIN_CREATOR_USERNAME = 3;
export const MAX_CREATOR_USERNAME = 30;
export const MAX_CREATOR_BIO = 150;
export const CREATOR_USERNAME_REGEX = /^[a-z0-9_]{3,30}$/;

export interface CreatorProfile {
  uid: string;
  displayName: string;
  username: string;
  avatarUrl: string | null;
  bio: string;
  followersCount: number;
  followingCount: number;
  reelsCount: number;
  createdAt: Timestamp | null;
}

export interface SaveCreatorProfileInput {
  displayName: string;
  username?: string;
  avatarUrl?: string | null;
  bio?: string;
}

const creatorProfileCache = new Map<string, CreatorProfile>();

function parseCreatorAvatarUrl(url: any): string | null {
  if (typeof url === 'string') {
    const trimmed = url.trim();
    if (trimmed.startsWith('https://')) {
      return trimmed;
    }
  }
  return null;
}

function mapCreatorProfileDoc(snap: DocumentSnapshot | QueryDocumentSnapshot): CreatorProfile | null {
  if (!snap.exists()) return null;
  const d = snap.data() || {};
  const displayName = String(d.displayName || '').trim();
  if (!displayName) return null;

  return {
    uid: snap.id,
    displayName,
    username: typeof d.username === 'string' ? d.username : '',
    avatarUrl: parseCreatorAvatarUrl(d.avatarUrl),
    bio: typeof d.bio === 'string' ? d.bio : '',
    followersCount: typeof d.followersCount === 'number' && d.followersCount >= 0 ? d.followersCount : 0,
    followingCount: typeof d.followingCount === 'number' && d.followingCount >= 0 ? d.followingCount : 0,
    reelsCount: typeof d.reelsCount === 'number' && d.reelsCount >= 0 ? d.reelsCount : 0,
    createdAt: (d.createdAt as Timestamp | null) || null,
  };
}

export function normalizeCreatorUsername(raw: string): string {
  return raw.trim().replace(/^@+/, '').toLowerCase();
}

export function validateCreatorProfileInput(input: SaveCreatorProfileInput): {
  displayName: string;
  username: string;
  bio: string;
} {
  const displayName = input.displayName.trim().slice(0, MAX_CREATOR_DISPLAY_NAME);
  if (!displayName) {
    throw new Error('Display name is required.');
  }

  const username = normalizeCreatorUsername(input.username || '');
  if (username && !CREATOR_USERNAME_REGEX.test(username)) {
    throw new Error('Username must be 3–30 characters using only lowercase letters, numbers, and underscores.');
  }

  const bio = (input.bio || '').trim().slice(0, MAX_CREATOR_BIO);
  return { displayName, username, bio };
}

export function getCachedCreatorProfile(uid: string): CreatorProfile | null {
  return creatorProfileCache.get(uid) || null;
}

export function clearCreatorProfileCache(uid?: string): void {
  if (uid) {
    creatorProfileCache.delete(uid);
  } else {
    creatorProfileCache.clear();
  }
}

export async function isCreatorUsernameAvailable(
  rawUsername: string,
  excludeUid?: string
): Promise<boolean> {
  const normalized = normalizeCreatorUsername(rawUsername);
  if (!normalized) return true;
  if (!CREATOR_USERNAME_REGEX.test(normalized)) return false;

  const db = getFirebaseDb();
  const q = query(
    collection(db, 'creator_profiles'),
    where('username', '==', normalized),
    limit(5)
  );
  const snap = await getDocs(q);
  return snap.docs.every((d) => d.id === excludeUid);
}

export async function getCreatorProfile(
  uid: string,
  forceRefresh = false
): Promise<CreatorProfile | null> {
  if (!uid) return null;
  if (!forceRefresh) {
    const cached = creatorProfileCache.get(uid);
    if (cached) return cached;
  }

  const db = getFirebaseDb();
  try {
    const snap = await getDoc(doc(db, 'creator_profiles', uid));
    const mapped = mapCreatorProfileDoc(snap);
    if (mapped) {
      creatorProfileCache.set(uid, mapped);
    } else {
      creatorProfileCache.delete(uid);
    }
    return mapped;
  } catch {
    return creatorProfileCache.get(uid) || null;
  }
}

export async function getCreatorProfilesByIds(
  uids: string[]
): Promise<Record<string, CreatorProfile | null>> {
  const unique = Array.from(new Set(uids.filter(Boolean)));
  const result: Record<string, CreatorProfile | null> = {};
  const missing: string[] = [];

  for (const uid of unique) {
    const cached = creatorProfileCache.get(uid);
    if (cached) {
      result[uid] = cached;
    } else {
      missing.push(uid);
    }
  }

  await Promise.all(
    missing.map(async (uid) => {
      result[uid] = await getCreatorProfile(uid, false);
    })
  );

  return result;
}

export async function listCreatorProfiles(maxCount = 30): Promise<CreatorProfile[]> {
  const db = getFirebaseDb();
  const safeLimit = Math.min(Math.max(maxCount, 1), 30);
  const snap = await getDocs(query(collection(db, 'creator_profiles'), limit(safeLimit)));
  const list = snap.docs
    .map(mapCreatorProfileDoc)
    .filter((p): p is CreatorProfile => p !== null);
  list.forEach((profile) => creatorProfileCache.set(profile.uid, profile));
  list.sort((a, b) => a.displayName.localeCompare(b.displayName));
  return list;
}

export function subscribeToCreatorProfile(
  uid: string,
  onData: (profile: CreatorProfile | null) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  if (!uid) {
    onData(null);
    return () => {};
  }

  const db = getFirebaseDb();
  return onSnapshot(
    doc(db, 'creator_profiles', uid),
    (snap) => {
      const mapped = mapCreatorProfileDoc(snap);
      if (mapped) {
        creatorProfileCache.set(uid, mapped);
      } else {
        creatorProfileCache.delete(uid);
      }
      onData(mapped);
    },
    (err) => {
      onError?.(err instanceof Error ? err : new Error(String(err)));
    }
  );
}

function wrapFirebaseError(err: any, fallbackMessage: string): Error {
  const code = typeof err?.code === 'string' ? err.code : '';
  const message = typeof err?.message === 'string' && err.message ? err.message : fallbackMessage;
  const wrapped = new Error(
    code && !message.includes(code) ? `${message} (${code})` : message || fallbackMessage
  ) as Error & { code?: string };
  if (code) wrapped.code = code;
  return wrapped;
}

export async function uploadCreatorAvatar(uid: string, file: File): Promise<string> {
  const effectiveUid = getFirebaseAuth().currentUser?.uid || uid;
  if (!effectiveUid) {
    throw new Error('Authentication required to upload an avatar.');
  }
  if (!file.type.startsWith('image/')) {
    throw new Error('Please choose a valid image file (JPEG, PNG, WebP, or GIF).');
  }
  if (file.size <= 0 || file.size > 10 * 1024 * 1024) {
    throw new Error('Avatar image must be smaller than 10 MB.');
  }

  const compressed = await compressImage(file, 480, 480, 0.84, {
    maxWidth: 480,
    maxHeight: 480,
    quality: 0.84,
    maxFileSizeKB: 350,
    mimeType: 'image/jpeg',
  });

  const storage = getFirebaseStorage();
  const storageRef = ref(storage, `avatars/creator_${effectiveUid}_${Date.now()}.jpg`);
  const task = uploadBytesResumable(storageRef, compressed.blob, {
    contentType: 'image/jpeg',
  });

  try {
    await task;
    return await getDownloadURL(task.snapshot.ref);
  } catch (err: any) {
    throw wrapFirebaseError(err, 'Failed to upload avatar image.');
  }
}

export async function createCreatorProfile(
  uid: string,
  input: SaveCreatorProfileInput
): Promise<CreatorProfile> {
  const effectiveUid = getFirebaseAuth().currentUser?.uid || uid;
  if (!effectiveUid) {
    throw new Error('Sign in required to create a creator profile.');
  }

  const { displayName, username, bio } = validateCreatorProfileInput(input);
  if (username) {
    const available = await isCreatorUsernameAvailable(username, effectiveUid);
    if (!available) {
      throw new Error('That username is already taken. Please choose another.');
    }
  }

  const avatarUrl = parseCreatorAvatarUrl(input.avatarUrl);

  const db = getFirebaseDb();
  try {
    await setDoc(doc(db, 'creator_profiles', effectiveUid), {
      displayName,
      username,
      avatarUrl,
      bio,
      followersCount: 0,
      followingCount: 0,
      reelsCount: 0,
      createdAt: serverTimestamp(),
    });
  } catch (err: any) {
    throw wrapFirebaseError(err, 'Failed to create creator profile.');
  }

  const created: CreatorProfile = {
    uid: effectiveUid,
    displayName,
    username,
    avatarUrl,
    bio,
    followersCount: 0,
    followingCount: 0,
    reelsCount: 0,
    createdAt: null,
  };
  creatorProfileCache.set(effectiveUid, created);
  return created;
}

export async function updateCreatorProfile(
  uid: string,
  input: SaveCreatorProfileInput
): Promise<CreatorProfile> {
  const effectiveUid = getFirebaseAuth().currentUser?.uid || uid;
  if (!effectiveUid) {
    throw new Error('Sign in required to update your creator profile.');
  }

  const { displayName, username, bio } = validateCreatorProfileInput(input);
  if (username) {
    const available = await isCreatorUsernameAvailable(username, effectiveUid);
    if (!available) {
      throw new Error('That username is already taken. Please choose another.');
    }
  }

  const avatarUrl = parseCreatorAvatarUrl(input.avatarUrl);

  const db = getFirebaseDb();
  try {
    await updateDoc(doc(db, 'creator_profiles', effectiveUid), {
      displayName,
      username,
      avatarUrl,
      bio,
    });
  } catch (err: any) {
    throw wrapFirebaseError(err, 'Failed to update creator profile.');
  }

  const existing = await getCreatorProfile(effectiveUid, true);
  if (existing) {
    return existing;
  }

  const fallback: CreatorProfile = {
    uid: effectiveUid,
    displayName,
    username,
    avatarUrl,
    bio,
    followersCount: 0,
    followingCount: 0,
    reelsCount: 0,
    createdAt: null,
  };
  creatorProfileCache.set(effectiveUid, fallback);
  return fallback;
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

function mapReelSnap(d: QueryDocumentSnapshot): ReelModel {
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
}

export async function fetchCreatorReels(authorId: string, countLimit = 30): Promise<ReelModel[]> {
  if (!authorId) return [];
  const db = getFirebaseDb();
  const safeLimit = Math.min(Math.max(countLimit, 1), 50);
  const colRef = collection(db, 'reels');

  try {
    const q = query(
      colRef,
      where('authorId', '==', authorId),
      orderBy('createdAt', 'desc'),
      limit(safeLimit)
    );
    const snap = await getDocs(q);
    return snap.docs.map(mapReelSnap);
  } catch (err: any) {
    const code = String(err?.code || '');
    const msg = String(err?.message || '').toLowerCase();
    if (code === 'failed-precondition' || msg.includes('index')) {
      const fallbackQ = query(colRef, where('authorId', '==', authorId), limit(safeLimit));
      const snap = await getDocs(fallbackQ);
      const list = snap.docs.map(mapReelSnap);
      list.sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
      return list;
    }
    throw err;
  }
}
