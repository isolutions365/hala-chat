import React, {useEffect, useId, useRef, useState} from 'react';
import {watchCreatorsByName, type CreatorProfile} from '../lib/creatorFollowing';
import {creatorNameRange, CREATOR_SEARCH_LIMIT} from '../lib/creatorNameSearch.mjs';

type Result = CreatorProfile & {id:string};
export function CreatorNameSearch({isRtl,onOpenCreator}:{isRtl:boolean;onOpenCreator:(id:string,name:string)=>void}) {
 const [input,setInput]=useState('');
 const [request,setRequest]=useState<{prefix:string;end:string}|null>(null);
 const [state,setState]=useState<'idle'|'invalid'|'loading'|'ready'|'failed'>('idle');
 const [results,setResults]=useState<Result[]>([]);
 const helpId=useId(), inputRef=useRef<HTMLInputElement>(null);
 useEffect(()=>{
  if(!request)return;
  let active=true,stop=()=>{};
  const timer=setTimeout(()=>{if(active){active=false;stop();setResults([]);setState('failed');}},12000);
  try {stop=watchCreatorsByName(request.prefix,request.end,items=>{if(active){clearTimeout(timer);setResults(items);setState('ready');}},()=>{if(active){clearTimeout(timer);active=false;setResults([]);setState('failed');}});}
  catch {clearTimeout(timer);active=false;setState('failed');}
  return()=>{active=false;clearTimeout(timer);stop();};
 },[request]);
 function search(event:React.FormEvent){
  event.preventDefault();setResults([]);
  const range=creatorNameRange(input);
  if(!range){setRequest(null);setState('invalid');inputRef.current?.focus();return;}
  setState('loading');setRequest(range);
 }
 const button='min-h-11 rounded-xl px-4 py-3 font-semibold focus-visible:ring-2 focus-visible:ring-teal-700 disabled:opacity-50';
 return <section className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 space-y-3" aria-label={isRtl?'البحث بالاسم':'Find by name'}>
  <h3 className="font-bold text-[#112330]">{isRtl?'ابحث عن صانع محتوى بالاسم':'Find a creator by name'}</h3>
  <form onSubmit={search} className="space-y-3">
   <label className="block text-sm font-medium">{isRtl?'بداية الاسم العام':'Start of public name'}<input ref={inputRef} value={input} maxLength={100} dir="auto" autoCapitalize="none" autoCorrect="off" spellCheck={false} aria-invalid={state==='invalid'} aria-describedby={helpId} onChange={event=>{setInput(event.target.value);setRequest(null);setState('idle');setResults([]);}} className="block w-full mt-2 rounded-xl border border-slate-300 min-h-11 px-3 text-base"/></label>
   <p id={helpId} className="text-sm text-slate-600">{isRtl?'اكتب حرفين على الأقل من بداية الاسم. يجب مطابقة الأحرف الكبيرة والصغيرة والتشكيل. تظهر حتى ٢٠ نتيجة؛ أضف حروفاً لتضييق البحث.':'Enter at least 2 characters from the start of the name. Capital letters and accents must match. Up to 20 results appear; add more letters to narrow the search.'}</p>
   <button className={`${button} bg-[#087F75] text-white`} disabled={state==='loading'}>{state==='loading'?(isRtl?'جارٍ البحث…':'Searching…'):state==='failed'?(isRtl?'إعادة المحاولة':'Retry search'):(isRtl?'بحث':'Find creators')}</button>
  </form>
  {state==='invalid'&&<p role="alert" className="text-sm text-red-700">{isRtl?'أدخل حرفين على الأقل من الاسم العام.':'Enter at least 2 characters of the public name.'}</p>}
  {state==='failed'&&<p role="alert" className="text-sm text-red-700">{isRtl?'تعذر البحث. تحقق من الاتصال وحاول مجدداً.':'Search could not finish. Check your connection and retry.'}</p>}
  <p role="status" className="text-sm">{state==='loading'?(isRtl?'جارٍ تحميل الملفات العامة…':'Loading public profiles…'):state==='ready'?(results.length===0?(isRtl?'لا توجد أسماء مطابقة. جرّب تهجئة أخرى أو معرّف Hala.':'No matching names. Try another spelling or the exact Hala ID.'):results.length===CREATOR_SEARCH_LIMIT?(isRtl?'تظهر أول ٢٠ نتيجة. أضف حروفاً لتضييق البحث.':'Showing the first 20 matches. Add more letters to narrow the search.'):(isRtl?`النتائج: ${results.length}`:`${results.length} matches`)):''}</p>
  <ul className="space-y-2">{results.map(profile=><li key={profile.id} className="rounded-xl bg-[#F5F8F7] p-3 space-y-2"><p className="font-bold break-words" dir="auto">{profile.name}</p>{profile.bio&&<p className="text-sm whitespace-pre-wrap break-words" dir="auto">{profile.bio}</p>}<p className="text-xs break-all" dir="ltr">Hala ID: {profile.id}</p><button type="button" className={`${button} border border-slate-300`} onClick={()=>onOpenCreator(profile.id,profile.name)}>{isRtl?'عرض الملف والمنشورات':'View profile and posts'}</button></li>)}</ul>
 </section>;
}
