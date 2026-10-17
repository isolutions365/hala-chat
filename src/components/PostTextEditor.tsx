import React,{useEffect,useRef,useState} from 'react';
import {editPostText} from '../lib/socialFeed';

export function PostTextEditor({id,text,hasMedia,isRtl}:{id:string;text:string;hasMedia:boolean;isRtl:boolean}) {
 const [editing,setEditing]=useState(false),[draft,setDraft]=useState(''),[original,setOriginal]=useState('');
 const [busy,setBusy]=useState(false),[status,setStatus]=useState('');
 const pending=useRef(false),active=useRef(true),buttonRef=useRef<HTMLButtonElement>(null),restoreFocus=useRef(false);
 useEffect(()=>{active.current=true;return()=>{active.current=false;};},[]);
 useEffect(()=>{if(!editing&&restoreFocus.current){buttonRef.current?.focus();restoreFocus.current=false;}},[editing]);
 const close=()=>{restoreFocus.current=true;setEditing(false);};
 async function save(event:React.FormEvent){
  event.preventDefault();if(pending.current||draft.trim().length>2000||(!draft.trim()&&!hasMedia))return;
  pending.current=true;setBusy(true);setStatus('');
  try {await editPostText(id,original,draft);if(active.current){close();setStatus(isRtl?'تم حفظ التعديل.':'Changes saved.');}}
  catch(error){if(active.current)setStatus(error instanceof Error&&error.message==='post-edit-conflict'?(isRtl?'تغير المنشور على جهاز آخر. انسخ مسودتك، ثم ألغِ التعديل وافتحه مجدداً.':'This post changed on another device. Copy your draft, then cancel and reopen the editor.'):(isRtl?'تعذر حفظ التعديل. مسودتك ما زالت هنا؛ تحقق من الاتصال وحاول مجدداً.':'Changes could not be saved. Your draft is still here; check your connection and retry.'));}
  finally {pending.current=false;if(active.current)setBusy(false);}
 }
 const button='min-h-11 px-4 py-2 rounded-xl border border-slate-300 focus-visible:ring-2 focus-visible:ring-teal-700 disabled:opacity-50';
 return <div className="space-y-2">
  {!editing?<button ref={buttonRef} type="button" className={button} onClick={()=>{setOriginal(text);setDraft(text);setStatus('');setEditing(true);}}>{isRtl?'تعديل النص / الوصف':'Edit text / caption'}</button>:<form onSubmit={save} className="rounded-xl bg-slate-50 p-3 space-y-2">
   <label className="block text-sm font-medium">{isRtl?'تعديل نص المنشور':'Edit post text'}<textarea autoFocus disabled={busy} value={draft} maxLength={2000} rows={3} dir="auto" onChange={event=>setDraft(event.target.value)} className="block w-full mt-2 border border-slate-300 rounded-xl p-3 text-base"/></label>
   <p className="text-xs text-slate-600">{draft.length}/2000</p>
   {!draft.trim()&&!hasMedia&&<p className="text-sm text-red-700">{isRtl?'لا يمكن ترك منشور نصي فارغاً.':'A text-only post cannot be empty.'}</p>}
   <div className="flex flex-wrap gap-2"><button disabled={busy||(!draft.trim()&&!hasMedia)||draft.trim()===original} className={`${button} bg-[#087F75] text-white`}>{busy?(isRtl?'جارٍ الحفظ…':'Saving…'):(isRtl?'حفظ التعديل':'Save changes')}</button><button type="button" disabled={busy} className={button} onClick={()=>{close();setStatus('');}}>{isRtl?'إلغاء':'Cancel'}</button></div>
  </form>}
  <p role="status" className="text-sm">{status}</p>
 </div>;
}
