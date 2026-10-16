import React,{useEffect,useState} from 'react';
import {watchCreatorProfile,type CreatorProfile} from '../lib/creatorFollowing';
export function CreatorProfileCard({id,isRtl}:{id:string;isRtl:boolean}) {
 const [profile,setProfile]=useState<CreatorProfile|null>(null),[loading,setLoading]=useState(true),[failed,setFailed]=useState(false),[retry,setRetry]=useState(0),[imageFailed,setImageFailed]=useState(false);
 useEffect(()=>{let active=true;setLoading(true);setFailed(false);setProfile(null);setImageFailed(false);const stop=watchCreatorProfile(id,value=>{if(active){setProfile(value);setLoading(false);setFailed(false);setImageFailed(false);}},()=>{if(active){setFailed(true);setLoading(false);}});return()=>{active=false;stop();};},[id,retry]);
 if(loading)return <p role="status">{isRtl?'جارٍ تحميل الملف العام…':'Loading public profile…'}</p>;
 if(failed)return <div role="alert"><p>{isRtl?'تعذر تحميل الملف العام.':'Public profile could not load.'}</p><button type="button" className="min-h-11 px-4 py-2 underline" onClick={()=>setRetry(n=>n+1)}>{isRtl?'إعادة المحاولة':'Retry profile'}</button></div>;
 if(!profile)return <p>{isRtl?'الملف العام غير متاح.':'Public profile is unavailable.'}</p>;
 return <div className="flex items-start gap-3" aria-label={isRtl?'الملف العام':'Public profile'}>
  {profile.avatar&&!imageFailed?<img src={profile.avatar} onError={()=>setImageFailed(true)} alt="" className="w-16 h-16 rounded-2xl object-cover shrink-0"/>:<span aria-hidden="true" className="w-16 h-16 rounded-2xl bg-white/10 flex items-center justify-center text-2xl shrink-0">{Array.from(profile.name.trim())[0]||'H'}</span>}
  <div className="min-w-0"><p className="font-bold break-words" dir="auto">{profile.name}</p>{profile.bio&&<p className="whitespace-pre-wrap break-words text-sm mt-1" dir="auto">{profile.bio}</p>}<p className="text-xs mt-2 break-all select-all" dir="ltr">Hala ID: {id}</p></div>
 </div>;
}
