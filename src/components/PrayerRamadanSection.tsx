import React, { useCallback, useEffect, useState } from 'react';
import { BellOff, CalendarClock, CheckCircle2, Clock, Compass, MapPin, Moon, Power } from 'lucide-react';
import {
  calculatePrayerTimes,
  getFastingProgress,
  getNextPrayer,
  gregorianToHijri,
  PRAYER_CITY_PRESETS,
  type PrayerName,
} from '../lib/prayerTimes';
import {
  selectCityLocation,
  usePrayerAndRamadanSettings,
  type RamadanPreference,
} from '../lib/prayerSettings';
import { QiblaCompass } from './QiblaCompass';

interface PrayerRamadanSectionProps {
  isRtl: boolean;
  active?: boolean;
  variant?: 'majlis' | 'settings';
}

const PRAYER_LABELS_AR: Record<PrayerName, string> = {
  Fajr: 'الفجر',
  Dhuhr: 'الظهر',
  Asr: 'العصر',
  Maghrib: 'المغرب',
  Isha: 'العشاء',
};

export const PrayerRamadanSection: React.FC<PrayerRamadanSectionProps> = ({
  isRtl,
  active = true,
  variant = 'majlis',
}) => {
  const {
    prayerEnabled,
    setPrayerEnabled,
    ramadanPref,
    setRamadanPref,
    isRamadanActive,
    isCurrentlyRamadanMonth,
    location,
    updateLocation,
  } = usePrayerAndRamadanSettings();

  const [locationLoading, setLocationLoading] = useState(false);
  const [locationFailed, setLocationFailed] = useState(false);
  const [now, setNow] = useState<Date>(() => new Date());
  const [showCompassInSettings, setShowCompassInSettings] = useState(variant === 'majlis');

  const requestLocation = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setLocationFailed(true);
      return;
    }
    setLocationLoading(true);
    setLocationFailed(false);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        updateLocation({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          source: 'gps',
        });
        setLocationLoading(false);
        setLocationFailed(false);
      },
      () => {
        setLocationLoading(false);
        setLocationFailed(true);
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 }
    );
  }, [updateLocation]);

  useEffect(() => {
    if (!active || (!prayerEnabled && !isRamadanActive)) return;
    setNow(new Date());
    const timer = setInterval(() => {
      setNow(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, [active, prayerEnabled, isRamadanActive]);

  useEffect(() => {
    if (!active || (!prayerEnabled && !isRamadanActive)) return;
    if (!location || location.source === 'gps') {
      requestLocation();
    }
  }, [active, prayerEnabled, isRamadanActive, requestLocation]);

  const hijriDate = gregorianToHijri(now);
  const prayerTimes = location ? calculatePrayerTimes(location.lat, location.lng, now) : null;
  const nextPrayer = prayerTimes ? getNextPrayer(prayerTimes, now) : null;
  const fastingProgress = prayerTimes ? getFastingProgress(prayerTimes, now) : null;

  const prayerList: Array<{ key: PrayerName; time: string }> = prayerTimes
    ? [
        { key: 'Fajr', time: prayerTimes.fajr },
        { key: 'Dhuhr', time: prayerTimes.dhuhr },
        { key: 'Asr', time: prayerTimes.asr },
        { key: 'Maghrib', time: prayerTimes.maghrib },
        { key: 'Isha', time: prayerTimes.isha },
      ]
    : [];

  const handleCitySelect = (cityId: string) => {
    const city = PRAYER_CITY_PRESETS.find((c) => c.id === cityId);
    if (city) {
      selectCityLocation(city);
      setLocationFailed(false);
    }
  };

  const selectedCityId =
    location?.source === 'city'
      ? PRAYER_CITY_PRESETS.find(
          (c) => Math.abs(c.lat - location.lat) < 0.01 && Math.abs(c.lng - location.lng) < 0.01
        )?.id || ''
      : '';

  const renderLocationBar = () => (
    <div className="rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700 p-2.5 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 min-w-0">
          <MapPin className="w-3.5 h-3.5 text-[#087F75] dark:text-teal-300 shrink-0" />
          <span className="truncate font-medium">
            {locationLoading
              ? isRtl
                ? 'جارٍ تحديد موقعك…'
                : 'Detecting location…'
              : location
              ? location.source === 'city'
                ? isRtl
                  ? `المدينة: ${location.labelAr || location.labelEn}`
                  : `City: ${location.labelEn}`
                : isRtl
                ? `موقعك الحالي (${location.lat.toFixed(2)}, ${location.lng.toFixed(2)})`
                : `GPS (${location.lat.toFixed(2)}, ${location.lng.toFixed(2)})`
              : locationFailed
              ? isRtl
                ? 'تعذر GPS — اختر مدينتك أدناه للقبلة والمواقيت'
                : 'GPS unavailable — choose your city below'
              : isRtl
              ? 'اختر مدينة أو استخدم GPS'
              : 'Use GPS or pick a city'}
          </span>
        </div>
        <button
          type="button"
          onClick={requestLocation}
          disabled={locationLoading}
          className="shrink-0 text-[11px] font-bold text-[#087F75] dark:text-teal-300 hover:underline px-2 py-0.5 cursor-pointer disabled:opacity-50"
        >
          {isRtl ? 'تحديث GPS' : 'Use GPS'}
        </button>
      </div>

      <select
        value={selectedCityId}
        onChange={(e) => handleCitySelect(e.target.value)}
        aria-label={isRtl ? 'اختر المدينة لحساب الصلاة والقبلة' : 'Select city for prayer & Qibla'}
        className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs text-slate-800 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-[#087F75]/40 cursor-pointer"
      >
        <option value="">
          {isRtl ? 'اختر مدينة سريعة (مكة، الرياض، كراتشي...)' : 'Quick select city (Makkah, Riyadh, Karachi...)'}
        </option>
        {PRAYER_CITY_PRESETS.map((city) => (
          <option key={city.id} value={city.id}>
            {isRtl ? city.nameAr : city.nameEn}
          </option>
        ))}
      </select>
    </div>
  );

  const ramadanModeOptions: Array<{ id: RamadanPreference; labelAr: string; labelEn: string }> = [
    { id: 'auto', labelAr: 'تلقائي (رمضان)', labelEn: 'Auto (Ramadan)' },
    { id: 'on', labelAr: 'تشغيل الآن', labelEn: 'On' },
    { id: 'off', labelAr: 'إيقاف', labelEn: 'Off' },
  ];

  return (
    <div className="space-y-3.5">
      {/* 1. Separate Prayer Times & Qibla Card (Default ON, user toggleable) */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-xs">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <span
              className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                prayerEnabled
                  ? 'bg-[#087F75] text-white'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
              }`}
            >
              <Compass className="w-4 h-4" />
            </span>
            <div className="min-w-0">
              <span className="block text-sm font-bold text-[#112330] dark:text-slate-100">
                {isRtl ? 'أوقات الصلاة والقبلة' : 'Prayer Times & Qibla'}
              </span>
              <span className="block text-xs text-slate-500 dark:text-slate-400">
                {prayerEnabled
                  ? isRtl
                    ? 'مفعّل · المواقيت والعد التنازلي والقبلة'
                    : 'Active · Daily times, countdown & compass'
                  : isRtl
                  ? 'متوقف · فعّله لعرض مواقيت الصلاة والقبلة'
                  : 'Off · Enable for prayer times & Qibla'}
              </span>
            </div>
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={prayerEnabled}
            aria-label={isRtl ? 'أوقات الصلاة والقبلة' : 'Prayer Times & Qibla'}
            onClick={() => setPrayerEnabled(!prayerEnabled)}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
              prayerEnabled ? 'bg-[#087F75]' : 'bg-slate-300 dark:bg-slate-700'
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                prayerEnabled
                  ? isRtl
                    ? '-translate-x-5'
                    : 'translate-x-5'
                  : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        {prayerEnabled && (
          <div className="mt-4 pt-3.5 border-t border-slate-100 dark:border-slate-800 space-y-3">
            {/* Hijri Date */}
            <div className="flex items-center justify-between gap-2 rounded-xl bg-teal-50/70 dark:bg-teal-950/50 border border-teal-100 dark:border-teal-800/70 px-3 py-2">
              <span className="text-xs font-semibold text-[#087F75] dark:text-teal-300">
                {isRtl ? 'التاريخ الهجري' : 'Hijri Date'}
              </span>
              <span className="text-xs font-bold text-[#112330] dark:text-slate-100 tabular-nums">
                {isRtl
                  ? `${hijriDate.day} ${hijriDate.monthNameAr} ${hijriDate.year} هـ`
                  : `${hijriDate.day} ${hijriDate.monthNameEn} ${hijriDate.year} AH`}
              </span>
            </div>

            {/* GPS / City Selector */}
            {renderLocationBar()}

            {location && prayerTimes && nextPrayer && (
              <>
                <div className="flex items-center justify-between gap-3 rounded-xl bg-[#112330] dark:bg-slate-800 text-white px-3.5 py-2.5 border border-transparent dark:border-slate-700">
                  <div className="flex items-center gap-2 min-w-0">
                    <Clock className="w-4 h-4 text-[#8FE8D0] shrink-0" />
                    <div className="min-w-0">
                      <span className="block text-[11px] text-slate-300">
                        {isRtl ? 'الصلاة القادمة' : 'Next prayer'}
                      </span>
                      <span className="block text-sm font-bold truncate">
                        {isRtl ? PRAYER_LABELS_AR[nextPrayer.name] : nextPrayer.name} · {nextPrayer.time}
                      </span>
                    </div>
                  </div>
                  <span className="text-sm font-bold tabular-nums text-[#8FE8D0] shrink-0">
                    {nextPrayer.remainingFormatted}
                  </span>
                </div>

                <div className="grid grid-cols-5 gap-1.5 text-center">
                  {prayerList.map((item) => {
                    const isNext = item.key === nextPrayer.name;
                    return (
                      <div
                        key={item.key}
                        className={`rounded-xl px-1.5 py-2 border transition-colors ${
                          isNext
                            ? 'bg-teal-50 dark:bg-teal-950/60 border-[#087F75] dark:border-teal-500 text-[#087F75] dark:text-teal-300'
                            : 'bg-slate-50 dark:bg-slate-800/80 border-slate-100 dark:border-slate-700 text-slate-700 dark:text-slate-200'
                        }`}
                      >
                        <span className="block text-[10px] font-bold truncate">
                          {isRtl ? PRAYER_LABELS_AR[item.key] : item.key}
                        </span>
                        <span className="block text-xs font-semibold tabular-nums mt-0.5">
                          {item.time}
                        </span>
                      </div>
                    );
                  })}
                </div>

                {variant === 'settings' && (
                  <button
                    type="button"
                    onClick={() => setShowCompassInSettings((v) => !v)}
                    className="w-full py-2 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 text-xs font-bold text-[#087F75] dark:text-teal-300 flex items-center justify-center gap-1.5 cursor-pointer hover:bg-teal-50/50 dark:hover:bg-teal-950/30 transition"
                  >
                    <Compass className="w-3.5 h-3.5" />
                    <span>
                      {showCompassInSettings
                        ? isRtl
                          ? 'إخفاء بوصلة القبلة'
                          : 'Hide Qibla Compass'
                        : isRtl
                        ? 'فتح بوصلة القبلة'
                        : 'Open Qibla Compass'}
                    </span>
                  </button>
                )}

                {(variant === 'majlis' || showCompassInSettings) && (
                  <QiblaCompass
                    lat={location.lat}
                    lng={location.lng}
                    isRtl={isRtl}
                    active={active && prayerEnabled}
                  />
                )}
              </>
            )}

            {/* DND Hint */}
            <div className="flex items-center gap-2 rounded-xl bg-amber-50/80 dark:bg-amber-950/50 border border-amber-200/70 dark:border-amber-800/60 px-3 py-2 text-xs text-amber-900 dark:text-amber-200">
              <BellOff className="w-3.5 h-3.5 shrink-0 text-amber-700 dark:text-amber-400" />
              <span>
                {isRtl
                  ? 'سيتم كتم المكالمات والإشعارات خلال أوقات الصلاة'
                  : 'Calls and notifications silenced during prayer times'}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* 2. Separate Ramadan Mode Card (Auto in Ramadan month OR manual ON/OFF) */}
      <div className="rounded-2xl border border-amber-200/80 dark:border-amber-900/50 bg-white dark:bg-slate-900 p-4 shadow-xs space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <span
              className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                isRamadanActive
                  ? 'bg-amber-500 text-white'
                  : 'bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300'
              }`}
            >
              <Moon className="w-4 h-4" />
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-sm font-bold text-[#112330] dark:text-slate-100">
                  {isRtl ? 'وضع رمضان' : 'Ramadan Mode'}
                </span>
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                    isRamadanActive
                      ? 'bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-200'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  {ramadanPref === 'auto' ? (
                    isCurrentlyRamadanMonth ? (
                      <Moon className="w-2.5 h-2.5" />
                    ) : (
                      <CalendarClock className="w-2.5 h-2.5" />
                    )
                  ) : ramadanPref === 'on' ? (
                    <CheckCircle2 className="w-2.5 h-2.5" />
                  ) : (
                    <Power className="w-2.5 h-2.5" />
                  )}
                  {ramadanPref === 'auto'
                    ? isCurrentlyRamadanMonth
                      ? isRtl
                        ? 'مفعّل تلقائياً (رمضان)'
                        : 'Auto Active (Ramadan)'
                      : isRtl
                      ? 'تلقائي عند حلول رمضان'
                      : 'Auto on Ramadan start'
                    : ramadanPref === 'on'
                    ? isRtl
                      ? 'مفعّل يدوياً'
                      : 'Active (Manual)'
                    : isRtl
                    ? 'متوقف'
                    : 'Off'}
                </span>
              </div>
              <span className="block text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {isRtl
                  ? 'يتفعّل تلقائياً فور بدء شهر رمضان، ويمكنك تشغيله متى شئت'
                  : 'Turns on automatically in Ramadan, or switch it on anytime'}
              </span>
            </div>
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={isRamadanActive}
            aria-label={isRtl ? 'تبديل وضع رمضان' : 'Toggle Ramadan Mode'}
            onClick={() => setRamadanPref(isRamadanActive ? 'off' : 'on')}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
              isRamadanActive ? 'bg-amber-500' : 'bg-slate-300 dark:bg-slate-700'
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                isRamadanActive
                  ? isRtl
                    ? '-translate-x-5'
                    : 'translate-x-5'
                  : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        {/* 3-way preference selector: Auto (Ramadan) / On / Off */}
        <div className="grid grid-cols-3 gap-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 p-1">
          {ramadanModeOptions.map((opt) => {
            const selected = ramadanPref === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                aria-pressed={selected}
                onClick={() => setRamadanPref(opt.id)}
                className={`py-1.5 px-2 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                  selected
                    ? 'bg-white dark:bg-slate-900 text-[#112330] dark:text-slate-100 shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                {isRtl ? opt.labelAr : opt.labelEn}
              </button>
            );
          })}
        </div>

        {/* Fasting Progress Bar (visible when Ramadan Mode is active, even if Prayer card is collapsed/off as long as location exists) */}
        {isRamadanActive && (
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-3">
            {!prayerEnabled && !location && renderLocationBar()}
            {fastingProgress ? (
              <div className="rounded-xl bg-amber-50/60 dark:bg-amber-950/30 border border-amber-200/70 dark:border-amber-800/50 px-3.5 py-3 space-y-2">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="font-bold text-[#112330] dark:text-slate-100">
                    {isRtl ? 'تقدّم يوم الصيام' : 'Fasting day progress'}
                  </span>
                  <span className="font-bold tabular-nums text-amber-700 dark:text-amber-300">
                    {Math.round(fastingProgress.percent)}%
                  </span>
                </div>
                <div
                  role="progressbar"
                  aria-label={isRtl ? 'تقدّم يوم الصيام' : 'Fasting day progress'}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(fastingProgress.percent)}
                  className="w-full h-2.5 rounded-full bg-slate-200/80 dark:bg-slate-800 overflow-hidden"
                >
                  <svg
                    viewBox="0 0 100 10"
                    preserveAspectRatio="none"
                    className="w-full h-full block"
                    aria-hidden="true"
                  >
                    <rect
                      x={isRtl ? (100 - fastingProgress.percent).toFixed(2) : '0'}
                      y="0"
                      width={fastingProgress.percent.toFixed(2)}
                      height="10"
                      rx="5"
                      className="fill-amber-500 transition-all duration-500"
                    />
                  </svg>
                </div>
                <div className="flex items-center justify-between gap-2 text-[11px] text-slate-600 dark:text-slate-400 tabular-nums">
                  <span>
                    {isRtl ? `السحور / الفجر ${fastingProgress.fajrTime}` : `Fajr ${fastingProgress.fajrTime}`}
                  </span>
                  <span className="font-semibold text-amber-700 dark:text-amber-300">
                    {fastingProgress.status === 'before'
                      ? isRtl
                        ? 'لم يبدأ الصيام بعد'
                        : 'Starts at Fajr'
                      : fastingProgress.status === 'completed'
                      ? isRtl
                        ? 'وقت الإفطار · صوماً مقبولاً'
                        : 'Iftar time · Fast completed'
                      : isRtl
                      ? `متبقي للإفطار ${fastingProgress.remainingToMaghribFormatted}`
                      : `${fastingProgress.remainingToMaghribFormatted} to Iftar`}
                  </span>
                  <span>
                    {isRtl ? `الإفطار ${fastingProgress.maghribTime}` : `Maghrib ${fastingProgress.maghribTime}`}
                  </span>
                </div>
              </div>
            ) : (
              renderLocationBar()
            )}
          </div>
        )}
      </div>
    </div>
  );
};
