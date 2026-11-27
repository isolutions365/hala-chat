// Pure-math Prayer Times (Muslim World League), Qibla bearing, and Hijri date utilities.
// No external APIs or third-party packages.

export type PrayerName = 'Fajr' | 'Dhuhr' | 'Asr' | 'Maghrib' | 'Isha';

export interface DailyPrayerTimes {
  fajr: string;
  dhuhr: string;
  asr: string;
  maghrib: string;
  isha: string;
}

export interface NextPrayerInfo {
  name: PrayerName;
  time: string;
  remainingMs: number;
  remainingFormatted: string;
}

export interface HijriDateInfo {
  day: number;
  month: number;
  year: number;
  monthNameEn: string;
  monthNameAr: string;
}

export interface FastingProgressInfo {
  percent: number;
  status: 'before' | 'fasting' | 'completed';
  fajrTime: string;
  maghribTime: string;
  remainingToMaghribFormatted: string;
}

const MECCA_LAT = 21.4225;
const MECCA_LNG = 39.8262;

// Muslim World League (MWL) standard angles & Asr factor
const MWL_FAJR_ANGLE = 18;
const MWL_ISHA_ANGLE = 17;
const SUNSET_ANGLE = 0.833;
const ASR_SHADOW_FACTOR = 1; // Standard (Shafii / Maliki / Hanbali)

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

const HIJRI_MONTHS_EN = [
  'Muharram',
  'Safar',
  "Rabi' al-Awwal",
  "Rabi' al-Thani",
  'Jumada al-Ula',
  'Jumada al-Akhirah',
  'Rajab',
  "Sha'ban",
  'Ramadan',
  'Shawwal',
  "Dhu al-Qi'dah",
  'Dhu al-Hijjah',
];

const HIJRI_MONTHS_AR = [
  'محرم',
  'صفر',
  'ربيع الأول',
  'ربيع الآخر',
  'جمادى الأولى',
  'جمادى الآخرة',
  'رجب',
  'شعبان',
  'رمضان',
  'شوال',
  'ذو القعدة',
  'ذو الحجة',
];

function sinDeg(deg: number): number {
  return Math.sin(deg * DEG_TO_RAD);
}

function cosDeg(deg: number): number {
  return Math.cos(deg * DEG_TO_RAD);
}

function tanDeg(deg: number): number {
  return Math.tan(deg * DEG_TO_RAD);
}

function asinDeg(x: number): number {
  return Math.asin(Math.max(-1, Math.min(1, x))) * RAD_TO_DEG;
}

function acosDeg(x: number): number {
  return Math.acos(Math.max(-1, Math.min(1, x))) * RAD_TO_DEG;
}

function atanDeg(x: number): number {
  return Math.atan(x) * RAD_TO_DEG;
}

function atan2Deg(y: number, x: number): number {
  return Math.atan2(y, x) * RAD_TO_DEG;
}

function fixAngle(angle: number): number {
  const a = angle - 360 * Math.floor(angle / 360);
  return a < 0 ? a + 360 : a;
}

function fixHour(hour: number): number {
  const h = hour - 24 * Math.floor(hour / 24);
  return h < 0 ? h + 24 : h;
}

function toJulianDay(year: number, month: number, day: number): number {
  let y = year;
  let m = month;
  if (m <= 2) {
    y -= 1;
    m += 12;
  }
  const a = Math.floor(y / 100);
  const b = 2 - a + Math.floor(a / 4);
  return (
    Math.floor(365.25 * (y + 4716)) +
    Math.floor(30.6001 * (m + 1)) +
    day +
    b -
    1524.5
  );
}

function sunPosition(jd: number): { decl: number; eqt: number } {
  const d = jd - 2451545.0;
  const g = fixAngle(357.529 + 0.98560028 * d);
  const q = fixAngle(280.459 + 0.98564736 * d);
  const L = fixAngle(q + 1.915 * sinDeg(g) + 0.02 * sinDeg(2 * g));
  const e = 23.439 - 0.00000036 * d;

  const raHours = fixHour(atan2Deg(cosDeg(e) * sinDeg(L), cosDeg(L)) / 15);
  let eqt = q / 15 - raHours;
  if (eqt > 12) eqt -= 24;
  if (eqt < -12) eqt += 24;

  const decl = asinDeg(sinDeg(e) * sinDeg(L));
  return { decl, eqt };
}

function midDayHours(jd: number, dayFraction: number): number {
  const { eqt } = sunPosition(jd + dayFraction);
  return fixHour(12 - eqt);
}

function sunDepressionTime(
  jd: number,
  lat: number,
  depressionAngle: number,
  dayFraction: number,
  isMorning: boolean
): number {
  const { decl } = sunPosition(jd + dayFraction);
  const noon = midDayHours(jd, dayFraction);
  const denom = cosDeg(decl) * cosDeg(lat);
  if (Math.abs(denom) < 1e-9) {
    return noon;
  }
  const cosH = (-sinDeg(depressionAngle) - sinDeg(decl) * sinDeg(lat)) / denom;
  const hourAngle = acosDeg(cosH) / 15;
  return noon + (isMorning ? -hourAngle : hourAngle);
}

function asrTimeHours(
  jd: number,
  lat: number,
  shadowFactor: number,
  dayFraction: number
): number {
  const { decl } = sunPosition(jd + dayFraction);
  const noon = midDayHours(jd, dayFraction);
  const alt = atanDeg(1 / (shadowFactor + tanDeg(Math.abs(lat - decl))));
  const denom = cosDeg(decl) * cosDeg(lat);
  if (Math.abs(denom) < 1e-9) {
    return noon;
  }
  const cosH = (sinDeg(alt) - sinDeg(decl) * sinDeg(lat)) / denom;
  const hourAngle = acosDeg(cosH) / 15;
  return noon + hourAngle;
}

function formatHourAsHHMM(hourFloat: number): string {
  const normalized = fixHour(hourFloat);
  const totalMinutes = Math.round(normalized * 60) % 1440;
  const hh = Math.floor(totalMinutes / 60);
  const mm = totalMinutes % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

/**
 * Calculates daily prayer times (Fajr, Dhuhr, Asr, Maghrib, Isha) using
 * the Muslim World League (MWL) standard method. Returns HH:MM strings in local time.
 */
export function calculatePrayerTimes(
  latitude: number,
  longitude: number,
  date: Date = new Date()
): DailyPrayerTimes {
  const safeLat = Math.max(-65, Math.min(65, latitude));
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();

  const jd = toJulianDay(year, month, day) - longitude / 360;
  const tzOffsetHours = -date.getTimezoneOffset() / 60;
  const tzAdjust = tzOffsetHours - longitude / 15;

  // Initial day-fraction estimates
  const tFajr = 5 / 24;
  const tDhuhr = 12 / 24;
  const tAsr = 13 / 24;
  const tSunset = 18 / 24;
  const tIsha = 18 / 24;

  // One-pass refinement for accurate solar declination / equation of time
  const fajrRaw = sunDepressionTime(jd, safeLat, MWL_FAJR_ANGLE, tFajr, true);
  const dhuhrRaw = midDayHours(jd, tDhuhr);
  const asrRaw = asrTimeHours(jd, safeLat, ASR_SHADOW_FACTOR, tAsr);
  const maghribRaw = sunDepressionTime(jd, safeLat, SUNSET_ANGLE, tSunset, false);
  const ishaRaw = sunDepressionTime(jd, safeLat, MWL_ISHA_ANGLE, tIsha, false);

  return {
    fajr: formatHourAsHHMM(fajrRaw + tzAdjust),
    dhuhr: formatHourAsHHMM(dhuhrRaw + tzAdjust),
    asr: formatHourAsHHMM(asrRaw + tzAdjust),
    maghrib: formatHourAsHHMM(maghribRaw + tzAdjust),
    isha: formatHourAsHHMM(ishaRaw + tzAdjust),
  };
}

function parseHHMMToDate(hhmm: string, baseDate: Date, addDays = 0): Date {
  const [hhStr, mmStr] = hhmm.split(':');
  const hh = Number.parseInt(hhStr || '0', 10);
  const mm = Number.parseInt(mmStr || '0', 10);
  const d = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate() + addDays, hh, mm, 0, 0);
  return d;
}

export function formatCountdown(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/**
 * Determines the next upcoming prayer and remaining countdown relative to `now`.
 */
export function getNextPrayer(
  times: DailyPrayerTimes,
  now: Date = new Date()
): NextPrayerInfo {
  const schedule: Array<{ name: PrayerName; time: string }> = [
    { name: 'Fajr', time: times.fajr },
    { name: 'Dhuhr', time: times.dhuhr },
    { name: 'Asr', time: times.asr },
    { name: 'Maghrib', time: times.maghrib },
    { name: 'Isha', time: times.isha },
  ];

  const nowMs = now.getTime();
  for (const item of schedule) {
    const targetMs = parseHHMMToDate(item.time, now, 0).getTime();
    if (targetMs > nowMs) {
      const remainingMs = targetMs - nowMs;
      return {
        name: item.name,
        time: item.time,
        remainingMs,
        remainingFormatted: formatCountdown(remainingMs),
      };
    }
  }

  // After Isha: next prayer is tomorrow's Fajr
  const nextFajrMs = parseHHMMToDate(times.fajr, now, 1).getTime();
  const remainingMs = Math.max(0, nextFajrMs - nowMs);
  return {
    name: 'Fajr',
    time: times.fajr,
    remainingMs,
    remainingFormatted: formatCountdown(remainingMs),
  };
}

/**
 * Calculates the percentage of the current fasting day completed between Fajr and Maghrib.
 */
export function getFastingProgress(
  times: DailyPrayerTimes,
  now: Date = new Date()
): FastingProgressInfo {
  const nowMs = now.getTime();
  const fajrMs = parseHHMMToDate(times.fajr, now, 0).getTime();
  const maghribMs = parseHHMMToDate(times.maghrib, now, 0).getTime();
  const spanMs = maghribMs - fajrMs;

  if (spanMs <= 0 || nowMs < fajrMs) {
    return {
      percent: 0,
      status: 'before',
      fajrTime: times.fajr,
      maghribTime: times.maghrib,
      remainingToMaghribFormatted: formatCountdown(Math.max(0, maghribMs - nowMs)),
    };
  }

  if (nowMs >= maghribMs) {
    return {
      percent: 100,
      status: 'completed',
      fajrTime: times.fajr,
      maghribTime: times.maghrib,
      remainingToMaghribFormatted: '00:00:00',
    };
  }

  const elapsedMs = nowMs - fajrMs;
  const percent = Math.min(100, Math.max(0, (elapsedMs / spanMs) * 100));
  return {
    percent,
    status: 'fasting',
    fajrTime: times.fajr,
    maghribTime: times.maghrib,
    remainingToMaghribFormatted: formatCountdown(maghribMs - nowMs),
  };
}

/**
 * Calculates initial great-circle Qibla bearing (degrees clockwise from True North)
 * from (latitude, longitude) to the Kaaba in Mecca (21.4225 N, 39.8262 E).
 */
export function calculateQiblaBearing(latitude: number, longitude: number): number {
  const lat1 = latitude * DEG_TO_RAD;
  const lat2 = MECCA_LAT * DEG_TO_RAD;
  const dLon = (MECCA_LNG - longitude) * DEG_TO_RAD;

  const y = Math.sin(dLon) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);

  const bearing = Math.atan2(y, x) * RAD_TO_DEG;
  return fixAngle(bearing);
}

/**
 * Pure-math Gregorian to Hijri conversion (Kuwaiti/Tabular Islamic calendar).
 */
export function gregorianToHijri(date: Date = new Date()): HijriDateInfo {
  const day = date.getDate();
  const month = date.getMonth() + 1;
  const year = date.getFullYear();

  let m = month;
  let y = year;
  if (m < 3) {
    y -= 1;
    m += 12;
  }

  const a = Math.floor(y / 100);
  let b = 2 - a + Math.floor(a / 4);
  if (y < 1583) b = 0;
  if (y === 1582) {
    if (m > 10) b = -10;
    if (m === 10) {
      b = 0;
      if (day > 4) b = -10;
    }
  }

  const jd =
    Math.floor(365.25 * (y + 4716)) +
    Math.floor(30.6001 * (m + 1)) +
    day +
    b -
    1524;

  const iYear = 10631.0 / 30.0;
  const epochAstro = 1948084;
  const shift1 = 8.01 / 60.0;

  let z = jd - epochAstro;
  const cyc = Math.floor(z / 10631.0);
  z -= 10631.0 * cyc;
  const j = Math.floor((z - shift1) / iYear);
  const hijriYear = 30 * cyc + j;
  z -= Math.floor(j * iYear + shift1);
  let hijriMonth = Math.floor((z + 28.5001) / 29.5);
  if (hijriMonth === 13) hijriMonth = 12;
  if (hijriMonth < 1) hijriMonth = 1;
  const hijriDay = Math.max(1, Math.floor(z - Math.floor(29.5001 * hijriMonth - 29)));

  return {
    day: hijriDay,
    month: hijriMonth,
    year: hijriYear,
    monthNameEn: HIJRI_MONTHS_EN[hijriMonth - 1] || '',
    monthNameAr: HIJRI_MONTHS_AR[hijriMonth - 1] || '',
  };
}

/**
 * Returns true when the given date falls in the Hijri month of Ramadan (month === 9).
 */
export function isRamadanMonth(date: Date = new Date()): boolean {
  return gregorianToHijri(date).month === 9;
}

export interface QiblaAlignmentInfo {
  /** Signed shortest rotation needed from heading to Qibla (-180..+180). Positive = turn right, negative = turn left. */
  signedDeltaDeg: number;
  /** Absolute angular distance to Qibla (0..180). */
  absDeltaDeg: number;
  /** Clockwise dial needle rotation (0..360) relative to phone top / heading. */
  needleDeg: number;
  /** True when user is aligned within ±5 degrees of Qibla. */
  isAligned: boolean;
}

/**
 * Computes relative Qibla needle rotation and signed turn guidance given Qibla bearing and current heading.
 */
export function getQiblaAlignment(qiblaBearingDeg: number, headingDeg: number): QiblaAlignmentInfo {
  const needleDeg = fixAngle(qiblaBearingDeg - headingDeg);
  const signedDeltaDeg = ((needleDeg + 540) % 360) - 180;
  const absDeltaDeg = Math.abs(signedDeltaDeg);
  return {
    signedDeltaDeg,
    absDeltaDeg,
    needleDeg,
    isAligned: absDeltaDeg <= 5,
  };
}

export interface CityLocationPreset {
  id: string;
  nameEn: string;
  nameAr: string;
  lat: number;
  lng: number;
}

export const PRAYER_CITY_PRESETS: CityLocationPreset[] = [
  { id: 'mecca', nameEn: 'Makkah', nameAr: 'مكة المكرمة', lat: 21.4225, lng: 39.8262 },
  { id: 'madinah', nameEn: 'Madinah', nameAr: 'المدينة المنورة', lat: 24.4672, lng: 39.6112 },
  { id: 'riyadh', nameEn: 'Riyadh', nameAr: 'الرياض', lat: 24.7136, lng: 46.6753 },
  { id: 'jeddah', nameEn: 'Jeddah', nameAr: 'جدة', lat: 21.4858, lng: 39.1925 },
  { id: 'dubai', nameEn: 'Dubai', nameAr: 'دبي', lat: 25.2048, lng: 55.2708 },
  { id: 'doha', nameEn: 'Doha', nameAr: 'الدوحة', lat: 25.2854, lng: 51.531 },
  { id: 'kuwait', nameEn: 'Kuwait City', nameAr: 'الكويت', lat: 29.3759, lng: 47.9774 },
  { id: 'cairo', nameEn: 'Cairo', nameAr: 'القاهرة', lat: 30.0444, lng: 31.2357 },
  { id: 'amman', nameEn: 'Amman', nameAr: 'عمّان', lat: 31.9454, lng: 35.9284 },
  { id: 'karachi', nameEn: 'Karachi', nameAr: 'كراتشي', lat: 24.8607, lng: 67.0011 },
  { id: 'lahore', nameEn: 'Lahore', nameAr: 'لاهور', lat: 31.5204, lng: 74.3587 },
  { id: 'islamabad', nameEn: 'Islamabad', nameAr: 'إسلام آباد', lat: 33.6844, lng: 73.0479 },
  { id: 'istanbul', nameEn: 'Istanbul', nameAr: 'إسطنبول', lat: 41.0082, lng: 28.9784 },
  { id: 'london', nameEn: 'London', nameAr: 'لندن', lat: 51.5072, lng: -0.1276 },
  { id: 'new_york', nameEn: 'New York', nameAr: 'نيويورك', lat: 40.7128, lng: -74.006 },
];

