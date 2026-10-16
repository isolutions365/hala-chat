import {VideoSubtitleImport} from './VideoSubtitleImport';
import type {VideoSubtitles} from './VideoSubtitleTrack';
import { CreatorSearch } from './CreatorSearch';
import { PostTextEditor } from './PostTextEditor';
import { CreatorProfileCard } from './CreatorProfileCard';
import { VideoCoverPicker } from './VideoCoverPicker';
import { FollowingControls } from './FollowingControls';
import { setCreatorFollow, watchFollowing } from '../lib/creatorFollowing';
import { matchesCommunitySearch } from '../lib/communitySearch';
import { readCommunityDraft, saveCommunityDraft } from '../lib/communityDraft';
import React, { useEffect, useRef, useState } from 'react';
import { CommunityVideo } from './CommunityVideo';
import { inspectShortVideo } from '../lib/shortVideo';
import { CommunityPhoto } from './CommunityPhoto';
import { PostSafety } from './PostSafety';
import { readHiddenPosts, saveHiddenPosts } from '../lib/hiddenPosts';
import { PostComments } from './PostComments';
import { createLivePlanList, type PlanListState } from '../lib/livePlanList';
import { Heart, ImagePlus, Trash2 } from 'lucide-react';
import { deletePost, likePost, newPostId, publishPost, watchSocialFeed, type SocialPost } from '../lib/socialFeed';
import { uploadChatMedia } from '../lib/media';

export function SocialFeed(props:{uid:string;name:string;isRtl:boolean}) {
 return <AccountSocialFeed key={props.uid} {...props}/>;
}
function AccountSocialFeed({uid,name,isRtl}:{uid:string;name:string;isRtl:boolean;key?:string}) {
 const [list,setList]=useState<PlanListState<SocialPost>>({items:[],loading:true,error:false,hasMore:false});
 const {items:posts,loading,error:failed}=list;
 const listController=useRef<ReturnType<typeof createLivePlanList<SocialPost>>|null>(null);
 const [creator,setCreator]=useState<{id:string;name:string}|null>(null);
 const creatorHeading=useRef<HTMLHeadingElement>(null);
 const feedHeading=useRef<HTMLHeadingElement>(null);
 const previousView=useRef({search:'',view:'all' as 'all'|'videos'});
 const navigationPending=useRef(false);
 const [audience,setAudience]=useState<'everyone'|'following'>('everyone');
 const [following,setFollowing]=useState<string[]>([]),[followingReady,setFollowingReady]=useState(false),[followingFailed,setFollowingFailed]=useState(false),[followingRetry,setFollowingRetry]=useState(0),[followPending,setFollowPending]=useState(false);
 const queryKey=creator?JSON.stringify([creator.id]):audience==='following'?JSON.stringify(following):'';
 const waitForFollowing=!creator&&audience==='following'&&!followingReady;
 function openCreator(id:string,name:string){previousView.current={search,view};setCreator({id,name});setSearch('');setView('all');setCommentsFor('');setConfirm('');setStatus('');setActiveVideoId('');navigationPending.current=true;}
 function closeCreator(){setCreator(null);setSearch(previousView.current.search);setView(previousView.current.view);setCommentsFor('');setConfirm('');setStatus('');setActiveVideoId('');navigationPending.current=true;}
 useEffect(()=>{if(navigationPending.current){const heading=creator?creatorHeading.current:feedHeading.current;heading?.focus();heading?.scrollIntoView({block:'start'});navigationPending.current=false;}},[creator]);
 useEffect(()=>{setFollowingReady(false);setFollowingFailed(false);return watchFollowing(uid,ids=>{setFollowing(ids);setFollowingReady(true);setFollowingFailed(false);},()=>{setFollowingFailed(true);setFollowingReady(false);});},[uid,followingRetry]);
 const [commentsFor,setCommentsFor]=useState('');
 const [hidden,setHidden]=useState<string[]>(()=>readHiddenPosts(uid));
 useEffect(()=>{setHidden(readHiddenPosts(uid));},[uid]);
 function updateHidden(ids:string[]) {const next=ids.slice(-200);setHidden(next);if(!saveHiddenPosts(uid,next))setStatus(isRtl?'تم الإخفاء مؤقتاً؛ تعذر حفظ التفضيل على الجهاز.':'Hidden for this session; device storage is unavailable.');}
 const [search,setSearch]=useState('');
 const visiblePosts=posts.filter(post=>!hidden.includes(post.id));
 const matchingPosts=visiblePosts.filter(post=>matchesCommunitySearch(post,search));
 const [view,setView]=useState<'all'|'videos'>('all');
 const [activeVideoId,setActiveVideoId]=useState('');
 const videos=matchingPosts.filter(post=>!!post.videoUrl);
 const activeVideoIndex=Math.max(0,videos.findIndex(post=>post.id===activeVideoId));
 const displayedPosts=view==='videos'?videos.slice(activeVideoIndex,activeVideoIndex+1):matchingPosts;
 function changeVideo(offset:number){const next=videos[activeVideoIndex+offset];if(next){setActiveVideoId(next.id);setCommentsFor('');setConfirm('');}}

 const [draftSaved,setDraftSaved]=useState(true);
 const [text,setText]=useState(()=>readCommunityDraft(uid)),[photo,setPhoto]=useState<File|null>(null);
 const [preview,setPreview]=useState('');
 const [cover,setCover]=useState<Blob|null>(null);
 const [subtitles,setSubtitles]=useState<VideoSubtitles|null>(null);
 const coverUpload=useRef<{blob:Blob;url:string}|null>(null);
 const [checking,setChecking]=useState(false),[videoDuration,setVideoDuration]=useState(0);
 const isVideo=!!photo?.type.startsWith('video/');
 const [busy,setBusy]=useState(false),[pending,setPending]=useState(''),[confirm,setConfirm]=useState(''),[status,setStatus]=useState(''),[progress,setProgress]=useState(0);
 const alive=useRef(true);const input=useRef<HTMLInputElement>(null);
 // Retain an uploaded URL and stable document ID if publishing needs a retry.
 const attempt=useRef<{id:string;file:File|null;url:string}|null>(null);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 useEffect(()=>{if(!photo){setPreview('');return;}const url=URL.createObjectURL(photo);setPreview(url);return()=>URL.revokeObjectURL(url);},[photo]);
 useEffect(()=>{setList({items:[],loading:true,error:false,hasMore:false});if(waitForFollowing)return;const controller=createLivePlanList<SocialPost>((count,next,error)=>watchSocialFeed(next,error,count,queryKey?JSON.parse(queryKey):undefined),setList);listController.current=controller;controller.start();return()=>{controller.dispose();listController.current=null;};},[uid,queryKey,waitForFollowing]);
 async function followCreator(id:string,followed:boolean){if(followPending)return;setFollowPending(true);setStatus('');try{await setCreatorFollow(id,followed);if(alive.current)setStatus(isRtl?(followed?'تمت المتابعة.':'تم إلغاء المتابعة.'):(followed?'Creator followed.':'Creator unfollowed.'));}catch(e){if(alive.current)setStatus(e instanceof Error&&e.message==='following-limit'?(isRtl?'يمكنك متابعة ٣٠ صانع محتوى. ألغِ متابعة أحدهم أولاً.':'You can follow 30 creators. Unfollow someone first.'):(isRtl?'تعذر حفظ المتابعة. حاول مجدداً.':'Could not save following. Try again.'));}finally{if(alive.current)setFollowPending(false);}}

 const error=()=>setStatus(isRtl?'تعذر إكمال العملية. تحقق من الاتصال وحاول مجدداً.':'Could not complete the action. Check your connection and try again.');
 async function publish(e:React.FormEvent){e.preventDefault();if(busy || checking || (!text.trim()&&!photo))return;setBusy(true);setStatus('');setProgress(0);
  try {
   if(!attempt.current || attempt.current.file!==photo)attempt.current={id:newPostId(),file:photo,url:''};
   const current=attempt.current;
   if(photo && !current.url){current.url=(await uploadChatMedia({chatId:'social-feed',messageId:current.id,fileOrBlob:photo,onProgress:p=>{if(alive.current)setProgress(p);}})).downloadUrl;}
   if(isVideo&&cover&&coverUpload.current?.blob!==cover)coverUpload.current={blob:cover,url:(await uploadChatMedia({chatId:'social-feed',messageId:current.id+'-cover',fileOrBlob:cover})).downloadUrl};
   await publishPost(current.id,name,text,isVideo?'':current.url,isVideo?current.url:'',isVideo?videoDuration:0,isVideo&&cover?coverUpload.current?.url||'':'',isVideo?subtitles:null);
   const cleared=saveCommunityDraft(uid,'');
   if(alive.current){setDraftSaved(cleared);setText('');setPhoto(null);setCover(null);setSubtitles(null);coverUpload.current=null;attempt.current=null;if(input.current)input.current.value='';setStatus(isRtl?'تم نشر المشاركة.':'Post published.');}
  }catch{if(alive.current)error();}finally{if(alive.current)setBusy(false);}
 }
 async function chooseFile(file:File|undefined){if(!file)return;setStatus('');
  if(!['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm'].includes(file.type)||file.size<=0||file.size>5*1024*1024){setStatus(isRtl?'اختر صورة أو فيديو MP4/WebM حتى ٥ ميغابايت.':'Choose an image or MP4/WebM video up to 5 MB.');if(input.current)input.current.value='';return;}
  setChecking(true);
  try{const duration=file.type.startsWith('video/')?await inspectShortVideo(file):0;if(alive.current){setPhoto(file);setCover(null);setSubtitles(null);coverUpload.current=null;setVideoDuration(duration);}}
  catch{if(alive.current){setStatus(isRtl?'اختر فيديو قابلاً للتشغيل مدته ٣٠ ثانية أو أقل.':'Choose a playable video up to 30 seconds.');if(input.current)input.current.value='';}}
  finally{if(alive.current)setChecking(false);}
 }
 async function act(id:string,action:()=>Promise<void>){if(pending)return;setPending(id);setStatus('');try{await action();if(alive.current)setConfirm('');}catch{if(alive.current)error();}finally{if(alive.current)setPending('');}}
 const button='min-h-11 rounded-xl px-4 py-3 font-semibold disabled:opacity-50';
 return <section className="flex-1 overflow-y-auto px-4 pb-28 pt-3 bg-[#F5F8F7]" dir={isRtl?'rtl':'ltr'} aria-label={isRtl?'منشورات المجتمع':'Community posts'}>
  {creator?<div className="rounded-2xl bg-[#112330] text-white p-4 mb-4 space-y-3">
   <button type="button" className={button} onClick={closeCreator}>{isRtl?'العودة إلى المجتمع':'Back to feed'}</button>
   <p className="text-sm text-teal-100">{isRtl?'منشورات صانع المحتوى':'Creator posts'}</p>
   <h2 ref={creatorHeading} tabIndex={-1} className="text-2xl font-bold break-words focus:outline-none" dir="auto">{creator.name}</h2>
   <p className="text-sm">{isRtl?'المنشورات والفيديوهات المشتركة في المجتمع.':'Posts and videos shared with the community.'}</p>
   <CreatorProfileCard id={creator.id} isRtl={isRtl}/>
   {creator.id!==uid&&<button type="button" disabled={!followingReady||followingFailed||followPending} aria-pressed={following.includes(creator.id)} className={`${button} bg-white text-[#087F75]`} onClick={()=>void followCreator(creator.id,!following.includes(creator.id))}>{following.includes(creator.id)?(isRtl?'إلغاء المتابعة':'Unfollow creator'):(isRtl?'متابعة':'Follow creator')}</button>}
  </div>:<h2 ref={feedHeading} tabIndex={-1} className="font-bold text-xl text-[#112330] mb-3 focus:outline-none">{isRtl?'المجتمع':'Community'}</h2>}
  {!creator&&<form onSubmit={publish} className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
   <h2 className="font-bold text-[#112330]">{isRtl?'شارك شيئاً يستحق':'Share something worth sharing'}</h2>
   <p className="text-sm text-slate-600">{isRtl?'منشورك ظاهر لجميع مستخدمي هلا المسجلين. لا تنشر معلومات خاصة.':'Your post is visible to all signed-in Hala users. Keep private information out.'}</p>
   <label className="block text-sm font-medium">{isRtl?'منشور جديد':'New post'}<textarea disabled={busy} maxLength={2000} rows={3} value={text} onChange={e=>{setText(e.target.value);setDraftSaved(saveCommunityDraft(uid,e.target.value));}} className="mt-2 w-full rounded-xl border border-slate-300 p-3 resize-y text-base text-start" dir="auto" /></label>
   <div className="text-xs text-slate-500">{text.length}/2000</div>
   <p className="text-xs text-slate-600">{draftSaved?(isRtl?'تُحفظ مسودة النص لهذا الحساب على هذا الجهاز فقط. أعد اختيار المرفقات بعد إعادة التحميل.':'Text drafts are saved for this account on this device only. Reselect attachments after reloading.'):(isRtl?'تعذر حفظ المسودة على الجهاز. انسخ النص قبل مغادرة الصفحة.':'Draft could not be saved on this device. Copy your text before leaving.')}</p>
   {!!text && <button type="button" disabled={busy} className="min-h-11 px-3 text-sm underline" onClick={()=>{setText('');setDraftSaved(saveCommunityDraft(uid,''));}}>{isRtl?'مسح مسودة النص':'Clear text draft'}</button>}
   {preview && <div>{isVideo?<VideoCoverPicker key={preview} src={preview} disabled={busy||checking} isRtl={isRtl} cover={cover} subtitles={subtitles} onChange={setCover} onBusyChange={setChecking}/>:<img src={preview} alt={isRtl?'معاينة الصورة':'Photo preview'} className="max-h-64 rounded-xl object-contain"/>}<button type="button" disabled={busy||checking} className={button} onClick={()=>{setPhoto(null);setCover(null);setSubtitles(null);coverUpload.current=null;setVideoDuration(0);if(input.current)input.current.value='';}}>{isRtl?'إزالة المرفق':'Remove attachment'}</button></div>}
   {isVideo&&preview&&<VideoSubtitleImport key={preview} duration={videoDuration} isRtl={isRtl} disabled={busy||checking} value={subtitles} onChange={setSubtitles} onBusyChange={setChecking}/>}
   <p className="text-xs text-slate-500">{isRtl?'صور أو فيديو MP4/WebM حتى ٣٠ ثانية. الحد الأقصى ٥ ميغابايت.':'Images or MP4/WebM video up to 30 seconds. Maximum 5 MB.'}</p>
   {checking&&<p role="status">{isRtl?'جارٍ فحص الفيديو…':'Checking video…'}</p>}
   <div className="flex flex-wrap gap-2 items-center">
    <label className={`${button} border border-slate-300 inline-flex gap-2 items-center cursor-pointer focus-within:ring-2 focus-within:ring-teal-700`}><ImagePlus size={18} aria-hidden="true"/>{isRtl?'إضافة صورة أو فيديو':'Add photo or video'}<input ref={input} disabled={busy||checking} type="file" accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm" className="sr-only" onChange={e=>void chooseFile(e.target.files?.[0])}/></label>
    <button disabled={busy || checking || (!text.trim()&&!photo)} className={`${button} bg-[#087F75] text-white`}>{busy?(photo?`${isRtl?'جارٍ النشر':'Publishing'} ${progress}%`:(isRtl?'جارٍ النشر…':'Publishing…')):(isRtl?'نشر':'Publish')}</button>
   </div>
  </form>}
  <p role="status" className="text-sm py-3">{status}</p>
  {!creator&&<CreatorSearch isRtl={isRtl} onOpenCreator={openCreator}/>}
  <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 space-y-2">
   {!creator&&<div role="group" aria-label={isRtl?'مصدر المنشورات':'Post source'} className="flex flex-wrap gap-2">
    <button type="button" className={`${button} ${audience==='everyone'?'bg-[#112330] text-white':'border'}`} aria-pressed={audience==='everyone'} onClick={()=>{setAudience('everyone');setCommentsFor('');setActiveVideoId('');}}>{isRtl?'الجميع':'Everyone'}</button>
    <button type="button" className={`${button} ${audience==='following'?'bg-[#112330] text-white':'border'}`} aria-pressed={audience==='following'} onClick={()=>{setAudience('following');setCommentsFor('');setActiveVideoId('');}}>{isRtl?'أتابعهم':'Following'}</button>
   </div>}
   <p className="text-xs text-slate-600">{isRtl?'قائمة متابعاتك خاصة وتُحفظ في حسابك. منشورات المجتمع تظل مرئية للمستخدمين المسجلين.':'Your following list is private and saved to your account. Community posts remain visible to signed-in users.'}</p>
   {followingFailed?<div role="alert">{isRtl?'تعذر تحميل المتابعات.':'Following could not load.'}<button type="button" className={button} onClick={()=>setFollowingRetry(value=>value+1)}>{isRtl?'إعادة المحاولة':'Retry following'}</button></div>:!followingReady?<p role="status">{isRtl?'جارٍ تحميل المتابعات…':'Loading following…'}</p>:<FollowingControls ids={following} isRtl={isRtl} pending={followPending} onOpenCreator={creator?undefined:openCreator} onUnfollow={id=>void followCreator(id,false)}/>}
  </div>
  <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 space-y-2">
   <label className="block text-sm font-medium">{isRtl?'البحث في المنشورات المحملة':'Search loaded posts'}<input type="search" maxLength={100} value={search} onChange={e=>setSearch(e.target.value)} className="mt-2 w-full min-h-11 rounded-xl border border-slate-300 px-3 text-base" dir="auto"/></label>
   <p className="text-xs text-slate-600">{isRtl?'ابحث بالاسم أو النص. حمّل منشورات أقدم لتوسيع البحث؛ المنشورات المخفية مستبعدة.':'Search by name or text. Load older posts to search more; hidden posts are excluded.'}</p>
   {!!search && <button type="button" className={button} onClick={()=>setSearch('')}>{isRtl?'مسح البحث':'Clear search'}</button>}
   {!!search.trim() && !loading && !failed && <p role="status" className="text-sm">{matchingPosts.length ? `${isRtl?'النتائج':'Results'}: ${matchingPosts.length}` : (isRtl?'لا توجد نتائج في المنشورات المحملة.':'No matches in loaded posts.')}</p>}
  </div>
  {failed && <div role="alert" className="rounded-xl border p-3 bg-white"><p>{isRtl?'تعذر تحميل المنشورات.':'Posts could not load.'}</p><button className={button} onClick={()=>listController.current?.retry()}>{isRtl?'إعادة المحاولة':'Retry'}</button></div>}
  {loading && !(waitForFollowing&&followingFailed) && <p role="status">{isRtl?'جارٍ التحميل…':'Loading posts…'}</p>}
  {!loading && !failed && !posts.length && <p className="p-6 text-center text-slate-600">{creator?(isRtl?'لا توجد منشورات لهذا الحساب بعد.':'This creator has not shared any posts yet.'):audience==='following'?(isRtl?'لا توجد منشورات من متابعاتك بعد. يمكنك متابعة صناع المحتوى من قسم الجميع.':'No posts from followed creators yet. Find creators to follow in Everyone.'):(isRtl?'لا توجد منشورات بعد. كن أول من يشارك.':'No posts yet. Share the first one.')}</p>}
  {hidden.length>0&&<div className="mb-3 text-sm"><p>{isRtl?'الإخفاء خاص بهذا الحساب على هذا الجهاز.':'Hidden posts are saved for this account on this device.'}</p><button className={button} onClick={()=>updateHidden([])}>{isRtl?'إظهار المنشورات المخفية':'Restore hidden posts'} · {hidden.length}</button></div>}
  {!loading&&!failed&&posts.length>0&&visiblePosts.length===0&&<p className="p-4 text-sm">{isRtl?'تم إخفاء كل المنشورات المحملة. يمكنك استعادتها أو تحميل منشورات أقدم.':'All loaded posts are hidden. Restore them or load older posts.'}</p>}
  <div role="group" aria-label={isRtl?'عرض المجتمع':'Community view'} className="flex gap-2 mb-4">
   <button type="button" className={`${button} ${view==='all'?'bg-[#087F75] text-white':'bg-white border'}`} aria-pressed={view==='all'} onClick={()=>{setView('all');setCommentsFor('');}}>{isRtl?'كل المنشورات':'All posts'}</button>
   <button type="button" className={`${button} ${view==='videos'?'bg-[#087F75] text-white':'bg-white border'}`} aria-pressed={view==='videos'} onClick={()=>{setView('videos');setCommentsFor('');}}>{isRtl?'فيديوهات قصيرة':'Short videos'}</button>
  </div>
  {view==='videos' && <div className="rounded-2xl bg-[#112330] text-white p-4 mb-4 space-y-3">
   <h2 className="font-semibold">{isRtl?'شاهد على مهل':'Watch at your pace'}</h2>
   <p className="text-sm">{isRtl?'فيديو واحد في كل مرة. اضغط التشغيل للمشاهدة. تظهر فيديوهات المنشورات المحملة فقط.':'One video at a time. Press play to watch. Only videos from loaded posts appear here.'}</p>
   {!videos.length && !loading && !failed && <p role="status">{isRtl?'لا توجد فيديوهات مطابقة في المنشورات المحملة.':'No matching videos in loaded posts.'}</p>}
   {!!videos.length && <div className="flex items-center justify-between gap-2"><button type="button" className={button} disabled={activeVideoIndex===0} onClick={()=>changeVideo(-1)}>{isRtl?'السابق':'Previous video'}</button><span role="status">{activeVideoIndex+1} / {videos.length}</span><button type="button" className={button} disabled={activeVideoIndex===videos.length-1} onClick={()=>changeVideo(1)}>{isRtl?'التالي':'Next video'}</button></div>}
  </div>}
  <div className="space-y-4">{displayedPosts.map(post=><article key={post.id} className="rounded-2xl bg-white border border-slate-200 p-4 space-y-3">
   <header><h3 className="font-bold text-[#112330]">{creator?<span dir="auto">{post.authorName}</span>:<button type="button" className="min-h-11 py-2 text-start underline decoration-teal-300 underline-offset-4 break-words" aria-label={`${isRtl?'عرض منشورات':'View posts by'} ${post.authorName}`} onClick={()=>openCreator(post.authorId,post.authorName)} dir="auto">{post.authorName}</button>}</h3><time className="text-xs text-slate-500">{post.createdAt?.toDate().toLocaleString(isRtl?'ar-SA':'en-GB') || (isRtl?'جارٍ الحفظ…':'Saving…')}</time>{post.authorId!==uid&&<button type="button" disabled={!followingReady||followingFailed||followPending} aria-pressed={following.includes(post.authorId)} aria-label={`${following.includes(post.authorId)?(isRtl?'إلغاء متابعة':'Unfollow'):(isRtl?'متابعة':'Follow')} ${post.authorName}`} className={`${button} text-[#087F75] ms-2`} onClick={()=>void followCreator(post.authorId,!following.includes(post.authorId))}>{following.includes(post.authorId)?(isRtl?'أتابعه':'Following'):(isRtl?'متابعة':'Follow')}</button>}</header>
   {post.text && <p className="whitespace-pre-wrap break-words text-base text-slate-800" dir="auto">{post.text}</p>}
   {post.editedAt&&<p className="text-xs text-slate-500">{isRtl?'تم التعديل':'Edited'}</p>}
   {post.authorId===uid&&<PostTextEditor id={post.id} text={post.text} hasMedia={!!(post.imageUrl||post.videoUrl)} isRtl={isRtl}/>}
   {post.videoUrl && <CommunityVideo src={post.videoUrl} poster={post.videoCoverUrl} subtitles={post.videoSubtitles} isRtl={isRtl}/>}
   {post.imageUrl && <CommunityPhoto src={post.imageUrl} author={post.authorName} isRtl={isRtl}/>}
   <div className="flex gap-2 items-center justify-between"><button disabled={!!pending || failed} aria-pressed={!!post.likes[uid]} onClick={()=>void act(post.id,()=>likePost(post.id,!post.likes[uid]))} className={`${button} inline-flex gap-2 items-center ${post.likes[uid]?'bg-teal-50 text-[#087F75]':'text-slate-600'}`}><Heart size={18} fill={post.likes[uid]?'currentColor':'none'} aria-hidden="true"/>{isRtl?'إعجاب':'Like'} · {Object.keys(post.likes).length}</button>
   {post.authorId===uid && <button disabled={!!pending} className={`${button} text-slate-600`} aria-label={isRtl?'حذف المنشور':'Delete post'} onClick={()=>setConfirm(post.id)}><Trash2 size={18}/></button>}</div>
   <button type="button" className={`${button} text-[#087F75]`} aria-expanded={commentsFor===post.id} onClick={()=>setCommentsFor(value=>value===post.id?'':post.id)}>{isRtl?'التعليقات':'Comments'}</button>
   {commentsFor===post.id && <PostComments postId={post.id} ownerId={post.authorId} uid={uid} name={name} isRtl={isRtl}/>}
   {post.authorId!==uid&&<PostSafety post={post} isRtl={isRtl} onHide={()=>updateHidden([...hidden,post.id])}/>}
   {confirm===post.id && <div className="rounded-xl bg-slate-50 p-3"><p>{isRtl?'حذف هذا المنشور نهائياً؟':'Permanently delete this post?'}</p><div className="flex gap-2"><button disabled={!!pending} className={`${button} text-red-700`} onClick={()=>void act(post.id,()=>deletePost(post.id))}>{isRtl?'حذف':'Delete'}</button><button disabled={!!pending} className={button} onClick={()=>setConfirm('')}>{isRtl?'إلغاء':'Cancel'}</button></div></div>}
  </article>)}</div>
  {list.hasMore && posts.length<200 && <button disabled={loading || failed} className={`${button} mt-4 bg-white border border-slate-300`} onClick={()=>listController.current?.more()}>{isRtl?'تحميل منشورات أقدم':'Load older posts'}</button>}
  {posts.length>=200 && <p className="text-sm text-slate-500 py-4">{isRtl?'تظهر أحدث ٢٠٠ مشاركة في هذه النسخة.':'This preview shows up to 200 recent posts.'}</p>}
 </section>;
}
