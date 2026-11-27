/**
 * App Configuration and Environment Service
 * Handles public app URL, API base URL resolution, asset paths, and runtime checks
 * for web, Capacitor (iOS/Android), and Electron (Desktop).
 */

import { getApps } from 'firebase/app';
import { getAuth } from 'firebase/auth';

const DEFAULT_CLOUD_FUNCTIONS_API_BASE =
  'https://europe-west1-gen-lang-client-0446181078.cloudfunctions.net/api';
const DEFAULT_PUBLIC_SHARE_URL = 'https://hala-chat-topaz.vercel.app';

export function getPublicAppUrl(): string {
  if (typeof window !== 'undefined') {
    const custom = (import.meta as any).env?.VITE_PUBLIC_APP_URL;
    if (custom && typeof custom === 'string' && custom.trim()) {
      return custom.trim().replace(/\/+$/, '');
    }
    // Standalone Capacitor APK runs on https://localhost — use public share URL for invite links
    if (isNativeRuntime() && window.location.hostname === 'localhost') {
      return DEFAULT_PUBLIC_SHARE_URL;
    }
    // Fallback to current window origin if valid http/https
    if (window.location.protocol.startsWith('http')) {
      return window.location.origin;
    }
  }
  return DEFAULT_PUBLIC_SHARE_URL;
}

export function resolveApiUrl(path: string): string {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  const apiBase = (import.meta as any).env?.VITE_API_BASE_URL;
  if (apiBase && typeof apiBase === 'string' && apiBase.trim()) {
    return `${apiBase.trim().replace(/\/+$/, '')}${cleanPath}`;
  }
  // Standalone Capacitor APK / Electron builds run from bundled local assets (https://localhost or file://)
  // and call Firebase Cloud Functions directly without depending on Vercel.
  if (
    typeof window !== 'undefined' &&
    (isNativeRuntime() ||
      window.location.protocol === 'file:' ||
      window.location.protocol === 'capacitor:')
  ) {
    const stripped = cleanPath.replace(/^\/api(?=\/|$)/, '') || '/';
    return `${DEFAULT_CLOUD_FUNCTIONS_API_BASE}${stripped}`;
  }
  return cleanPath;
}

export async function getCurrentFirebaseIdToken(): Promise<string | null> {
  try {
    const apps = getApps();
    if (apps.length === 0) return null;
    const currentUser = getAuth(apps[0]).currentUser;
    if (!currentUser) return null;
    return await currentUser.getIdToken();
  } catch {
    return null;
  }
}

export async function getApiAuthHeaders(
  extraHeaders: Record<string, string> = {}
): Promise<Record<string, string>> {
  const token = await getCurrentFirebaseIdToken();
  return token
    ? { ...extraHeaders, Authorization: `Bearer ${token}` }
    : { ...extraHeaders };
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
