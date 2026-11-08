import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { Readable } from 'stream';

interface CachedMediaEntry {
  buffer: Buffer;
  contentType: string;
  contentLength: string;
  contentRange?: string;
  statusCode: number;
  cachedAt: number;
}

const MAX_LRU_ENTRIES = 150;
const MAX_CACHEABLE_FILE_SIZE = 15 * 1024 * 1024; // 15MB max per cached asset
const LRU_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours TTL
const mediaLRUCache = new Map<string, CachedMediaEntry>();

function getLRUCacheKey(url: string, range?: string): string {
  return range ? `${url}::${range}` : url;
}

function getFromLRUCache(key: string): CachedMediaEntry | null {
  const entry = mediaLRUCache.get(key);
  if (!entry) return null;

  if (Date.now() - entry.cachedAt > LRU_TTL_MS) {
    mediaLRUCache.delete(key);
    return null;
  }

  // Refresh LRU order (delete & re-set moves key to end / most recent)
  mediaLRUCache.delete(key);
  mediaLRUCache.set(key, entry);
  return entry;
}

function putInLRUCache(key: string, entry: CachedMediaEntry): void {
  if (entry.buffer.byteLength > MAX_CACHEABLE_FILE_SIZE) return;

  if (mediaLRUCache.has(key)) {
    mediaLRUCache.delete(key);
  } else if (mediaLRUCache.size >= MAX_LRU_ENTRIES) {
    const oldestKey = mediaLRUCache.keys().next().value;
    if (oldestKey) mediaLRUCache.delete(oldestKey);
  }

  mediaLRUCache.set(key, entry);
}

const handleMediaProxy = async (req: any, res: any) => {
  const timestamp = new Date().toISOString();
  const startTime = Date.now();
  const requestId = (req.headers?.['x-request-id'] || req.headers?.['X-Request-ID'] || `req_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`) as string;
  
  // Explicit CORS and Cache-Control header setup for media streaming
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type, Accept, X-Preload-Url, X-Request-ID');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Accept-Ranges, Content-Type, Cache-Control, X-Proxy-Cache, Link, X-Request-ID, X-Upstream-Handshake-Ms');
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('X-Request-ID', requestId);

  if (req.method === 'OPTIONS') {
    console.log(`[Media Proxy ${timestamp} | ReqId: ${requestId}] Handled CORS OPTIONS preflight request`);
    res.statusCode = 204;
    res.end();
    return;
  }

  try {
    const urlParam = new URL(req.url || '', 'http://localhost').searchParams.get('url');
    const preloadParam = new URL(req.url || '', 'http://localhost').searchParams.get('preloadUrl') || (req.headers?.['x-preload-url'] as string | undefined);
    console.log(`[Media Proxy ${timestamp} | ReqId: ${requestId}] Request received for URL:`, urlParam);
    if (!urlParam) {
      console.warn(`[Media Proxy ${timestamp} | ReqId: ${requestId}] Rejected: missing 'url' parameter`);
      res.statusCode = 400;
      res.setHeader('Content-Type', 'text/plain');
      res.end('Missing url parameter');
      return;
    }
    const parsed = new URL(urlParam);
    if (!parsed.hostname.endsWith('firebasestorage.googleapis.com') && !parsed.hostname.endsWith('storage.googleapis.com')) {
      console.warn(`[Media Proxy ${timestamp} | ReqId: ${requestId}] Rejected: forbidden host '${parsed.hostname}'`);
      res.statusCode = 403;
      res.setHeader('Content-Type', 'text/plain');
      res.end('Forbidden host');
      return;
    }

    // Helper to generate Link pre-loading headers
    const buildLinkHeader = (contentType: string) => {
      const linkParts = [
        '<https://firebasestorage.googleapis.com>; rel=preconnect; crossorigin',
      ];
      let asType = 'fetch';
      if (contentType.startsWith('audio/')) asType = 'audio';
      else if (contentType.startsWith('video/')) asType = 'video';
      else if (contentType.startsWith('image/')) asType = 'image';

      linkParts.push(`<${urlParam}>; rel=preload; as=${asType}; crossorigin`);

      if (preloadParam) {
        try {
          const parsedPreload = new URL(preloadParam);
          if (parsedPreload.hostname.endsWith('firebasestorage.googleapis.com') || parsedPreload.hostname.endsWith('storage.googleapis.com')) {
            linkParts.push(`<${preloadParam}>; rel=preload; as=fetch; crossorigin`);
          }
        } catch {}
      }
      return linkParts.join(', ');
    };

    // Inspect client Range header
    const rangeHeader = req.headers?.range || req.headers?.['range'];
    const cacheKey = getLRUCacheKey(urlParam, rangeHeader);

    // 1. Check LRU Cache layer
    const cachedEntry = getFromLRUCache(cacheKey);
    if (cachedEntry) {
      console.log(`[Media Proxy ${timestamp} | ReqId: ${requestId}] LRU Cache HIT for ${urlParam} (${cachedEntry.buffer.byteLength} bytes). Response delivered in ${Date.now() - startTime}ms`);
      res.statusCode = cachedEntry.statusCode;
      res.setHeader('Content-Type', cachedEntry.contentType);
      res.setHeader('Content-Length', cachedEntry.contentLength);
      if (cachedEntry.contentRange) res.setHeader('Content-Range', cachedEntry.contentRange);
      res.setHeader('Cache-Control', 'public, max-age=86400, immutable');
      res.setHeader('X-Proxy-Cache', 'HIT');
      res.setHeader('Link', buildLinkHeader(cachedEntry.contentType));
      res.setHeader('X-Upstream-Handshake-Ms', '0.00');
      res.end(cachedEntry.buffer);
      return;
    }

    // 2. Cache MISS: Forward request to upstream
    const fetchHeaders: Record<string, string> = {};
    if (rangeHeader) {
      fetchHeaders['range'] = rangeHeader;
      console.log(`[Media Proxy ${timestamp} | ReqId: ${requestId}] Client requested HTTP Range: ${rangeHeader}`);
    }

    const FETCH_TIMEOUT_MS = 30000;
    const controller = new AbortController();
    const fetchTimeoutTimer = setTimeout(() => {
      console.warn(`[Media Proxy ${timestamp} | ReqId: ${requestId}] Upstream fetch connection timed out (${FETCH_TIMEOUT_MS / 1000}s limit reached)`);
      controller.abort();
    }, FETCH_TIMEOUT_MS);

    console.log(`[Media Proxy ${timestamp} | ReqId: ${requestId}] Fetching upstream URL (Cache MISS): ${urlParam}`);
    const fetchStartTime = performance.now();
    let response: Response;
    try {
      response = await fetch(urlParam, { headers: fetchHeaders, signal: controller.signal });
    } finally {
      clearTimeout(fetchTimeoutTimer);
    }
    const handshakeDurationMs = (performance.now() - fetchStartTime).toFixed(2);

    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((val, key) => { responseHeaders[key] = val; });

    console.log(`[Media Proxy ${timestamp} | ReqId: ${requestId}] Upstream response received in ${handshakeDurationMs}ms:`, {
      status: response.status,
      statusText: response.statusText,
      handshakeDurationMs: `${handshakeDurationMs}ms`,
      headers: responseHeaders,
      ok: response.ok,
    });

    if (!response.ok && response.status !== 206) {
      const errorBody = await response.text().catch(() => '');
      console.error(`[Media Proxy ${timestamp} | ReqId: ${requestId}] Upstream returned non-OK status ${response.status} ${response.statusText} in ${handshakeDurationMs}ms. Body preview:`, errorBody.slice(0, 500));
      res.statusCode = response.status;
      res.setHeader('Content-Type', 'text/plain');
      res.setHeader('X-Upstream-Handshake-Ms', handshakeDurationMs);
      res.end(`Upstream error ${response.status}: ${response.statusText} - ${errorBody}`);
      return;
    }

    // Forward status & media streaming headers with Cache-Control layer and Link preloading
    res.statusCode = response.status;
    const contentType = response.headers.get('content-type') || 'application/octet-stream';
    const contentLength = response.headers.get('content-length');
    const contentRange = response.headers.get('content-range');

    res.setHeader('Content-Type', contentType);
    if (contentLength) res.setHeader('Content-Length', contentLength);
    if (contentRange) res.setHeader('Content-Range', contentRange);
    res.setHeader('Cache-Control', 'public, max-age=86400, immutable');
    res.setHeader('X-Proxy-Cache', 'MISS');
    res.setHeader('Link', buildLinkHeader(contentType));
    res.setHeader('X-Upstream-Handshake-Ms', handshakeDurationMs);

    if (response.body) {
      console.log(`[Media Proxy ${timestamp}] Direct stream piping initiated (Status ${response.status}, Length: ${contentLength || 'unknown'}). TTFB: ${Date.now() - startTime}ms`);
      let totalBytesStreamed = 0;
      let firstChunkLogged = false;
      let isBufferCapExceeded = false;
      const chunks: Buffer[] = [];

      const nodeStream = Readable.fromWeb(response.body as any);

      // Stream inactivity watchdog (30s timeout if upstream stalls mid-stream)
      const STREAM_INACTIVITY_MS = 30000;
      let streamInactivityTimer: NodeJS.Timeout | null = null;

      const resetInactivityWatchdog = () => {
        if (streamInactivityTimer) clearTimeout(streamInactivityTimer);
        streamInactivityTimer = setTimeout(() => {
          console.error(`[Media Proxy ${timestamp}] 504 Gateway Timeout: Upstream media stream stalled (no data received for ${STREAM_INACTIVITY_MS / 1000}s)`);
          nodeStream.destroy(new Error('Stream inactivity timeout'));
          if (!res.headersSent) {
            res.statusCode = 504;
            res.setHeader('Content-Type', 'text/plain');
            res.end(`504 Gateway Timeout: Upstream media stream stalled (${STREAM_INACTIVITY_MS / 1000}s inactivity limit)`);
          } else {
            res.destroy();
          }
        }, STREAM_INACTIVITY_MS);
      };

      resetInactivityWatchdog();

      // Handle client socket drain event (low watermark threshold reached: resume upstream stream)
      res.on('drain', () => {
        nodeStream.resume();
      });

      nodeStream.on('data', (chunk: Buffer | Uint8Array) => {
        resetInactivityWatchdog();
        const bufChunk = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        
        // Cap memory buffer for LRU caching to prevent memory bloat on large media
        if (!isBufferCapExceeded) {
          if (totalBytesStreamed + bufChunk.byteLength <= MAX_CACHEABLE_FILE_SIZE) {
            chunks.push(bufChunk);
          } else {
            isBufferCapExceeded = true;
            chunks.length = 0; // Clear chunks to free memory if asset exceeds max cacheable size
          }
        }

        // Apply backpressure (high watermark threshold reached: pause upstream fetch stream)
        const canAcceptMore = res.write(bufChunk);
        if (!canAcceptMore) {
          nodeStream.pause();
        }

        if (!firstChunkLogged) {
          firstChunkLogged = true;
          console.log(`[Media Proxy ${timestamp}] First stream chunk delivered to client in ${Date.now() - startTime}ms (Chunk size: ${bufChunk.byteLength} bytes)`);
        }
        totalBytesStreamed += bufChunk.byteLength;
      });

      nodeStream.on('end', () => {
        if (streamInactivityTimer) clearTimeout(streamInactivityTimer);
        const duration = Date.now() - startTime;
        console.log(`[Media Proxy ${timestamp}] Stream completed successfully in ${duration}ms. Total streamed: ${totalBytesStreamed} bytes.`);
        
        res.end();

        // Populate LRU cache for future recurring requests if under file size limit
        if (!isBufferCapExceeded && chunks.length > 0 && totalBytesStreamed <= MAX_CACHEABLE_FILE_SIZE) {
          const fullBuffer = Buffer.concat(chunks);
          putInLRUCache(cacheKey, {
            buffer: fullBuffer,
            contentType,
            contentLength: totalBytesStreamed.toString(),
            contentRange: contentRange || undefined,
            statusCode: response.status,
            cachedAt: Date.now(),
          });
          console.log(`[Media Proxy ${timestamp}] Cached asset in LRU Cache (${fullBuffer.byteLength} bytes). Total LRU entries: ${mediaLRUCache.size}`);
        }
      });

      nodeStream.on('error', (streamErr: any) => {
        if (streamInactivityTimer) clearTimeout(streamInactivityTimer);
        console.error(`[Media Proxy ${timestamp}] Error during streaming pipe:`, {
          message: streamErr?.message || streamErr,
          stack: streamErr?.stack,
          totalBytesStreamed,
        });
        if (!res.headersSent) {
          res.statusCode = 502;
          res.setHeader('Content-Type', 'text/plain');
          res.end('Upstream stream failed');
        } else {
          res.destroy(streamErr);
        }
      });
    } else {
      console.warn(`[Media Proxy ${timestamp}] Upstream response had no stream body, falling back to empty end.`);
      res.end();
    }
  } catch (err: any) {
    const isTimeout = err?.name === 'AbortError' || err?.message?.includes('aborted');
    console.error(`[Media Proxy ${timestamp}] ${isTimeout ? '504 Gateway Timeout' : 'Internal proxy error'}:`, {
      name: err?.name,
      message: err?.message || 'Proxy error',
      stack: err?.stack,
    });
    if (!res.headersSent) {
      res.statusCode = isTimeout ? 504 : 500;
      res.setHeader('Content-Type', 'text/plain');
      res.end(isTimeout ? '504 Gateway Timeout: Upstream server connection timed out (30s limit)' : (err?.message || 'Proxy error'));
    } else {
      res.destroy(err);
    }
  }
};

export default defineConfig(() => {
  return {
    base: './',
    plugins: [
      react(),
      tailwindcss(),
      {
        name: 'media-cors-proxy',
        configureServer(server) {
          server.middlewares.use('/api/media-proxy', handleMediaProxy);
        },
        configurePreviewServer(server) {
          server.middlewares.use('/api/media-proxy', handleMediaProxy);
        },
      },
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: [
          'favicon.ico',
          'favicon.png',
          'apple-touch-icon.png',
          'icon.svg',
          'icons/favicon.ico',
          'icons/favicon-32.png',
          'icons/apple-touch-icon-180.png',
          'icons/icon-192.png',
          'icons/icon-512.png',
        ],
        manifest: {
          id: './',
          name: 'Hala — Middle East Chat',
          short_name: 'Hala',
          description: 'Hala mobile-first Middle East chat experience.',
          theme_color: '#087F75',
          background_color: '#087F75',
          display: 'standalone',
          orientation: 'portrait-primary',
          start_url: './',
          scope: './',
          icons: [
            {
              src: '/icons/icon-192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/icons/icon-512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/icons/maskable-192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'maskable',
            },
            {
              src: '/icons/maskable-512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
            {
              src: '/icons/monochrome-512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'monochrome',
            },
          ],
        },
        workbox: {
          maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
          globPatterns: ['**/*.{js,css,html,ico,png,svg,webp}'],
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
              handler: 'StaleWhileRevalidate',
              options: {
                cacheName: 'google-fonts-stylesheets',
              },
            },
            {
              urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'google-fonts-webfonts',
                expiration: {
                  maxEntries: 30,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
              },
            },
          ],
        },
        devOptions: {
          enabled: false,
          type: 'module',
        },
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR === 'true' ? false : { overlay: false },
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
    build: {
      rollupOptions: {
        input: {
          main: path.resolve(__dirname, 'index.html'),
          welcome: path.resolve(__dirname, 'welcome.html'),
        },
      },
    },
  };
});
