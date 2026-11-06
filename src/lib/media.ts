import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { getFirebaseStorage, getFirebaseAuth, ensureAuthUser } from './firebase';
import { validateMediaUpload } from './mediaPolicy';
import { encryptBlobData } from './crypto';
import { compressAudio } from './audioCompression';
import { isFirebaseStorageQuotaError } from './safeStorage';

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
        if (isFirebaseStorageQuotaError(error)) {
          console.error('[Firebase Storage Upload Error]: Storage quota exceeded.', error);
          const quotaErr: any = new Error('Storage quota exceeded. Please free up space or contact support.');
          quotaErr.code = 'storage/quota-exceeded';
          reject(quotaErr);
        } else {
          console.error('[Firebase Storage Upload Error]: Code:', error?.code, 'Message:', error?.message, error);
          reject(error);
        }
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

  if (!conversationKey) {
    throw new Error('Secure conversation key is not ready. Attachment was not uploaded. Reopen the chat and try again.');
  }

  // Chat attachments are always encrypted before leaving the device.
  // Voice-note diagnostics are opt-in via ?debug=1 and never include audio or key material.
  const isVoiceNote = inferredFileName.startsWith('voice_note_');
  const diagnosticsEnabled = isVoiceNote && typeof window !== 'undefined' && window.location.search.includes('debug=1');
  const encryptionStartedAt = performance.now();
  const encrypted = await encryptBlobData(fileOrBlob, conversationKey);
  const encryptionMs = Math.round(performance.now() - encryptionStartedAt);
  if (!encrypted?.ivB64 || !encrypted.encryptedBlob) {
    throw new Error('Could not encrypt the attachment. Nothing was uploaded.');
  }
  const uploadStartedAt = performance.now();
  try {
    const downloadUrl = await storeMedia(
      encrypted.encryptedBlob,
      onProgress,
      inferredFileName,
      'application/octet-stream'
    );
    if (diagnosticsEnabled) {
      console.info('[Voice diagnostics] Sender stages', {
        mimeType: fileOrBlob.type || 'unknown',
        originalBytes: fileOrBlob.size,
        encryptedBytes: encrypted.encryptedBlob.size,
        encryptionMs,
        uploadAndUrlMs: Math.round(performance.now() - uploadStartedAt),
      });
    }
    return { downloadUrl, mediaIv: encrypted.ivB64 };
  } catch (error: any) {
    if (diagnosticsEnabled) {
      console.warn('[Voice diagnostics] Sender upload failed', {
        mimeType: fileOrBlob.type || 'unknown',
        originalBytes: fileOrBlob.size,
        encryptedBytes: encrypted.encryptedBlob.size,
        encryptionMs,
        uploadMs: Math.round(performance.now() - uploadStartedAt),
        errorCode: typeof error?.code === 'string' ? error.code : 'unknown',
        errorName: typeof error?.name === 'string' ? error.name : 'Error',
      });
    }
    throw error;
  }
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
  const rawType = audioBlob.type || 'audio/webm';
  const ext = rawType.includes('wav') ? 'wav' : rawType.includes('mp4') || rawType.includes('m4a') ? 'm4a' : rawType.includes('ogg') ? 'ogg' : 'webm';
  const fileName = `voice_note_${Date.now()}.${ext}`;

  return uploadChatMedia({
    chatId,
    messageId,
    fileOrBlob: audioBlob,
    fileName,
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

