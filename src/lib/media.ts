import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { getFirebaseStorage, getFirebaseAuth, ensureAuthUser } from './firebase.ts';
import { validateMediaUpload, normalizeBaseMimeType, MAX_MEDIA_BYTES } from './mediaPolicy.ts';
import { encryptBlobData } from './crypto.ts';
import { compressAudio } from './audioCompression.ts';
import { isFirebaseStorageQuotaError } from './safeStorage.ts';
import { randomUUID } from './uuid.ts';

export { compressImage } from './imageCompression.ts';

function isNonRetryableUploadError(err: any): boolean {
  const code = String(err?.code || '');
  const message = String(err?.message || '');
  if (isFirebaseStorageQuotaError(err)) return true;
  if (
    code === 'storage/unauthorized' ||
    code === 'storage/unauthenticated' ||
    code === 'storage/invalid-argument' ||
    code === 'storage/invalid-checksum' ||
    code === 'storage/project-not-found' ||
    code === 'storage/bucket-not-found'
  ) {
    return true;
  }
  if (
    message.includes('This file format is not supported') ||
    message.includes('Choose a non-empty file up to 20 MB') ||
    message.includes('Secure conversation key is not ready')
  ) {
    return true;
  }
  return false;
}

// Files are stored under /media/{uid}/{assetId} (matching storage.rules)
async function storeMedia(
  blob: Blob,
  onProgress?: (percent: number) => void,
  originalFileName?: string,
  originalFileType?: string,
  chatScoped?: { chatId: string; mediaType: 'voice' | 'images' | 'documents' | 'PDFs' | 'attachments' }
): Promise<string> {
  const tUploadStart = performance.now();

  const authUser = await ensureAuthUser();
  const uid = authUser?.uid || getFirebaseAuth().currentUser?.uid;
  if (!uid) {
    console.error('[Media Upload][Auth Error] Cannot upload media: user is not authenticated.');
    throw new Error('Please sign in before uploading.');
  }
  validateMediaUpload(blob);

  // Set explicit contentType metadata (application/octet-stream for encrypted chat media, base MIME for stories)
  const inferredType = normalizeBaseMimeType(originalFileType || blob.type) || 'application/octet-stream';
  const customMetadata: Record<string, string> = {
    originalName: originalFileName || '',
    uploaderUid: uid,
    ...(chatScoped ? { chatId: chatScoped.chatId, mediaCategory: chatScoped.mediaType } : {}),
  };

  const metadata = {
    contentType: inferredType,
    customMetadata,
  };

  const assetId = randomUUID();
  const storagePath = `media/${uid}/${assetId}`;

  const storage = getFirebaseStorage();
  const target = ref(storage, storagePath);

  console.log('[Media Upload][Storage Start]', {
    storagePath,
    fullPath: target.fullPath,
    bucket: target.bucket,
    uid,
    chatId: chatScoped?.chatId || null,
    mediaCategory: chatScoped?.mediaType || null,
    originalFileName: originalFileName || '',
    contentType: inferredType,
    blobType: blob.type || '',
    fileSizeBytes: blob.size,
    fileSizeMB: Number((blob.size / (1024 * 1024)).toFixed(3)),
  });

  return new Promise((resolve, reject) => {
    const task = uploadBytesResumable(target, blob, metadata);

    // 180s timeout for large uploads (up to 20MB)
    const timeout = setTimeout(() => {
      task.cancel();
      const err: any = new Error('Upload timed out (3 min limit). Please retry.');
      err.code = 'storage/canceled';
      console.error('[Media Upload][Storage Timeout]', {
        storagePath,
        fullPath: target.fullPath,
        fileSizeBytes: blob.size,
        contentType: inferredType,
        elapsedMs: Math.round(performance.now() - tUploadStart),
      });
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
        const errorDetails = {
          storagePath,
          fullPath: target.fullPath,
          bucket: target.bucket,
          uid,
          chatId: chatScoped?.chatId || null,
          originalFileName: originalFileName || '',
          contentType: inferredType,
          fileSizeBytes: blob.size,
          fileSizeMB: Number((blob.size / (1024 * 1024)).toFixed(3)),
          elapsedMs: Math.round(performance.now() - tUploadStart),
          errorCode: error?.code || 'unknown',
          errorMessage: error?.message || String(error),
          serverResponse: error?.customData?.serverResponse || error?.serverResponse || null,
        };
        if (isFirebaseStorageQuotaError(error)) {
          console.error('[Media Upload][Storage Quota Exceeded]', errorDetails, error);
          const quotaErr: any = new Error('Storage quota exceeded. Please free up space or contact support.');
          quotaErr.code = 'storage/quota-exceeded';
          reject(quotaErr);
        } else {
          console.error('[Media Upload][Storage Error]', errorDetails, error);
          reject(error);
        }
      },
      async () => {
        const tUploadEnd = performance.now();
        console.log('[Media Upload][Storage Uploaded]', {
          storagePath,
          fullPath: target.fullPath,
          fileSizeBytes: blob.size,
          elapsedMs: Math.round(tUploadEnd - tUploadStart),
        });
        const tGetUrlStart = performance.now();
        try {
          const url = await getDownloadURL(task.snapshot.ref);
          clearTimeout(timeout);
          console.log('[Media Upload][Storage DownloadURL Ready]', {
            storagePath,
            fullPath: target.fullPath,
            fileSizeBytes: blob.size,
            getUrlMs: Math.round(performance.now() - tGetUrlStart),
            totalMs: Math.round(performance.now() - tUploadStart),
          });
          onProgress?.(100);
          resolve(url);
        } catch (error: any) {
          clearTimeout(timeout);
          console.error('[Media Upload][Storage getDownloadURL Error]', {
            storagePath,
            fullPath: target.fullPath,
            fileSizeBytes: blob.size,
            elapsedMs: Math.round(performance.now() - tGetUrlStart),
            errorCode: error?.code || 'unknown',
            errorMessage: error?.message || String(error),
            serverResponse: error?.customData?.serverResponse || error?.serverResponse || null,
          }, error);
          reject(error);
        }
      }
    );
  });
}

// Robust WhatsApp/Telegram style automatic retry wrapper for media uploads right after login / network reconnect
async function storeMediaWithRetry(
  blob: Blob,
  onProgress?: (percent: number) => void,
  originalFileName?: string,
  originalFileType?: string,
  chatScoped?: { chatId: string; mediaType: 'voice' | 'images' | 'documents' | 'PDFs' | 'attachments' },
  retries = 3
): Promise<string> {
  let lastErr: any;
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      let authUser = await ensureAuthUser();
      if (!authUser && getFirebaseAuth().currentUser) {
        authUser = getFirebaseAuth().currentUser;
      }
      if (!authUser) {
        for (let waitAttempt = 0; waitAttempt < 10; waitAttempt++) {
          if (getFirebaseAuth().currentUser) {
            authUser = getFirebaseAuth().currentUser;
            break;
          }
          await new Promise(r => setTimeout(r, 300));
        }
      }

      const uid = authUser?.uid || getFirebaseAuth().currentUser?.uid;
      if (!uid) throw new Error('Please sign in before uploading.');

      try {
        await getFirebaseAuth().currentUser?.getIdToken(true);
      } catch {}

      return await storeMedia(blob, onProgress, originalFileName, originalFileType, chatScoped);
    } catch (err: any) {
      lastErr = err;
      const nonRetryable = isNonRetryableUploadError(err);
      console.error('[Media Upload][Attempt Failed]', {
        attempt: attempt + 1,
        maxRetries: retries,
        nonRetryable,
        originalFileName: originalFileName || '',
        fileSizeBytes: blob.size,
        contentType: originalFileType || blob.type || '',
        errorCode: err?.code || 'unknown',
        errorMessage: err?.message || String(err),
      });
      if (nonRetryable || attempt === retries - 1) {
        throw err;
      }
      await new Promise(r => setTimeout(r, (attempt + 1) * 2000));
    }
  }
  throw lastErr;
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
  const rawMimeType = fileOrBlob.type || '';
  const baseMimeType = normalizeBaseMimeType(rawMimeType);

  console.log('[Media Upload][Chat Media Start]', {
    chatId,
    messageId,
    fileName: fileName || (fileOrBlob as File).name || '',
    rawMimeType,
    baseMimeType,
    fileSizeBytes: fileOrBlob.size,
    fileSizeMB: Number((fileOrBlob.size / (1024 * 1024)).toFixed(3)),
    hasConversationKey: Boolean(conversationKey),
  });

  validateMediaUpload(fileOrBlob);

  let blobToUpload = fileOrBlob;
  const mimeSubtype = baseMimeType.split('/')[1] || '';
  const inferredFileName =
    fileName ||
    (fileOrBlob as File).name ||
    (baseMimeType.startsWith('image/')
      ? `image_${Date.now()}.${mimeSubtype.replace('jpeg', 'jpg') || 'jpg'}`
      : baseMimeType.startsWith('video/')
      ? `video_${Date.now()}.${mimeSubtype.replace('quicktime', 'mov').replace('x-matroska', 'mkv').replace('x-m4v', 'm4v') || 'mp4'}`
      : baseMimeType.startsWith('audio/')
      ? `voice_${Date.now()}.webm`
      : 'file.pdf');

  let inferredFileType = baseMimeType;
  if (!inferredFileType || inferredFileType === 'application/octet-stream') {
    const ext = inferredFileName.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'pdf': inferredFileType = 'application/pdf'; break;
      case 'jpg':
      case 'jpeg': inferredFileType = 'image/jpeg'; break;
      case 'png': inferredFileType = 'image/png'; break;
      case 'webp': inferredFileType = 'image/webp'; break;
      case 'gif': inferredFileType = 'image/gif'; break;
      case 'mp4': inferredFileType = 'video/mp4'; break;
      case 'webm':
        inferredFileType = inferredFileName.toLowerCase().startsWith('video') ? 'video/webm' : 'audio/webm';
        break;
      case 'mov': inferredFileType = 'video/quicktime'; break;
      case '3gp': inferredFileType = 'video/3gpp'; break;
      case 'm4v': inferredFileType = 'video/x-m4v'; break;
      case 'mkv': inferredFileType = 'video/x-matroska'; break;
      case 'avi': inferredFileType = 'video/x-msvideo'; break;
      case 'mp3': inferredFileType = 'audio/mpeg'; break;
      case 'wav': inferredFileType = 'audio/wav'; break;
      case 'm4a': inferredFileType = 'audio/mp4'; break;
      case 'ogg': inferredFileType = 'audio/ogg'; break;
      case 'docx': inferredFileType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'; break;
      case 'xlsx': inferredFileType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'; break;
      case 'pptx': inferredFileType = 'application/vnd.openxmlformats-officedocument.presentationml.presentation'; break;
      case 'zip': inferredFileType = 'application/zip'; break;
      default: inferredFileType = 'application/octet-stream'; break;
    }
  }

  // Stage: compress (ONLY for genuine audio files — never run audio compression on video/* or video_note_*.webm!)
  const lowerName = inferredFileName.toLowerCase();
  const isVideo =
    inferredFileType.startsWith('video/') ||
    lowerName.startsWith('video_') ||
    /\.(mp4|mov|m4v|3gp|3g2|mkv|avi)$/i.test(lowerName);

  const isAudio =
    !isVideo &&
    (inferredFileType.startsWith('audio/') ||
      lowerName.endsWith('.webm') ||
      lowerName.endsWith('.m4a') ||
      lowerName.endsWith('.ogg') ||
      lowerName.endsWith('.opus') ||
      lowerName.endsWith('.wav'));

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
    } catch {
      if (isDebug) {
        console.log(`[Debug Upload] stage: compress failed in ${(performance.now() - tCompressStart).toFixed(2)}ms`);
      }
    }
  }

  if (!conversationKey) {
    console.error('[Media Upload][E2EE Error] Missing conversationKey before upload', { chatId, messageId, inferredFileName });
    throw new Error('Secure conversation key is not ready. Attachment was not uploaded. Reopen the chat and try again.');
  }

  // Stage: encrypt
  const tEncryptStart = performance.now();
  const encrypted = await encryptBlobData(blobToUpload, conversationKey);
  const tEncryptEnd = performance.now();

  if (!encrypted?.ivB64 || !encrypted.encryptedBlob) {
    console.error('[Media Upload][E2EE Error] Encryption produced empty result', { chatId, messageId, inferredFileName });
    throw new Error('Could not encrypt the attachment. Nothing was uploaded.');
  }

  if (encrypted.encryptedBlob.size > MAX_MEDIA_BYTES) {
    console.error('[Media Upload][Size Error] Encrypted media exceeds 20 MB storage limit', {
      chatId,
      messageId,
      inferredFileName,
      plaintextBytes: blobToUpload.size,
      encryptedBytes: encrypted.encryptedBlob.size,
      maxBytes: MAX_MEDIA_BYTES,
    });
    throw new Error('Choose a non-empty file up to 20 MB.');
  }

  // Determine mediaType category for chat-scoped storage metadata
  let mediaCategory: 'voice' | 'images' | 'documents' | 'PDFs' | 'attachments' = 'attachments';
  if (isAudio) {
    mediaCategory = 'voice';
  } else if (inferredFileType.startsWith('image/')) {
    mediaCategory = 'images';
  } else if (inferredFileType === 'application/pdf' || lowerName.endsWith('.pdf')) {
    mediaCategory = 'PDFs';
  } else if (
    inferredFileType.startsWith('text/') ||
    inferredFileType.includes('document') ||
    inferredFileType.includes('word') ||
    inferredFileType.includes('sheet')
  ) {
    mediaCategory = 'documents';
  }

  console.log('[Media Upload][Encrypted Ready]', {
    chatId,
    messageId,
    inferredFileName,
    inferredFileType,
    isVideo,
    isAudio,
    mediaCategory,
    plaintextBytes: blobToUpload.size,
    encryptedBytes: encrypted.encryptedBlob.size,
    encryptMs: Math.round(tEncryptEnd - tEncryptStart),
  });

  const downloadUrl = await storeMediaWithRetry(
    encrypted.encryptedBlob,
    onProgress,
    inferredFileName,
    'application/octet-stream',
    { chatId, mediaType: mediaCategory }
  );
  return { downloadUrl, mediaIv: encrypted.ivB64 };
}

export async function uploadStoryMedia({
  fileOrBlob,
  onProgress,
}: {
  fileOrBlob: Blob | File;
  onProgress?: (percent: number) => void;
}): Promise<{ downloadUrl: string }> {
  validateMediaUpload(fileOrBlob);

  const rawName = (fileOrBlob as File).name || '';
  let realContentType = normalizeBaseMimeType(fileOrBlob.type);
  if (!realContentType || realContentType === 'application/octet-stream') {
    const ext = rawName.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'jpg':
      case 'jpeg': realContentType = 'image/jpeg'; break;
      case 'png': realContentType = 'image/png'; break;
      case 'webp': realContentType = 'image/webp'; break;
      case 'gif': realContentType = 'image/gif'; break;
      case 'mp4': realContentType = 'video/mp4'; break;
      case 'webm': realContentType = 'video/webm'; break;
      case 'mov': realContentType = 'video/quicktime'; break;
      default: break;
    }
  }

  if (!realContentType || realContentType === 'application/octet-stream') {
    throw new Error('Unsupported story media format. Supported formats: JPEG, PNG, WebP, GIF, MP4, WebM, MOV.');
  }

  const extFromMime =
    realContentType.split('/')[1]?.replace('jpeg', 'jpg').replace('quicktime', 'mov') || 'bin';
  const inferredFileName =
    rawName ||
    (realContentType.startsWith('video/')
      ? `story_video_${Date.now()}.${extFromMime}`
      : `story_image_${Date.now()}.${extFromMime}`);

  const downloadUrl = await storeMediaWithRetry(
    fileOrBlob,
    onProgress,
    inferredFileName,
    realContentType
  );
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

export async function testFirebasePdfUpload(
  pdfFileOrBlob: Blob | File,
  onToastMessage?: (msg: string) => void,
  onProgress?: (percent: number) => void
): Promise<string | null> {
  try {
    console.log('[Test PDF Upload] Starting test upload for PDF file size:', pdfFileOrBlob.size);
    const downloadUrl = await storeMediaWithRetry(
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
