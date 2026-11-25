import { useCallback, useEffect, useState } from 'react';
import { safeLocalStorageSet } from './safeStorage.ts';
import { isRamadanMonth, type CityLocationPreset } from './prayerTimes.ts';

export const PRAYER_MODE_KEY = 'hala.prayerMode';
export const RAMADAN_MODE_KEY = 'hala.ramadanMode';
export const PRAYER_LOCATION_KEY = 'hala.prayerLocation.v1';
export const PRAYER_RAMADAN_CHANGE_EVENT = 'hala-prayer-ramadan-changed';

export type RamadanPreference = 'auto' | 'on' | 'off';

export interface SavedPrayerLocation {
  lat: number;
  lng: number;
  labelEn?: string;
  labelAr?: string;
  source?: 'gps' | 'city';
  updatedAt?: number;
}

function getStorage(): Storage | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) return window.localStorage;
    if (typeof globalThis !== 'undefined' && (globalThis as any).localStorage) return (globalThis as any).localStorage;
  } catch {
    // ignore storage access errors
  }
  return null;
}

function emitPrayerSettingsChanged() {
  if (typeof window !== 'undefined' && typeof CustomEvent !== 'undefined') {
    window.dispatchEvent(new CustomEvent(PRAYER_RAMADAN_CHANGE_EVENT));
  }
}

/**
 * Prayer Mode defaults to ON (`true`) so prayer times & Qibla work immediately,
 * while still allowing the user to turn Prayer Mode off/on anytime.
 */
export function readPrayerMode(): boolean {
  try {
    const raw = getStorage()?.getItem(PRAYER_MODE_KEY);
    if (raw === 'false') return false;
    return true;
  } catch {
    return true;
  }
}

export function savePrayerMode(enabled: boolean): boolean {
  const ok = safeLocalStorageSet(PRAYER_MODE_KEY, enabled ? 'true' : 'false');
  emitPrayerSettingsChanged();
  return ok;
}

/**
 * Ramadan Mode supports `'auto'` (default — turns ON automatically during Hijri month 9),
 * `'on'` (user manually turns it on anytime), and `'off'` (user manually turns it off).
 * Backward compatible with `'true'` / `'false'`.
 */
export function readRamadanPreference(): RamadanPreference {
  try {
    const raw = getStorage()?.getItem(RAMADAN_MODE_KEY);
    if (raw === 'true' || raw === 'on') return 'on';
    if (raw === 'false' || raw === 'off') return 'off';
    return 'auto';
  } catch {
    return 'auto';
  }
}

export function saveRamadanPreference(pref: RamadanPreference): boolean {
  const ok = safeLocalStorageSet(RAMADAN_MODE_KEY, pref);
  emitPrayerSettingsChanged();
  return ok;
}

export function isRamadanModeActive(pref: RamadanPreference, date: Date = new Date()): boolean {
  if (pref === 'on') return true;
  if (pref === 'off') return false;
  return isRamadanMonth(date);
}

export function readSavedPrayerLocation(): SavedPrayerLocation | null {
  try {
    const raw = getStorage()?.getItem(PRAYER_LOCATION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      typeof parsed?.lat === 'number' &&
      Number.isFinite(parsed.lat) &&
      typeof parsed?.lng === 'number' &&
      Number.isFinite(parsed.lng)
    ) {
      return {
        lat: parsed.lat,
        lng: parsed.lng,
        labelEn: typeof parsed.labelEn === 'string' ? parsed.labelEn : undefined,
        labelAr: typeof parsed.labelAr === 'string' ? parsed.labelAr : undefined,
        source: parsed.source === 'city' ? 'city' : 'gps',
        updatedAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : undefined,
      };
    }
  } catch {
    // ignore corrupt location
  }
  return null;
}

export function savePrayerLocation(loc: SavedPrayerLocation): boolean {
  const ok = safeLocalStorageSet(
    PRAYER_LOCATION_KEY,
    JSON.stringify({ ...loc, updatedAt: Date.now() })
  );
  emitPrayerSettingsChanged();
  return ok;
}

export function selectCityLocation(city: CityLocationPreset): boolean {
  return savePrayerLocation({
    lat: city.lat,
    lng: city.lng,
    labelEn: city.nameEn,
    labelAr: city.nameAr,
    source: 'city',
  });
}

export function usePrayerAndRamadanSettings() {
  const [prayerEnabled, setPrayerEnabled] = useState<boolean>(() => readPrayerMode());
  const [ramadanPref, setRamadanPref] = useState<RamadanPreference>(() => readRamadanPreference());
  const [location, setLocation] = useState<SavedPrayerLocation | null>(() => readSavedPrayerLocation());

  const refresh = useCallback(() => {
    setPrayerEnabled(readPrayerMode());
    setRamadanPref(readRamadanPreference());
    setLocation(readSavedPrayerLocation());
  }, []);

  useEffect(() => {
    const onStorageOrCustom = () => refresh();
    window.addEventListener('storage', onStorageOrCustom);
    window.addEventListener(PRAYER_RAMADAN_CHANGE_EVENT, onStorageOrCustom);
    return () => {
      window.removeEventListener('storage', onStorageOrCustom);
      window.removeEventListener(PRAYER_RAMADAN_CHANGE_EVENT, onStorageOrCustom);
    };
  }, [refresh]);

  const setPrayer = useCallback((enabled: boolean) => {
    setPrayerEnabled(enabled);
    savePrayerMode(enabled);
  }, []);

  const setRamadan = useCallback((pref: RamadanPreference) => {
    setRamadanPref(pref);
    saveRamadanPreference(pref);
  }, []);

  const updateLocation = useCallback((loc: SavedPrayerLocation) => {
    setLocation(loc);
    savePrayerLocation(loc);
  }, []);

  return {
    prayerEnabled,
    setPrayerEnabled: setPrayer,
    ramadanPref,
    setRamadanPref: setRamadan,
    isRamadanActive: isRamadanModeActive(ramadanPref),
    isCurrentlyRamadanMonth: isRamadanMonth(),
    location,
    updateLocation,
  };
}
