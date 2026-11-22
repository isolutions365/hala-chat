import React,{useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {X,RefreshCw,Expand} from 'lucide-react';
import {LazyImage} from './LazyImage';

export function CommunityPhoto({src,author,isRtl}:{src:string;author:string;isRtl:boolean}) {
 const [failed,setFailed]=useState(false),[attempt,setAttempt]=useState(0),[open,setOpen]=useState(false);
 const dialog=useRef<HTMLDialogElement|null>(null);
 const trigger=useRef<HTMLButtonElement|null>(null);
 const retryButton=useRef<HTMLButtonElement|null>(null);
 const label=isRtl?`صورة من ${author}`:`Photo by ${author}`;
 let source=src;
 if(attempt>0){try{const url=new URL(src);if(url.protocol==='https:'||url.protocol==='http:'){url.searchParams.set('_hala_retry',String(attempt));source=url.toString();}}catch{/* Keep original URL; invalid images show a recoverable error. */}}
 useEffect(()=>{setFailed(false);setAttempt(0);setOpen(false);},[src]);
 useEffect(()=>{
  if(!open||!dialog.current)return;
  const element=dialog.current;const previous=document.body.style.overflow;
  document.body.style.overflow='hidden';element.showModal();
  return()=>{element.close();document.body.style.overflow=previous;if(trigger.current)trigger.current.focus();else retryButton.current?.focus();};
 },[open]);
 const retry=()=>{setFailed(false);setAttempt(n=>n+1);};
 const failure=<div role="alert" className="flex flex-col items-center justify-center gap-3 p-6 min-h-40"><p>{isRtl?'تعذر تحميل الصورة.':'Photo could not load.'}</p><button type="button" ref={retryButton} autoFocus={attempt>0} className="min-h-11 rounded-xl border border-current px-4 py-2 inline-flex gap-2 items-center" onClick={retry}><RefreshCw size={16} aria-hidden="true"/>{isRtl?'إعادة المحاولة':'Retry photo'}</button></div>;
 return <>
  {failed&&!open?<div className="rounded-xl bg-slate-50 text-slate-600">{failure}</div>:<button type="button" ref={trigger} onClick={()=>setOpen(true)} className="relative block w-full rounded-xl overflow-hidden bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700" aria-label={isRtl?`فتح صورة من ${author}`:`Open photo by ${author}`}>
   <LazyImage key={source} src={source} alt={label} aspectRatio="16/9" objectFit="contain" containerClassName="w-full max-h-96 min-h-32 rounded-xl" className="w-full max-h-96 min-h-32 object-contain"/>
   <span className="absolute bottom-2 end-2 p-2 rounded-full bg-slate-900/80 text-white z-20"><Expand size={16} aria-hidden="true"/></span>
  </button>}
  {open&&createPortal(<dialog ref={dialog} dir={isRtl?'rtl':'ltr'} aria-label={label} className="fixed inset-0 m-0 h-dvh w-screen max-h-none max-w-none border-0 bg-[#112330] text-white p-4 backdrop:bg-black/80" onCancel={e=>{e.preventDefault();setOpen(false);}} onClick={e=>{if(e.target===e.currentTarget)setOpen(false);}}>
   <div className="flex justify-between items-center gap-3 mb-3"><p className="text-sm truncate">{label}</p><button type="button" autoFocus className="min-h-11 min-w-11 inline-flex items-center justify-center rounded-full bg-white/10 focus-visible:outline-2 focus-visible:outline-white" aria-label={isRtl?'إغلاق الصورة':'Close photo'} onClick={()=>setOpen(false)}><X aria-hidden="true"/></button></div>
   {failed?failure:<img key={source} src={source} alt={label} referrerPolicy="no-referrer" onError={()=>setFailed(true)} className="w-full h-[calc(100dvh-6rem)] object-contain"/>}
  </dialog>,document.body)}
 </>;
}
