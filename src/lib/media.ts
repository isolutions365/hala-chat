import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { getFirebaseStorage, getFirebaseAuth, ensureAuthUser } from './firebase';
import { validateMediaUpload } from './mediaPolicy';
import { encryptBlobData } from './crypto';
import { compressAudio } from './audioCompression';
import { isFirebaseStorageQuotaError } from './safeStorage';

export { compressImage } from './imageCompression';

// Files are stored under chat-scoped paths /chats/{chatId}/{mediaType}/{assetId} when in chat,
// or legacy /media/{uid}/{assetId} for non-chat contexts (story/social).
async function storeMedia(
  blob: Blob,
  onProgress?: (percent: number) => void,
  originalFileName?: string,
  originalFileType?: string,
  chatScoped?: { chatId: string; mediaType: 'voice' | 'images' | 'documents' | 'PDFs' | 'attachments' }
): Promise<string> {
  const isDebug = typeof window !== 'undefined' && window.location.search.includes('debug=1');
  const tUploadStart = performance.now();

  const authUser = await ensureAuthUser();
  const uid = authUser?.uid || getFirebaseAuth().currentUser?.uid;
  if (!uid) throw new Error('Please sign in before uploading.');
  validateMediaUpload(blob);

  // Set explicit contentType metadata (application/pdf, image/jpeg, etc.)
  const inferredType = originalFileType || blob.type || 'application/pdf';
  const customMetadata: Record<string, string> = {
    originalName: originalFileName || '',
    uploaderUid: uid,
  };

  const metadata = {
    contentType: inferredType,
    customMetadata,
  };

  const isRealChat = Boolean(
    chatScoped?.chatId &&
    !chatScoped.chatId.startsWith('story_') &&
    chatScoped.chatId !== 'social-feed' &&
    chatScoped.chatId !== 'channels_avatar_upload'
  );

  const assetId = crypto.randomUUID();
  const storagePath = isRealChat
    ? `chats/${chatScoped!.chatId}/${chatScoped!.mediaType}/${assetId}`
    : `media/${uid}/${assetId}`;

  const target = ref(getFirebaseStorage(), storagePath);

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
        if (isDebug) {
          console.warn(`[Debug Upload] stage: upload FAILED in ${(performance.now() - tUploadStart).toFixed(2)}ms | Code: ${error?.code}`);
        }
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
        const tUploadEnd = performance.now();
        if (isDebug) {
          console.log(`[Debug Upload] stage: upload completed in ${(tUploadEnd - tUploadStart).toFixed(2)}ms`);
        }
        const tGetUrlStart = performance.now();
        try {
          const url = await getDownloadURL(task.snapshot.ref);
          clearTimeout(timeout);
          const tGetUrlEnd = performance.now();
          if (isDebug) {
            console.log(`[Debug Upload] stage: getDownloadURL completed in ${(tGetUrlEnd - tGetUrlStart).toFixed(2)}ms`);
          }
          onProgress?.(100);
          resolve(url);
        } catch (error: any) {
          clearTimeout(timeout);
          if (isDebug) {
            console.warn(`[Debug Upload] stage: getDownloadURL FAILED in ${(performance.now() - tGetUrlStart).toFixed(2)}ms | Code: ${error?.code}`);
          }
          console.error('[Firebase Storage getDownloadURL Error]: Code:', error?.code, 'Message:', error?.message, error);
          reject(error);
        }
      }
    );
  });
}

export async function uploadChatMedia({
  chatId,
  messageId,
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
  const isDebug = typeof window !== 'undefined' && window.location.search.includes('debug=1');
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

  // Stage: compress
  let blobToUpload = fileOrBlob;
  const isAudio = 
    fileOrBlob.type.startsWith('audio/') || 
    inferredFileName.endsWith('.webm') || 
    inferredFileName.endsWith('.m4a') || 
    inferredFileName.endsWith('.ogg') || 
    inferredFileName.endsWith('.opus') || 
    inferredFileName.endsWith('.wav');

  const tCompressStart = performance.now();
  if (isAudio) {
    try {
      blobToUpload = await compressAudio(fileOrBlob);
      const tCompressEnd = performance.now();
      if (isDebug) {
        if (blobToUpload === fileOrBlob) {
          console.log(`[Debug Upload] stage: compress bypassed in ${(tCompressEnd - tCompressStart).toFixed(2)}ms (Size: ${fileOrBlob.size} bytes)`);
        } else {
          console.log(`[Debug Upload] stage: compress completed in ${(tCompressEnd - tCompressStart).toFixed(2)}ms (Size: ${fileOrBlob.size} -> ${blobToUpload.size} bytes)`);
        }
      }
    } catch (compressErr) {
      if (isDebug) {
        console.log(`[Debug Upload] stage: compress failed in ${(performance.now() - tCompressStart).toFixed(2)}ms`);
      }
    }
  } else if (isDebug) {
    console.log(`[Debug Upload] stage: compress skipped (not audio) in 0.00ms`);
  }

  if (!conversationKey) {
    throw new Error('Secure conversation key is not ready. Attachment was not uploaded. Reopen the chat and try again.');
  }

  // Stage: encrypt
  const tEncryptStart = performance.now();
  const encrypted = await encryptBlobData(blobToUpload, conversationKey);
  const tEncryptEnd = performance.now();
  if (isDebug) {
    console.log(`[Debug Upload] stage: encrypt completed in ${(tEncryptEnd - tEncryptStart).toFixed(2)}ms`);
  }

  if (!encrypted?.ivB64 || !encrypted.encryptedBlob) {
    throw new Error('Could not encrypt the attachment. Nothing was uploaded.');
  }

  // Determine mediaType category for chat-scoped storage
  let mediaCategory: 'voice' | 'images' | 'documents' | 'PDFs' | 'attachments' = 'attachments';
  if (isAudio) {
    mediaCategory = 'voice';
  } else if (inferredFileType.startsWith('image/')) {
    mediaCategory = 'images';
  } else if (inferredFileType === 'application/pdf' || inferredFileName.toLowerCase().endsWith('.pdf')) {
    mediaCategory = 'PDFs';
  } else if (
    inferredFileType.startsWith('text/') ||
    inferredFileType.includes('document') ||
    inferredFileType.includes('word') ||
    inferredFileType.includes('sheet')
  ) {
    mediaCategory = 'documents';
  }

  const downloadUrl = await storeMedia(
    encrypted.encryptedBlob,
    onProgress,
    inferredFileName,
    'application/octet-stream',
    { chatId, mediaType: mediaCategory }
  );
  return { downloadUrl, mediaIv: encrypted.ivB64 };
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

