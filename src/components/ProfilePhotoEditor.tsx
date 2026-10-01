import React, { useRef, useState } from 'react';
import { Camera, LoaderCircle } from 'lucide-react';
import { compressAvatar } from '../lib/imageCompression';

export function ProfilePhotoEditor({ isRtl, onSave }: {
  isRtl: boolean;
  onSave: (dataUrl: string) => Promise<void>;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState(false);
  async function choose(file?: File) {
    if (!file) return;
    setMessage(''); setError(false); setPreview(null);
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 10 * 1024 * 1024) {
      setError(true); setMessage(isRtl ? 'اختر صورة JPG أو PNG أو WebP أقل من 10 ميجابايت.' : 'Choose a JPG, PNG or WebP image under 10 MB.'); return;
    }
    setBusy(true);
    try { setPreview(await compressAvatar(file)); }
    catch { setError(true); setMessage(isRtl ? 'تعذرت قراءة الصورة. اختر صورة أخرى.' : 'Could not read this image. Choose another photo.'); }
    finally { setBusy(false); }
  }
  async function save() {
    if (!preview) return;
    setBusy(true); setMessage(''); setError(false);
    try {
      await onSave(preview); setPreview(null);
      setMessage(isRtl ? 'تم حفظ صورتك' : 'Your photo is saved');
    } catch {
      setError(true); setMessage(isRtl ? 'تعذر حفظ الصورة. حاول مرة أخرى.' : 'Could not save your photo. Please try again.');
    } finally { setBusy(false); }
  }
  return <div className="w-full mt-4 space-y-3">
    <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
      aria-label={isRtl ? 'اختر صورة الملف الشخصي' : 'Choose profile photo'}
      onChange={e => { void choose(e.target.files?.[0]); e.target.value = ''; }} />
    {preview && <img src={preview} alt={isRtl ? 'معاينة صورتك الجديدة' : 'New photo preview'} className="w-24 h-24 object-cover rounded-3xl mx-auto" />}
    <button type="button" disabled={busy} onClick={() => input.current?.click()} className="min-h-11 px-4 rounded-xl border border-teal-200 text-teal-800 inline-flex items-center justify-center gap-2 disabled:opacity-50">
      {busy ? <LoaderCircle className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
      {isRtl ? 'تغيير الصورة' : 'Change photo'}
    </button>
    {preview && <div className="flex justify-center gap-3">
      <button type="button" disabled={busy} onClick={save} className="min-h-11 px-5 bg-teal-700 text-white rounded-xl disabled:opacity-50">{isRtl ? 'حفظ الصورة' : 'Save photo'}</button>
      <button type="button" disabled={busy} onClick={() => setPreview(null)} className="min-h-11 px-4 rounded-xl border border-slate-200">{isRtl ? 'إلغاء' : 'Cancel'}</button>
    </div>}
    {message && <p role={error ? 'alert' : 'status'} className={error ? 'text-sm text-red-700' : 'text-sm text-teal-800'}>{message}</p>}
  </div>;
}
