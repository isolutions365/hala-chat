import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  WORKBOX_CACHE_NAMES,
  WORKBOX_CONFIG,
  WORKBOX_NAVIGATE_FALLBACK_DENYLIST,
  WORKBOX_RUNTIME_CACHING,
  USER_SCOPED_CACHE_NAMES,
  matchWorkboxRuntimeRule,
} from '../src/lib/workboxConfig.ts';

test('1. Precache config includes static UI extensions, cleans outdated caches, and excludes debug uploads & FCM SW', () => {
  assert.equal(WORKBOX_CONFIG.cleanupOutdatedCaches, true);
  assert.equal(WORKBOX_CONFIG.clientsClaim, true);
  assert.equal(WORKBOX_CONFIG.navigateFallback, 'index.html');
  assert.equal(WORKBOX_CONFIG.globPatterns.some((p) => p.includes('js,css,html')), true);
  assert.equal(WORKBOX_CONFIG.globIgnores.includes('**/firebase-messaging-sw.js'), true);
  assert.equal(WORKBOX_CONFIG.globIgnores.includes('**/assets/aistudio/**'), true);
});

test('2. navigateFallbackDenylist excludes API routes, FCM SW, Firebase reserved paths, welcome.html, and static files', () => {
  const deniedPaths = [
    '/api/media-proxy?url=abc',
    '/api/transcribe',
    '/__/auth/handler',
    '/firebase-messaging-sw.js',
    '/welcome.html',
    '/icons/icon-192.png',
    '/manifest.webmanifest',
  ];
  for (const path of deniedPaths) {
    const isDenied = WORKBOX_NAVIGATE_FALLBACK_DENYLIST.some((re) => re.test(path));
    assert.equal(isDenied, true, `Expected ${path} to be excluded from navigateFallback`);
  }

  const allowedSpaRoutes = ['/', '/chat/abc123', '/settings/privacy', '/reels'];
  for (const route of allowedSpaRoutes) {
    const isDenied = WORKBOX_NAVIGATE_FALLBACK_DENYLIST.some((re) => re.test(route));
    assert.equal(isDenied, false, `Expected SPA route ${route} to fall back to index.html`);
  }
});

test('3. Static UI assets (Google Fonts & same-origin icons/images/fonts/scripts) use fast cache strategies', () => {
  const fontCss = matchWorkboxRuntimeRule(
    'https://fonts.googleapis.com/css2?family=Cairo:wght@400;700&display=swap'
  );
  assert.equal(fontCss?.handler, 'StaleWhileRevalidate');
  assert.equal(fontCss?.options?.cacheName, WORKBOX_CACHE_NAMES.googleFontsStylesheets);

  const fontFile = matchWorkboxRuntimeRule(
    'https://fonts.gstatic.com/s/cairo/v28/SLXGc1nY6HkvangtZmpQdkhzfH5lkSs2SgRjCAGMQ1z0hOA-W1Q.woff2'
  );
  assert.equal(fontFile?.handler, 'CacheFirst');
  assert.equal(fontFile?.options?.cacheName, WORKBOX_CACHE_NAMES.googleFontsWebfonts);

  const localIcon = matchWorkboxRuntimeRule('https://hala-chat-topaz.vercel.app/icons/icon-512.png', {
    sameOrigin: true,
    destination: 'image',
  });
  assert.equal(localIcon?.handler, 'StaleWhileRevalidate');
  assert.equal(localIcon?.options?.cacheName, WORKBOX_CACHE_NAMES.staticUiAssets);

  // FCM service worker script must NOT be intercepted by static UI cache
  const fcmSw = matchWorkboxRuntimeRule(
    'https://hala-chat-topaz.vercel.app/firebase-messaging-sw.js',
    { sameOrigin: true, destination: 'script' }
  );
  assert.equal(fcmSw, null);
});

test('4. Critical read-only APIs use NetworkFirst with 4s timeout fallback for intermittent connectivity', () => {
  const genericApi = matchWorkboxRuntimeRule('https://hala-chat-topaz.vercel.app/api/health', {
    sameOrigin: true,
    method: 'GET',
  });
  assert.equal(genericApi?.handler, 'NetworkFirst');
  assert.equal(genericApi?.options?.cacheName, WORKBOX_CACHE_NAMES.apiCritical);
  assert.equal(genericApi?.options?.networkTimeoutSeconds, 4);

  const nominatimReverse = matchWorkboxRuntimeRule(
    'https://nominatim.openstreetmap.org/reverse?format=json&lat=24.71&lon=46.67'
  );
  assert.equal(nominatimReverse?.handler, 'NetworkFirst');
  assert.equal(nominatimReverse?.options?.cacheName, WORKBOX_CACHE_NAMES.apiGeocoding);
  assert.equal(nominatimReverse?.options?.networkTimeoutSeconds, 4);

  const translatePrimary = matchWorkboxRuntimeRule(
    'https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=ar&dt=t&q=hello'
  );
  assert.equal(translatePrimary?.handler, 'NetworkFirst');
  assert.equal(translatePrimary?.options?.cacheName, WORKBOX_CACHE_NAMES.apiTranslations);

  const translateFallback = matchWorkboxRuntimeRule(
    'https://api.mymemory.translated.net/get?q=hello&langpair=Autodetect|ar'
  );
  assert.equal(translateFallback?.handler, 'NetworkFirst');
  assert.equal(translateFallback?.options?.cacheName, WORKBOX_CACHE_NAMES.apiTranslations);
});

test('5. Media proxy caches full GET responses but bypasses HTTP Range requests for video/audio seeking', () => {
  const fullMediaReq = matchWorkboxRuntimeRule(
    'https://hala-chat-topaz.vercel.app/api/media-proxy?url=https%3A%2F%2Fexample.com%2Fimg.jpg',
    { sameOrigin: true, method: 'GET' }
  );
  assert.equal(fullMediaReq?.handler, 'CacheFirst');
  assert.equal(fullMediaReq?.options?.cacheName, WORKBOX_CACHE_NAMES.apiMedia);

  const rangeMediaReq = matchWorkboxRuntimeRule(
    'https://hala-chat-topaz.vercel.app/api/media-proxy?url=https%3A%2F%2Fexample.com%2Fvid.mp4',
    { sameOrigin: true, method: 'GET', headers: { Range: 'bytes=0-1048575' } }
  );
  assert.equal(rangeMediaReq, null);
});

test('6. Map tiles & profile/storage images are cached with bounded LRU limits', () => {
  const osmTile = matchWorkboxRuntimeRule('https://tile.openstreetmap.org/12/2560/1712.png');
  assert.equal(osmTile?.handler, 'CacheFirst');
  assert.equal(osmTile?.options?.cacheName, WORKBOX_CACHE_NAMES.mapTiles);

  const arcgisTile = matchWorkboxRuntimeRule(
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/12/1712/2560'
  );
  assert.equal(arcgisTile?.handler, 'CacheFirst');
  assert.equal(arcgisTile?.options?.cacheName, WORKBOX_CACHE_NAMES.mapTiles);

  const googleAvatar = matchWorkboxRuntimeRule(
    'https://lh3.googleusercontent.com/a/ACg8ocSampleAvatar=s96-c',
    { destination: 'image' }
  );
  assert.equal(googleAvatar?.handler, 'StaleWhileRevalidate');
  assert.equal(googleAvatar?.options?.cacheName, WORKBOX_CACHE_NAMES.avatarsAndImages);

  const firebaseImage = matchWorkboxRuntimeRule(
    'https://firebasestorage.googleapis.com/v0/b/hala-chat.appspot.com/o/avatars%2Fu1.jpg?alt=media',
    { destination: 'image' }
  );
  assert.equal(firebaseImage?.handler, 'StaleWhileRevalidate');
  assert.equal(firebaseImage?.options?.cacheName, WORKBOX_CACHE_NAMES.avatarsAndImages);
});

test('7. Security & realtime endpoints are strictly NetworkOnly and POST mutations are never cached', () => {
  const networkOnlyUrls = [
    'https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=abc',
    'https://securetoken.googleapis.com/v1/token?key=abc',
    'https://firestore.googleapis.com/google.firestore.v1.Firestore/Listen/channel',
    'https://www.google.com/recaptcha/api2/anchor',
    'https://www.gstatic.com/recaptcha/releases/abc/recaptcha__en.js',
    'https://hala-chat-topaz.vercel.app/api/transcribe',
    'https://hala-chat-topaz.vercel.app/api/quick-replies',
    'https://hala-chat-topaz.vercel.app/api/auth/native-bridge-status',
    'https://europe-west1-gen-lang-client-0446181078.cloudfunctions.net/api/auth/native-bridge-status',
  ];

  for (const url of networkOnlyUrls) {
    const matched = matchWorkboxRuntimeRule(url, { sameOrigin: url.includes('hala-chat-topaz') });
    assert.equal(
      matched?.handler,
      'NetworkOnly',
      `Expected ${url} to match NetworkOnly, got ${matched?.handler ?? 'null'}`
    );
  }

  // POST mutations must never hit any GET caching rule
  const postApi = matchWorkboxRuntimeRule('https://hala-chat-topaz.vercel.app/api/messages', {
    sameOrigin: true,
    method: 'POST',
  });
  assert.equal(postApi, null);
});

test('8. Every caching rule defines bounded expiration + purgeOnQuotaError and self-contained urlPattern', () => {
  for (const rule of WORKBOX_RUNTIME_CACHING) {
    if (rule.handler !== 'NetworkOnly') {
      assert.ok(rule.options?.cacheName, `Missing cacheName for handler ${rule.handler}`);
      assert.ok(
        (rule.options?.expiration?.maxEntries ?? 0) > 0,
        `Missing positive maxEntries for ${rule.options?.cacheName}`
      );
      assert.ok(
        (rule.options?.expiration?.maxAgeSeconds ?? 0) > 0,
        `Missing positive maxAgeSeconds for ${rule.options?.cacheName}`
      );
      assert.equal(
        rule.options?.expiration?.purgeOnQuotaError,
        true,
        `Expected purgeOnQuotaError=true for ${rule.options?.cacheName}`
      );
    }

    // Verify function urlPatterns serialize cleanly for workbox-build with zero outer closures
    if (typeof rule.urlPattern === 'function') {
      const serialized = rule.urlPattern.toString();
      const rehydrated = new Function(`return (${serialized});`)();
      assert.equal(typeof rehydrated, 'function');
      const result = rehydrated({
        url: new URL('https://hala-chat-topaz.vercel.app/icons/icon-192.png'),
        request: { method: 'GET', destination: 'image', headers: new Headers() },
        sameOrigin: true,
      });
      assert.equal(typeof result, 'boolean');
    }
  }
});

test('9. User-scoped cache list purges private/API caches on logout without touching static shell/fonts/tiles', () => {
  assert.equal(USER_SCOPED_CACHE_NAMES.includes(WORKBOX_CACHE_NAMES.apiMedia), true);
  assert.equal(USER_SCOPED_CACHE_NAMES.includes(WORKBOX_CACHE_NAMES.apiCritical), true);
  assert.equal(USER_SCOPED_CACHE_NAMES.includes(WORKBOX_CACHE_NAMES.avatarsAndImages), true);
  assert.equal(USER_SCOPED_CACHE_NAMES.includes(WORKBOX_CACHE_NAMES.apiTranslations), true);

  assert.equal(USER_SCOPED_CACHE_NAMES.includes(WORKBOX_CACHE_NAMES.staticUiAssets), false);
  assert.equal(USER_SCOPED_CACHE_NAMES.includes(WORKBOX_CACHE_NAMES.googleFontsWebfonts), false);
  assert.equal(USER_SCOPED_CACHE_NAMES.includes(WORKBOX_CACHE_NAMES.mapTiles), false);
});
