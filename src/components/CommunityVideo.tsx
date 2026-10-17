import {VideoSubtitleTrack,type VideoSubtitles} from './VideoSubtitleTrack';
import React,{useEffect,useRef,useState} from 'react';
export function CommunityVideo({src,isRtl,poster,subtitles}:{src:string;isRtl:boolean;poster?:string;subtitles?:VideoSubtitles}) {
 const videoRef=useRef<HTMLVideoElement>(null);
 const [speed,setSpeed]=useState(1);
 const speeds=[0.5,0.75,1,1.25,1.5,2];
 const [failed,setFailed]=useState(false),[attempt,setAttempt]=useState(0);
 useEffect(()=>{setFailed(false);setAttempt(0);setSpeed(1);},[src]);
 let source=src;if(attempt){try{const url=new URL(src);if(['http:','https:'].includes(url.protocol)){url.searchParams.set('_hala_retry',String(attempt));source=url.toString();}}catch{}}
 useEffect(()=>{if(videoRef.current)videoRef.current.playbackRate=speed;},[speed,source,failed]);
 return failed?<div role="alert" className="rounded-xl bg-slate-50 p-5"><p>{isRtl?'تعذر تشغيل الفيديو. تحقق من الاتصال أو جرّب متصفحاً آخر.':'Video could not play. Check your connection or try another browser.'}</p><button type="button" autoFocus={attempt>0} className="min-h-11 px-4 py-2 rounded-xl border mt-2" onClick={()=>{setFailed(false);setAttempt(n=>n+1);}}>{isRtl?'إعادة المحاولة':'Retry video'}</button></div>:<div className="space-y-2"><video ref={videoRef} key={source} src={source} poster={poster||undefined} controls playsInline preload="none" aria-label={isRtl?'فيديو المجتمع':'Community video'} onLoadedMetadata={event=>{event.currentTarget.playbackRate=speed;}} onRateChange={event=>{const rate=event.currentTarget.playbackRate;if(Number.isFinite(rate)&&rate>0)setSpeed(rate);}} onError={()=>setFailed(true)} className="w-full max-h-[32rem] rounded-xl bg-[#112330]"><VideoSubtitleTrack subtitles={subtitles}/></video><label className="flex flex-wrap items-center gap-2 text-sm text-slate-700">{isRtl?'سرعة التشغيل':'Playback speed'}<select value={speed} onChange={event=>{const rate=Number(event.target.value);if(speeds.includes(rate))setSpeed(rate);}} className="min-h-11 rounded-xl border border-slate-300 bg-white px-3 text-base focus-visible:ring-2 focus-visible:ring-teal-700" dir="ltr">{!speeds.includes(speed)&&<option value={speed}>{speed}×</option>}{speeds.map(rate=><option key={rate} value={rate}>{rate}×{rate===1?(isRtl?' — عادي':' — Normal'):''}</option>)}</select></label></div>;
}
