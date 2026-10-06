import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { getFirebaseStorage, getFirebaseAuth } from './firebase';
import { validateMediaUpload } from './mediaPolicy';
import { encryptBlobData } from './crypto';
import { compressAudio } from './audioCompression';

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

// Files are owned by the authenticated uploader. The resulting bearer URL is
// shared only through an authorized Firestore message/story, never logged.
async function storeMedia(blob: Blob, onProgress?: (percent: number) => void): Promise<string> {
  const uid = getFirebaseAuth().currentUser?.uid;
  if (!uid) throw new Error('Please sign in before uploading.');
  validateMediaUpload(blob);
  const target = ref(getFirebaseStorage(), `media/${uid}/${crypto.randomUUID()}`);
  return new Promise((resolve, reject) => {
    const task = uploadBytesResumable(target, blob, { contentType: blob.type });
    const timeout = setTimeout(() => { task.cancel(); reject(new Error('Upload timed out. Please retry.')); }, 30000);
    task.on('state_changed', snapshot => {
      if (snapshot.totalBytes) onProgress?.(Math.min(99, Math.round(snapshot.bytesTransferred / snapshot.totalBytes * 100)));
    }, error => { clearTimeout(timeout); reject(error); }, async () => {
      try {
        const url = await getDownloadURL(task.snapshot.ref);
        clearTimeout(timeout); onProgress?.(100); resolve(url);
      } catch (error) { clearTimeout(timeout); reject(error); }
    });
  });
}

export async function uploadChatMedia({ fileOrBlob, onProgress, conversationKey }: {
  chatId: string; messageId: string; fileOrBlob: Blob | File;
  dataUrlFallback?: string; onProgress?: (percent: number) => void; conversationKey?: CryptoKey | null;
}): Promise<{ downloadUrl: string; mediaIv?: string }> {
  validateMediaUpload(fileOrBlob);
  if (conversationKey) {
    // Encryption failure must not silently publish a plaintext replacement.
    const encrypted = await encryptBlobData(fileOrBlob, conversationKey);
    if (!encrypted) throw new Error('Could not encrypt the attachment.');
    return { downloadUrl: await storeMedia(encrypted.encryptedBlob, onProgress), mediaIv: encrypted.ivB64 };
  }
  return { downloadUrl: await storeMedia(fileOrBlob, onProgress) };
}

export async function uploadVoiceNote({ audioBlob, onProgress, conversationKey, chatId, messageId }: {
  chatId: string; messageId: string; audioBlob: Blob; dataUrlFallback?: string;
  onProgress?: (percent: number) => void; conversationKey?: CryptoKey | null;
}): Promise<{ downloadUrl: string; mediaIv?: string }> {
  let compressed = audioBlob;
  try { compressed = await compressAudio(audioBlob); } catch { /* The bounded original is still usable. */ }
  return uploadChatMedia({ chatId, messageId, fileOrBlob: compressed, onProgress, conversationKey });
}
