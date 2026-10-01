import React, { useEffect, useRef, useState } from 'react';
import { CalendarDays, ArrowUpRight, X } from 'lucide-react';

// A deliberately private prototype. Nothing is sent to chats or AI services.
export function MajlisDraft({ uid, isRtl }: { uid: string; isRtl: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const key = `hala.majlis.draft.v1.${uid}`;
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState('');
  useEffect(() => {
    setTitle(''); setDate(''); setNotes(''); setStatus('');
    try {
      const value = JSON.parse(localStorage.getItem(key) || '{}');
      if (typeof value.title === 'string') setTitle(value.title.slice(0, 100));
      if (typeof value.date === 'string') setDate(value.date);
      if (typeof value.notes === 'string') setNotes(value.notes.slice(0, 2000));
    } catch { setStatus(isRtl ? 'تعذر تحميل المسودة المحفوظة.' : 'Could not load the saved draft.'); }
  }, [key, isRtl]);
  function save() {
    try {
      localStorage.setItem(key, JSON.stringify({ title: title.trim(), date, notes }));
      setStatus(isRtl ? 'تم الحفظ على هذا المتصفح فقط.' : 'Saved on this browser only.');
    } catch { setStatus(isRtl ? 'تعذر الحفظ. اترك هذه النافذة مفتوحة للاحتفاظ بالنص.' : 'Could not save. Keep this window open to retain your text.'); }
  }
  const field = 'w-full mt-2 p-3 rounded-xl border border-slate-300 bg-white text-slate-900';
  return <>
    <button type="button" onClick={() => dialog.current?.showModal()} className="w-full flex items-center justify-between gap-3 rounded-2xl bg-[#8FE8D0] p-4 text-start text-[#112330]">
      <div className="flex gap-3 items-center"><CalendarDays className="w-6 h-6 shrink-0" /><div>
        <span className="block font-bold">{isRtl ? 'مجلس هلا' : 'Hala Majlis'}</span>
        <span className="block text-xs mt-1">{isRtl ? 'فكرة اليوم، خطة الغد · مسودة خاصة' : 'Today’s idea, tomorrow’s plan · Private draft'}</span>
      </div></div><ArrowUpRight className="w-5 h-5 shrink-0" />
    </button>
    <dialog ref={dialog} dir={isRtl ? 'rtl' : 'ltr'} aria-labelledby="majlis-title" className="m-auto w-[calc(100%-2rem)] max-w-md max-h-[85dvh] overflow-y-auto rounded-3xl bg-[#F8FAFC] p-6 text-[#112330] shadow-xl backdrop:bg-slate-950/60">
      <div className="flex justify-between items-center gap-3"><h2 id="majlis-title" className="text-xl font-bold">{isRtl ? 'مجلس هلا' : 'Hala Majlis'}</h2>
        <button type="button" onClick={() => dialog.current?.close()} aria-label={isRtl ? 'إغلاق' : 'Close'} className="p-3"><X className="w-5 h-5" /></button></div>
      <p className="text-sm text-slate-600 my-4">{isRtl ? 'نسخة تجريبية خاصة على هذا المتصفح. لا تتم مشاركة خطتك أو إرسالها للذكاء الاصطناعي. التخطيط المشترك والتصويت قيد التطوير.' : 'A private prototype on this browser. Your plan is not shared or sent to AI. Shared planning and voting are still in development.'}</p>
      <form className="space-y-4" onSubmit={e => { e.preventDefault(); save(); }}>
        <label className="block text-sm font-semibold">{isRtl ? 'ماذا نخطط؟' : 'What are we planning?'}<input required maxLength={100} value={title} onChange={e => setTitle(e.target.value)} className={field} /></label>
        <label className="block text-sm font-semibold">{isRtl ? 'موعد مقترح' : 'Suggested date'}<input type="date" value={date} onChange={e => setDate(e.target.value)} className={field} /></label>
        <label className="block text-sm font-semibold">{isRtl ? 'أفكار ومهام' : 'Ideas and next steps'}<textarea maxLength={2000} rows={4} value={notes} onChange={e => setNotes(e.target.value)} className={field} /></label>
        <button type="submit" className="min-h-11 w-full rounded-xl bg-[#087F75] px-4 py-3 font-semibold text-white">{isRtl ? 'حفظ المسودة الخاصة' : 'Save private draft'}</button>
        <p role="status" className="text-sm">{status}</p>
      </form>
    </dialog>
  </>;
}
