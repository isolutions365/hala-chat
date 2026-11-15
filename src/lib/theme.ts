export type ThemeMode = 'dark' | 'light' | 'system';

const THEME_STORAGE_KEY = 'hala_theme_mode';

export function getSavedTheme(): ThemeMode {
  if (typeof window === 'undefined') return 'dark';
  const saved = localStorage.getItem(THEME_STORAGE_KEY);
  if (saved === 'dark' || saved === 'light' || saved === 'system') {
    return saved;
  }
  return 'dark';
}

export function applyTheme(mode: ThemeMode): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, mode);
  } catch {}

  const root = document.documentElement;
  const body = document.body;

  let isDark = false;
  if (mode === 'dark') {
    isDark = true;
  } else if (mode === 'light') {
    isDark = false;
  } else {
    isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  }

  root.classList.toggle('dark', isDark);
  body.classList.toggle('dark', isDark);
  root.style.colorScheme = isDark ? 'dark' : 'light';
}

export function initThemeListener(): () => void {
  if (typeof window === 'undefined') return () => {};
  const mode = getSavedTheme();
  applyTheme(mode);

  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  const handleChange = () => {
    if (getSavedTheme() === 'system') {
      applyTheme('system');
    }
  };

  mediaQuery.addEventListener('change', handleChange);
  return () => mediaQuery.removeEventListener('change', handleChange);
}
