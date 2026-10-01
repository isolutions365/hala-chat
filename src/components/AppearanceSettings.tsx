import React, { useState } from 'react';
import { readTypography, saveTypography, defaultTypography, typographyFonts, type Typography } from '../lib/typography';

export function AppearanceSettings({ isRtl }: { isRtl: boolean }) {
  const [value, setValue] = useState(readTypography);
  const [saved, setSaved] = useState(true);
  const change = (next: Typography) => { setValue(next); setSaved(saveTypography(next)); };
  const control = 'block w-full mt-2 rounded-xl border border-slate-300 bg-white p-3 text-slate-900 focus:outline-2 focus:outline-teal-700';
  return <section dir={isRtl ? 'rtl' : 'ltr'} className="space-y-4 border-t border-slate-200 pt-4">
    <h3 className="text-lg font-bold text-teal-800">{isRtl ? 'أسلوبي' : 'My Style · Mera Andaaz'}</h3>
    <p className="text-sm text-slate-600">{isRtl ? 'تفضيلات القراءة على هذا الجهاز فقط. لا تتغير رسائل الآخرين.' : 'Reading preferences on this device only. Message content stays unchanged.'}</p>
    <label className="block text-sm">{isRtl ? 'الخط' : 'Font'}
      <select className={control} value={value.font} onChange={e => change({ ...value, font: e.target.value as Typography['font'] })}>
        <option value="default">{isRtl ? 'هلا — القاهرة' : 'Hala — Cairo'}</option>
        <option value="system">{isRtl ? 'خط الجهاز' : 'Device font'}</option>
        <option value="classic">{isRtl ? 'نسخ — كلاسيكي' : 'Naskh — Classic'}</option>
      </select>
    </label>
    <label className="block text-sm">{isRtl ? 'حجم النص' : 'Text size'}
      <select className={control} value={value.size} onChange={e => change({ ...value, size: Number(e.target.value) })}>
        {[16,18,20].map(size => <option key={size} value={size}>{size}px</option>)}
      </select>
    </label>
    <label className="block text-sm">{isRtl ? 'تباعد الأسطر' : 'Line spacing'}
      <select className={control} value={value.spacing} onChange={e => change({ ...value, spacing: Number(e.target.value) })}>
        {[1.5,1.75,2].map(spacing => <option key={spacing} value={spacing}>{spacing}×</option>)}
      </select>
    </label>
    <div className="rounded-xl bg-teal-50 p-4 text-slate-900" style={{fontFamily: typographyFonts[value.font], fontSize: value.size, lineHeight: value.spacing}}>
      <p lang="ar" dir="rtl">أهلاً بك في هلا. مساحة تجمع أحاديثك ولحظاتك.</p>
      <p lang="en" dir="ltr">Your conversations, your own reading style.</p>
      <p lang="ur" dir="rtl">ہلا میں خوش آمدید</p>
    </div>
    <p role="status" className="text-sm text-slate-600">{saved ? (isRtl ? 'يتم الحفظ تلقائياً' : 'Saved automatically') : (isRtl ? 'تم التطبيق، لكن تعذر الحفظ على الجهاز.' : 'Applied, but device storage is unavailable; preferences will not survive reload.')}</p>
    <button type="button" className="rounded-xl border border-teal-700 px-4 py-2 text-teal-800" onClick={() => change({...defaultTypography})}>{isRtl ? 'استعادة الافتراضي' : 'Reset appearance'}</button>
  </section>;
}
