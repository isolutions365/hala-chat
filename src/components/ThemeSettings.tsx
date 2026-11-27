import React, { useEffect, useState } from 'react';
import { Moon, Sun, Monitor } from 'lucide-react';
import {
  getSavedTheme,
  getResolvedTheme,
  applyTheme,
  THEME_CHANGE_EVENT,
  THEME_STORAGE_KEY,
  ThemeMode,
  ResolvedTheme,
} from '../lib/theme';

interface ThemeSettingsProps {
  isRtl: boolean;
}

export const ThemeSettings: React.FC<ThemeSettingsProps> = ({ isRtl }) => {
  const [theme, setTheme] = useState<ThemeMode>(getSavedTheme);
  const [resolved, setResolved] = useState<ResolvedTheme>(() => getResolvedTheme());

  useEffect(() => {
    const syncFromSystem = () => {
      const saved = getSavedTheme();
      setTheme(saved);
      setResolved(getResolvedTheme(saved));
    };
    const handleStorage = (e: StorageEvent) => {
      if (e.key === THEME_STORAGE_KEY) {
        syncFromSystem();
      }
    };
    window.addEventListener(THEME_CHANGE_EVENT, syncFromSystem as EventListener);
    window.addEventListener('storage', handleStorage);
    return () => {
      window.removeEventListener(THEME_CHANGE_EVENT, syncFromSystem as EventListener);
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  const handleSelect = (mode: ThemeMode) => {
    setTheme(mode);
    const nextResolved = applyTheme(mode);
    setResolved(nextResolved);
  };

  const options: { mode: ThemeMode; labelEn: string; labelAr: string; icon: React.ReactNode }[] = [
    { mode: 'dark', labelEn: 'Dark', labelAr: 'داكن', icon: <Moon className="w-4 h-4" /> },
    { mode: 'light', labelEn: 'Light', labelAr: 'فاتح', icon: <Sun className="w-4 h-4" /> },
    { mode: 'system', labelEn: 'System', labelAr: 'حسب النظام', icon: <Monitor className="w-4 h-4" /> },
  ];

  return (
    <div dir={isRtl ? 'rtl' : 'ltr'} className="space-y-4 border-t border-slate-200 dark:border-slate-800 pt-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-lg font-bold text-teal-800 dark:text-teal-400">
          {isRtl ? 'المظهر (Theme)' : 'Theme Appearance'}
        </h3>
        {theme === 'system' && (
          <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
            {isRtl
              ? `النظام الآن: ${resolved === 'dark' ? 'داكن' : 'فاتح'}`
              : `System — ${resolved === 'dark' ? 'Dark' : 'Light'}`}
          </span>
        )}
      </div>
      <p className="text-sm text-slate-600 dark:text-slate-400">
        {isRtl
          ? 'اختر مظهر التطبيق (داكن، فاتح، أو متوافق مع إعدادات النظام).'
          : 'Choose your preferred app appearance (Dark, Light, or System default).'}
      </p>

      <div className="grid grid-cols-3 gap-3">
        {options.map((opt) => {
          const active = theme === opt.mode;
          return (
            <button
              key={opt.mode}
              type="button"
              aria-pressed={active}
              onClick={() => handleSelect(opt.mode)}
              className={`flex flex-col items-center justify-center gap-2 p-3.5 rounded-2xl border-2 transition-all cursor-pointer ${
                active
                  ? 'border-[#087F75] bg-[#087F75]/10 dark:bg-[#087F75]/20 text-[#087F75] dark:text-teal-300 font-bold shadow-xs'
                  : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-700'
              }`}
            >
              <div className={`${active ? 'text-[#087F75] dark:text-teal-300' : 'text-slate-500 dark:text-slate-400'}`}>
                {opt.icon}
              </div>
              <span className="text-xs">{isRtl ? opt.labelAr : opt.labelEn}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
