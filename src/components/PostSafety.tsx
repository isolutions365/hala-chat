import React,{useEffect,useRef,useState} from 'react';
import {reportPost,type SocialPost,type PostReportReason} from '../lib/socialFeed';
export function PostSafety({post,isRtl,onHide}:{post:SocialPost;isRtl:boolean;onHide:()=>void}) {
 const [open,setOpen]=useState(false),[reason,setReason]=useState<PostReportReason>('Spam'),[details,setDetails]=useState(''),[busy,setBusy]=useState(false),[status,setStatus]=useState('');
 const alive=useRef(true);useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 const button='min-h-11 px-3 py-2 rounded-xl text-sm disabled:opacity-50';
 async function submit(e:React.FormEvent){e.preventDefault();if(busy)return;setBusy(true);setStatus('');try{await reportPost(post,reason,details);if(alive.current){setOpen(false);setDetails('');setStatus(isRtl?'تم حفظ البلاغ.':'Report saved.');}}catch{if(alive.current)setStatus(isRtl?'تعذر حفظ البلاغ. حاول مجدداً.':'Could not save report. Please retry.');}finally{if(alive.current)setBusy(false);}}
 return <div className="border-t border-slate-100 pt-2">
  <div className="flex flex-wrap gap-2"><button type="button" disabled={busy} className={button} onClick={onHide}>{isRtl?'إخفاء على هذا الجهاز':'Hide on this device'}</button><button type="button" disabled={busy} className={button} aria-expanded={open} onClick={()=>setOpen(value=>!value)}>{isRtl?'إبلاغ':'Report post'}</button></div>
  {open&&<form onSubmit={submit} className="space-y-3 rounded-xl bg-slate-50 p-3">
   <p className="text-sm text-slate-600">{isRtl?'البلاغ خاص ولا يظهر لصاحب المنشور. لا يتسبب في حذف المنشور تلقائياً.':'Your report is private from the post author. It does not automatically remove the post.'}</p>
   <label className="block text-sm">{isRtl?'سبب البلاغ':'Report reason'}<select disabled={busy} className="block w-full border rounded-xl p-3 mt-1" value={reason} onChange={e=>setReason(e.target.value as PostReportReason)}>{(['Spam','Harassment','Inappropriate content','Other'] as const).map((value,i)=><option key={value} value={value}>{isRtl?['رسائل مزعجة','مضايقة','محتوى غير لائق','أخرى'][i]:value}</option>)}</select></label>
   <label className="block text-sm">{isRtl?'تفاصيل (اختياري)':'Details (optional)'}<textarea disabled={busy} maxLength={1000} rows={2} value={details} onChange={e=>setDetails(e.target.value)} className="block w-full border rounded-xl p-3 mt-1"/></label>
   <button disabled={busy} className={`${button} bg-[#087F75] text-white`}>{busy?(isRtl?'جارٍ الحفظ…':'Saving…'):(isRtl?'إرسال البلاغ':'Submit report')}</button><button type="button" disabled={busy} className={button} onClick={()=>setOpen(false)}>{isRtl?'إلغاء':'Cancel'}</button>
  </form>}
  <p role="status" className="text-sm">{status}</p>
 </div>;
}
