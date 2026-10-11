import React, { useEffect, useState } from 'react';
import { watchCreatorNames } from '../lib/creatorFollowing';
export function FollowingControls({ids,isRtl,pending,onUnfollow}:{ids:string[];isRtl:boolean;pending:boolean;onUnfollow:(id:string)=>void}) {
 const [open,setOpen]=useState(false),[names,setNames]=useState<Record<string,string>>({});
 const [failed,setFailed]=useState(false),[retry,setRetry]=useState(0),[loading,setLoading]=useState(false);
 const key=JSON.stringify(ids);
 useEffect(()=>{if(!open)return;setNames({});setFailed(false);setLoading(true);return watchCreatorNames(JSON.parse(key),value=>{setNames(value);setLoading(false);},()=>{setFailed(true);setLoading(false);});},[open,key,retry]);
 return <div>
  <button type="button" aria-expanded={open} className="min-h-11 px-3 underline text-sm" onClick={()=>setOpen(!open)}>{isRtl?'إدارة المتابعات':'Manage following'} · {ids.length}/30</button>
  {open&&<div className="space-y-2 pt-2">
   {loading&&<p role="status">{isRtl?'جارٍ تحميل الأسماء…':'Loading names…'}</p>}
   {failed&&<p role="alert">{isRtl?'تعذر تحميل الأسماء.':'Names could not load.'} <button className="min-h-11 underline px-3" onClick={()=>setRetry(value=>value+1)}>{isRtl?'إعادة المحاولة':'Retry names'}</button></p>}
   {!ids.length&&<p>{isRtl?'تابع صانع محتوى من منشوراته في قسم الجميع.':'Follow a creator from their posts in Everyone.'}</p>}
   {ids.map((id,index)=><div key={id} className="flex items-center justify-between gap-3 border-t border-slate-100 py-1"><span dir="auto" className="break-words min-w-0">{names[id]||(isRtl?`صانع محتوى ${index+1}`:`Creator ${index+1}`)}</span><button type="button" disabled={pending} className="min-h-11 px-3 text-[#087F75] font-semibold disabled:opacity-50 shrink-0" onClick={()=>onUnfollow(id)}>{isRtl?'إلغاء المتابعة':'Unfollow'}</button></div>)}
  </div>}
 </div>;
}
