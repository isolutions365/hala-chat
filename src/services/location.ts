import { Language } from '../types';

export type LocationPermissionState = 'granted' | 'denied' | 'prompt' | 'unknown';

export type LocationErrorCode =
  | 'UNSUPPORTED'
  | 'PERMISSION_DENIED'
  | 'POSITION_UNAVAILABLE'
  | 'TIMEOUT'
  | 'UNKNOWN';

export interface GeolocationRequestOptions {
  enableHighAccuracy: boolean;
  timeout: number;
  maximumAge: number;
}

export interface CoordinatesResult {
  latitude: number;
  longitude: number;
  accuracy: number | null;
}

export interface ResolvedLocationResult extends CoordinatesResult {
  locationName: string;
  mapsUrl: string;
  usedFallbackAccuracy: boolean;
}

/**
 * Pluggable adapter interface so the web navigator.geolocation implementation
 * can be swapped cleanly for @capacitor/geolocation in native builds:
 *
 * ```ts
 * import { Geolocation } from '@capacitor/geolocation';
 * setLocationProviderAdapter({
 *   checkPermission: async () => (await Geolocation.checkPermissions()).location,
 *   requestPermission: async () => (await Geolocation.requestPermissions()).location,
 *   getCurrentPosition: async (opts) => {
 *     const pos = await Geolocation.getCurrentPosition(opts);
 *     return {
 *       latitude: pos.coords.latitude,
 *       longitude: pos.coords.longitude,
 *       accuracy: pos.coords.accuracy ?? null,
 *     };
 *   },
 * });
 * ```
 */
export interface LocationProviderAdapter {
  checkPermission(): Promise<LocationPermissionState>;
  requestPermission(): Promise<LocationPermissionState>;
  getCurrentPosition(options: GeolocationRequestOptions): Promise<CoordinatesResult>;
}

export class LocationServiceError extends Error {
  public readonly code: LocationErrorCode;

  constructor(code: LocationErrorCode, message: string) {
    super(message);
    this.name = 'LocationServiceError';
    this.code = code;
  }
}

function mapNativeGeolocationError(err: unknown): LocationServiceError {
  if (err instanceof LocationServiceError) {
    return err;
  }
  const anyErr = err as { code?: number; message?: string } | null;
  const code = anyErr?.code;
  const rawMessage = String(anyErr?.message || '');
  const lower = rawMessage.toLowerCase();

  if (code === 1 || lower.includes('denied') || lower.includes('permissions policy')) {
    return new LocationServiceError(
      'PERMISSION_DENIED',
      rawMessage || 'Location permission was denied.'
    );
  }
  if (code === 2 || lower.includes('unavailable')) {
    return new LocationServiceError(
      'POSITION_UNAVAILABLE',
      rawMessage || 'Location information is unavailable.'
    );
  }
  if (code === 3 || lower.includes('timeout')) {
    return new LocationServiceError(
      'TIMEOUT',
      rawMessage || 'Location request timed out.'
    );
  }
  return new LocationServiceError(
    'UNKNOWN',
    rawMessage || 'Failed to detect current location.'
  );
}

export const webGeolocationAdapter: LocationProviderAdapter = {
  async checkPermission(): Promise<LocationPermissionState> {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') {
      return 'unknown';
    }
    if (!window.isSecureContext && !['localhost', '127.0.0.1'].includes(window.location.hostname)) {
      return 'denied';
    }
    if (!('permissions' in navigator) || typeof navigator.permissions?.query !== 'function') {
      return 'unknown';
    }
    try {
      const status = await navigator.permissions.query({
        name: 'geolocation' as PermissionName,
      });
      if (status.state === 'granted' || status.state === 'denied' || status.state === 'prompt') {
        return status.state;
      }
      return 'unknown';
    } catch {
      return 'unknown';
    }
  },

  async requestPermission(): Promise<LocationPermissionState> {
    return this.checkPermission();
  },

  async getCurrentPosition(options: GeolocationRequestOptions): Promise<CoordinatesResult> {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      throw new LocationServiceError(
        'UNSUPPORTED',
        'Geolocation is not supported in this browser.'
      );
    }
    if (
      typeof window !== 'undefined' &&
      !window.isSecureContext &&
      !['localhost', '127.0.0.1'].includes(window.location.hostname)
    ) {
      throw new LocationServiceError(
        'UNSUPPORTED',
        'Location requires a secure HTTPS connection.'
      );
    }

    return new Promise<CoordinatesResult>((resolve, reject) => {
      let settled = false;
      // Guard against browsers where native geolocation timeout fails to fire
      const safetyTimer = setTimeout(() => {
        if (!settled) {
          settled = true;
          reject(new LocationServiceError('TIMEOUT', 'Location request timed out.'));
        }
      }, options.timeout + 1500);

      navigator.geolocation.getCurrentPosition(
        (position) => {
          if (settled) return;
          settled = true;
          clearTimeout(safetyTimer);
          resolve({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy:
              typeof position.coords.accuracy === 'number'
                ? position.coords.accuracy
                : null,
          });
        },
        (error) => {
          if (settled) return;
          settled = true;
          clearTimeout(safetyTimer);
          reject(mapNativeGeolocationError(error));
        },
        {
          enableHighAccuracy: options.enableHighAccuracy,
          timeout: options.timeout,
          maximumAge: options.maximumAge,
        }
      );
    });
  },
};

let activeLocationAdapter: LocationProviderAdapter = webGeolocationAdapter;

export function setLocationProviderAdapter(adapter: LocationProviderAdapter): void {
  activeLocationAdapter = adapter;
}

export function getLocationProviderAdapter(): LocationProviderAdapter {
  return activeLocationAdapter;
}

export function buildGoogleMapsUrl(latitude: number, longitude: number): string {
  return `https://www.google.com/maps?q=${encodeURIComponent(`${latitude},${longitude}`)}`;
}

export function sanitizeMapsUrl(url: string | undefined, latitude?: number, longitude?: number): string {
  if (url) {
    try {
      const parsed = new URL(url);
      if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
        return parsed.toString();
      }
    } catch {
      // ignore invalid URL
    }
  }
  if (typeof latitude === 'number' && typeof longitude === 'number') {
    return buildGoogleMapsUrl(latitude, longitude);
  }
  return '';
}

export function calculateDistanceKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function formatDistanceLabel(km: number, isRtl: boolean): string {
  if (!Number.isFinite(km) || km < 0) return '';
  if (km < 1) {
    const meters = Math.max(10, Math.round((km * 1000) / 10) * 10);
    return isRtl ? `على بُعد ${meters} م` : `${meters} m away`;
  }
  const rounded = km < 10 ? km.toFixed(1) : Math.round(km).toString();
  return isRtl ? `على بُعد ${rounded} كم` : `${rounded} km away`;
}

export function getLocationErrorMessage(error: unknown, isRtl: boolean): string {
  const mapped = mapNativeGeolocationError(error);
  switch (mapped.code) {
    case 'UNSUPPORTED':
      return isRtl
        ? 'تحديد الموقع غير مدعوم في هذا المتصفح أو يتطلب اتصالاً آمناً (HTTPS).'
        : 'Location is not supported in this browser or requires HTTPS.';
    case 'PERMISSION_DENIED':
      return isRtl
        ? 'تم رفض صلاحية الوصول إلى الموقع. يرجى تفعيل الموقع من إعدادات المتصفح ثم المحاولة مجدداً.'
        : 'Location permission was denied. Please allow location access in your browser settings and try again.';
    case 'TIMEOUT':
      return isRtl
        ? 'انتهت مهلة تحديد الموقع. تأكد من تفعيل خدمات الموقع وحاول مرة أخرى.'
        : 'Location request timed out. Please ensure location services are turned on and try again.';
    case 'POSITION_UNAVAILABLE':
      return isRtl
        ? 'تعذر تحديد موقعك حالياً. تحقق من إشارة الشبكة أو نظام GPS وحاول مرة أخرى.'
        : 'Your location is currently unavailable. Check your GPS or network signal and try again.';
    default:
      return isRtl
        ? 'تعذر تحديد موقعك الجغرافي. يرجى المحاولة مرة أخرى.'
        : 'Could not detect your location. Please try again.';
  }
}

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export function getGoogleMapsApiKey(): string {
  if (typeof import.meta !== 'undefined' && import.meta.env?.VITE_GOOGLE_MAPS_API_KEY) {
    return String(import.meta.env.VITE_GOOGLE_MAPS_API_KEY).trim();
  }
  return '';
}

export function reportGmpQuotaErrorIfApplicable(error: unknown): boolean {
  if (typeof window === 'undefined') return false;
  const anyErr = error as { status?: number | string; code?: number | string; message?: string } | null;
  const text = [
    anyErr?.status,
    anyErr?.code,
    anyErr?.message,
    typeof error === 'string' ? error : '',
  ]
    .filter(Boolean)
    .join(' ');

  if (
    text.includes('429') ||
    text.includes('RESOURCE_EXHAUSTED') ||
    text.includes('OVER_QUERY_LIMIT') ||
    text.includes('OVER_DAILY_LIMIT') ||
    text.includes('OverQuotaMapError') ||
    text.includes('QuotaExceededError')
  ) {
    window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
    return true;
  }
  return false;
}

export async function reverseGeocodeCoordinates(
  latitude: number,
  longitude: number,
  language: Language
): Promise<string> {
  const isRtl = language === 'ar';
  const fallbackName = isRtl ? 'الموقع الجغرافي' : 'Location';
  const langParam = isRtl ? 'ar' : 'en';

  // 1. Prefer official Google Maps JS SDK Geocoding wrapper when API key & SDK are available
  const googleMapsApiKey = getGoogleMapsApiKey();
  const mapsGlobal =
    typeof window !== 'undefined'
      ? (window as unknown as { google?: { maps?: { importLibrary?: (name: string) => Promise<unknown> } } }).google
      : undefined;

  if (googleMapsApiKey && mapsGlobal?.maps?.importLibrary) {
    try {
      const geocodingLib = (await mapsGlobal.maps.importLibrary('geocoding')) as {
        Geocoder: new () => {
          geocode: (req: {
            location: { lat: number; lng: number };
            language?: string;
          }) => Promise<{ results?: Array<{ formatted_address?: string }> }>;
        };
      };
      const geocoder = new geocodingLib.Geocoder();
      const response = await geocoder.geocode({
        location: { lat: latitude, lng: longitude },
        language: langParam,
      });
      const formatted = response?.results?.[0]?.formatted_address;
      if (typeof formatted === 'string' && formatted.trim()) {
        return formatted.split(',').slice(0, 3).join(', ').trim();
      }
    } catch (err) {
      reportGmpQuotaErrorIfApplicable(err);
      // Fall through to Nominatim fallback
    }
  }

  // 2. Fallback to OpenStreetMap Nominatim with strict timeout
  try {
    const osmUrl = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${encodeURIComponent(
      String(latitude)
    )}&lon=${encodeURIComponent(String(longitude))}&accept-language=${langParam}`;
    const res = await fetchWithTimeout(osmUrl, 4500);
    if (res.ok) {
      const data = await res.json();
      if (typeof data?.display_name === 'string' && data.display_name.trim()) {
        const parts = data.display_name.split(',').slice(0, 3).join(', ').trim();
        return parts || data.display_name.trim();
      }
    }
  } catch {
    // Return coordinate-safe fallback label
  }

  return fallbackName;
}

/**
 * Acquires current coordinates with high-accuracy first and automatic
 * low-accuracy fallback on timeout or unavailability, then resolves
 * a human-readable location label and safe Google Maps URL.
 */
export async function getCurrentLocationWithAddress(params: {
  language: Language;
  highAccuracyTimeoutMs?: number;
  lowAccuracyTimeoutMs?: number;
  onFallbackToLowAccuracy?: () => void;
}): Promise<ResolvedLocationResult> {
  const highTimeout = params.highAccuracyTimeoutMs ?? 8000;
  const lowTimeout = params.lowAccuracyTimeoutMs ?? 12000;

  const perm = await activeLocationAdapter.checkPermission();
  if (perm === 'denied') {
    throw new LocationServiceError(
      'PERMISSION_DENIED',
      'Location permission was denied.'
    );
  }
  if (perm === 'prompt') {
    const requested = await activeLocationAdapter.requestPermission();
    if (requested === 'denied') {
      throw new LocationServiceError(
        'PERMISSION_DENIED',
        'Location permission was denied.'
      );
    }
  }

  let coords: CoordinatesResult;
  let usedFallbackAccuracy = false;

  try {
    coords = await activeLocationAdapter.getCurrentPosition({
      enableHighAccuracy: true,
      timeout: highTimeout,
      maximumAge: 15000,
    });
  } catch (highErr) {
    const mapped = mapNativeGeolocationError(highErr);
    if (mapped.code === 'PERMISSION_DENIED' || mapped.code === 'UNSUPPORTED') {
      throw mapped;
    }

    // Retry with low accuracy (Wi-Fi / network triangulation) on timeout or GPS unavailability
    usedFallbackAccuracy = true;
    params.onFallbackToLowAccuracy?.();
    coords = await activeLocationAdapter.getCurrentPosition({
      enableHighAccuracy: false,
      timeout: lowTimeout,
      maximumAge: 60000,
    });
  }

  const locationName = await reverseGeocodeCoordinates(
    coords.latitude,
    coords.longitude,
    params.language
  );

  return {
    ...coords,
    locationName,
    mapsUrl: buildGoogleMapsUrl(coords.latitude, coords.longitude),
    usedFallbackAccuracy,
  };
}
