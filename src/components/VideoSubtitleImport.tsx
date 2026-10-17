import {VideoSubtitleEditor} from './VideoSubtitleEditor';
import React,{useEffect,useRef,useState} from 'react';
import {normalizeSubtitles,SUBTITLE_MAX_BYTES} from '../lib/videoSubtitles.mjs';
import type {VideoSubtitles} from './VideoSubtitleTrack';
export function VideoSubtitleImport({duration,isRtl,disabled,value,onChange,onBusyChange,onEditingChange}:{key?:string;duration:number;isRtl:boolean;disabled:boolean;value:VideoSubtitles|null;onChange:(value:VideoSubtitles|null)=>void;onBusyChange:(busy:boolean)=>void;onEditingChange?:(editing:boolean)=>void}) {
 const [language,setLanguage]=useState(isRtl?'ar':'en'),[error,setError]=useState(false),[busy,setBusy]=useState(false);
 const [editing,setEditing]=useState(false);
 useEffect(()=>{onEditingChange?.(editing);return()=>onEditingChange?.(false);},[editing,onEditingChange]);
 const active=useRef(true),pending=useRef(false);
 useEffect(()=>{active.current=true;return()=>{active.current=false;onBusyChange(false);};},[]);
 async function choose(file?:File){
  if(!file||disabled||pending.current)return;
  setError(false);
  if(!file.name.toLowerCase().endsWith('.vtt')||file.size>SUBTITLE_MAX_BYTES||!file.size){setError(true);return;}
  pending.current=true;setBusy(true);onBusyChange(true);
  try {const {vtt}=normalizeSubtitles(await file.text(),duration);if(active.current)onChange({vtt,language});}
  catch {if(active.current)setError(true);}
  finally {pending.current=false;if(active.current){setBusy(false);onBusyChange(false);}}
 }
 return <div className="rounded-xl border border-slate-200 p-3 space-y-2">
  <h3 className="font-semibold">{isRtl?'ترجمة الفيديو (اختيارية)':'Video subtitles (optional)'}</h3>
  <label className="block text-sm">{isRtl?'لغة الترجمة':'Subtitle language'}<select value={value?.language||language} disabled={disabled||busy||editing} onChange={event=>{setLanguage(event.target.value);if(value)onChange({...value,language:event.target.value});}} className="block mt-1 min-h-11 rounded-xl border px-3"><option value="ar">العربية</option><option value="en">English</option><option value="ur">اردو</option></select></label>
  <button type="button" disabled={disabled||busy||editing} onClick={()=>{setError(false);setEditing(true);}} className="min-h-11 px-3 py-2 rounded-xl border border-slate-300">{value?(isRtl?'تعديل التوقيت والنص':'Edit subtitle timing and text'):(isRtl?'كتابة الترجمة هنا':'Write subtitles here')}</button>
  {editing&&<VideoSubtitleEditor vtt={value?.vtt} duration={duration} isRtl={isRtl} disabled={disabled||busy} onApply={vtt=>{onChange({vtt,language:value?.language||language});setEditing(false);}} onCancel={()=>setEditing(false)}/>}
  <label className="block text-sm">{isRtl?'إرفاق ملف VTT' :'Attach a VTT file'}<input type="file" accept=".vtt,text/vtt" disabled={disabled||busy||editing} onChange={event=>{const file=event.target.files?.[0];event.target.value='';void choose(file);}} className="block w-full min-h-11 mt-1 text-sm"/></label>
  <p className="text-sm text-slate-600">{isRtl?'ملف نصي حتى ٢٤ كيلوبايت، وبحد أقصى ٦٠ مقطعاً غير متداخل ضمن مدة الفيديو. التنسيق والأنماط غير مدعومة. استخدم CC في المشغل للمعاينة.':'Plain VTT up to 24 KB: at most 60 non-overlapping cues within the video duration. Styling and positioning are not supported. Use the player’s CC control to preview.'}</p>
  <a href="/subtitles-example.vtt" download className="inline-block min-h-11 py-3 underline">{isRtl?'تنزيل مثال للتعديل':'Download an example to edit'}</a>
  {error&&<p role="alert" className="text-sm text-red-700">{isRtl?'تعذر قراءة الترجمة. تحقق من تنسيق الملف وحجمه وتوقيته. احتُفظ بالترجمة السابقة إن وجدت.':'Could not read subtitles. Check file format, size and timing. Any previously attached subtitles were kept.'}</p>}
  <p role="status" className="text-sm">{busy?(isRtl?'جارٍ فحص الترجمة…':'Checking subtitles…'):value?(isRtl?'تم إرفاق الترجمة.':'Subtitles attached.'):''}</p>
  {value&&<button type="button" disabled={disabled||busy||editing} onClick={()=>{onChange(null);setError(false);}} className="min-h-11 px-3 underline">{isRtl?'إزالة الترجمة':'Remove subtitles'}</button>}
 </div>;
}
