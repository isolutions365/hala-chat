import { useEffect, useState } from 'react';

export type ThemeMode = 'dark' | 'light' | 'system';
export type ResolvedTheme = 'dark' | 'light';

export const THEME_STORAGE_KEY = 'hala_theme_mode';
export const THEME_CHANGE_EVENT = 'hala-theme-changed';

export function getSavedTheme(): ThemeMode {
  if (typeof window === 'undefined') return 'dark';
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === 'dark' || saved === 'light' || saved === 'system') {
      return saved;
    }
  } catch {
    // ignore storage errors
  }
  return 'dark';
}

export function getResolvedTheme(mode?: ThemeMode): ResolvedTheme {
  const effectiveMode = mode ?? getSavedTheme();
  if (effectiveMode === 'dark') return 'dark';
  if (effectiveMode === 'light') return 'light';
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return 'dark';
}

export function applyTheme(mode: ThemeMode): ResolvedTheme {
  if (typeof window === 'undefined') return mode === 'light' ? 'light' : 'dark';
  try {
    localStorage.setItem(THEME_STORAGE_KEY, mode);
  } catch {
    // ignore storage errors
  }

  const resolved = getResolvedTheme(mode);
  const isDark = resolved === 'dark';

  const root = document.documentElement;
  const body = document.body;

  root.classList.toggle('dark', isDark);
  if (body) {
    body.classList.toggle('dark', isDark);
  }
  root.style.colorScheme = resolved;
  if (root.dataset) {
    root.dataset.theme = resolved;
    root.dataset.themeMode = mode;
  }

  const metaTheme = document.querySelector('meta[name="theme-color"]') as HTMLMetaElement | null;
  if (metaTheme) {
    metaTheme.content = isDark ? '#0B141A' : '#087F75';
  }

  try {
    window.dispatchEvent(
      new CustomEvent(THEME_CHANGE_EVENT, {
        detail: { mode, resolved },
      })
    );
  } catch {
    // ignore environments without CustomEvent support
  }

  return resolved;
}

export function initThemeListener(): () => void {
  if (typeof window === 'undefined') return () => {};
  const mode = getSavedTheme();
  applyTheme(mode);

  const mediaQuery = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  const handleMediaChange = () => {
    if (getSavedTheme() === 'system') {
      applyTheme('system');
    }
  };

  const handleStorageChange = (event: StorageEvent) => {
    if (event.key === THEME_STORAGE_KEY) {
      applyTheme(getSavedTheme());
    }
  };

  if (mediaQuery) {
    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', handleMediaChange);
    } else if (typeof mediaQuery.addListener === 'function') {
      mediaQuery.addListener(handleMediaChange);
    }
  }
  window.addEventListener('storage', handleStorageChange);

  return () => {
    if (mediaQuery) {
      if (typeof mediaQuery.removeEventListener === 'function') {
        mediaQuery.removeEventListener('change', handleMediaChange);
      } else if (typeof mediaQuery.removeListener === 'function') {
        mediaQuery.removeListener(handleMediaChange);
      }
    }
    window.removeEventListener('storage', handleStorageChange);
  };
}

export function useResolvedTheme(): ResolvedTheme {
  const [resolved, setResolved] = useState<ResolvedTheme>(() => getResolvedTheme());

  useEffect(() => {
    setResolved(getResolvedTheme());
    const sync = () => setResolved(getResolvedTheme());
    window.addEventListener(THEME_CHANGE_EVENT, sync as EventListener);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(THEME_CHANGE_EVENT, sync as EventListener);
      window.removeEventListener('storage', sync);
    };
  }, []);

  return resolved;
}
