import {VideoSubtitleTrack,type VideoSubtitles} from './VideoSubtitleTrack';
import React,{useEffect,useState} from 'react';
export function CommunityVideo({src,isRtl,poster,subtitles}:{src:string;isRtl:boolean;poster?:string;subtitles?:VideoSubtitles}) {
 const [failed,setFailed]=useState(false),[attempt,setAttempt]=useState(0);
 useEffect(()=>{setFailed(false);setAttempt(0);},[src]);
 let source=src;if(attempt){try{const url=new URL(src);if(['http:','https:'].includes(url.protocol)){url.searchParams.set('_hala_retry',String(attempt));source=url.toString();}}catch{}}
 return failed?<div role="alert" className="rounded-xl bg-slate-50 p-5"><p>{isRtl?'تعذر تشغيل الفيديو. تحقق من الاتصال أو جرّب متصفحاً آخر.':'Video could not play. Check your connection or try another browser.'}</p><button type="button" autoFocus={attempt>0} className="min-h-11 px-4 py-2 rounded-xl border mt-2" onClick={()=>{setFailed(false);setAttempt(n=>n+1);}}>{isRtl?'إعادة المحاولة':'Retry video'}</button></div>:<video key={source} src={source} poster={poster||undefined} controls playsInline preload="none" aria-label={isRtl?'فيديو المجتمع':'Community video'} onError={()=>setFailed(true)} className="w-full max-h-[32rem] rounded-xl bg-[#112330]"><VideoSubtitleTrack subtitles={subtitles}/></video>;
}
