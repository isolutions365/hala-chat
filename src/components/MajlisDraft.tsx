import { SharedMajlis } from './SharedMajlis';
import type { ChatModel } from '../types';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { CalendarDays, ArrowUpRight, X, Moon, Compass, BellOff, MapPin, Clock } from 'lucide-react';

import { safeLocalStorageSet } from '../lib/safeStorage';
import {
  calculatePrayerTimes,
  calculateQiblaBearing,
  getFastingProgress,
  getNextPrayer,
  gregorianToHijri,
  type PrayerName,
} from '../lib/prayerTimes';

const RAMADAN_MODE_KEY = 'hala.ramadanMode';
const PRAYER_LOCATION_KEY = 'hala.prayerLocation.v1';

interface CachedLocation {
  lat: number;
  lng: number;
}

const PRAYER_LABELS_AR: Record<PrayerName, string> = {
  Fajr: 'الفجر',
  Dhuhr: 'الظهر',
  Asr: 'العصر',
  Maghrib: 'المغرب',
  Isha: 'العشاء',
};

function readCachedLocation(): CachedLocation | null {
  try {
    const raw = localStorage.getItem(PRAYER_LOCATION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      typeof parsed?.lat === 'number' &&
      Number.isFinite(parsed.lat) &&
      typeof parsed?.lng === 'number' &&
      Number.isFinite(parsed.lng)
    ) {
      return { lat: parsed.lat, lng: parsed.lng };
    }
  } catch {
    // ignore invalid cache
  }
  return null;
}

// Drafts stay local until the user explicitly shares with a selected chat.
export function MajlisDraft({ uid, isRtl, chats = [] }: { uid: string; isRtl: boolean; chats?: ChatModel[] }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const key = `hala.majlis.draft.v1.${uid}`;
  const [opened, setOpened] = useState(false);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState('');

  const [ramadanMode, setRamadanMode] = useState<boolean>(() => {
    try {
      return localStorage.getItem(RAMADAN_MODE_KEY) === 'true';
    } catch {
      return false;
    }
  });
  const [location, setLocation] = useState<CachedLocation | null>(() => readCachedLocation());
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationFailed, setLocationFailed] = useState(false);
  const [now, setNow] = useState<Date>(() => new Date());
  const [compassHeading, setCompassHeading] = useState<number | null>(null);
  const [compassNeedsPermission, setCompassNeedsPermission] = useState<boolean>(() => {
    try {
      return (
        typeof DeviceOrientationEvent !== 'undefined' &&
        typeof (DeviceOrientationEvent as any).requestPermission === 'function'
      );
    } catch {
      return false;
    }
  });

  useEffect(() => {
    setTitle(''); setDate(''); setNotes(''); setStatus('');
    try {
      const value = JSON.parse(localStorage.getItem(key) || '{}');
      if (typeof value.title === 'string') setTitle(value.title.slice(0, 100));
      if (typeof value.date === 'string') setDate(value.date);
      if (typeof value.notes === 'string') setNotes(value.notes.slice(0, 2000));
    } catch { setStatus(isRtl ? 'تعذر تحميل المسودة المحفوظة.' : 'Could not load the saved draft.'); }
  }, [key, isRtl]);

  const requestLocation = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setLocationFailed(true);
      return;
    }
    setLocationLoading(true);
    setLocationFailed(false);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const nextLoc = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        };
        setLocation(nextLoc);
        setLocationLoading(false);
        setLocationFailed(false);
        safeLocalStorageSet(
          PRAYER_LOCATION_KEY,
          JSON.stringify({ ...nextLoc, updatedAt: Date.now() })
        );
      },
      () => {
        setLocationLoading(false);
        setLocationFailed(true);
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }
    );
  }, []);

  useEffect(() => {
    if (!opened || !ramadanMode) return;
    setNow(new Date());
    const timer = setInterval(() => {
      setNow(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, [opened, ramadanMode]);

  useEffect(() => {
    if (!opened || !ramadanMode) return;
    requestLocation();
  }, [opened, ramadanMode, requestLocation]);

  useEffect(() => {
    if (!opened || !ramadanMode || typeof window === 'undefined') return;

    const handleOrientation = (event: Event) => {
      const e = event as DeviceOrientationEvent & { webkitCompassHeading?: number };
      if (typeof e.webkitCompassHeading === 'number' && Number.isFinite(e.webkitCompassHeading)) {
        setCompassHeading((e.webkitCompassHeading + 360) % 360);
        setCompassNeedsPermission(false);
      } else if ((e.absolute === true || event.type === 'deviceorientationabsolute') && typeof e.alpha === 'number' && Number.isFinite(e.alpha)) {
        setCompassHeading((360 - e.alpha) % 360);
        setCompassNeedsPermission(false);
      }
    };

    window.addEventListener('deviceorientationabsolute', handleOrientation);
    window.addEventListener('deviceorientation', handleOrientation);
    return () => {
      window.removeEventListener('deviceorientationabsolute', handleOrientation);
      window.removeEventListener('deviceorientation', handleOrientation);
    };
  }, [opened, ramadanMode]);

  async function enableCompassPermission() {
    try {
      const req = (DeviceOrientationEvent as any)?.requestPermission;
      if (typeof req === 'function') {
        const result = await req.call(DeviceOrientationEvent);
        if (result === 'granted') {
          setCompassNeedsPermission(false);
        }
      }
    } catch {
      // fail gracefully; degree bearing remains visible
    }
  }

  function toggleRamadanMode() {
    const next = !ramadanMode;
    setRamadanMode(next);
    safeLocalStorageSet(RAMADAN_MODE_KEY, next ? 'true' : 'false');
  }

  function save() {
    const success = safeLocalStorageSet(key, JSON.stringify({ title: title.trim(), date, notes }));
    if (success) {
      setStatus(isRtl ? 'تم الحفظ على هذا المتصفح فقط.' : 'Saved on this browser only.');
    } else {
      setStatus(isRtl ? 'تعذر الحفظ. اترك هذه النافذة مفتوحة للاحتفاظ بالنص.' : 'Could not save. Keep this window open to retain your text.');
    }
  }

  const hijriDate = ramadanMode ? gregorianToHijri(now) : null;
  const prayerTimes = ramadanMode && location ? calculatePrayerTimes(location.lat, location.lng, now) : null;
  const nextPrayer = prayerTimes ? getNextPrayer(prayerTimes, now) : null;
  const fastingProgress = prayerTimes ? getFastingProgress(prayerTimes, now) : null;
  const qiblaBearing = ramadanMode && location ? calculateQiblaBearing(location.lat, location.lng) : null;
  const arrowRotationDeg =
    qiblaBearing !== null
      ? compassHeading !== null
        ? (qiblaBearing - compassHeading + 360) % 360
        : qiblaBearing
      : 0;

  const prayerList: Array<{ key: PrayerName; time: string }> = prayerTimes
    ? [
        { key: 'Fajr', time: prayerTimes.fajr },
        { key: 'Dhuhr', time: prayerTimes.dhuhr },
        { key: 'Asr', time: prayerTimes.asr },
        { key: 'Maghrib', time: prayerTimes.maghrib },
        { key: 'Isha', time: prayerTimes.isha },
      ]
    : [];

  const field = 'w-full mt-2 p-3 rounded-xl border border-slate-300 bg-white text-slate-900';
  return <>
    <button type="button" onClick={() => { setOpened(true); dialog.current?.showModal(); }} className="w-full flex items-center justify-between gap-3 rounded-2xl bg-[#8FE8D0] p-4 text-start text-[#112330]">
      <div className="flex gap-3 items-center"><CalendarDays className="w-6 h-6 shrink-0" /><div>
        <span className="block font-bold">{isRtl ? 'مجلس هلا' : 'Hala Majlis'}</span>
        <span className="block text-xs mt-1">{isRtl ? 'خططوا معاً · تصويت ومهام' : 'Plan together · Votes and tasks'}</span>
      </div></div><ArrowUpRight className="w-5 h-5 shrink-0" />
    </button>
    <dialog onClose={() => setOpened(false)} ref={dialog} dir={isRtl ? 'rtl' : 'ltr'} aria-labelledby="majlis-title" className="m-auto w-[calc(100%-2rem)] max-w-md max-h-[85dvh] overflow-y-auto rounded-3xl bg-[#F8FAFC] p-6 text-[#112330] shadow-xl backdrop:bg-slate-950/60">
      <div className="flex justify-between items-center gap-3"><h2 id="majlis-title" className="text-xl font-bold">{isRtl ? 'مجلس هلا' : 'Hala Majlis'}</h2>
        <button type="button" onClick={() => dialog.current?.close()} aria-label={isRtl ? 'إغلاق' : 'Close'} className="p-3"><X className="w-5 h-5" /></button></div>
      <p className="text-sm text-slate-600 my-4">{isRtl ? 'نسخة تجريبية خاصة على هذا المتصفح. لا تتم مشاركة خطتك أو إرسالها للذكاء الاصطناعي. يمكنك مشاركة مسودة أدناه مع محادثة محددة للتصويت وتوزيع المهام.' : 'Drafts stay on this browser until you choose a chat and share. Members can then vote and complete assigned tasks. Nothing is sent to AI.'}</p>

      {/* Ramadan / Prayer mode toggle & panel */}
      <div className="mb-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${ramadanMode ? 'bg-[#087F75] text-white' : 'bg-slate-100 text-slate-600'}`}>
              <Moon className="w-4 h-4" />
            </span>
            <div className="min-w-0">
              <span className="block text-sm font-bold text-[#112330]">
                {isRtl ? 'وضع رمضان / الصلاة' : 'Ramadan / Prayer mode'}
              </span>
              <span className="block text-xs text-slate-500">
                {isRtl ? 'أوقات الصلاة والقبلة والتاريخ الهجري' : 'Prayer times, Qibla & Hijri date'}
              </span>
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={ramadanMode}
            aria-label={isRtl ? 'وضع رمضان / الصلاة' : 'Ramadan / Prayer mode'}
            onClick={toggleRamadanMode}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
              ramadanMode ? 'bg-[#087F75]' : 'bg-slate-300'
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                ramadanMode
                  ? isRtl
                    ? '-translate-x-5'
                    : 'translate-x-5'
                  : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        {ramadanMode && (
          <div className="mt-4 pt-4 border-t border-slate-100 space-y-3.5">
            {/* Hijri Date */}
            {hijriDate && (
              <div className="flex items-center justify-between gap-2 rounded-xl bg-teal-50/70 border border-teal-100 px-3 py-2">
                <span className="text-xs font-semibold text-[#087F75]">
                  {isRtl ? 'التاريخ الهجري' : 'Hijri Date'}
                </span>
                <span className="text-xs font-bold text-[#112330] tabular-nums">
                  {isRtl
                    ? `${hijriDate.day} ${hijriDate.monthNameAr} ${hijriDate.year} هـ`
                    : `${hijriDate.day} ${hijriDate.monthNameEn} ${hijriDate.year} AH`}
                </span>
              </div>
            )}

            {/* Next Prayer Countdown & Prayer Times */}
            {prayerTimes && nextPrayer ? (
              <>
                <div className="flex items-center justify-between gap-3 rounded-xl bg-[#112330] text-white px-3.5 py-2.5">
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
                            ? 'bg-teal-50 border-[#087F75] text-[#087F75]'
                            : 'bg-slate-50 border-slate-100 text-slate-700'
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

                {/* Real-time Fasting Day Progress Bar (Fajr -> Maghrib) */}
                {fastingProgress && (
                  <div className="rounded-xl bg-teal-50/50 border border-teal-100 px-3.5 py-3 space-y-2">
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="font-bold text-[#112330]">
                        {isRtl ? 'تقدّم يوم الصيام' : 'Fasting day progress'}
                      </span>
                      <span className="font-bold tabular-nums text-[#087F75]">
                        {Math.round(fastingProgress.percent)}%
                      </span>
                    </div>
                    <div
                      role="progressbar"
                      aria-label={isRtl ? 'تقدّم يوم الصيام' : 'Fasting day progress'}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={Math.round(fastingProgress.percent)}
                      className="w-full h-2.5 rounded-full bg-slate-200/80 overflow-hidden"
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
                          className="fill-[#087F75] transition-all duration-500"
                        />
                      </svg>
                    </div>
                    <div className="flex items-center justify-between gap-2 text-[11px] text-slate-600 tabular-nums">
                      <span>
                        {isRtl ? `الفجر ${fastingProgress.fajrTime}` : `Fajr ${fastingProgress.fajrTime}`}
                      </span>
                      <span className="font-semibold text-[#087F75]">
                        {fastingProgress.status === 'before'
                          ? isRtl
                            ? 'لم يبدأ الصيام بعد'
                            : 'Starts at Fajr'
                          : fastingProgress.status === 'completed'
                          ? isRtl
                            ? 'اكتمل الصيام · وقت الإفطار'
                            : 'Completed · Iftar time'
                          : isRtl
                          ? `متبقي ${fastingProgress.remainingToMaghribFormatted}`
                          : `${fastingProgress.remainingToMaghribFormatted} to Iftar`}
                      </span>
                      <span>
                        {isRtl ? `المغرب ${fastingProgress.maghribTime}` : `Maghrib ${fastingProgress.maghribTime}`}
                      </span>
                    </div>
                  </div>
                )}

                {/* Qibla Direction */}
                {qiblaBearing !== null && (
                  <div className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 border border-slate-200/80 px-3.5 py-2.5">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div
                        className="w-9 h-9 rounded-full bg-white border border-slate-200 flex items-center justify-center shrink-0 shadow-xs"
                        aria-label={isRtl ? 'اتجاه القبلة' : 'Qibla direction'}
                      >
                        <svg
                          viewBox="0 0 24 24"
                          className="w-5 h-5 text-[#087F75]"
                          aria-hidden="true"
                        >
                          <g transform={`rotate(${arrowRotationDeg.toFixed(1)} 12 12)`}>
                            <path
                              d="M12 3L17 17L12 14L7 17L12 3Z"
                              fill="currentColor"
                            />
                          </g>
                        </svg>
                      </div>
                      <div className="min-w-0">
                        <span className="flex items-center gap-1 text-xs font-bold text-[#112330]">
                          <Compass className="w-3.5 h-3.5 text-[#087F75]" />
                          <span>{isRtl ? 'اتجاه القبلة' : 'Qibla direction'}</span>
                        </span>
                        <span className="block text-[11px] text-slate-500 tabular-nums">
                          {compassHeading !== null
                            ? isRtl
                              ? `مباشر · ${Math.round(qiblaBearing)}° إلى مكة`
                              : `Live compass · ${Math.round(qiblaBearing)}° to Mecca`
                            : isRtl
                            ? `${Math.round(qiblaBearing)}° من الشمال (البوصلة غير متوفرة)`
                            : `${Math.round(qiblaBearing)}° from North (compass unavailable)`}
                        </span>
                      </div>
                    </div>
                    {compassNeedsPermission && compassHeading === null && (
                      <button
                        type="button"
                        onClick={() => void enableCompassPermission()}
                        className="shrink-0 text-[11px] font-bold text-[#087F75] hover:underline px-2 py-1 cursor-pointer"
                      >
                        {isRtl ? 'تفعيل البوصلة' : 'Enable compass'}
                      </button>
                    )}
                  </div>
                )}
              </>
            ) : (
              <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs text-slate-600 min-w-0">
                  <MapPin className="w-4 h-4 text-slate-400 shrink-0" />
                  <span>
                    {locationLoading
                      ? isRtl
                        ? 'جارٍ تحديد موقعك لحساب أوقات الصلاة…'
                        : 'Getting your location for prayer times…'
                      : locationFailed
                      ? isRtl
                        ? 'تعذر تحديد الموقع. فعّل إذن الموقع لعرض أوقات الصلاة والقبلة.'
                        : 'Location unavailable. Allow location access for local prayer times & Qibla.'
                      : isRtl
                      ? 'بانتظار الموقع…'
                      : 'Waiting for location…'}
                  </span>
                </div>
                {!locationLoading && (
                  <button
                    type="button"
                    onClick={requestLocation}
                    className="shrink-0 text-xs font-bold text-[#087F75] hover:underline px-2 py-1 cursor-pointer"
                  >
                    {isRtl ? 'إعادة المحاولة' : 'Retry'}
                  </button>
                )}
              </div>
            )}

            {/* DND Hint Text */}
            <div className="flex items-center gap-2 rounded-xl bg-amber-50/80 border border-amber-200/70 px-3 py-2 text-xs text-amber-900">
              <BellOff className="w-3.5 h-3.5 shrink-0 text-amber-700" />
              <span>
                {isRtl
                  ? 'سيتم كتم المكالمات والإشعارات خلال أوقات الصلاة'
                  : 'Calls and notifications silenced during prayer times'}
              </span>
            </div>
          </div>
        )}
      </div>
      
      {/* Ready Templates */}
      <div className="mb-4">
        <span className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
          {isRtl ? 'قوالب جاهزة للتخطيط' : 'Ready Planning Templates'}
        </span>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              setTitle(isRtl ? 'خطة تجمع الويك إند' : 'Weekend Gathering Plan');
              setNotes(isRtl ? '1. اختيار شاليه أو كافيه مناسب\n2. تحديد الموعد المناسب للجميع\n3. توزيع المشروبات والمأكولات' : '1. Venue selection (Resort or Cafe)\n2. Confirming time\n3. Snacks & drinks list');
            }}
            className="px-3 py-1.5 rounded-xl bg-teal-100/80 hover:bg-teal-200/80 text-[#087F75] text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5"
          >
            <span>🌴</span>
            <span>{isRtl ? 'خطة الويك إند' : 'Weekend plan'}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setTitle(isRtl ? 'خطة إفطار رمضان' : 'Iftar Plan');
              setNotes(isRtl ? '1. اختيار موقع الإفطار\n2. قائمة الأطباق الرئيسية والمقبلات\n3. توزيع المهام والحلويات' : '1. Iftar venue selection\n2. Main dish & appetizers list\n3. Assigning desserts');
            }}
            className="px-3 py-1.5 rounded-xl bg-amber-100/80 hover:bg-amber-200/80 text-amber-900 text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5"
          >
            <span>🌙</span>
            <span>{isRtl ? 'خطة الإفطار' : 'Iftar plan'}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setTitle(isRtl ? 'خطة الرحلة القادمة' : 'Next Trip Plan');
              setNotes(isRtl ? '1. تحديد الوجهة (العلا / أبها / كشتة)\n2. حجز السكن والمواصلات\n3. جدول الفعاليات والأنشطة' : '1. Destination selection\n2. Accommodation & transit\n3. Activity schedule');
            }}
            className="px-3 py-1.5 rounded-xl bg-sky-100/80 hover:bg-sky-200/80 text-sky-900 text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5"
          >
            <span>✈️</span>
            <span>{isRtl ? 'خطة الرحلة' : 'Trip plan'}</span>
          </button>
        </div>
      </div>

      <form className="space-y-4" onSubmit={e => { e.preventDefault(); save(); }}>
        <label className="block text-sm font-semibold">{isRtl ? 'ماذا نخطط؟' : 'What are we planning?'}<input required placeholder={isRtl ? 'أدخل عنوان الخطة...' : 'Enter plan title...'} maxLength={100} value={title} onChange={e => setTitle(e.target.value)} className={field} /></label>
        <label className="block text-sm font-semibold">{isRtl ? 'موعد مقترح' : 'Suggested date'}<input type="date" value={date} onChange={e => setDate(e.target.value)} className={field} /></label>
        <label className="block text-sm font-semibold">{isRtl ? 'أفكار ومهام' : 'Ideas and next steps'}<textarea placeholder={isRtl ? 'اكتب التفاصيل هنا...' : 'Write details here...'} maxLength={2000} rows={4} value={notes} onChange={e => setNotes(e.target.value)} className={field} /></label>
        <button type="submit" className="min-h-11 w-full rounded-xl bg-[#087F75] px-4 py-3 font-semibold text-white shadow-sm active:scale-95 transition-all">{isRtl ? 'حفظ المسودة الخاصة' : 'Save private draft'}</button>
        <p role="status" className="text-sm font-medium text-center text-[#087F75]">{status}</p>
      </form>
      {opened && <SharedMajlis uid={uid} isRtl={isRtl} chats={chats} draft={{title,date,notes}} onShareSuccess={() => { setTitle(''); setDate(''); setNotes(''); setStatus(''); localStorage.removeItem(key); }} />}
    </dialog>
  </>;
}
