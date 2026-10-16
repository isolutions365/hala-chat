import React,{useEffect,useState} from 'react';
import {normalizeSubtitles,SUBTITLE_LANGUAGES} from '../lib/videoSubtitles.mjs';
export type VideoSubtitles={vtt:string;language:string};
export function VideoSubtitleTrack({subtitles}:{subtitles?:VideoSubtitles|null}) {
 const [source,setSource]=useState('');
 useEffect(()=>{
  setSource('');
  if(!subtitles||!SUBTITLE_LANGUAGES.includes(subtitles.language))return;
  let url='';
  try {const {vtt}=normalizeSubtitles(subtitles.vtt,30);url=URL.createObjectURL(new Blob([vtt],{type:'text/vtt'}));setSource(url);}catch{}
  return()=>{if(url)URL.revokeObjectURL(url);};
 },[subtitles?.vtt,subtitles?.language]);
 if(!source||!subtitles)return null;
 return <track key={source} kind="subtitles" src={source} srcLang={subtitles.language} label={subtitles.language==='ar'?'العربية':subtitles.language==='ur'?'اردو':'English'}/>;
}
