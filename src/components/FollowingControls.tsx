import React, { useEffect, useState } from 'react';
import { FOLLOW_LIMIT, watchCreatorNames } from '../lib/creatorFollowing';
export function FollowingControls({ids,isRtl,pending,onUnfollow,onOpenCreator}:{ids:string[];isRtl:boolean;pending:boolean;onUnfollow:(id:string)=>void;onOpenCreator?:(id:string,name:string)=>void}) {
 const [search,setSearch]=useState('');
 const [open,setOpen]=useState(false),[names,setNames]=useState<Record<string,string>>({});
 const [failed,setFailed]=useState(false),[retry,setRetry]=useState(0),[loading,setLoading]=useState(false);
 const key=JSON.stringify(ids);
 const needle=search.trim().normalize('NFKC').toLocaleLowerCase();
 const visible=ids.map((id,index)=>({id,index})).filter(({id})=>loading||failed||!needle||`${names[id]||''} ${id}`.normalize('NFKC').toLocaleLowerCase().includes(needle));
 useEffect(()=>{if(!open)return;setNames({});setFailed(false);setLoading(true);return watchCreatorNames(JSON.parse(key),value=>{setNames(value);setLoading(false);},()=>{setFailed(true);setLoading(false);});},[open,key,retry]);
 return <div>
  <button type="button" aria-expanded={open} className="min-h-11 px-3 underline text-sm" onClick={()=>setOpen(!open)}>{isRtl?'إدارة المتابعات':'Manage following'} · {ids.length}/{FOLLOW_LIMIT}</button>
  {open&&<div className="space-y-2 pt-2">
   {loading&&<p role="status">{isRtl?'جارٍ تحميل الأسماء…':'Loading names…'}</p>}
   {failed&&<p role="alert">{isRtl?'تعذر تحميل الأسماء.':'Names could not load.'} <button className="min-h-11 underline px-3" onClick={()=>setRetry(value=>value+1)}>{isRtl?'إعادة المحاولة':'Retry names'}</button></p>}
   {!ids.length&&<p>{isRtl?'تابع صانع محتوى من منشوراته في قسم الجميع.':'Follow a creator from their posts in Everyone.'}</p>}
   {!!ids.length&&<label className="block text-sm font-medium">{isRtl?'البحث في المتابعات بالاسم أو معرّف هلا':'Find followed creators by name or Hala ID'}<input type="search" value={search} maxLength={128} disabled={loading||failed} onChange={event=>setSearch(event.target.value)} dir="auto" className="mt-2 w-full min-h-11 rounded-xl border border-slate-300 px-3 text-base focus-visible:ring-2 focus-visible:ring-teal-700 disabled:opacity-50"/></label>}
   {!loading&&!failed&&!!ids.length&&!!needle&&<p role="status" className="text-sm">{visible.length?(isRtl?`النتائج: ${visible.length}`:`${visible.length} matching creators`):(isRtl?'لا توجد نتائج في متابعاتك.':'No matches in your following list.')}</p>}
   {visible.map(({id,index})=><div key={id} className="flex items-center justify-between gap-3 border-t border-slate-100 py-1">{onOpenCreator?<button type="button" dir="auto" className="min-h-11 text-start break-words min-w-0 underline underline-offset-4" onClick={()=>onOpenCreator(id,names[id]||(isRtl?'صانع محتوى':'Creator'))}>{names[id]||(isRtl?`صانع محتوى ${index+1}`:`Creator ${index+1}`)}</button>:<span dir="auto" className="break-words min-w-0">{names[id]||(isRtl?`صانع محتوى ${index+1}`:`Creator ${index+1}`)}</span>}<button type="button" disabled={pending} className="min-h-11 px-3 text-[#087F75] font-semibold disabled:opacity-50 shrink-0" onClick={()=>onUnfollow(id)}>{isRtl?'إلغاء المتابعة':'Unfollow'}</button></div>)}
  </div>}
 </div>;
}
