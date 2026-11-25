import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

function createThemeTestEnv({ initialStorage = {}, initialMediaDark = false } = {}) {
  const storage = new Map(Object.entries(initialStorage));
  const htmlClasses = new Set();
  const bodyClasses = new Set();
  let mediaDark = initialMediaDark;
  const mediaListeners = new Set();
  const windowListeners = new Map();
  const dispatchedEvents = [];
  const metaTheme = { content: '#087F75' };

  const classListFor = (set) => ({
    toggle(cls, force) {
      if (force === undefined) {
        if (set.has(cls)) {
          set.delete(cls);
          return false;
        }
        set.add(cls);
        return true;
      }
      if (force) set.add(cls);
      else set.delete(cls);
      return Boolean(force);
    },
    contains(cls) {
      return set.has(cls);
    },
    add(...items) {
      items.forEach((c) => set.add(c));
    },
    remove(...items) {
      items.forEach((c) => set.delete(c));
    },
  });

  globalThis.localStorage = {
    getItem: (key) => (storage.has(key) ? storage.get(key) : null),
    setItem: (key, val) => storage.set(key, String(val)),
    removeItem: (key) => storage.delete(key),
  };

  globalThis.CustomEvent = class CustomEvent {
    constructor(type, init = {}) {
      this.type = type;
      this.detail = init.detail;
    }
  };

  globalThis.document = {
    documentElement: {
      classList: classListFor(htmlClasses),
      style: {},
      dataset: {},
    },
    body: {
      classList: classListFor(bodyClasses),
    },
    querySelector: (sel) => (sel === 'meta[name="theme-color"]' ? metaTheme : null),
  };

  globalThis.window = {
    matchMedia: (query) => ({
      media: query,
      get matches() {
        return mediaDark;
      },
      addEventListener: (ev, fn) => {
        if (ev === 'change') mediaListeners.add(fn);
      },
      removeEventListener: (ev, fn) => {
        if (ev === 'change') mediaListeners.delete(fn);
      },
      addListener: (fn) => mediaListeners.add(fn),
      removeListener: (fn) => mediaListeners.delete(fn),
    }),
    addEventListener: (ev, fn) => {
      if (!windowListeners.has(ev)) windowListeners.set(ev, new Set());
      windowListeners.get(ev).add(fn);
    },
    removeEventListener: (ev, fn) => {
      windowListeners.get(ev)?.delete(fn);
    },
    dispatchEvent: (ev) => {
      dispatchedEvents.push(ev);
      windowListeners.get(ev.type)?.forEach((fn) => fn(ev));
      return true;
    },
  };

  return {
    storage,
    htmlClasses,
    bodyClasses,
    metaTheme,
    dispatchedEvents,
    setOsDark(next) {
      mediaDark = Boolean(next);
      mediaListeners.forEach((fn) => fn({ matches: mediaDark }));
    },
    cleanup() {
      delete globalThis.localStorage;
      delete globalThis.document;
      delete globalThis.window;
      delete globalThis.CustomEvent;
    },
  };
}

test('Tailwind v4 CSS configures class-based .dark variant instead of OS-only media query', () => {
  const indexCss = fs.readFileSync(path.join(process.cwd(), 'src/index.css'), 'utf8');
  assert.match(
    indexCss,
    /@custom-variant\s+dark\s*\(/,
    'src/index.css must define @custom-variant dark so toggling .dark controls Tailwind dark:* styles'
  );

  const distAssetsDir = path.join(process.cwd(), 'dist/assets');
  if (fs.existsSync(distAssetsDir)) {
    const cssFiles = fs.readdirSync(distAssetsDir).filter((f) => f.endsWith('.css'));
    assert.ok(cssFiles.length > 0, 'Expected built CSS asset in dist/assets');
    const css = fs.readFileSync(path.join(distAssetsDir, cssFiles[0]), 'utf8');
    assert.equal(
      /@media\s*\(prefers-color-scheme:\s*dark\)/.test(css),
      false,
      'Built CSS must NOT lock dark:* utilities behind @media (prefers-color-scheme: dark)'
    );
    assert.match(
      css,
      /:where\(\.dark/,
      'Built CSS must scope dark:* utilities using .dark selector'
    );
  }
});

test('Light, Dark, and System theme modes switch classes and respond to OS changes only in System mode', async () => {
  const env = createThemeTestEnv({ initialMediaDark: false });
  try {
    const themeMod = await import(`../src/lib/theme.ts?t=${Date.now()}`);
    const cleanupListener = themeMod.initThemeListener();

    // Explicit Light mode even if OS turns dark
    themeMod.applyTheme('light');
    assert.equal(themeMod.getSavedTheme(), 'light');
    assert.equal(env.htmlClasses.has('dark'), false);
    assert.equal(env.bodyClasses.has('dark'), false);
    assert.equal(globalThis.document.documentElement.style.colorScheme, 'light');
    env.setOsDark(true);
    assert.equal(env.htmlClasses.has('dark'), false, 'OS change must not override explicit Light mode');

    // Explicit Dark mode even if OS turns light
    themeMod.applyTheme('dark');
    assert.equal(themeMod.getSavedTheme(), 'dark');
    assert.equal(env.htmlClasses.has('dark'), true);
    assert.equal(env.bodyClasses.has('dark'), true);
    assert.equal(globalThis.document.documentElement.style.colorScheme, 'dark');
    env.setOsDark(false);
    assert.equal(env.htmlClasses.has('dark'), true, 'OS change must not override explicit Dark mode');

    // System mode follows OS preference dynamically
    themeMod.applyTheme('system');
    assert.equal(themeMod.getSavedTheme(), 'system');
    assert.equal(env.htmlClasses.has('dark'), false, 'System mode should match OS=light');

    env.setOsDark(true);
    assert.equal(env.htmlClasses.has('dark'), true, 'System mode should update to dark when OS turns dark');

    env.setOsDark(false);
    assert.equal(env.htmlClasses.has('dark'), false, 'System mode should update to light when OS turns light');

    cleanupListener();
  } finally {
    env.cleanup();
  }
});

test('Default chat wallpaper adapts to global dark/light theme', async () => {
  const { resolveWallpaperStyle } = await import(`../src/lib/wallpaperPresets.ts?t=${Date.now()}`);
  const lightDefault = resolveWallpaperStyle('default', false);
  const darkDefault = resolveWallpaperStyle('default', true);
  assert.equal(lightDefault.isDark, false);
  assert.equal(darkDefault.isDark, true);
});

test('Core screens support both Light and Dark variants via Tailwind dark: classes', () => {
  const requiredDarkFiles = [
    'src/components/ChatListScreen.tsx',
    'src/components/SettingsModal.tsx',
    'src/components/CallLogScreen.tsx',
    'src/components/StoriesBar.tsx',
    'src/components/MajlisDraft.tsx',
    'src/components/community/CommunityTab.tsx',
    'src/components/community/CommunityPostCard.tsx',
    'src/components/NotificationSoundsSettings.tsx',
  ];

  for (const rel of requiredDarkFiles) {
    const content = fs.readFileSync(path.join(process.cwd(), rel), 'utf8');
    const matches = content.match(/\bdark:/g) || [];
    assert.ok(
      matches.length >= 3,
      `${rel} must contain dark: theme classes (found ${matches.length})`
    );
  }
});
