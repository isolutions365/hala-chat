import React, { useEffect, useRef, useState } from 'react';
import { Compass, RotateCcw, CheckCircle2 } from 'lucide-react';
import { calculateQiblaBearing, getQiblaAlignment } from '../lib/prayerTimes';

interface QiblaCompassProps {
  lat: number;
  lng: number;
  isRtl: boolean;
  active?: boolean;
}

function getScreenOrientationAngle(): number {
  try {
    if (typeof window !== 'undefined') {
      const angle = window.screen?.orientation?.angle ?? (window as any).orientation ?? 0;
      if (typeof angle === 'number' && Number.isFinite(angle)) {
        return angle;
      }
    }
  } catch {
    // ignore
  }
  return 0;
}

function smoothCircularAngle(prev: number | null, next: number, alpha = 0.35): number {
  if (prev === null || !Number.isFinite(prev)) return (next + 360) % 360;
  const diff = (((next - prev) + 540) % 360) - 180;
  return (prev + diff * alpha + 360) % 360;
}

export const QiblaCompass: React.FC<QiblaCompassProps> = ({
  lat,
  lng,
  isRtl,
  active = true,
}) => {
  const [sensorHeading, setSensorHeading] = useState<number | null>(null);
  const [sensorSource, setSensorSource] = useState<'none' | 'absolute' | 'relative'>('none');
  const [manualHeading, setManualHeading] = useState<number>(0);
  const [useManualMode, setUseManualMode] = useState<boolean>(false);
  const [permissionDenied, setPermissionDenied] = useState<boolean>(false);
  const [needsPermission, setNeedsPermission] = useState<boolean>(() => {
    try {
      return (
        typeof DeviceOrientationEvent !== 'undefined' &&
        typeof (DeviceOrientationEvent as any).requestPermission === 'function'
      );
    } catch {
      return false;
    }
  });

  const hasAbsoluteRef = useRef<boolean>(false);
  const mountedAtRef = useRef<number>(Date.now());

  useEffect(() => {
    if (!active || typeof window === 'undefined') return;
    mountedAtRef.current = Date.now();
    hasAbsoluteRef.current = false;

    const handleOrientation = (event: Event) => {
      const e = event as DeviceOrientationEvent & { webkitCompassHeading?: number };
      const screenAngle = getScreenOrientationAngle();

      // 1. iOS Safari true magnetic heading
      if (typeof e.webkitCompassHeading === 'number' && Number.isFinite(e.webkitCompassHeading)) {
        hasAbsoluteRef.current = true;
        const heading = (e.webkitCompassHeading + 360) % 360;
        setSensorHeading((prev) => smoothCircularAngle(prev, heading));
        setSensorSource('absolute');
        setNeedsPermission(false);
        return;
      }

      if (typeof e.alpha !== 'number' || !Number.isFinite(e.alpha)) return;

      const isAbs = e.absolute === true || event.type === 'deviceorientationabsolute';
      if (isAbs) {
        hasAbsoluteRef.current = true;
        const heading = (360 - e.alpha + screenAngle + 360) % 360;
        setSensorHeading((prev) => smoothCircularAngle(prev, heading));
        setSensorSource('absolute');
        setNeedsPermission(false);
        return;
      }

      // 2. Fallback to relative deviceorientation alpha if no absolute event arrives after 500ms
      if (!hasAbsoluteRef.current && Date.now() - mountedAtRef.current > 500) {
        const heading = (360 - e.alpha + screenAngle + 360) % 360;
        setSensorHeading((prev) => smoothCircularAngle(prev, heading));
        setSensorSource('relative');
        setNeedsPermission(false);
      }
    };

    window.addEventListener('deviceorientationabsolute', handleOrientation);
    window.addEventListener('deviceorientation', handleOrientation);

    return () => {
      window.removeEventListener('deviceorientationabsolute', handleOrientation);
      window.removeEventListener('deviceorientation', handleOrientation);
    };
  }, [active]);

  const requestCompassPermission = async () => {
    try {
      const req = (DeviceOrientationEvent as any)?.requestPermission;
      if (typeof req === 'function') {
        const result = await req.call(DeviceOrientationEvent);
        if (result === 'granted') {
          setNeedsPermission(false);
          setPermissionDenied(false);
          setUseManualMode(false);
        } else {
          setPermissionDenied(true);
          setUseManualMode(true);
        }
      }
    } catch {
      setPermissionDenied(true);
      setUseManualMode(true);
    }
  };

  const qiblaBearing = calculateQiblaBearing(lat, lng);
  const hasLiveSensor = sensorHeading !== null && !useManualMode;
  const effectiveHeading = hasLiveSensor ? (sensorHeading as number) : manualHeading;
  const alignment = getQiblaAlignment(qiblaBearing, effectiveHeading);

  const roundedQibla = Math.round(qiblaBearing);
  const roundedHeading = Math.round(effectiveHeading);
  const roundedTurn = Math.round(alignment.absDeltaDeg);
  const turnDirection =
    alignment.isAligned
      ? isRtl
        ? 'باتجاه القبلة تماماً'
        : 'Facing Qibla'
      : alignment.signedDeltaDeg > 0
      ? isRtl
        ? `استدر يميناً ${roundedTurn}°`
        : `Turn right ${roundedTurn}°`
      : isRtl
      ? `استدر يساراً ${roundedTurn}°`
      : `Turn left ${roundedTurn}°`;

  return (
    <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200/90 dark:border-slate-700 p-3.5 space-y-3">
      {/* Header row */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Compass className="w-4 h-4 text-[#087F75] dark:text-teal-300 shrink-0" />
          <div className="min-w-0">
            <span className="block text-xs font-bold text-[#112330] dark:text-slate-100">
              {isRtl ? 'بوصلة اتجاه القبلة' : 'Qibla Compass'}
            </span>
            <span className="block text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
              {hasLiveSensor
                ? sensorSource === 'absolute'
                  ? isRtl
                    ? `مباشر (${roundedHeading}°) · القبلة ${roundedQibla}°`
                    : `Live (${roundedHeading}°) · Qibla ${roundedQibla}°`
                  : isRtl
                  ? `مستشعر الحركة (${roundedHeading}°) · القبلة ${roundedQibla}°`
                  : `Motion sensor (${roundedHeading}°) · Qibla ${roundedQibla}°`
                : isRtl
                ? `القبلة ${roundedQibla}° من الشمال · الشمال يدوي ${roundedHeading}°`
                : `Qibla ${roundedQibla}° from North · Dial ${roundedHeading}°`}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {needsPermission && sensorHeading === null && (
            <button
              type="button"
              onClick={() => void requestCompassPermission()}
              className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-[#087F75] text-white hover:bg-[#06685F] transition cursor-pointer"
            >
              {isRtl ? 'تفعيل البوصلة' : 'Enable live'}
            </button>
          )}
          {sensorHeading !== null && (
            <button
              type="button"
              onClick={() => setUseManualMode((v) => !v)}
              className="text-[11px] font-semibold px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700 transition cursor-pointer"
            >
              {useManualMode ? (isRtl ? 'مباشر' : 'Live') : (isRtl ? 'يدوي' : 'Manual')}
            </button>
          )}
        </div>
      </div>

      {/* Compass Dial & Readout */}
      <div className="flex items-center gap-4">
        <div
          className={`relative w-28 h-28 rounded-full flex items-center justify-center shrink-0 transition-colors duration-300 border-2 shadow-inner ${
            alignment.isAligned
              ? 'bg-emerald-50/90 dark:bg-emerald-950/50 border-emerald-500 shadow-emerald-500/20'
              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700'
          }`}
          aria-label={isRtl ? 'مؤشر بوصلة القبلة' : 'Qibla compass dial'}
        >
          {/* Fixed Phone Top Reference Pointer */}
          <div
            className={`absolute -top-1.5 left-1/2 -translate-x-1/2 w-0 h-0 border-l-[5px] border-r-[5px] border-b-[8px] border-l-transparent border-r-transparent ${
              alignment.isAligned ? 'border-b-emerald-600 dark:border-b-emerald-400' : 'border-b-[#087F75] dark:border-b-teal-400'
            }`}
            aria-hidden="true"
          />

          <svg viewBox="0 0 120 120" className="w-24 h-24 overflow-visible" aria-hidden="true">
            {/* Rotating Cardinal Ring (-effectiveHeading) */}
            <g transform={`rotate(${(-effectiveHeading).toFixed(1)} 60 60)`}>
              <circle
                cx="60"
                cy="60"
                r="52"
                fill="none"
                stroke="currentColor"
                className="text-slate-200 dark:text-slate-700"
                strokeWidth="1.5"
              />
              {/* 12 degree ticks */}
              {Array.from({ length: 12 }, (_, idx) => {
                const deg = idx * 30;
                return (
                  <line
                    key={deg}
                    x1="60"
                    y1="9"
                    x2="60"
                    y2={idx % 3 === 0 ? '15' : '12'}
                    stroke="currentColor"
                    strokeWidth={idx % 3 === 0 ? '2' : '1'}
                    className={deg === 0 ? 'text-rose-500' : 'text-slate-400 dark:text-slate-500'}
                    transform={`rotate(${deg} 60 60)`}
                  />
                );
              })}
              <text x="60" y="24" textAnchor="middle" className="fill-rose-500 text-[9px] font-extrabold">
                N
              </text>
              <text x="98" y="63" textAnchor="middle" className="fill-slate-400 dark:fill-slate-500 text-[8px] font-bold">
                E
              </text>
              <text x="60" y="102" textAnchor="middle" className="fill-slate-400 dark:fill-slate-500 text-[8px] font-bold">
                S
              </text>
              <text x="22" y="63" textAnchor="middle" className="fill-slate-400 dark:fill-slate-500 text-[8px] font-bold">
                W
              </text>
            </g>

            {/* Qibla Needle pointing toward Mecca relative to current heading */}
            <g transform={`rotate(${alignment.needleDeg.toFixed(1)} 60 60)`}>
              {/* Tail */}
              <line
                x1="60"
                y1="60"
                x2="60"
                y2="92"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                className="text-slate-300 dark:text-slate-600"
              />
              {/* Main Qibla Arrow */}
              <path
                d="M60 15L68 48L60 43L52 48L60 15Z"
                className={
                  alignment.isAligned
                    ? 'fill-emerald-600 dark:fill-emerald-400'
                    : 'fill-[#087F75] dark:fill-teal-400'
                }
              />
              {/* Kaaba marker near needle tip */}
              <rect
                x="56"
                y="24"
                width="8"
                height="8"
                rx="1.5"
                className="fill-[#112330] dark:fill-amber-300"
              />
              <circle
                cx="60"
                cy="60"
                r="4.5"
                className={
                  alignment.isAligned
                    ? 'fill-emerald-600 dark:fill-emerald-400'
                    : 'fill-[#087F75] dark:fill-teal-400'
                }
              />
            </g>
          </svg>
        </div>

        {/* Turn guidance & Calibration controls */}
        <div className="flex-1 min-w-0 space-y-2">
          <div
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-bold ${
              alignment.isAligned
                ? 'bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300'
                : 'bg-teal-100/80 dark:bg-teal-950/60 text-[#087F75] dark:text-teal-300'
            }`}
          >
            {alignment.isAligned && <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />}
            <span>{turnDirection}</span>
          </div>

          <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
            {hasLiveSensor
              ? isRtl
                ? 'وجّه أعلى الهاتف حتى يتطابق سهم الكعبة مع المؤشر العلوي.'
                : 'Rotate your phone until the Kaaba needle aligns with the top pointer.'
              : permissionDenied
              ? isRtl
                ? 'تم رفض إذن مستشعر الاتجاه. حرّك الشريط لمطابقة الشمال ومعرفة اتجاه القبلة.'
                : 'Compass permission denied. Rotate the dial below to align North.'
              : isRtl
              ? 'حرّك الشريط لمطابقة اتجاه الشمال أو لاختبار اتجاه القبلة على هذا الجهاز.'
              : 'Adjust heading slider to align North or test Qibla direction on this device.'}
          </p>

          {!hasLiveSensor && (
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min={0}
                  max={359}
                  value={manualHeading}
                  aria-label={isRtl ? 'تدوير البوصلة يدوياً' : 'Rotate compass heading manually'}
                  onChange={(e) => setManualHeading(Number(e.target.value))}
                  className="flex-1 accent-[#087F75] cursor-pointer h-1.5"
                />
                <button
                  type="button"
                  onClick={() => setManualHeading(0)}
                  title={isRtl ? 'إعادة للشمال 0°' : 'Reset North (0°)'}
                  aria-label={isRtl ? 'إعادة للشمال' : 'Reset North'}
                  className="p-1 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700 transition cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400">
                <span>{isRtl ? `زاوية الجهاز: ${manualHeading}°` : `Facing: ${manualHeading}°`}</span>
                <button
                  type="button"
                  onClick={() => setManualHeading(roundedQibla)}
                  className="text-[#087F75] dark:text-teal-300 font-bold hover:underline cursor-pointer"
                >
                  {isRtl ? 'محاذاة للقبلة' : 'Align to Qibla'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
