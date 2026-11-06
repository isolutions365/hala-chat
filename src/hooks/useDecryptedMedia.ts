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
  if (buffer && buffer.byteLength >= 4) {
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
    // MP3 with ID3v2 tag: 0x494433 ("ID3")
    if ((magic & 0xFFFFFF00) === 0x49443300) {
      return 'audio/mpeg';
    }
    // MP3 frame sync: 11 bits set (0xFFE0 mask)
    if ((view.getUint16(0, false) & 0xFFE0) === 0xFFE0) {
      return 'audio/mpeg';
    }
    // AAC ADTS syncword: 0xFFF0 mask
    if ((view.getUint16(0, false) & 0xFFF6) === 0xFFF0) {
      return 'audio/aac';
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
  const [mediaErrorDetails, setMediaErrorDetails] = useState<Record<string, { code?: string; stage: string }>>({});

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
      setMediaErrorDetails({});
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
      let lastStage = 'sdk';
      let lastErrorCode = '';

      try {
        setMediaStatuses(prev => ({ ...prev, [msg.id]: 'loading' }));

        let arrayBuffer: ArrayBuffer | null = null;
        if (msg.content.startsWith('data:')) {
          lastStage = 'data_url';
          const base64Data = msg.content.split(',')[1] || msg.content;
          const binaryString = window.atob(base64Data);
          const bytes = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
          arrayBuffer = bytes.buffer;
        } else if (msg.content.startsWith('blob:')) {
          lastStage = 'blob_url';
          const res = await fetch(msg.content);
          arrayBuffer = await res.arrayBuffer();
        } else if (msg.content.startsWith('gs://')) {
          lastStage = 'sdk';
          try {
            const storageReference = storageRef(getFirebaseStorage(), msg.content);
            arrayBuffer = await getBytes(storageReference);
            if (isDebug) console.log(`[useDecryptedMedia Debug] Storage SDK getBytes succeeded for gs:// ${msg.id}`);
          } catch (storageErr: any) {
            lastErrorCode = storageErr?.code || 'storage/error';
            console.warn(
              `[useDecryptedMedia Debug] Storage SDK getBytes FAILED for gs:// ${msg.id} | Code: ${storageErr?.code} | Message: ${storageErr?.message}`,
              storageErr
            );
          }
        } else {
          // Authenticated Firebase Storage SDK reads avoid CORS and the slow
          // development-only proxy path. Encrypted voice media must be fetched
          // completely before it can be decrypted.
          const storagePath = getStoragePathFromUrl(msg.content);
          if (storagePath) {
            lastStage = 'sdk';
            try {
              const storageReference = storageRef(getFirebaseStorage(), storagePath);
              arrayBuffer = await getBytes(storageReference);
              if (isDebug) console.log(`[useDecryptedMedia Debug] Storage SDK getBytes succeeded for ${msg.id}`);
            } catch (storageReadError: any) {
              lastErrorCode = storageReadError?.code || 'storage/error';
              console.warn(
                `[useDecryptedMedia Debug] Storage SDK getBytes FAILED for ${msg.id} | Code: ${storageReadError?.code} | Message: ${storageReadError?.message}`,
                storageReadError
              );
            }
          }

          // Tokenized download URL fallback for legacy objects or rule variations.
          if (!arrayBuffer) {
            lastStage = 'fetch';
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 12000);
            try {
              const res = await fetch(msg.content);
              console.log(`[useDecryptedMedia Debug] Token URL fetch status for ${msg.id}: HTTP ${res.status}`);
              if (res.ok) {
                arrayBuffer = await res.arrayBuffer();
              } else {
                lastErrorCode = `HTTP ${res.status}`;
                console.warn(`[useDecryptedMedia Debug] Token URL fetch non-ok status for ${msg.id}: HTTP ${res.status}`);
              }
            } catch (fetchErr: any) {
              lastErrorCode = fetchErr?.name === 'AbortError' ? 'timeout' : 'network_error';
              console.warn(`[useDecryptedMedia Debug] Token URL fetch FAILED for ${msg.id}:`, fetchErr);
            } finally {
              clearTimeout(timeoutId);
            }
          }

          // This Vite middleware exists only in local dev/preview, not Vercel production.
          if (!arrayBuffer && import.meta.env.DEV) {
            lastStage = 'proxy';
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 6000);
            try {
              const proxyUrl = `/api/media-proxy?url=${encodeURIComponent(msg.content)}`;
              const proxyRes = await fetch(proxyUrl, { signal: controller.signal });
              console.log(`[useDecryptedMedia Debug] Proxy fetch status for ${msg.id}: HTTP ${proxyRes.status}`);
              if (proxyRes.ok) {
                arrayBuffer = await proxyRes.arrayBuffer();
              } else {
                lastErrorCode = `Proxy HTTP ${proxyRes.status}`;
              }
            } catch (proxyErr: any) {
              console.warn(`[useDecryptedMedia Debug] Proxy fetch FAILED for ${msg.id}:`, proxyErr);
            } finally {
              clearTimeout(timeoutId);
            }
          }
        }

        if (!arrayBuffer || arrayBuffer.byteLength < 16) {
          throw { stage: lastStage, code: lastErrorCode || 'empty_bytes', message: 'Unable to retrieve audio/media bytes' };
        }

        if (activeChatIdRef.current !== msg.chatId) return;

        const defaultFallback = msg.fileType || 
          (msg.type === 'video' ? 'video/mp4' : 
           msg.type === 'voice' ? 'audio/webm' : 
           msg.type === 'image' ? 'image/jpeg' : 
           'application/octet-stream');

        let resultUrl = '';
        if (msg.mediaIv) {
          lastStage = 'decrypt';
          try {
            resultUrl = await decryptBlobData(arrayBuffer, msg.mediaIv, defaultFallback, conversationKey) || '';
            if (!resultUrl) {
              console.warn(`[useDecryptedMedia Debug] decryptBlobData returned NULL for ${msg.id} (stage: decrypt)`);
              throw { stage: 'decrypt', code: 'decryption_null', message: 'Decryption returned null' };
            } else {
              console.log(`[useDecryptedMedia Debug] decryptBlobData SUCCEEDED for ${msg.id}`);
            }
          } catch (decErr: any) {
            console.warn(`[useDecryptedMedia Debug] decryptBlobData threw ERROR for ${msg.id}:`, decErr);
            throw { stage: 'decrypt', code: decErr?.code || 'decrypt_error', message: decErr?.message || 'Decryption failed' };
          }
        } else {
          const sniffedType = sniffMimeType(arrayBuffer, '') || msg.fileType || defaultFallback;
          const blob = new Blob([arrayBuffer], { type: sniffedType });
          resultUrl = URL.createObjectURL(blob);
        }

        if (resultUrl && activeChatIdRef.current === msg.chatId) {
          blobUrlCacheRef.current.set(msg.id, resultUrl);
          setDecryptedMediaUrls(prev => ({ ...prev, [msg.id]: resultUrl }));
          setMediaStatuses(prev => ({ ...prev, [msg.id]: 'ready' }));
          setMediaErrorDetails(prev => {
            const next = { ...prev };
            delete next[msg.id];
            return next;
          });
          if (isDebug) console.log(`[Debug] Media ready in ${performance.now() - start}ms: ${msg.id}`);
        } else if (resultUrl) {
          URL.revokeObjectURL(resultUrl);
        } else {
          throw { stage: 'decrypt', code: 'decryption_null', message: 'Decryption returned null' };
        }
      } catch (err: any) {
        console.warn(`[Media Notice] ${msg.id}:`, err);
        const stage = err?.stage || lastStage || 'unknown';
        const code = err?.code || (err as any)?.code || (typeof err?.message === 'string' ? err.message : '');
        setMediaErrorDetails(prev => ({
          ...prev,
          [msg.id]: { stage, code: code || undefined }
        }));

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

  return { decryptedMediaUrls, mediaStatuses, mediaErrorDetails, processMediaMessage };
}
