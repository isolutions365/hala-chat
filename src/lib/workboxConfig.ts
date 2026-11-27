/**
 * Workbox service worker caching strategy for Hala Chat.
 *
 * Layered offline-first architecture:
 *  - Precache: App shell (HTML, JS, CSS, core icons/SVGs/fonts) with SPA navigateFallback.
 *  - Layer 0 (NetworkOnly): Auth, token exchange, Firestore realtime channels, reCAPTCHA,
 *    and mutable/AI POST endpoints so sensitive or live-streaming traffic is never cached.
 *  - Layer 1 (Static UI Assets): Google Fonts, local UI icons/images/fonts/styles/scripts.
 *  - Layer 2 (Critical Read-Only APIs): Media proxy (non-Range GETs), critical same-origin
 *    read-only `/api/*` GETs, geocoding/location lookups, and message translation APIs with
 *    fast `networkTimeoutSeconds` fallback for intermittent cellular connectivity.
 *  - Layer 3 (Map Tiles & Avatars): OSM/ArcGIS map tiles and profile/storage images with
 *    bounded LRU expiration and `purgeOnQuotaError` protection.
 *
 * NOTE: Every function `urlPattern` MUST remain 100% self-contained (no outer closures or
 * module variable references) because `workbox-build` serializes callback functions via
 * `.toString()` directly into the generated `sw.js`.
 */

export interface WorkboxRouteMatchContext {
  url: URL;
  request: Request;
  sameOrigin: boolean;
}

export type WorkboxHandlerName =
  | 'CacheFirst'
  | 'CacheOnly'
  | 'NetworkFirst'
  | 'NetworkOnly'
  | 'StaleWhileRevalidate';

export type WorkboxHttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'HEAD' | 'PATCH';

export interface WorkboxRuntimeCachingRule {
  urlPattern: RegExp | ((context: WorkboxRouteMatchContext) => boolean);
  handler: WorkboxHandlerName;
  method?: WorkboxHttpMethod;
  options?: {
    cacheName?: string;
    networkTimeoutSeconds?: number;
    expiration?: {
      maxEntries?: number;
      maxAgeSeconds?: number;
      purgeOnQuotaError?: boolean;
    };
    cacheableResponse?: {
      statuses?: number[];
      headers?: Record<string, string>;
    };
  };
}

export const WORKBOX_CACHE_NAMES = {
  googleFontsStylesheets: 'hala-google-fonts-stylesheets',
  googleFontsWebfonts: 'hala-google-fonts-webfonts',
  staticUiAssets: 'hala-static-ui-assets',
  apiMedia: 'hala-api-media-cache',
  apiCritical: 'hala-api-critical',
  apiGeocoding: 'hala-api-geocoding',
  apiTranslations: 'hala-api-translations',
  mapTiles: 'hala-map-tiles',
  avatarsAndImages: 'hala-avatars-and-images',
} as const;

/**
 * Caches that may contain user-specific or authenticated content and MUST be purged
 * on explicit user sign-out while preserving the static app shell and map tiles.
 */
export const USER_SCOPED_CACHE_NAMES: readonly string[] = [
  WORKBOX_CACHE_NAMES.apiMedia,
  WORKBOX_CACHE_NAMES.apiCritical,
  WORKBOX_CACHE_NAMES.apiTranslations,
  WORKBOX_CACHE_NAMES.avatarsAndImages,
];

const ONE_DAY = 60 * 60 * 24;
const ONE_WEEK = ONE_DAY * 7;
const TWO_WEEKS = ONE_DAY * 14;
const THIRTY_DAYS = ONE_DAY * 30;
const ONE_YEAR = ONE_DAY * 365;

export const WORKBOX_NAVIGATE_FALLBACK_DENYLIST: RegExp[] = [
  /^\/api\//,
  /^\/__\//,
  /^\/firebase-messaging-sw\.js$/,
  /^\/welcome\.html$/,
  /\/[^/?]+\.[a-zA-Z0-9]{2,12}$/,
];

export const WORKBOX_RUNTIME_CACHING: WorkboxRuntimeCachingRule[] = [
  // =========================================================================
  // Layer 0: Explicit NetworkOnly Security & Realtime Bypass Rules
  // =========================================================================
  {
    // Never intercept/cache Firebase Auth, token refresh, Firestore realtime channels, or reCAPTCHA
    urlPattern:
      /^https:\/\/(identitytoolkit\.googleapis\.com|securetoken\.googleapis\.com|firestore\.googleapis\.com|www\.google\.com\/recaptcha|www\.gstatic\.com\/recaptcha|recaptcha\.google\.com)\//i,
    handler: 'NetworkOnly',
  },
  {
    // Never cache mutable, AI, or auth token-exchange endpoints
    urlPattern: /\/api\/(transcribe|quick-replies|auth)(\?|$|\/)/i,
    handler: 'NetworkOnly',
  },

  // =========================================================================
  // Layer 1: Static UI Assets (Google Fonts + Same-Origin Static UI Resources)
  // =========================================================================
  {
    urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
    method: 'GET',
    handler: 'StaleWhileRevalidate',
    options: {
      cacheName: WORKBOX_CACHE_NAMES.googleFontsStylesheets,
      cacheableResponse: {
        statuses: [0, 200],
      },
      expiration: {
        maxEntries: 20,
        maxAgeSeconds: THIRTY_DAYS,
        purgeOnQuotaError: true,
      },
    },
  },
  {
    urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
    method: 'GET',
    handler: 'CacheFirst',
    options: {
      cacheName: WORKBOX_CACHE_NAMES.googleFontsWebfonts,
      cacheableResponse: {
        statuses: [0, 200],
      },
      expiration: {
        maxEntries: 40,
        maxAgeSeconds: ONE_YEAR,
        purgeOnQuotaError: true,
      },
    },
  },
  {
    // Same-origin static UI assets (images, icons, fonts, CSS/JS chunks) not already precached
    urlPattern: ({ sameOrigin, request, url }) =>
      sameOrigin &&
      request.method === 'GET' &&
      !url.pathname.startsWith('/api/') &&
      !url.pathname.includes('firebase-messaging-sw') &&
      (request.destination === 'image' ||
        request.destination === 'font' ||
        request.destination === 'style' ||
        request.destination === 'script' ||
        /\.(?:png|jpe?g|svg|webp|gif|ico|woff2?|ttf|otf)$/i.test(url.pathname)),
    method: 'GET',
    handler: 'StaleWhileRevalidate',
    options: {
      cacheName: WORKBOX_CACHE_NAMES.staticUiAssets,
      cacheableResponse: {
        statuses: [0, 200],
      },
      expiration: {
        maxEntries: 120,
        maxAgeSeconds: THIRTY_DAYS,
        purgeOnQuotaError: true,
      },
    },
  },

  // =========================================================================
  // Layer 2: Critical Read-Only API Responses (Offline & Flaky-Network Ready)
  // =========================================================================
  {
    // Proxied media GET responses (skip Range requests so video/audio seeking never hits 206 errors)
    urlPattern: ({ request, url }) =>
      request.method === 'GET' &&
      !request.headers.has('range') &&
      /\/api\/media-proxy(?:\?|$)/i.test(url.pathname + url.search),
    method: 'GET',
    handler: 'CacheFirst',
    options: {
      cacheName: WORKBOX_CACHE_NAMES.apiMedia,
      cacheableResponse: {
        statuses: [200],
      },
      expiration: {
        maxEntries: 60,
        maxAgeSeconds: ONE_WEEK,
        purgeOnQuotaError: true,
      },
    },
  },
  {
    // Critical read-only same-origin /api/* GET responses with fast 4s network timeout fallback
    urlPattern: ({ sameOrigin, request, url }) =>
      sameOrigin &&
      request.method === 'GET' &&
      url.pathname.startsWith('/api/') &&
      !url.pathname.startsWith('/api/media-proxy') &&
      !url.pathname.startsWith('/api/transcribe') &&
      !url.pathname.startsWith('/api/quick-replies'),
    method: 'GET',
    handler: 'NetworkFirst',
    options: {
      cacheName: WORKBOX_CACHE_NAMES.apiCritical,
      networkTimeoutSeconds: 4,
      cacheableResponse: {
        statuses: [200],
      },
      expiration: {
        maxEntries: 80,
        maxAgeSeconds: ONE_DAY,
        purgeOnQuotaError: true,
      },
    },
  },
  {
    // Location geocoding & search API responses (OpenStreetMap Nominatim + Google Geocoding)
    urlPattern:
      /^https:\/\/(nominatim\.openstreetmap\.org\/(reverse|search)|maps\.googleapis\.com\/maps\/api\/geocode)\b/i,
    method: 'GET',
    handler: 'NetworkFirst',
    options: {
      cacheName: WORKBOX_CACHE_NAMES.apiGeocoding,
      networkTimeoutSeconds: 4,
      cacheableResponse: {
        statuses: [0, 200],
      },
      expiration: {
        maxEntries: 60,
        maxAgeSeconds: ONE_WEEK,
        purgeOnQuotaError: true,
      },
    },
  },
  {
    // Message translation API responses (Google Translate GTX + MyMemory fallback)
    urlPattern:
      /^https:\/\/(translate\.googleapis\.com\/translate_a\/|api\.mymemory\.translated\.net\/get)/i,
    method: 'GET',
    handler: 'NetworkFirst',
    options: {
      cacheName: WORKBOX_CACHE_NAMES.apiTranslations,
      networkTimeoutSeconds: 4,
      cacheableResponse: {
        statuses: [0, 200],
      },
      expiration: {
        maxEntries: 100,
        maxAgeSeconds: TWO_WEEKS,
        purgeOnQuotaError: true,
      },
    },
  },

  // =========================================================================
  // Layer 3: Map Tiles & Profile / Storage Images
  // =========================================================================
  {
    // Slippy map tiles (OpenStreetMap, ArcGIS World Street Map, Google Maps static assets)
    urlPattern:
      /^https:\/\/(([a-c]\.)?tile\.openstreetmap\.org\/|server\.arcgisonline\.com\/ArcGIS\/rest\/services\/|maps\.gstatic\.com\/)/i,
    method: 'GET',
    handler: 'CacheFirst',
    options: {
      cacheName: WORKBOX_CACHE_NAMES.mapTiles,
      cacheableResponse: {
        statuses: [0, 200],
      },
      expiration: {
        maxEntries: 200,
        maxAgeSeconds: TWO_WEEKS,
        purgeOnQuotaError: true,
      },
    },
  },
  {
    // User avatars & external image assets (Google User Content + Firebase Storage images, non-Range GET)
    urlPattern: ({ request, url }) =>
      request.method === 'GET' &&
      !request.headers.has('range') &&
      (/(^|\.)googleusercontent\.com$/i.test(url.hostname) ||
        (/^firebasestorage\.googleapis\.com$/i.test(url.hostname) &&
          request.destination === 'image')),
    method: 'GET',
    handler: 'StaleWhileRevalidate',
    options: {
      cacheName: WORKBOX_CACHE_NAMES.avatarsAndImages,
      cacheableResponse: {
        statuses: [0, 200],
      },
      expiration: {
        maxEntries: 100,
        maxAgeSeconds: ONE_WEEK,
        purgeOnQuotaError: true,
      },
    },
  },
];

export const WORKBOX_CONFIG = {
  maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
  cleanupOutdatedCaches: true,
  clientsClaim: true,
  globPatterns: ['**/*.{js,css,html,ico,png,svg,webp,woff,woff2,webmanifest}'],
  globIgnores: [
    '**/firebase-messaging-sw.js',
    '**/workbox-*.js',
    '**/assets/aistudio/**',
  ],
  navigateFallback: 'index.html',
  navigateFallbackDenylist: WORKBOX_NAVIGATE_FALLBACK_DENYLIST,
  runtimeCaching: WORKBOX_RUNTIME_CACHING,
};

/**
 * Evaluates which Workbox runtimeCaching rule matches a given request (first-match-wins,
 * mirroring Workbox Router semantics). Useful for deterministic automated verification.
 */
export function matchWorkboxRuntimeRule(
  urlInput: string | URL,
  options?: {
    method?: WorkboxHttpMethod;
    sameOrigin?: boolean;
    destination?: RequestDestination;
    headers?: Record<string, string>;
  }
): WorkboxRuntimeCachingRule | null {
  const url = typeof urlInput === 'string' ? new URL(urlInput) : urlInput;
  const method = (options?.method || 'GET').toUpperCase() as WorkboxHttpMethod;
  const sameOrigin = options?.sameOrigin ?? false;
  const headers = new Headers(options?.headers || {});
  const request = {
    method,
    url: url.toString(),
    destination: options?.destination ?? '',
    headers,
  } as unknown as Request;

  for (const rule of WORKBOX_RUNTIME_CACHING) {
    const ruleMethod = rule.method ?? 'GET';
    if (ruleMethod !== method) continue;

    if (rule.urlPattern instanceof RegExp) {
      if (rule.urlPattern.test(url.href)) {
        return rule;
      }
    } else if (rule.urlPattern({ url, request, sameOrigin })) {
      return rule;
    }
  }

  return null;
}
