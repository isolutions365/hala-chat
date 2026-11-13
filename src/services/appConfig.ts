/**
 * App Configuration and Environment Service
 * Handles public app URL, API base URL resolution, asset paths, and runtime checks
 * for web, Capacitor (iOS/Android), and Electron (Desktop).
 */

export function getPublicAppUrl(): string {
  if (typeof window !== 'undefined') {
    const custom = (import.meta as any).env?.VITE_PUBLIC_APP_URL;
    if (custom && typeof custom === 'string' && custom.trim()) {
      return custom.trim().replace(/\/+$/, '');
    }
    // Fallback to current window origin if valid http/https
    if (window.location.protocol.startsWith('http')) {
      return window.location.origin;
    }
  }
  return 'https://hala.app';
}

export function resolveApiUrl(path: string): string {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  const apiBase = (import.meta as any).env?.VITE_API_BASE_URL;
  if (apiBase && typeof apiBase === 'string' && apiBase.trim()) {
    return `${apiBase.trim().replace(/\/+$/, '')}${cleanPath}`;
  }
  // In pure static builds (Electron file:// or Capacitor webview), relative paths work or fallback to public app url
  if (typeof window !== 'undefined' && (window.location.protocol === 'file:' || window.location.protocol === 'capacitor:')) {
    const pub = getPublicAppUrl();
    if (pub.startsWith('http')) {
      return `${pub}${cleanPath}`;
    }
  }
  return cleanPath;
}

export function resolveAssetPath(path: string): string {
  const cleanPath = path.startsWith('/') ? path.slice(1) : path;
  // Use relative path for static webviews (Electron/Capacitor file:// safety)
  return `./${cleanPath}`;
}

export function isNativeRuntime(): boolean {
  if (typeof window === 'undefined') return false;
  const anyWin = window as any;
  return Boolean(
    anyWin.Capacitor?.isNativePlatform?.() ||
    anyWin.navigator?.userAgent?.includes('Electron') ||
    window.location.protocol === 'capacitor:' ||
    window.location.protocol === 'ionic:'
  );
}

export function openExternalUrl(url: string): void {
  if (typeof window === 'undefined') return;
  try {
    const anyWin = window as any;
    if (anyWin.Capacitor?.Plugins?.Browser) {
      anyWin.Capacitor.Plugins.Browser.open({ url });
      return;
    }
  } catch {}
  window.open(url, '_blank', 'noopener,noreferrer');
}
