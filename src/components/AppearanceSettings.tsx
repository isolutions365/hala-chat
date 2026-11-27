import React, { useEffect, useState } from 'react';
import { readTypography, saveTypography, defaultTypography, typographyFonts, normalizeTypography, type Typography } from '../lib/typography';
import { ThemeSettings } from './ThemeSettings';

export function AppearanceSettings({ isRtl }: { isRtl: boolean }) {
  const [value, setValue] = useState(readTypography);
  const [saved, setSaved] = useState(true);
  const change = (next: Typography) => {
    const normalized = normalizeTypography(next);
    setValue(normalized);
    setSaved(saveTypography(normalized));
  };

  useEffect(() => {
    const syncFromExternal = (event?: Event) => {
      const detail = (event as CustomEvent<Typography> | undefined)?.detail;
      setValue(detail ? normalizeTypography(detail) : readTypography());
    };
    window.addEventListener('storage', syncFromExternal);
    window.addEventListener('hala-typography-changed', syncFromExternal);
    return () => {
      window.removeEventListener('storage', syncFromExternal);
      window.removeEventListener('hala-typography-changed', syncFromExternal);
    };
  }, []);

  const control = 'block w-full mt-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 text-slate-900 dark:text-white focus:outline-2 focus:outline-teal-700';
  return (
    <section dir={isRtl ? 'rtl' : 'ltr'} className="space-y-6 pt-2">
      <ThemeSettings isRtl={isRtl} />

      <div className="space-y-4 border-t border-slate-200 dark:border-slate-800 pt-4">
        <h3 className="text-lg font-bold text-teal-800 dark:text-teal-400">{isRtl ? 'أسلوبي' : 'My Style'}</h3>
        <p className="text-sm text-slate-600 dark:text-slate-400">{isRtl ? 'تفضيلات القراءة على هذا الجهاز فقط. لا تتغير رسائل الآخرين.' : 'Reading preferences on this device only. Message content stays unchanged.'}</p>
        <label className="block text-sm text-slate-700 dark:text-slate-300">{isRtl ? 'الخط' : 'Font'}
          <select className={control} value={value.font} onChange={e => change({ ...value, font: e.target.value as Typography['font'] })}>
            <option value="default">{isRtl ? 'افتراضي — هلا (Cairo & Plus Jakarta)' : 'Default — Hala (Cairo & Plus Jakarta)'}</option>
            
            <optgroup label={isRtl ? 'خطوط إنجليزية وحديثة (English & Modern Fonts)' : 'English & Modern Fonts'}>
              <option value="inter">Inter (Modern & Clean / حديث ونظيف)</option>
              <option value="poppins">Poppins (Geometric Sans / هندسي عالي الدقة)</option>
              <option value="playfair">Playfair Display (Classic Serif / كلاسيكي أنيق)</option>
              <option value="spaceGrotesk">Space Grotesk (Modern Grotesk / عصري بارز)</option>
              <option value="firaCode">Fira Code (Tech Monospace / أحادي المسافة برمجي)</option>
              <option value="dancingScript">Dancing Script (Cursive / بخط اليد)</option>
            </optgroup>

            <optgroup label={isRtl ? 'خطوط عربية (Arabic Fonts)' : 'Arabic Fonts'}>
              <option value="tajawal">{isRtl ? 'تجوال (Tajawal)' : 'Tajawal (تجوال)'}</option>
              <option value="amiri">{isRtl ? 'أميري — خط أصيل (Amiri)' : 'Amiri — Classic (أميري)'}</option>
              <option value="almarai">{isRtl ? 'المرعي (Almarai)' : 'Almarai (المرعي)'}</option>
              <option value="ibmPlex">{isRtl ? 'آي بي إم بلكس (IBM Plex Arabic)' : 'IBM Plex Sans Arabic'}</option>
              <option value="alexandria">{isRtl ? 'الإسكندرية (Alexandria)' : 'Alexandria (الإسكندرية)'}</option>
              <option value="reemKufi">{isRtl ? 'ريم كوفي (Reem Kufi)' : 'Reem Kufi (ريم كوفي)'}</option>
              <option value="classic">{isRtl ? 'نسخ كلاسيكي (Naskh)' : 'Naskh — Classic (نسخ)'}</option>
              <option value="kufam">{isRtl ? 'كوفام — هندسي كوفي (Kufam)' : 'Kufam — Geometric (كوفام)'}</option>
              <option value="changa">{isRtl ? 'تشانغا — عصري قوي (Changa)' : 'Changa — Bold Modern (تشانغا)'}</option>
              <option value="elMessiri">{isRtl ? 'المسيري — خط فني (El Messiri)' : 'El Messiri — Artistic (المسيري)'}</option>
              <option value="lateef">{isRtl ? 'لطيف — خط نسخي انسيابي (Lateef)' : 'Lateef — Calligraphic (لطيف)'}</option>
              <option value="arefRuqaa">{isRtl ? 'عارف رقعة — خط رقعة (Aref Ruqaa)' : 'Aref Ruqaa — Ruqah (عارف رقعة)'}</option>
              <option value="rakkas">{isRtl ? 'رقاص — خط بارز وزخرفي (Rakkas)' : 'Rakkas — Decorative (رقاص)'}</option>
              <option value="marhey">{isRtl ? 'مرحي — خط حديث ومرح (Marhey)' : 'Marhey — Playful Modern (مرحي)'}</option>
              <option value="lalezar">{isRtl ? 'لاليزار — خط عناوين عريض (Lalezar)' : 'Lalezar — Bold Header (لاليزار)'}</option>
            </optgroup>

            <optgroup label={isRtl ? 'خط النظام (System)' : 'System Default'}>
              <option value="system">{isRtl ? 'خط الجهاز (System Font)' : 'System Font (خط الجهاز)'}</option>
            </optgroup>
          </select>
        </label>
        <label className="block text-sm text-slate-700 dark:text-slate-300">{isRtl ? 'حجم النص' : 'Text size'}
          <select className={control} value={value.size} onChange={e => change({ ...value, size: Number(e.target.value) })}>
            {[16,18,20].map(size => <option key={size} value={size}>{size}px</option>)}
          </select>
        </label>
        <label className="block text-sm text-slate-700 dark:text-slate-300">{isRtl ? 'تباعد الأسطر' : 'Line spacing'}
          <select className={control} value={value.spacing} onChange={e => change({ ...value, spacing: Number(e.target.value) })}>
            {[1.5,1.75,2].map(spacing => <option key={spacing} value={spacing}>{spacing}×</option>)}
          </select>
        </label>
        <div
          className="rounded-xl bg-teal-50 dark:bg-teal-950/40 border border-teal-200 dark:border-teal-900/50 p-4 text-slate-900 dark:text-slate-100"
          style={{
            '--hala-font': typographyFonts[value.font],
            fontFamily: typographyFonts[value.font],
            fontSize: value.size,
            lineHeight: value.spacing,
          } as React.CSSProperties}
        >
          <p lang="ar" dir="rtl">أهلاً بك في هلا. مساحة تجمع أحاديثك ولحظاتك.</p>
          <p lang="en" dir="ltr">Your conversations, your own reading style.</p>
        </div>
        <p role="status" className="text-sm text-slate-600 dark:text-slate-400">{saved ? (isRtl ? 'يتم الحفظ تلقائياً' : 'Saved automatically') : (isRtl ? 'تم التطبيق، لكن تعذر الحفظ على الجهاز.' : 'Applied, but device storage is unavailable; preferences will not survive reload.')}</p>
        <button type="button" className="rounded-xl border border-teal-700 dark:border-teal-500 px-4 py-2 text-teal-800 dark:text-teal-300 hover:bg-teal-50 dark:hover:bg-teal-950/30 transition-colors cursor-pointer" onClick={() => change({...defaultTypography})}>{isRtl ? 'استعادة الافتراضي' : 'Reset appearance'}</button>
      </div>
    </section>
  );
}
