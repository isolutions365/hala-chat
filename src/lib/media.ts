import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { getFirebaseStorage, getFirebaseAuth, ensureAuthUser } from './firebase';
import { validateMediaUpload } from './mediaPolicy';
import { encryptBlobData } from './crypto';
import { compressAudio } from './audioCompression';

export { compressImage } from './imageCompression';

// Files are owned by the authenticated uploader. The resulting bearer URL is
// shared only through an authorized Firestore message/story, never logged.
async function storeMedia(
  blob: Blob,
  onProgress?: (percent: number) => void,
  originalFileName?: string,
  originalFileType?: string
): Promise<string> {
  const authUser = await ensureAuthUser();
  const uid = authUser?.uid || getFirebaseAuth().currentUser?.uid;
  if (!uid) throw new Error('Please sign in before uploading.');
  validateMediaUpload(blob);

  // Set explicit contentType metadata (application/pdf, image/jpeg, etc.)
  const inferredType = originalFileType || blob.type || 'application/pdf';
  const metadata = {
    contentType: inferredType,
    customMetadata: {
      originalName: originalFileName || '',
    },
  };

  const target = ref(getFirebaseStorage(), `media/${uid}/${crypto.randomUUID()}`);

  return new Promise((resolve, reject) => {
    const task = uploadBytesResumable(target, blob, metadata);

    // 180s timeout for large uploads (up to 20MB)
    const timeout = setTimeout(() => {
      task.cancel();
      const err: any = new Error('Upload timed out (3 min limit). Please retry.');
      err.code = 'storage/canceled';
      reject(err);
    }, 180000);

    task.on(
      'state_changed',
      (snapshot) => {
        if (snapshot.totalBytes) {
          const percent = Math.min(99, Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100));
          onProgress?.(percent);
        }
      },
      (error: any) => {
        clearTimeout(timeout);
        console.error('[Firebase Storage Upload Error]: Code:', error?.code, 'Message:', error?.message, error);
        reject(error);
      },
      async () => {
        try {
          const url = await getDownloadURL(task.snapshot.ref);
          clearTimeout(timeout);
          onProgress?.(100);
          resolve(url);
        } catch (error: any) {
          clearTimeout(timeout);
          console.error('[Firebase Storage getDownloadURL Error]: Code:', error?.code, 'Message:', error?.message, error);
          reject(error);
        }
      }
    );
  });
}

export async function uploadChatMedia({
  fileOrBlob,
  fileName,
  onProgress,
  conversationKey,
}: {
  chatId: string;
  messageId: string;
  fileOrBlob: Blob | File;
  fileName?: string;
  dataUrlFallback?: string;
  onProgress?: (percent: number) => void;
  conversationKey?: CryptoKey | null;
}): Promise<{ downloadUrl: string; mediaIv?: string }> {
  validateMediaUpload(fileOrBlob);

  const inferredFileName = fileName || (fileOrBlob as File).name || 'file.pdf';
  let inferredFileType = fileOrBlob.type;
  if (!inferredFileType || inferredFileType === 'application/octet-stream') {
    if (inferredFileName.toLowerCase().endsWith('.pdf')) {
      inferredFileType = 'application/pdf';
    } else {
      inferredFileType = 'application/octet-stream';
    }
  }

  if (conversationKey) {
    // Encryption
    const encrypted = await encryptBlobData(fileOrBlob, conversationKey);
    if (!encrypted) throw new Error('Could not encrypt the attachment.');
    const downloadUrl = await storeMedia(
      encrypted.encryptedBlob,
      onProgress,
      inferredFileName,
      inferredFileType
    );
    return { downloadUrl, mediaIv: encrypted.ivB64 };
  }

  const downloadUrl = await storeMedia(fileOrBlob, onProgress, inferredFileName, inferredFileType);
  return { downloadUrl };
}

export async function uploadVoiceNote({
  audioBlob,
  onProgress,
  conversationKey,
  chatId,
  messageId,
}: {
  chatId: string;
  messageId: string;
  audioBlob: Blob;
  dataUrlFallback?: string;
  onProgress?: (percent: number) => void;
  conversationKey?: CryptoKey | null;
}): Promise<{ downloadUrl: string; mediaIv?: string }> {
  let compressed = audioBlob;
  try {
    compressed = await compressAudio(audioBlob);
  } catch {
    /* The bounded original is still usable. */
  }
  return uploadChatMedia({
    chatId,
    messageId,
    fileOrBlob: compressed,
    fileName: 'voice_note.webm',
    onProgress,
    conversationKey,
  });
}

/**
 * Test Firebase Storage PDF upload with comprehensive error handling,
 * explicit application/pdf content type metadata, and exact error code logging.
 */
export async function testFirebasePdfUpload(
  pdfFileOrBlob: Blob | File,
  onToastMessage?: (msg: string) => void,
  onProgress?: (percent: number) => void
): Promise<string | null> {
  try {
    console.log('[Test PDF Upload] Starting test upload for PDF file size:', pdfFileOrBlob.size);
    const downloadUrl = await storeMedia(
      pdfFileOrBlob,
      (p) => {
        console.log(`[Test PDF Upload] Progress: ${p}%`);
        onProgress?.(p);
      },
      (pdfFileOrBlob as File).name || 'test_document.pdf',
      'application/pdf'
    );
    console.log('[Test PDF Upload] Success! Download URL:', downloadUrl);
    onToastMessage?.('PDF upload test succeeded!');
    return downloadUrl;
  } catch (err: any) {
    const errCode = err?.code || 'unknown/error';
    const errMessage = err?.message || 'Unknown upload failure';
    console.error(`[Test PDF Upload FAILED] Code: ${errCode} | Message: ${errMessage}`, err);
    onToastMessage?.(`PDF upload failed: ${errCode}`);
    return null;
  }
}

