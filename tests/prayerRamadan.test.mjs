import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  calculateQiblaBearing,
  getQiblaAlignment,
  gregorianToHijri,
  isRamadanMonth,
  PRAYER_CITY_PRESETS,
} from '../src/lib/prayerTimes.ts';
import {
  isRamadanModeActive,
  readPrayerMode,
  readRamadanPreference,
  savePrayerMode,
  saveRamadanPreference,
} from '../src/lib/prayerSettings.ts';

function setupMockStorage() {
  const map = new Map();
  globalThis.localStorage = {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
  return () => {
    delete globalThis.localStorage;
  };
}

test('Prayer mode is separate and defaults to ON, allowing user toggle', () => {
  const cleanup = setupMockStorage();
  try {
    assert.equal(readPrayerMode(), true);
    assert.equal(savePrayerMode(false), true);
    assert.equal(readPrayerMode(), false);
    assert.equal(savePrayerMode(true), true);
    assert.equal(readPrayerMode(), true);
  } finally {
    cleanup();
  }
});

test('Ramadan mode auto-activates when Ramadan month starts and honors manual on/off', () => {
  const cleanup = setupMockStorage();
  try {
    assert.equal(readRamadanPreference(), 'auto');

    // Mid-Ramadan 1447 (~late Feb 2026) vs non-Ramadan (Nov 2026)
    const ramadanDate = new Date(2026, 1, 25); // Feb 25, 2026
    const nonRamadanDate = new Date(2026, 10, 25); // Nov 25, 2026

    assert.equal(gregorianToHijri(ramadanDate).month, 9);
    assert.equal(isRamadanMonth(ramadanDate), true);
    assert.equal(isRamadanMonth(nonRamadanDate), false);

    assert.equal(isRamadanModeActive('auto', ramadanDate), true);
    assert.equal(isRamadanModeActive('auto', nonRamadanDate), false);

    // User can manually turn Ramadan ON anytime
    saveRamadanPreference('on');
    assert.equal(readRamadanPreference(), 'on');
    assert.equal(isRamadanModeActive('on', nonRamadanDate), true);

    // User can manually turn Ramadan OFF even during Ramadan
    saveRamadanPreference('off');
    assert.equal(readRamadanPreference(), 'off');
    assert.equal(isRamadanModeActive('off', ramadanDate), false);
  } finally {
    cleanup();
  }
});

test('Qibla bearing and compass alignment math work accurately including 0/360 wraparound', () => {
  const riyadhQibla = calculateQiblaBearing(24.7136, 46.6753);
  assert.ok(riyadhQibla > 235 && riyadhQibla < 255, `Expected ~244 deg from Riyadh, got ${riyadhQibla}`);

  const karachiQibla = calculateQiblaBearing(24.8607, 67.0011);
  assert.ok(karachiQibla > 260 && karachiQibla < 275, `Expected ~267 deg from Karachi, got ${karachiQibla}`);

  // Aligned within +-5 degrees
  const aligned = getQiblaAlignment(riyadhQibla, riyadhQibla + 3);
  assert.equal(aligned.isAligned, true);

  // Facing 30 deg left of Qibla -> must turn right (+30)
  const turnRight = getQiblaAlignment(250, 220);
  assert.equal(turnRight.isAligned, false);
  assert.equal(Math.round(turnRight.signedDeltaDeg), 30);

  // Facing 30 deg right of Qibla -> must turn left (-30)
  const turnLeft = getQiblaAlignment(250, 280);
  assert.equal(turnLeft.isAligned, false);
  assert.equal(Math.round(turnLeft.signedDeltaDeg), -30);

  // Wraparound check: Qibla = 2 deg, heading = 359 deg -> +3 deg, aligned
  const wrapAligned = getQiblaAlignment(2, 359);
  assert.equal(wrapAligned.isAligned, true);
  assert.equal(Math.round(wrapAligned.signedDeltaDeg), 3);

  assert.ok(PRAYER_CITY_PRESETS.length >= 10);
});

test('Prayer and Ramadan controls are placed in both MajlisDraft and SettingsModal, with working QiblaCompass', async () => {
  const [majlisSrc, settingsSrc, compassSrc] = await Promise.all([
    readFile('src/components/MajlisDraft.tsx', 'utf8'),
    readFile('src/components/SettingsModal.tsx', 'utf8'),
    readFile('src/components/QiblaCompass.tsx', 'utf8'),
  ]);

  assert.equal(majlisSrc.includes('PrayerRamadanSection'), true);
  assert.equal(settingsSrc.includes('PrayerRamadanSection'), true);
  assert.equal(compassSrc.includes('deviceorientationabsolute'), true);
  assert.equal(compassSrc.includes('webkitCompassHeading'), true);
  assert.equal(compassSrc.includes('getQiblaAlignment'), true);
});

test('Ramadan badge and entire UI use text-matched semantic icons instead of Sparkles', async () => {
  const { readdir } = await import('node:fs/promises');
  const path = await import('node:path');

  async function collectFiles(dir) {
    const entries = await readdir(dir, { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...(await collectFiles(fullPath)));
      } else if (/\.(ts|tsx)$/.test(entry.name)) {
        files.push(fullPath);
      }
    }
    return files;
  }

  const srcFiles = await collectFiles('src');
  for (const file of srcFiles) {
    const content = await readFile(file, 'utf8');
    assert.equal(/\bSparkles\b/.test(content), false, `Found Sparkles in ${file}`);
  }

  const prayerRamadanSrc = await readFile('src/components/PrayerRamadanSection.tsx', 'utf8');
  for (const iconName of ['CalendarClock', 'Moon', 'CheckCircle2', 'Power']) {
    assert.equal(prayerRamadanSrc.includes(iconName), true, `Expected ${iconName} in PrayerRamadanSection.tsx`);
  }
});

