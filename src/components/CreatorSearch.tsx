import React,{useState} from 'react';
import {CreatorLookup} from './CreatorLookup';
import {CreatorNameSearch} from './CreatorNameSearch';
export function CreatorSearch(props:{isRtl:boolean;onOpenCreator:(id:string,name:string)=>void}) {
 const [mode,setMode]=useState<'id'|'name'>('id');
 return <div><div role="group" aria-label={props.isRtl?'طريقة البحث عن صانع المحتوى':'Creator search method'} className="flex flex-wrap gap-2 mb-2">
  {(['id','name'] as const).map(value=><button key={value} type="button" aria-pressed={mode===value} onClick={()=>setMode(value)} className={`min-h-11 rounded-xl px-4 py-2 font-semibold focus-visible:ring-2 focus-visible:ring-teal-700 ${mode===value?'bg-[#087F75] text-white':'bg-white border border-slate-300'}`}>{value==='id'?'Hala ID':props.isRtl?'الاسم':'Name'}</button>)}
 </div>{mode==='id'?<CreatorLookup {...props}/>:<CreatorNameSearch {...props}/>}</div>;
}
