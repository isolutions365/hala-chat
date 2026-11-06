import { useState, useEffect, useRef } from 'react';
import { MessageModel } from '../types';
import { decryptBlobData } from '../lib/crypto';
import { getFirebaseStorage, getBytes, ref as storageRef, isFirebaseStorageUrl } from '../lib/firebase';
import { isFirebaseStorageNonRetryableError } from '../lib/safeStorage';

function getStoragePathFromUrl(url: string): string | null {
  try {
    const match = url.match(/\/o\/([^?#]+)/);
    if (match && match[1]) {
      return decodeURIComponent(match[1]);
    }
  } catch {}
  return null;
}

function sniffMimeType(buffer: ArrayBuffer, fallbackType: string): string {
  if (buffer.byteLength >= 4) {
    const view = new DataView(buffer);
    const magic = view.getUint32(0, false);
    // EBML / WebM: 0x1A45DFA3
    if (magic === 0x1A45DFA3) {
      return fallbackType.startsWith('video/') ? 'video/webm' : 'audio/webm';
    }
    // OggS: 0x4F676753
    if (magic === 0x4F676753) {
      return 'audio/ogg';
    }
    // RIFF: 0x52494646
    if (magic === 0x52494646) {
      return 'audio/wav';
    }
    // ftyp (ISOBMFF / MP4 / M4A): 'ftyp' at offset 4
    if (buffer.byteLength >= 8 && view.getUint32(4, false) === 0x66747970) {
      return fallbackType.startsWith('video/') ? 'video/mp4' : 'audio/mp4';
    }
    // JPEG: 0xFFD8FF
    if ((magic & 0xFFFFFF00) === 0xFFD8FF00) {
      return 'image/jpeg';
    }
    // PNG: 0x89504E47
    if (magic === 0x89504E47) {
      return 'image/png';
    }
  }
  return fallbackType;
}

export function useDecryptedMedia(
  messages: MessageModel[],
  conversationKey: CryptoKey | null,
  activeChatId: string
) {
  const [decryptedMediaUrls, setDecryptedMediaUrls] = useState<Record<string, string>>({});
  const [mediaStatuses, setMediaStatuses] = useState<Record<string, 'idle' | 'loading' | 'ready' | 'error'>>({});

  const inFlightMediaRef = useRef<Map<string, Promise<void>>>(new Map());
  const blobUrlCacheRef = useRef<Map<string, string>>(new Map());
  const activeChatIdRef = useRef<string>(activeChatId);
  const isDebug = typeof window !== 'undefined' && window.location.search.includes('debug=1');

  useEffect(() => {
    activeChatIdRef.current = activeChatId;
  }, [activeChatId]);

  // Cleanup Blob URLs and reset state on unmount or chat change
  useEffect(() => {
    const currentCache = blobUrlCacheRef.current;
    return () => {
      currentCache.forEach(url => URL.revokeObjectURL(url));
      currentCache.clear();
      inFlightMediaRef.current.clear();
      setDecryptedMediaUrls({});
      setMediaStatuses({});
    };
  }, [activeChatId]);

  // Immediately handle unencrypted media/audio messages (no mediaIv) so they never get stuck loading
  useEffect(() => {
    if (messages.length === 0) return;

    const unencryptedUpdates: Record<string, string> = {};
    const statusUpdates: Record<string, 'ready'> = {};
    let hasUpdates = false;

    for (const msg of messages) {
      if ((msg.type === 'voice' || msg.type === 'image' || msg.type === 'video' || msg.type === 'file') &&
          msg.content && !msg.mediaIv && !decryptedMediaUrls[msg.id]) {
        const isLocalUrl = msg.content.startsWith('blob:') || msg.content.startsWith('data:');
        if (isLocalUrl) {
          unencryptedUpdates[msg.id] = msg.content;
          statusUpdates[msg.id] = 'ready';
          hasUpdates = true;
        }
      }
    }

    if (hasUpdates) {
      setDecryptedMediaUrls(prev => ({ ...prev, ...unencryptedUpdates }));
      setMediaStatuses(prev => ({ ...prev, ...statusUpdates }));
    }
  }, [messages, decryptedMediaUrls]);

  const processMediaMessage = async (msg: MessageModel, retryCount = 0) => {
    if (!msg.content) return;
    if (activeChatIdRef.current !== msg.chatId) return;
    if (inFlightMediaRef.current.has(msg.id)) {
      return inFlightMediaRef.current.get(msg.id);
    }
    if (decryptedMediaUrls[msg.id]) return;

    // If message is not encrypted and is already a local blob/data URL, it is ready immediately
    if (!msg.mediaIv) {
      const isLocalUrl = msg.content.startsWith('blob:') || msg.content.startsWith('data:');
      if (isLocalUrl) {
        setDecryptedMediaUrls(prev => ({ ...prev, [msg.id]: msg.content }));
        setMediaStatuses(prev => ({ ...prev, [msg.id]: 'ready' }));
        return;
      }
    }

    if (msg.mediaIv && !conversationKey) return;

    const start = performance.now();

    const runDownload = async () => {
      let diagnosticStage: 'download' | 'decrypt' | 'complete' = 'download';
      let downloadedBytes = 0;
      try {
        setMediaStatuses(prev => ({ ...prev, [msg.id]: 'loading' }));

        let arrayBuffer: ArrayBuffer | null = null;
        if (msg.content.startsWith('data:')) {
          const base64Data = msg.content.split(',')[1] || msg.content;
          const binaryString = window.atob(base64Data);
          const bytes = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
          arrayBuffer = bytes.buffer;
        } else if (msg.content.startsWith('blob:')) {
          const res = await fetch(msg.content);
          arrayBuffer = await res.arrayBuffer();
        } else if (msg.content.startsWith('gs://')) {
          const storageReference = storageRef(getFirebaseStorage(), msg.content);
          arrayBuffer = await getBytes(storageReference);
        } else {
          // Authenticated Firebase Storage SDK reads avoid CORS and the slow
          // development-only proxy path. Encrypted voice media must be fetched
          // completely before it can be decrypted.
          const storagePath = getStoragePathFromUrl(msg.content);
          if (storagePath) {
            try {
              const storageReference = storageRef(getFirebaseStorage(), storagePath);
              arrayBuffer = await getBytes(storageReference);
            } catch (storageReadError) {
              if (isDebug) console.warn('[Media] Storage SDK read failed; trying token URL.', storageReadError);
            }
          }

          // Tokenized download URL fallback for legacy objects or rule variations.
          if (!arrayBuffer) {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 12000);
            try {
              const res = await fetch(msg.content, { signal: controller.signal });
              if (res.ok) arrayBuffer = await res.arrayBuffer();
            } finally {
              clearTimeout(timeoutId);
            }
          }

          // This Vite middleware exists only in local dev/preview, not Vercel production.
          if (!arrayBuffer && import.meta.env.DEV) {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 6000);
            try {
              const proxyUrl = `/api/media-proxy?url=${encodeURIComponent(msg.content)}`;
              const proxyRes = await fetch(proxyUrl, { signal: controller.signal });
              if (proxyRes.ok) arrayBuffer = await proxyRes.arrayBuffer();
            } finally {
              clearTimeout(timeoutId);
            }
          }
        }

        if (!arrayBuffer) {
          throw new Error('Unable to retrieve audio/media bytes');
        }

        downloadedBytes = arrayBuffer.byteLength;
        if (activeChatIdRef.current !== msg.chatId) return;

        diagnosticStage = 'decrypt';
        const downloadAndSetupMs = Math.round(performance.now() - start);
        const defaultFallback = msg.fileType || 
          (msg.type === 'video' ? 'video/mp4' : 
           msg.type === 'voice' ? 'audio/webm' : 
           msg.type === 'image' ? 'image/jpeg' : 
           'application/octet-stream');

        let resultUrl = '';
        if (msg.mediaIv) {
          resultUrl = await decryptBlobData(arrayBuffer, msg.mediaIv, defaultFallback, conversationKey) || '';
        } else {
          const sniffedType = msg.fileType || sniffMimeType(arrayBuffer, defaultFallback);
          const blob = new Blob([arrayBuffer], { type: sniffedType });
          resultUrl = URL.createObjectURL(blob);
        }

        diagnosticStage = 'complete';
        if (isDebug && msg.type === 'voice') {
          console.info('[Voice diagnostics] Receiver stages', {
            downloadedBytes,
            downloadAndSetupMs,
            totalMs: Math.round(performance.now() - start),
            encrypted: Boolean(msg.mediaIv),
            ivPresent: Boolean(msg.mediaIv),
          });
        }

        if (resultUrl && activeChatIdRef.current === msg.chatId) {
          blobUrlCacheRef.current.set(msg.id, resultUrl);
          setDecryptedMediaUrls(prev => ({ ...prev, [msg.id]: resultUrl }));
          setMediaStatuses(prev => ({ ...prev, [msg.id]: 'ready' }));
          if (isDebug) console.log(`[Debug] Media ready in ${performance.now() - start}ms: ${msg.id}`);
        } else if (resultUrl) {
          URL.revokeObjectURL(resultUrl);
        } else {
          throw new Error('Decryption returned null');
        }
      } catch (err: any) {
        if (isDebug && msg.type === 'voice') {
          console.warn('[Voice diagnostics] Receiver failed', {
            stage: diagnosticStage,
            downloadedBytes,
            elapsedMs: Math.round(performance.now() - start),
            errorCode: typeof err?.code === 'string' ? err.code : 'unknown',
            errorName: typeof err?.name === 'string' ? err.name : 'Error',
            errorMessage: typeof err?.message === 'string' ? err.message.slice(0, 160) : 'Unknown error',
          });
        }
        console.error(`[Media Error] ${msg.id}:`, err);
        const isNonRetryable = isFirebaseStorageNonRetryableError(err);
        if (!isNonRetryable && retryCount < 2 && activeChatIdRef.current === msg.chatId) {
          const delay = retryCount === 0 ? 1000 : 2500;
          setTimeout(() => {
            inFlightMediaRef.current.delete(msg.id);
            processMediaMessage(msg, retryCount + 1);
          }, delay);
        } else {
          setMediaStatuses(prev => ({ ...prev, [msg.id]: 'error' }));
        }
      } finally {
        inFlightMediaRef.current.delete(msg.id);
      }
    };

    const promise = runDownload();
    inFlightMediaRef.current.set(msg.id, promise);
    return promise;
  };

  useEffect(() => {
    if (messages.length === 0) return;

    try {
      const mediaMsgs = messages.filter(m => 
        (m.type === 'voice' || m.type === 'image' || m.type === 'video' || m.type === 'file') &&
        m.content && !decryptedMediaUrls[m.id] && mediaStatuses[m.id] !== 'loading' && mediaStatuses[m.id] !== 'error'
      );

      if (mediaMsgs.length === 0) return;

      const priorityMedia = [...mediaMsgs]
        .sort((a, b) => {
          if (a.type === 'voice' && b.type !== 'voice') return -1;
          if (b.type === 'voice' && a.type !== 'voice') return 1;
          return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
        })
        .slice(0, 15);

      const triggerDownloads = async () => {
        for (const msg of priorityMedia) {
          if (inFlightMediaRef.current.size >= 3) break;
          if (!inFlightMediaRef.current.has(msg.id)) {
            processMediaMessage(msg);
          }
        }
      };

      triggerDownloads();
    } catch (err) {
      console.error('[useDecryptedMedia] Error:', err);
    }
  }, [messages, conversationKey, decryptedMediaUrls, mediaStatuses]);

  return { decryptedMediaUrls, mediaStatuses, processMediaMessage };
}
