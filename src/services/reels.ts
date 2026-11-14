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

export const MAX_REEL_DURATION_SECONDS = 60;
export const MAX_REEL_FILE_SIZE_BYTES = 100 * 1024 * 1024; // 100 MB safety net
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

  const onAbort = () => {
    waitingForInitialResume = false;
    cancelUploadTaskSafely(task);
  };

  if (signal) {
    if (signal.aborted) {
      onAbort();
    } else {
      signal.addEventListener('abort', onAbort, { once: true });
    }
  }

  return new Promise<string>((resolve, reject) => {
    task.on(
      'state_changed',
      (snapshot) => {
        if (waitingForInitialResume && snapshot.state === 'paused') {
          waitingForInitialResume = false;
          task.resume();
          return;
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
          onProgress?.(100);
          resolve(url);
        } catch (err) {
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
        if (code === 'storage/retry-limit-exceeded' || code === 'storage/unauthorized') {
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

function formatBytesMb(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB (${bytes} bytes)`;
}

/**
 * 1. Checks supported browser recording MIME types. Prefers MP4 (H.264/AAC) when supported.
 */
export function getSupportedVideoMimeType(): string | null {
  if (
    typeof window === 'undefined' ||
    typeof MediaRecorder === 'undefined' ||
    typeof MediaRecorder.isTypeSupported !== 'function'
  ) {
    return null;
  }

  // Prefer MP4 (H.264 / AAC) when supported by browser
  const mp4Candidates = [
    'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
    'video/mp4;codecs=avc1.4d002a,mp4a.40.2',
    'video/mp4;codecs=avc1,mp4a.40.2',
    'video/mp4;codecs=avc1',
    'video/mp4;codecs=h264,aac',
    'video/mp4;codecs=h264',
    'video/mp4',
  ];
  for (const mime of mp4Candidates) {
    if (MediaRecorder.isTypeSupported(mime)) {
      return mime;
    }
  }

  // Fallback to WebM if browser does not support MP4 MediaRecorder
  const webmCandidates = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
  ];
  for (const mime of webmCandidates) {
    if (MediaRecorder.isTypeSupported(mime)) {
      return mime;
    }
  }

  return null;
}

export interface CompressVideoResult {
  blob: Blob | File;
  contentType: string;
  originalSize: number;
  compressedSize: number;
  width: number;
  height: number;
  duration: number;
  wasTranscoded: boolean;
}

/**
 * 1. Client-side video compression / transcoding:
 * Scales to ~720p, ~2 to 3 Mbps (default 2.5 Mbps), mp4 (H.264/AAC) when supported,
 * keeping a 30s reel well under 25 MB (~9.5 MB).
 * 5. Reports original file size and compressed size in console.
 */
export async function compressReelVideo(
  file: File,
  options: {
    trimStart?: number;
    trimEnd?: number;
    targetBitrate?: number; // default: 2_500_000 bps (~2.5 Mbps)
    onProgress?: (percent: number) => void;
    signal?: AbortSignal;
  } = {}
): Promise<CompressVideoResult> {
  const originalSize = file.size;

  // Keep 100 MB safety net
  if (originalSize > MAX_REEL_FILE_SIZE_BYTES) {
    throw new Error('Video file must be under 100 MB.');
  }

  const supportedMime = getSupportedVideoMimeType();
  if (!supportedMime) {
    console.log(
      `[Reels] Video size — Original: ${formatBytesMb(originalSize)}, Compressed: ${formatBytesMb(originalSize)} (client transcoding unsupported in this browser)`
    );
    return {
      blob: file,
      contentType: inferVideoContentType(file),
      originalSize,
      compressedSize: originalSize,
      width: 0,
      height: 0,
      duration: 0,
      wasTranscoded: false,
    };
  }

  return new Promise<CompressVideoResult>((resolve, reject) => {
    let objectUrl = '';
    let stopped = false;
    let animFrameId: number | null = null;
    let audioCtx: AudioContext | null = null;
    let combinedStream: MediaStream | null = null;
    let recorder: MediaRecorder | null = null;
    let timeoutTimer: ReturnType<typeof setTimeout> | null = null;

    const cleanup = () => {
      stopped = true;
      if (timeoutTimer !== null) {
        clearTimeout(timeoutTimer);
        timeoutTimer = null;
      }
      if (animFrameId !== null) cancelAnimationFrame(animFrameId);
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      if (combinedStream) {
        combinedStream.getTracks().forEach((track) => track.stop());
      }
      if (audioCtx) {
        audioCtx.close().catch(() => {});
      }
    };

    if (options.signal) {
      if (options.signal.aborted) {
        cleanup();
        reject(new Error('Reel publish canceled.'));
        return;
      }
      options.signal.addEventListener(
        'abort',
        () => {
          cleanup();
          if (recorder && recorder.state !== 'inactive') {
            try {
              recorder.stop();
            } catch {}
          }
          reject(new Error('Reel publish canceled.'));
        },
        { once: true }
      );
    }

    const video = document.createElement('video');
    video.preload = 'auto';
    video.playsInline = true;
    video.crossOrigin = 'anonymous';
    // Routed through Web Audio MediaStreamDestination (not speakers) so audio is captured silently
    video.muted = false;
    video.volume = 1;

    try {
      objectUrl = URL.createObjectURL(file);
      video.src = objectUrl;
    } catch (urlErr) {
      cleanup();
      reject(urlErr);
      return;
    }

    // Initial metadata load timeout (20s), extended once clip duration is known
    timeoutTimer = setTimeout(() => {
      if (!stopped) {
        cleanup();
        console.warn('[Reels] Metadata load timeout during compression, falling back to original file.');
        console.log(
          `[Reels] Video size — Original: ${formatBytesMb(originalSize)}, Compressed: ${formatBytesMb(originalSize)} (fallback)`
        );
        resolve({
          blob: file,
          contentType: inferVideoContentType(file),
          originalSize,
          compressedSize: originalSize,
          width: 0,
          height: 0,
          duration: 0,
          wasTranscoded: false,
        });
      }
    }, 20000);

    video.onloadedmetadata = async () => {
      try {
        const origW = video.videoWidth || 720;
        const origH = video.videoHeight || 1280;
        const totalDuration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 30;

        const safeStart = Math.max(0, options.trimStart || 0);
        const safeEnd =
          options.trimEnd && options.trimEnd > safeStart
            ? Math.min(options.trimEnd, safeStart + MAX_REEL_DURATION_SECONDS)
            : Math.min(totalDuration, safeStart + MAX_REEL_DURATION_SECONDS);
        const clipDuration = Math.max(0.5, safeEnd - safeStart);

        if (timeoutTimer !== null) clearTimeout(timeoutTimer);
        timeoutTimer = setTimeout(() => {
          if (!stopped) {
            cleanup();
            console.warn('[Reels] Compression timeout, falling back to original video file.');
            console.log(
              `[Reels] Video size — Original: ${formatBytesMb(originalSize)}, Compressed: ${formatBytesMb(originalSize)} (timeout fallback)`
            );
            resolve({
              blob: file,
              contentType: inferVideoContentType(file),
              originalSize,
              compressedSize: originalSize,
              width: 0,
              height: 0,
              duration: 0,
              wasTranscoded: false,
            });
          }
        }, Math.max(90_000, Math.ceil((clipDuration + 25) * 1000)));

        // Target ~720p resolution (max short side 720, max long side 1280)
        let targetW = origW;
        let targetH = origH;
        if (origH >= origW) {
          if (origW > 720) {
            targetW = 720;
            targetH = Math.round((origH * 720) / origW);
          }
        } else {
          if (origH > 720) {
            targetH = 720;
            targetW = Math.round((origW * 720) / origH);
          }
        }
        // Ensure even dimensions for H.264 encoder compatibility
        targetW = Math.max(2, targetW - (targetW % 2));
        targetH = Math.max(2, targetH - (targetH % 2));

        // Fast-path only if already <=720p MP4, untrimmed, <= 18 MB, and <= ~3 Mbps
        const estimatedBitrate = (originalSize * 8) / Math.max(1, totalDuration);
        const isAlreadyOptimizedMp4 =
          originalSize <= 18 * 1024 * 1024 &&
          estimatedBitrate <= 3_100_000 &&
          (file.type === 'video/mp4' || file.name.toLowerCase().endsWith('.mp4')) &&
          Math.min(origW, origH) <= 720 &&
          Math.max(origW, origH) <= 1280 &&
          safeStart <= 0.1 &&
          (!options.trimEnd || options.trimEnd >= totalDuration - 0.2);

        if (isAlreadyOptimizedMp4) {
          cleanup();
          console.log(
            `[Reels] Video size — Original: ${formatBytesMb(originalSize)}, Compressed: ${formatBytesMb(originalSize)} (already <=720p MP4 @ <=3 Mbps)`
          );
          options.onProgress?.(100);
          resolve({
            blob: file,
            contentType: 'video/mp4',
            originalSize,
            compressedSize: originalSize,
            width: origW,
            height: origH,
            duration: totalDuration,
            wasTranscoded: false,
          });
          return;
        }

        const canvas = document.createElement('canvas');
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext('2d', { alpha: false });
        if (!ctx) {
          throw new Error('Canvas 2D context not available');
        }

        // Silent audio capture via Web Audio API
        let audioDest: MediaStreamAudioDestinationNode | null = null;
        try {
          const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
          if (AudioContextClass) {
            audioCtx = new AudioContextClass();
            if (audioCtx.state === 'suspended') {
              await audioCtx.resume();
            }
            const source = audioCtx.createMediaElementSource(video);
            audioDest = audioCtx.createMediaStreamDestination();
            source.connect(audioDest);
          }
        } catch (audioErr) {
          console.warn('[Reels] Could not attach audio track for transcoding, muting element:', audioErr);
          video.muted = true;
        }

        const canvasStream = canvas.captureStream(30);
        const tracks: MediaStreamTrack[] = [...canvasStream.getVideoTracks()];
        if (audioDest && audioDest.stream.getAudioTracks().length > 0) {
          tracks.push(...audioDest.stream.getAudioTracks());
        }
        combinedStream = new MediaStream(tracks);

        // Target ~2 to 3 Mbps (2.5 Mbps video + 128 kbps AAC/Opus audio)
        const targetBitrate = options.targetBitrate || 2_500_000;
        recorder = new MediaRecorder(combinedStream, {
          mimeType: supportedMime,
          videoBitsPerSecond: targetBitrate,
          audioBitsPerSecond: 128_000,
        });

        const chunks: Blob[] = [];
        recorder.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) {
            chunks.push(e.data);
          }
        };

        recorder.onstop = () => {
          cleanup();
          const mimeClean = supportedMime.split(';')[0];
          const rawBlob = new Blob(chunks, { type: mimeClean });

          const useCompressed =
            rawBlob.size > 0 &&
            (rawBlob.size < originalSize || originalSize > 25 * 1024 * 1024);

          const finalBlob = useCompressed ? rawBlob : file;
          const finalContentType = useCompressed ? mimeClean : inferVideoContentType(file);
          const compressedSize = finalBlob.size;

          // 5. Report the original file size and the compressed size in the console
          console.log(
            `[Reels] Video size — Original: ${formatBytesMb(originalSize)}, Compressed: ${formatBytesMb(compressedSize)} (${targetW}x${targetH}, ${finalContentType})`
          );

          options.onProgress?.(100);
          resolve({
            blob: finalBlob,
            contentType: finalContentType,
            originalSize,
            compressedSize,
            width: targetW,
            height: targetH,
            duration: clipDuration,
            wasTranscoded: useCompressed,
          });
        };

        // Seek to trimStart
        video.currentTime = safeStart;
        await new Promise<void>((res) => {
          const onSeeked = () => {
            video.removeEventListener('seeked', onSeeked);
            res();
          };
          video.addEventListener('seeked', onSeeked, { once: true });
          setTimeout(res, 500);
        });

        ctx.drawImage(video, 0, 0, targetW, targetH);

        const stopRecording = () => {
          if (stopped) return;
          stopped = true;
          if (animFrameId !== null) cancelAnimationFrame(animFrameId);
          video.pause();
          if (recorder && recorder.state !== 'inactive') {
            try {
              recorder.stop();
            } catch {}
          }
        };

        const drawLoop = () => {
          if (stopped) return;
          ctx.drawImage(video, 0, 0, targetW, targetH);

          const cur = video.currentTime;
          const elapsed = Math.max(0, cur - safeStart);
          const pct = Math.min(99, Math.round((elapsed / clipDuration) * 100));
          options.onProgress?.(pct);

          if (cur >= safeEnd || video.ended) {
            stopRecording();
            return;
          }

          if ('requestVideoFrameCallback' in video) {
            (video as any).requestVideoFrameCallback(drawLoop);
          } else {
            animFrameId = requestAnimationFrame(drawLoop);
          }
        };

        recorder.start(500);
        try {
          await video.play();
        } catch {
          // Mobile autoplay fallback if unmuted play was blocked
          video.muted = true;
          await video.play();
        }
        drawLoop();
      } catch (err) {
        cleanup();
        console.warn('[Reels] Compression failed, falling back to original file:', err);
        console.log(
          `[Reels] Video size — Original: ${formatBytesMb(originalSize)}, Compressed: ${formatBytesMb(originalSize)} (uncompressed fallback)`
        );
        resolve({
          blob: file,
          contentType: inferVideoContentType(file),
          originalSize,
          compressedSize: originalSize,
          width: 0,
          height: 0,
          duration: 0,
          wasTranscoded: false,
        });
      }
    };

    video.onerror = (e) => {
      cleanup();
      console.warn('[Reels] Video load error for compression:', e);
      console.log(
        `[Reels] Video size — Original: ${formatBytesMb(originalSize)}, Compressed: ${formatBytesMb(originalSize)} (load error fallback)`
      );
      resolve({
        blob: file,
        contentType: inferVideoContentType(file),
        originalSize,
        compressedSize: originalSize,
        width: 0,
        height: 0,
        duration: 0,
        wasTranscoded: false,
      });
    };
  });
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
  onStageChange?: (stage: 'compressing' | 'thumbnail' | 'video' | 'saving' | 'done') => void;
  onTaskCreated?: (task: UploadTask, controller: ReelPublishController) => void;
  onVideoCompressed?: (result: CompressVideoResult) => void;
  onResumableSession?: (session: ReelResumableSession) => void;
  controllerRef?: { current: ReelPublishController | null };
  preparedVideoBlob?: Blob | File | null;
  preparedContentType?: string | null;
  preparedWasTranscoded?: boolean;
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
  onVideoCompressed,
  onResumableSession,
  controllerRef,
  preparedVideoBlob,
  preparedContentType,
  preparedWasTranscoded,
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

  // Keep the 100 MB limit as a safety net
  if (file.size <= 0 || file.size > MAX_REEL_FILE_SIZE_BYTES) {
    throw new Error('Video file must be under 100 MB.');
  }

  const storage = getFirebaseStorage();
  // 3. Raise the retry window
  setMaxUploadRetryTime(storage, 10 * 60 * 1000);
  setMaxOperationRetryTime(storage, 2 * 60 * 1000);

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

  // 1. Client-side compression / transcoding (reused on Retry so we don't restart compression)
  let videoBlobToUpload: Blob | File = preparedVideoBlob || file;
  let videoContentTypeToUpload = preparedContentType || inferVideoContentType(file);
  let wasTranscoded = Boolean(preparedWasTranscoded);

  if (!preparedVideoBlob) {
    onStageChange?.('compressing');
    onProgress?.(1, 'compressing');
    const compResult = await compressReelVideo(file, {
      trimStart: safeStart,
      trimEnd: effectiveEnd,
      targetBitrate: 2_500_000, // ~2 to 3 Mbps (2.5 Mbps)
      onProgress: (pct) => {
        onProgress?.(pct, 'compressing');
      },
      signal: abortController.signal,
    });
    videoBlobToUpload = compResult.blob;
    videoContentTypeToUpload = compResult.contentType;
    wasTranscoded = compResult.wasTranscoded;
    onVideoCompressed?.(compResult);
  } else {
    console.log(
      `[Reels] Resuming prepared video — Original: ${formatBytesMb(file.size)}, Compressed: ${formatBytesMb(videoBlobToUpload.size)}`
    );
  }

  if (videoBlobToUpload.size <= 0 || videoBlobToUpload.size > MAX_REEL_FILE_SIZE_BYTES) {
    throw new Error('Video file must be under 100 MB.');
  }

  if (abortController.signal.aborted) {
    throw new Error('Reel publish canceled.');
  }

  // 2. Upload thumbnail
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

  // 3. Upload video file with uploadBytesResumable (resuming existing session on Retry)
  let rawVideoUrl = '';
  try {
    onStageChange?.('video');
    const initialPct =
      resumeBytesTransferred && videoBlobToUpload.size > 0
        ? Math.max(1, Math.min(99, Math.round((resumeBytesTransferred / videoBlobToUpload.size) * 100)))
        : 1;
    onProgress?.(initialPct, 'video');

    rawVideoUrl = await activeStorageAdapter.uploadMedia({
      uid,
      reelId,
      file: videoBlobToUpload,
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
    // 4. If the video upload fails, delete the already-uploaded thumbnail so no orphan files remain
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

  // 4. Save to Firestore
  onStageChange?.('saving');
  const isTrimmed =
    !wasTranscoded &&
    (safeStart > 0.1 ||
      (typeof totalDuration === 'number' && totalDuration > 0 && effectiveEnd < totalDuration - 0.2) ||
      (typeof totalDuration === 'number' && totalDuration > MAX_REEL_DURATION_SECONDS));

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
