import { SharedMajlis } from './SharedMajlis';
import type { ChatModel } from '../types';
import React, { useEffect, useRef, useState } from 'react';
import { CalendarDays, ArrowUpRight, X } from 'lucide-react';

import { safeLocalStorageSet } from '../lib/safeStorage';

// Drafts stay local until the user explicitly shares with a selected chat.
export function MajlisDraft({ uid, isRtl, chats = [] }: { uid: string; isRtl: boolean; chats?: ChatModel[] }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const key = `hala.majlis.draft.v1.${uid}`;
  const [opened, setOpened] = useState(false);
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
    const success = safeLocalStorageSet(key, JSON.stringify({ title: title.trim(), date, notes }));
    if (success) {
      setStatus(isRtl ? 'تم الحفظ على هذا المتصفح فقط.' : 'Saved on this browser only.');
    } else {
      setStatus(isRtl ? 'تعذر الحفظ. اترك هذه النافذة مفتوحة للاحتفاظ بالنص.' : 'Could not save. Keep this window open to retain your text.');
    }
  }
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
        <label className="block text-sm font-semibold">{isRtl ? 'ماذا نخطط؟' : 'What are we planning?'}<input required maxLength={100} value={title} onChange={e => setTitle(e.target.value)} className={field} /></label>
        <label className="block text-sm font-semibold">{isRtl ? 'موعد مقترح' : 'Suggested date'}<input type="date" value={date} onChange={e => setDate(e.target.value)} className={field} /></label>
        <label className="block text-sm font-semibold">{isRtl ? 'أفكار ومهام' : 'Ideas and next steps'}<textarea maxLength={2000} rows={4} value={notes} onChange={e => setNotes(e.target.value)} className={field} /></label>
        <button type="submit" className="min-h-11 w-full rounded-xl bg-[#087F75] px-4 py-3 font-semibold text-white">{isRtl ? 'حفظ المسودة الخاصة' : 'Save private draft'}</button>
        <p role="status" className="text-sm">{status}</p>
      </form>
      {opened && <SharedMajlis uid={uid} isRtl={isRtl} chats={chats} draft={{title,date,notes}} />}
    </dialog>
  </>;
}
