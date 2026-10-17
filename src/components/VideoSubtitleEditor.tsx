import React,{useRef,useState} from 'react';
import {buildSubtitles,readSubtitleCues} from '../lib/videoSubtitles.mjs';
type Cue={id:number;start:string;end:string;text:string};
export function VideoSubtitleEditor({vtt,duration,isRtl,disabled,onApply,onCancel}:{vtt?:string;duration:number;isRtl:boolean;disabled:boolean;onApply:(vtt:string)=>void;onCancel:()=>void}) {
 const sequence=useRef(1);
 const [rows,setRows]=useState<Cue[]>(()=>{
  try {if(vtt)return readSubtitleCues(vtt,duration).map((cue,index)=>({id:index+1,start:String(cue.start),end:String(cue.end),text:cue.text}));}catch{}
  return [{id:1,start:'0',end:String(Math.min(2,duration)),text:''}];
 });
 const [error,setError]=useState(false);
 const inputClass='block w-full min-h-11 border border-slate-300 rounded-xl px-3 py-2 mt-1 text-base';
 const button='min-h-11 px-3 py-2 rounded-xl border border-slate-300 focus-visible:ring-2 focus-visible:ring-teal-700 disabled:opacity-50';
 function update(id:number,field:'start'|'end'|'text',value:string){setRows(items=>items.map(row=>row.id===id?{...row,[field]:value}:row));setError(false);}
 function apply(){try{if(rows.some(row=>!row.start.trim()||!row.end.trim()))throw Error();onApply(buildSubtitles(rows.map(row=>({start:Number(row.start),end:Number(row.end),text:row.text})),duration));}catch{setError(true);}}
 const lastEnd=rows.length?Number(rows[rows.length-1].end):0;
 return <div className="rounded-xl bg-slate-50 p-3 space-y-3" aria-label={isRtl?'محرر الترجمة':'Subtitle editor'}>
  <p className="text-sm">{isRtl?'اكتب النص وحدد بداية ونهاية كل مقطع بالثواني. طبّق التعديلات أو ألغها قبل النشر.':'Write each subtitle and its start/end time in seconds. Apply or cancel your edits before publishing.'}</p>
  <p className="text-sm">{isRtl?'مدة الفيديو':'Video duration'}: {duration.toFixed(2)} s · {rows.length}/60</p>
  {rows.map((row,index)=><fieldset key={row.id} disabled={disabled} className="border border-slate-200 rounded-xl p-3 space-y-2"><legend className="text-sm font-semibold">{isRtl?'مقطع':'Cue'} {index+1}</legend>
   <div className="grid grid-cols-2 gap-2"><label className="text-sm">{isRtl?'البداية (ثوانٍ)':'Start (seconds)'}<input type="number" min="0" max={duration} step="0.001" value={row.start} onChange={event=>update(row.id,'start',event.target.value)} className={inputClass}/></label><label className="text-sm">{isRtl?'النهاية (ثوانٍ)':'End (seconds)'}<input type="number" min="0" max={duration} step="0.001" value={row.end} onChange={event=>update(row.id,'end',event.target.value)} className={inputClass}/></label></div>
   <label className="block text-sm">{isRtl?'نص الترجمة':'Subtitle text'}<textarea rows={2} maxLength={1000} value={row.text} dir="auto" onChange={event=>update(row.id,'text',event.target.value)} className={inputClass}/></label>
   <button type="button" className={button} onClick={()=>{setRows(items=>items.filter(item=>item.id!==row.id));setError(false);}}>{isRtl?'حذف المقطع':'Remove cue'} {index+1}</button>
  </fieldset>)}
  {error&&<p role="alert" className="text-sm text-red-700">{isRtl?'تحقق من النص والتوقيت: لا تداخل بين المقاطع، والنهاية ضمن مدة الفيديو. استخدم نصاً عادياً دون أسطر فارغة أو وسوم.':'Check text and timing: cues must not overlap or exceed the video duration. Use plain text without blank lines or tags.'}</p>}
  <div className="flex flex-wrap gap-2">
   <button type="button" disabled={disabled||rows.length>=60||!Number.isFinite(lastEnd)||lastEnd<0||lastEnd>=duration} className={button} onClick={()=>{sequence.current=Math.max(sequence.current,...rows.map(row=>row.id))+1;setRows(items=>[...items,{id:sequence.current,start:String(lastEnd),end:String(Math.min(duration,lastEnd+2)),text:''}]);}}>{isRtl?'إضافة مقطع':'Add cue'}</button>
   <button type="button" disabled={disabled||!rows.length} className={`${button} bg-[#087F75] text-white`} onClick={apply}>{isRtl?'تطبيق الترجمة':'Apply subtitles'}</button>
   <button type="button" disabled={disabled} className={button} onClick={onCancel}>{isRtl?'إلغاء التعديلات':'Cancel edits'}</button>
  </div>
 </div>;
}
