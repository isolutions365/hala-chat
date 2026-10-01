import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { getFirebaseStorage } from './firebase';
import { encryptBlobData } from './crypto';
import { compressAudio } from './audioCompression';

import { compressImage } from './imageCompression';
export { compressImage } from './imageCompression';

/**
 * Extract first frame from a video file as thumbnail
 */
export async function getVideoThumbnail(file: File): Promise<{ thumbnailDataUrl: string }> {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.playsInline = true;
    video.muted = true;
    const url = URL.createObjectURL(file);
    video.src = url;

    video.onloadeddata = () => {
      video.currentTime = Math.min(0.5, video.duration / 2 || 0.1);
    };

    video.onseeked = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth || 480;
        canvas.height = video.videoHeight || 270;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const thumb = canvas.toDataURL('image/jpeg', 0.6);
          URL.revokeObjectURL(url);
          resolve({ thumbnailDataUrl: thumb });
          return;
        }
      } catch (err) {
        console.warn('Video thumbnail generation error:', err);
      }
      URL.revokeObjectURL(url);
      resolve({ thumbnailDataUrl: '' });
    };

    video.onerror = () => {
      URL.revokeObjectURL(url);
      resolve({ thumbnailDataUrl: '' });
    };
  });
}

// Track if Firebase Storage bucket is reachable/active in this environment
let isStorageServiceReachable: boolean | null = null;
let lastStorageFailureTime = 0;

function shouldAttemptStorage(): boolean {
  if (isStorageServiceReachable === false) {
    // Retry storage after 3 minutes in case connectivity or bucket was restored
    if (Date.now() - lastStorageFailureTime > 180000) {
      isStorageServiceReachable = null;
      return true;
    }
    return false;
  }
  return true;
}

function markStorageFailed() {
  isStorageServiceReachable = false;
  lastStorageFailureTime = Date.now();
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string || '');
    reader.onerror = () => resolve('');
    reader.readAsDataURL(blob);
  });
}

/**
 * Upload chat media to Firebase Storage with progress tracking,
 * with graceful fallback to base64 dataUrl if Storage service is unreachable
 */
export async function uploadChatMedia({
  chatId,
  messageId,
  fileOrBlob,
  dataUrlFallback,
  onProgress,
  conversationKey,
}: {
  chatId: string;
  messageId: string;
  fileOrBlob: Blob | File;
  dataUrlFallback?: string;
  onProgress?: (percent: number) => void;
  conversationKey?: CryptoKey | null;
}): Promise<{ downloadUrl: string; mediaIv?: string }> {
  let targetBlob = fileOrBlob;
  const isVideo = fileOrBlob.type.startsWith('video');

  // Automatically compress images client-side before uploading to Firebase Storage
  if (!isVideo) {
    try {
      const compressed = await compressImage(fileOrBlob, 1440, 1440, 0.80, {
        maxFileSizeKB: 450,
      });
      targetBlob = compressed.blob;
    } catch (compressErr) {
      console.warn('[Media] Automatic image compression fallback to original blob:', compressErr);
    }
  }

  // If storage is known to be unavailable, directly generate instant base64 payload
  if (!shouldAttemptStorage()) {
    console.info('[Media] Storage offline/inaccessible, using instant Base64 fallback.');
    onProgress?.(100);
    const downloadUrl = await blobToDataUrl(targetBlob);
    return { downloadUrl };
  }

  try {
    const storage = getFirebaseStorage();
    const isVideo = fileOrBlob.type.startsWith('video');
    const extension = isVideo ? 'mp4' : 'jpg';
    const storagePath = `chats/${chatId}/media/${messageId}.${extension}`;
    const storageRef = ref(storage, storagePath);

    return new Promise((resolve) => {
      const uploadTask = uploadBytesResumable(storageRef, targetBlob, {
        contentType: fileOrBlob.type || (isVideo ? 'video/mp4' : 'image/jpeg'),
      });

      uploadTask.on(
        'state_changed',
        (snapshot) => {
          if (snapshot.totalBytes > 0) {
            const progress = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
            onProgress?.(progress);
          }
        },
        async (error) => {
          markStorageFailed();
          console.warn('[Media] Firebase Storage upload deferred to offline Base64 fallback:', error?.message || error);
          const downloadUrl = await blobToDataUrl(targetBlob);
          resolve({ downloadUrl });
        },
        async () => {
          try {
            const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);
            isStorageServiceReachable = true;
            onProgress?.(100);
            resolve({ downloadUrl });
          } catch (urlErr) {
            console.warn('[Media] getDownloadURL fallback to Base64:', urlErr);
            const downloadUrl = await blobToDataUrl(targetBlob);
            resolve({ downloadUrl });
          }
        }
      );
    });
  } catch (err) {
    markStorageFailed();
    console.warn('[Media] Storage service unavailable, using Base64 fallback:', err);
    const downloadUrl = await blobToDataUrl(targetBlob);
    return { downloadUrl };
  }
}

/**
 * Upload voice note to Firebase Storage under /chats/{chatId}/voice/{messageId}
 * with fallback to base64 audio dataUrl
 */
export async function uploadVoiceNote({
  chatId,
  messageId,
  audioBlob,
  dataUrlFallback,
  onProgress,
  conversationKey,
}: {
  chatId: string;
  messageId: string;
  audioBlob: Blob;
  dataUrlFallback?: string;
  onProgress?: (percent: number) => void;
  conversationKey?: CryptoKey | null;
}): Promise<{ downloadUrl: string; mediaIv?: string }> {
  // Step (a): Recording stops & audio blob is created
  console.log(`[Voice Note Flow - Step a] Audio Blob created. Size: ${audioBlob.size} bytes, MimeType: "${audioBlob.type}"`);

  let targetBlob = audioBlob;

  // Compress audio first to shrink voice message size if possible
  try {
    targetBlob = await compressAudio(audioBlob);
    console.log(`[Voice Note Flow - Compression] Audio compressed successfully. New Size: ${targetBlob.size} bytes, MimeType: "${targetBlob.type}"`);
  } catch (compErr) {
    console.warn('[Voice Note Flow - Compression] Audio compression failed, using original blob:', compErr);
    targetBlob = audioBlob;
  }

  // Check if storage bucket is reachable or bypass immediately for speed
  if (!shouldAttemptStorage()) {
    console.info('[Voice Note Flow - Step c] Storage unavailable, seamlessly writing Base64 audio payload.');
    onProgress?.(100);
    const downloadUrl = await blobToDataUrl(targetBlob);
    return { downloadUrl };
  }

  // Step (c): Firebase Storage upload
  try {
    const storage = getFirebaseStorage();
    const ext = targetBlob.type.includes('wav')
      ? 'wav'
      : targetBlob.type.includes('mp4') || targetBlob.type.includes('m4a')
      ? 'm4a'
      : targetBlob.type.includes('ogg')
      ? 'ogg'
      : 'webm';
    const storagePath = `chats/${chatId}/voice/${messageId}.${ext}`;
    const storageRef = ref(storage, storagePath);
    const audioContentType = targetBlob.type || 'audio/webm';

    console.log(`[Voice Note Flow - Step c] Starting Firebase Storage upload. Path: "${storagePath}". ContentType: ${audioContentType}`);
    const uploadStart = performance.now();

    return new Promise((resolve) => {
      const uploadTask = uploadBytesResumable(storageRef, targetBlob, {
        contentType: audioContentType,
      });

      uploadTask.on(
        'state_changed',
        (snapshot) => {
          if (snapshot.totalBytes > 0) {
            const progress = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
            console.log(`[Voice Note Flow - Step c] Progress: ${progress}% (${snapshot.bytesTransferred}/${snapshot.totalBytes} bytes)`);
            onProgress?.(progress);
          }
        },
        async (error) => {
          markStorageFailed();
          console.warn('[Voice Note Flow - Step c] Storage upload deferred to Base64 fallback mode:', error?.message || error);
          const downloadUrl = await blobToDataUrl(targetBlob);
          console.log(`[Voice Note Flow] Successfully generated playable Base64 audio fallback (Size: ${targetBlob.size} bytes).`);
          onProgress?.(100);
          resolve({ downloadUrl });
        },
        async () => {
          try {
            console.log(`[Voice Note Flow - Step c] Firebase Storage Upload Task COMPLETED in ${(performance.now() - uploadStart).toFixed(2)}ms. Obtaining public download URL...`);
            const urlStart = performance.now();
            const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);
            isStorageServiceReachable = true;
            console.log(`[Voice Note Flow - Step c] Obtained public download URL: "${downloadUrl}" in ${(performance.now() - urlStart).toFixed(2)}ms.`);
            onProgress?.(100);
            resolve({ downloadUrl });
          } catch (urlErr) {
            console.warn('[Voice Note Flow - Step c] Failed to obtain download URL, using Base64 fallback:', urlErr);
            const downloadUrl = await blobToDataUrl(targetBlob);
            onProgress?.(100);
            resolve({ downloadUrl });
          }
        }
      );
    });
  } catch (err) {
    markStorageFailed();
    console.warn('[Voice Note Flow - Step c] Storage unreachable, using instant Base64 fallback:', err);
    onProgress?.(100);
    const downloadUrl = await blobToDataUrl(targetBlob);
    return { downloadUrl };
  }
}

