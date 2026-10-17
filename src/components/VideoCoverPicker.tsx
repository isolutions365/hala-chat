import {VideoSubtitleTrack,type VideoSubtitles} from './VideoSubtitleTrack';
import React,{useEffect,useRef,useState} from 'react';
import {captureVideoCover} from '../lib/videoCover';
export function VideoCoverPicker({src,disabled,isRtl,cover,onChange,onBusyChange,subtitles}:{key?:string;subtitles?:VideoSubtitles|null;src:string;disabled:boolean;isRtl:boolean;cover:Blob|null;onChange:(cover:Blob|null)=>void;onBusyChange:(busy:boolean)=>void}) {
 const video=useRef<HTMLVideoElement>(null),alive=useRef(true);const [ready,setReady]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(false),[coverUrl,setCoverUrl]=useState('');
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;onBusyChange(false);};},[]);
 useEffect(()=>{if(!cover){setCoverUrl('');return;}const url=URL.createObjectURL(cover);setCoverUrl(url);return()=>URL.revokeObjectURL(url);},[cover]);
 async function choose(){if(disabled||busy||!video.current)return;video.current.pause();setBusy(true);onBusyChange(true);setError(false);try{const result=await captureVideoCover(video.current);if(alive.current)onChange(result);}catch{if(alive.current)setError(true);}finally{if(alive.current){setBusy(false);onBusyChange(false);}}}
 return <div className="space-y-3">
  <video ref={video} src={src} controls playsInline preload="metadata" aria-label={isRtl?'معاينة الفيديو':'Video preview'} className="w-full max-h-64 rounded-xl" onLoadedData={()=>setReady(true)} onSeeking={()=>setReady(false)} onSeeked={()=>setReady(true)} onError={()=>{setReady(false);setError(true);}}><VideoSubtitleTrack subtitles={subtitles}/></video>
  <p className="text-sm text-slate-600">{isRtl?'أوقف الفيديو عند اللقطة التي تريدها ثم اخترها كغلاف.':'Pause at the frame you want, then choose it as the cover.'}</p>
  <button type="button" disabled={disabled||busy||!ready} onClick={()=>void choose()} className="min-h-11 px-4 py-3 rounded-xl border font-semibold disabled:opacity-50">{busy?(isRtl?'جارٍ تجهيز الغلاف…':'Preparing cover…'):(isRtl?'استخدام هذه اللقطة كغلاف':'Use this frame as cover')}</button>
  {error&&<p role="alert" className="text-sm text-red-700">{isRtl?'تعذر تجهيز الغلاف. جرّب لقطة أخرى أو انشر دون غلاف مخصص.':'Could not prepare the cover. Try another frame or publish without a custom cover.'}</p>}
  {coverUrl&&<div><img src={coverUrl} alt={isRtl?'الغلاف المختار':'Selected video cover'} className="max-h-40 rounded-xl"/><button type="button" disabled={disabled||busy} className="min-h-11 px-3 underline" onClick={()=>onChange(null)}>{isRtl?'إزالة الغلاف':'Remove cover'}</button></div>}
 </div>;
}
