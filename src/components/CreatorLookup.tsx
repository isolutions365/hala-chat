import React,{useEffect,useId,useRef,useState} from 'react';
import {watchCreatorProfile,type CreatorProfile} from '../lib/creatorFollowing';

export function CreatorLookup({isRtl,onOpenCreator}:{isRtl:boolean;onOpenCreator:(id:string,name:string)=>void}) {
 const [input,setInput]=useState(''),[request,setRequest]=useState<{id:string;attempt:number}|null>(null);
 const [state,setState]=useState<'idle'|'invalid'|'loading'|'missing'|'failed'|'found'>('idle');
 const [profile,setProfile]=useState<CreatorProfile|null>(null);
 const inputRef=useRef<HTMLInputElement>(null),helpId=useId();
 useEffect(()=>{
  if(!request)return;
  let active=true,stop=()=>{};
  const timer=setTimeout(()=>{if(active){active=false;stop();setProfile(null);setState('failed');}},12000);
  try{stop=watchCreatorProfile(request.id,value=>{if(active){clearTimeout(timer);setProfile(value);setState(value?'found':'missing');}},()=>{if(active){clearTimeout(timer);setProfile(null);setState('failed');}});}catch{clearTimeout(timer);setState('failed');}
  return()=>{active=false;clearTimeout(timer);stop();};
 },[request]);
 function search(e:React.FormEvent){e.preventDefault();const id=input.trim();setProfile(null);
  if(!id||id.length>128||id==='.'||id==='..'||/[\/\s\u0000-\u001f\u007f]/.test(id)){setRequest(null);setState('invalid');inputRef.current?.focus();return;}
  setState('loading');setRequest(previous=>({id,attempt:(previous?.attempt||0)+1}));
 }
 const button='min-h-11 rounded-xl px-4 py-3 font-semibold focus-visible:ring-2 focus-visible:ring-teal-700 disabled:opacity-50';
 return <section className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 space-y-3" aria-label={isRtl?'البحث عن صانع محتوى':'Find a creator'}>
  <h3 className="font-bold text-[#112330]">{isRtl?'ابحث عن صانع محتوى':'Find a creator'}</h3>
  <form onSubmit={search} className="space-y-3">
   <label className="block text-sm font-medium">{isRtl?'معرّف هلا الكامل':'Exact Hala ID'}<input ref={inputRef} value={input} maxLength={128} autoCapitalize="none" autoCorrect="off" spellCheck={false} dir="ltr" aria-invalid={state==='invalid'} aria-describedby={helpId} onChange={e=>{setInput(e.target.value);setRequest(null);setState('idle');setProfile(null);}} className="block w-full mt-2 rounded-xl border border-slate-300 min-h-11 px-3 text-base"/></label>
   <p id={helpId} className="text-sm text-slate-600">{isRtl?'الصق معرّف هلا الذي شاركه معك الشخص. البحث مطابق للمعرّف وليس برقم الهاتف.':'Paste the Hala ID shared with you. This is an exact ID lookup, not a phone-number search.'}</p>
   <button className={`${button} bg-[#087F75] text-white`} disabled={state==='loading'}>{state==='loading'?(isRtl?'جارٍ البحث…':'Searching…'):state==='failed'?(isRtl?'إعادة المحاولة':'Retry search'):(isRtl?'بحث':'Find creator')}</button>
  </form>
  {state==='invalid'&&<p role="alert" className="text-sm text-red-700">{isRtl?'أدخل معرّف هلا صالحاً دون مسافات أو شرطات مائلة.':'Enter a valid Hala ID without spaces or slashes.'}</p>}
  {state==='failed'&&<p role="alert" className="text-sm text-red-700">{isRtl?'تعذر البحث. تحقق من الاتصال وحاول مجدداً.':'Search could not finish. Check your connection and retry.'}</p>}
  <div role="status">{state==='loading'&&(isRtl?'جارٍ تحميل الملف العام…':'Loading public profile…')}{state==='missing'&&(isRtl?'لا يوجد ملف عام بهذا المعرّف. تحقق من المعرّف وحاول مجدداً.':'No public profile found for this ID. Check the ID and try again.')}</div>
  {state==='found'&&profile&&request&&<div className="rounded-xl bg-[#F5F8F7] p-3 space-y-2"><p className="font-bold break-words" dir="auto">{profile.name||request.id}</p>{profile.bio&&<p className="text-sm whitespace-pre-wrap break-words" dir="auto">{profile.bio}</p>}<button type="button" className={`${button} border border-slate-300`} onClick={()=>onOpenCreator(request.id,profile.name||request.id)}>{isRtl?'عرض الملف والمنشورات':'View profile and posts'}</button></div>}
 </section>;
}
