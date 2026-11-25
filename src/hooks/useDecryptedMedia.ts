import { useState, useEffect, useRef } from 'react';
import { MessageModel } from '../types';
import { decryptBlobData, detectMagicMimeType } from '../lib/crypto';
import { getFirebaseStorage, getFirebaseAuth, ensureAuthUser, getBytes, ref as storageRef } from '../lib/firebase';
import { isFirebaseStorageNonRetryableError } from '../lib/safeStorage';
import { bandwidthEstimator } from '../lib/bandwidthEstimator';
import { getApiAuthHeaders, resolveApiUrl } from '../services/appConfig';
import { extractAudioWaveformFromLocalUrl, getCachedAudioWaveform, registerAudioWaveform } from '../lib/audioWaveform';
import { mediaCacheService, arrayBufferToBase64 } from '../lib/mediaCache';

function getStoragePathFromUrl(url: string): string | null {
  try {
    const match = url.match(/\/o\/([^?#]+)/);
    if (match && match[1]) {
      return decodeURIComponent(match[1]);
    }
  } catch {}
  return null;
}

export function inferMimeTypeFromFileName(fileName?: string): string | null {
  if (!fileName) return null;
  const ext = fileName.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'pdf': return 'application/pdf';
    case 'mp4': return 'video/mp4';
    case 'webm': return 'video/webm';
    case 'mov': return 'video/quicktime';
    case 'mkv': return 'video/x-matroska';
    case 'avi': return 'video/x-msvideo';
    case 'mp3': return 'audio/mpeg';
    case 'wav': return 'audio/wav';
    case 'm4a': return 'audio/mp4';
    case 'ogg': return 'audio/ogg';
    case 'opus': return 'audio/opus';
    case 'aac': return 'audio/aac';
    case 'jpg':
    case 'jpeg': return 'image/jpeg';
    case 'png': return 'image/png';
    case 'gif': return 'image/gif';
    case 'webp': return 'image/webp';
    case 'svg': return 'image/svg+xml';
    case 'docx': return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    case 'doc': return 'application/msword';
    case 'xlsx': return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    case 'xls': return 'application/vnd.ms-excel';
    case 'pptx': return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
    case 'ppt': return 'application/vnd.ms-powerpoint';
    case 'zip': return 'application/zip';
    case 'txt': return 'text/plain';
    case 'csv': return 'text/csv';
    case 'json': return 'application/json';
    default: return null;
  }
}

// Global cache mapping mediaIv, remoteUrl, or tempMessageId to local blob/data URL
const sentMediaBlobCache = new Map<string, string>();

export function registerSentLocalMediaBlob(identifier: string, blobUrl: string) {
  if (identifier && blobUrl) {
    sentMediaBlobCache.set(identifier, blobUrl);
  }
}

export function getSentLocalMediaBlob(identifier?: string | null): string | null {
  if (!identifier) return null;
  return sentMediaBlobCache.get(identifier) || null;
}

export function clearSentMediaBlobCache(): void {
  sentMediaBlobCache.forEach((url) => {
    if (url.startsWith('blob:')) {
      try {
        URL.revokeObjectURL(url);
      } catch {}
    }
  });
  sentMediaBlobCache.clear();
}

export function useDecryptedMedia(
  messages: MessageModel[],
  conversationKey: CryptoKey | null,
  activeChatId: string
) {
  const [decryptedMediaUrls, setDecryptedMediaUrls] = useState<Record<string, string>>({});
  const [mediaStatuses, setMediaStatuses] = useState<Record<string, 'idle' | 'loading' | 'ready' | 'error'>>({});
  const [mediaErrorDetails, setMediaErrorDetails] = useState<Record<string, { code?: string; stage: string }>>({});
  const [voiceWaveforms, setVoiceWaveforms] = useState<Record<string, number[]>>({});
  const [voiceDurations, setVoiceDurations] = useState<Record<string, number>>({});

  const inFlightMediaRef = useRef<Map<string, Promise<void>>>(new Map());
  const blobUrlCacheRef = useRef<Map<string, string>>(new Map());
  const extractedVoiceIdsRef = useRef<Set<string>>(new Set());
  const activeChatIdRef = useRef<string>(activeChatId);
  const prevConversationKeyRef = useRef<CryptoKey | null>(conversationKey);
  const isDebug = typeof window !== 'undefined' && window.location.search.includes('debug=1');

  useEffect(() => {
    activeChatIdRef.current = activeChatId;
  }, [activeChatId]);

  // If the conversationKey changes (e.g. restored or peer updated key), retry any failed decrypts
  useEffect(() => {
    if (conversationKey && prevConversationKeyRef.current !== conversationKey) {
      prevConversationKeyRef.current = conversationKey;
      setMediaStatuses(prev => {
        const next = { ...prev };
        let changed = false;
        for (const [id, st] of Object.entries(next)) {
          if (st === 'error') {
            delete next[id];
            changed = true;
          }
        }
        return changed ? next : prev;
      });
      setMediaErrorDetails(prev => {
        const next = { ...prev };
        let changed = false;
        for (const [id, detail] of Object.entries(next)) {
          if (detail?.stage === 'decrypt') {
            delete next[id];
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    } else {
      prevConversationKeyRef.current = conversationKey;
    }
  }, [conversationKey]);

  // Cleanup Blob URLs and reset state on unmount or chat change
  useEffect(() => {
    const currentCache = blobUrlCacheRef.current;
    return () => {
      currentCache.forEach(url => URL.revokeObjectURL(url));
      currentCache.clear();
      inFlightMediaRef.current.clear();
      extractedVoiceIdsRef.current.clear();
      setDecryptedMediaUrls({});
      setMediaStatuses({});
      setMediaErrorDetails({});
      setVoiceWaveforms({});
      setVoiceDurations({});
    };
  }, [activeChatId]);

  const resolveVoiceWaveform = (msg: MessageModel, localUrl: string) => {
    if (msg.type !== 'voice' || !localUrl) return;
    const cached =
      getCachedAudioWaveform(msg.id) ||
      (msg.mediaIv ? getCachedAudioWaveform(msg.mediaIv) : null) ||
      getCachedAudioWaveform(msg.content) ||
      getCachedAudioWaveform(localUrl);

    if (cached) {
      extractedVoiceIdsRef.current.add(msg.id);
      registerAudioWaveform(msg.id, cached);
      registerAudioWaveform(localUrl, cached);
      setVoiceWaveforms(prev => (prev[msg.id] ? prev : { ...prev, [msg.id]: cached.peaks }));
      if (cached.duration > 0) {
        setVoiceDurations(prev => (prev[msg.id] ? prev : { ...prev, [msg.id]: cached.duration }));
      }
      return;
    }

    if (extractedVoiceIdsRef.current.has(msg.id)) return;
    if (!localUrl.startsWith('blob:') && !localUrl.startsWith('data:')) return;

    extractedVoiceIdsRef.current.add(msg.id);
    extractAudioWaveformFromLocalUrl(localUrl, 40).then(extracted => {
      if (!extracted || activeChatIdRef.current !== msg.chatId) return;
      registerAudioWaveform(msg.id, extracted);
      registerAudioWaveform(localUrl, extracted);
      if (msg.mediaIv) registerAudioWaveform(msg.mediaIv, extracted);
      if (msg.content && !msg.content.startsWith('blob:')) registerAudioWaveform(msg.content, extracted);
      setVoiceWaveforms(prev => ({ ...prev, [msg.id]: extracted.peaks }));
      if (extracted.duration > 0) {
        setVoiceDurations(prev => ({ ...prev, [msg.id]: extracted.duration }));
      }
    });
  };

  // Immediately handle local or pre-cached media/audio messages so they never get stuck loading
  useEffect(() => {
    if (messages.length === 0) return;

    const mediaUpdates: Record<string, string> = {};
    const statusUpdates: Record<string, 'ready'> = {};
    let hasUpdates = false;

    for (const msg of messages) {
      if ((msg.type === 'voice' || msg.type === 'image' || msg.type === 'video' || msg.type === 'file') &&
          msg.content && !decryptedMediaUrls[msg.id]) {
        const isLocalUrl = msg.content.startsWith('blob:') || msg.content.startsWith('data:');
        const cachedLocal = isLocalUrl
          ? msg.content
          : (msg.mediaIv ? sentMediaBlobCache.get(msg.mediaIv) : null) || sentMediaBlobCache.get(msg.content) || sentMediaBlobCache.get(msg.id);

        if (cachedLocal) {
          mediaUpdates[msg.id] = cachedLocal;
          statusUpdates[msg.id] = 'ready';
          hasUpdates = true;

          // Register in cache for future references
          if (msg.mediaIv) sentMediaBlobCache.set(msg.mediaIv, cachedLocal);
          if (msg.content) sentMediaBlobCache.set(msg.content, cachedLocal);
          if (msg.type === 'voice') {
            resolveVoiceWaveform(msg, cachedLocal);
          }
        }
      } else if (msg.type === 'voice' && decryptedMediaUrls[msg.id] && !voiceWaveforms[msg.id]) {
        resolveVoiceWaveform(msg, decryptedMediaUrls[msg.id]);
      }
    }

    if (hasUpdates) {
      setDecryptedMediaUrls(prev => ({ ...prev, ...mediaUpdates }));
      setMediaStatuses(prev => ({ ...prev, ...statusUpdates }));
    }
  }, [messages, decryptedMediaUrls, voiceWaveforms]);

  const processMediaMessage = async (msg: MessageModel, retryCount = 0, force = false) => {
    if (!msg.content) return;
    if (activeChatIdRef.current !== msg.chatId) return;

    if (force) {
      inFlightMediaRef.current.delete(msg.id);
      const oldBlobUrl = blobUrlCacheRef.current.get(msg.id);
      if (oldBlobUrl) {
        try {
          URL.revokeObjectURL(oldBlobUrl);
        } catch {}
        blobUrlCacheRef.current.delete(msg.id);
      }
      if (!msg.content.startsWith('blob:') && !msg.content.startsWith('data:')) {
        if (msg.mediaIv) sentMediaBlobCache.delete(msg.mediaIv);
        sentMediaBlobCache.delete(msg.content);
        sentMediaBlobCache.delete(msg.id);
      }
      setDecryptedMediaUrls(prev => {
        if (!prev[msg.id]) return prev;
        const next = { ...prev };
        delete next[msg.id];
        return next;
      });
      setMediaErrorDetails(prev => {
        if (!prev[msg.id]) return prev;
        const next = { ...prev };
        delete next[msg.id];
        return next;
      });
    }

    if (inFlightMediaRef.current.has(msg.id)) {
      return inFlightMediaRef.current.get(msg.id);
    }
    if (!force && decryptedMediaUrls[msg.id]) {
      if (msg.type === 'voice') resolveVoiceWaveform(msg, decryptedMediaUrls[msg.id]);
      return;
    }

    // Check if URL is local, in sent blob cache, or in persistent media cache (WhatsApp/Telegram speed)
    const persistentCacheUrl = !force ? mediaCacheService.get(msg.id) : null;
    const isLocalUrl = msg.content.startsWith('blob:') || msg.content.startsWith('data:');
    const cachedLocalUrl = isLocalUrl
      ? msg.content
      : persistentCacheUrl ||
        (!force
        ? (msg.mediaIv ? sentMediaBlobCache.get(msg.mediaIv) : null) || sentMediaBlobCache.get(msg.content) || sentMediaBlobCache.get(msg.id)
        : null);

    if (cachedLocalUrl) {
      setDecryptedMediaUrls(prev => ({ ...prev, [msg.id]: cachedLocalUrl }));
      setMediaStatuses(prev => ({ ...prev, [msg.id]: 'ready' }));
      if (msg.mediaIv) sentMediaBlobCache.set(msg.mediaIv, cachedLocalUrl);
      if (msg.content) sentMediaBlobCache.set(msg.content, cachedLocalUrl);
      if (msg.type === 'voice') resolveVoiceWaveform(msg, cachedLocalUrl);
      return;
    }

    if (msg.mediaIv && !conversationKey) return;

    const start = performance.now();

    const runDownload = async () => {
      let lastStage = 'sdk';
      let lastErrorCode = '';

      try {
        setMediaStatuses(prev => ({ ...prev, [msg.id]: 'loading' }));

        const authInst = getFirebaseAuth();
        if (!authInst.currentUser) {
          for (let attempt = 0; attempt < 10; attempt++) {
            if (authInst.currentUser) break;
            await new Promise(r => setTimeout(r, 300));
          }
        }

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
              if (!getFirebaseAuth().currentUser) {
                await ensureAuthUser().catch(() => null);
              }
              console.log(`[FileDownloader] Attempting Storage SDK getBytes for msg: ${msg.id}, path: ${storagePath}`);
              const storageReference = storageRef(getFirebaseStorage(), storagePath);
              arrayBuffer = await getBytes(storageReference);
              console.log(`[FileDownloader] Storage SDK getBytes SUCCEEDED for msg: ${msg.id}, size: ${arrayBuffer.byteLength} bytes`);
            } catch (storageReadError: any) {
              lastErrorCode = storageReadError?.code || 'storage/error';
              console.warn(
                `[FileDownloader] Storage SDK getBytes FAILED for msg: ${msg.id} | Code: ${storageReadError?.code} | Message: ${storageReadError?.message} | Details:`,
                {
                  code: storageReadError?.code,
                  message: storageReadError?.message,
                  serverResponse: storageReadError?.serverResponse,
                  status_: storageReadError?.status_,
                  customData: storageReadError?.customData,
                }
              );
            }
          }

          // Tokenized download URL fallback for legacy objects or rule variations.
          // Direct fetch(msg.content)
          if (!arrayBuffer) {
            lastStage = 'fetch';
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 15000);
            try {
              console.log(`[FileDownloader] Attempting direct fetch for msg: ${msg.id}, URL: ${msg.content}`);
              const res = await fetch(msg.content, { signal: controller.signal });
              const headersObj: Record<string, string> = {};
              res.headers.forEach((val, key) => { headersObj[key] = val; });

              console.log(`[FileDownloader] Direct fetch response received for msg: ${msg.id}:`, {
                url: msg.content,
                status: res.status,
                statusText: res.statusText,
                ok: res.ok,
                headers: headersObj,
              });

              if (res.ok) {
                const t0 = performance.now();
                arrayBuffer = await res.arrayBuffer();
                const elapsed = performance.now() - t0;
                bandwidthEstimator.recordSample(arrayBuffer.byteLength, elapsed);
                console.log(`[FileDownloader] Direct fetch SUCCEEDED for msg: ${msg.id}, size: ${arrayBuffer.byteLength} bytes`);
              } else {
                const errorText = await res.text().catch(() => '');
                lastErrorCode = `HTTP ${res.status}`;
                console.warn(`[FileDownloader] Direct fetch non-OK response for msg: ${msg.id}:`, {
                  status: res.status,
                  statusText: res.statusText,
                  headers: headersObj,
                  bodyPreview: errorText.slice(0, 500),
                });
              }
            } catch (fetchErr: any) {
              lastErrorCode = fetchErr?.name === 'AbortError' ? 'timeout' : 'network_error';
              console.warn(`[FileDownloader] Direct fetch THREW exception for msg: ${msg.id}:`, {
                name: fetchErr?.name,
                message: fetchErr?.message,
                stack: fetchErr?.stack,
              });
            } finally {
              clearTimeout(timeoutId);
            }
          }

          // Local Vite dev / preview media proxy fallback (guards against SPA HTML fallback)
          const canTryMediaProxy =
            import.meta.env.DEV ||
            (typeof window !== 'undefined' && window.location.protocol.startsWith('http'));
          if (!arrayBuffer && canTryMediaProxy) {
            lastStage = 'proxy';
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 25000);
            try {
              const resResolution = bandwidthEstimator.getEffectiveResolution();
              const proxyUrl = resolveApiUrl(`/api/media-proxy?url=${encodeURIComponent(msg.content)}&res=${resResolution}`);
              const proxyHeaders = await getApiAuthHeaders({ 'X-Media-Resolution': resResolution });
              const tProxyStart = performance.now();
              console.log(`[FileDownloader] Attempting media proxy fetch for msg: ${msg.id}, res: ${resResolution}, proxyUrl: ${proxyUrl}`);
              const proxyRes = await fetch(proxyUrl, {
                signal: controller.signal,
                headers: proxyHeaders,
              });
              const proxyHeadersObj: Record<string, string> = {};
              proxyRes.headers.forEach((val, key) => { proxyHeadersObj[key] = val; });

              console.log(`[FileDownloader] Media proxy response received for msg: ${msg.id}:`, {
                proxyUrl,
                status: proxyRes.status,
                statusText: proxyRes.statusText,
                ok: proxyRes.ok,
                headers: proxyHeadersObj,
              });

              const proxyContentType = (proxyRes.headers.get('content-type') || '').toLowerCase();
              if (proxyRes.ok && !proxyContentType.includes('text/html')) {
                arrayBuffer = await proxyRes.arrayBuffer();
                const proxyElapsed = performance.now() - tProxyStart;
                bandwidthEstimator.recordSample(arrayBuffer.byteLength, proxyElapsed);
                console.log(`[FileDownloader] Media proxy fetch SUCCEEDED for msg: ${msg.id}, res: ${resResolution}, size: ${arrayBuffer.byteLength} bytes`);
              } else {
                const errorText = await proxyRes.text().catch(() => '');
                lastErrorCode = proxyContentType.includes('text/html') ? 'proxy_unavailable' : `Proxy HTTP ${proxyRes.status}`;
                console.warn(`[FileDownloader] Media proxy fetch non-OK response for msg: ${msg.id}:`, {
                  status: proxyRes.status,
                  statusText: proxyRes.statusText,
                  headers: proxyHeadersObj,
                  bodyPreview: errorText.slice(0, 500),
                });
              }
            } catch (proxyErr: any) {
              lastErrorCode = proxyErr?.name === 'AbortError' ? 'timeout' : lastErrorCode || 'network_error';
              console.warn(`[FileDownloader] Media proxy fetch THREW exception for msg: ${msg.id}:`, {
                name: proxyErr?.name,
                message: proxyErr?.message,
                stack: proxyErr?.stack,
              });
            } finally {
              clearTimeout(timeoutId);
            }
          }
        }

        if (!arrayBuffer || arrayBuffer.byteLength < 16) {
          throw { stage: lastStage, code: lastErrorCode || 'empty_bytes', message: 'Unable to retrieve audio/media bytes' };
        }

        if (activeChatIdRef.current !== msg.chatId) return;

        const fileNameInferred = inferMimeTypeFromFileName(msg.fileName);
        const defaultFallback = msg.fileType || 
          fileNameInferred ||
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
          const sniffedType = detectMagicMimeType(arrayBuffer, defaultFallback) || msg.fileType || defaultFallback;
          const blob = new Blob([arrayBuffer], { type: sniffedType });
          resultUrl = URL.createObjectURL(blob);
        }

        if (resultUrl && activeChatIdRef.current === msg.chatId) {
          blobUrlCacheRef.current.set(msg.id, resultUrl);
          // Persist to local media cache for instant WhatsApp/Telegram-style loading on login/restart
          try {
            const sniffedType = msg.type === 'voice' ? 'audio/webm' : (msg.fileType || 'application/octet-stream');
            if (resultUrl.startsWith('blob:')) {
              fetch(resultUrl).then(r => r.arrayBuffer()).then(buf => {
                const dataUrl = arrayBufferToBase64(buf, sniffedType);
                mediaCacheService.set(msg.id, dataUrl);
              }).catch(() => {});
            } else if (resultUrl.startsWith('data:')) {
              mediaCacheService.set(msg.id, resultUrl);
            }
          } catch {}

          setDecryptedMediaUrls(prev => ({ ...prev, [msg.id]: resultUrl }));
          setMediaStatuses(prev => ({ ...prev, [msg.id]: 'ready' }));
          if (msg.type === 'voice') {
            resolveVoiceWaveform(msg, resultUrl);
          }
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
        const isTransient = !isNonRetryable || err?.code === 'storage/unauthenticated' || err?.code === 'network_error' || err?.code === 'timeout';
        const maxRetries = 4;
        if (isTransient && retryCount < maxRetries && activeChatIdRef.current === msg.chatId) {
          const delay = (retryCount + 1) * 1500;
          setMediaStatuses(prev => ({ ...prev, [msg.id]: 'loading' }));
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

  return { decryptedMediaUrls, mediaStatuses, mediaErrorDetails, processMediaMessage, voiceWaveforms, voiceDurations };
}
