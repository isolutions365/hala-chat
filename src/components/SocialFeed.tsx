import React, { useEffect, useRef, useState } from 'react';
import { PostSafety } from './PostSafety';
import { readHiddenPosts, saveHiddenPosts } from '../lib/hiddenPosts';
import { PostComments } from './PostComments';
import { createLivePlanList, type PlanListState } from '../lib/livePlanList';
import { Heart, ImagePlus, Trash2 } from 'lucide-react';
import { deletePost, likePost, newPostId, publishPost, watchSocialFeed, type SocialPost } from '../lib/socialFeed';
import { uploadChatMedia } from '../lib/media';

export function SocialFeed({uid,name,isRtl}:{uid:string;name:string;isRtl:boolean}) {
 const [list,setList]=useState<PlanListState<SocialPost>>({items:[],loading:true,error:false,hasMore:false});
 const {items:posts,loading,error:failed}=list;
 const listController=useRef<ReturnType<typeof createLivePlanList<SocialPost>>|null>(null);
 const [commentsFor,setCommentsFor]=useState('');
 const [hidden,setHidden]=useState<string[]>(()=>readHiddenPosts(uid));
 useEffect(()=>{setHidden(readHiddenPosts(uid));},[uid]);
 function updateHidden(ids:string[]) {const next=ids.slice(-200);setHidden(next);if(!saveHiddenPosts(uid,next))setStatus(isRtl?'تم الإخفاء مؤقتاً؛ تعذر حفظ التفضيل على الجهاز.':'Hidden for this session; device storage is unavailable.');}
 const visiblePosts=posts.filter(post=>!hidden.includes(post.id));
 const [text,setText]=useState(''),[photo,setPhoto]=useState<File|null>(null);
 const [preview,setPreview]=useState('');
 const [busy,setBusy]=useState(false),[pending,setPending]=useState(''),[confirm,setConfirm]=useState(''),[status,setStatus]=useState(''),[progress,setProgress]=useState(0);
 const alive=useRef(true);const input=useRef<HTMLInputElement>(null);
 // Retain an uploaded URL and stable document ID if publishing needs a retry.
 const attempt=useRef<{id:string;file:File|null;url:string}|null>(null);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 useEffect(()=>{if(!photo){setPreview('');return;}const url=URL.createObjectURL(photo);setPreview(url);return()=>URL.revokeObjectURL(url);},[photo]);
 useEffect(()=>{setList({items:[],loading:true,error:false,hasMore:false});const controller=createLivePlanList<SocialPost>((count,next,error)=>watchSocialFeed(next,error,count),setList);listController.current=controller;controller.start();return()=>{controller.dispose();listController.current=null;};},[uid]);
 const error=()=>setStatus(isRtl?'تعذر إكمال العملية. تحقق من الاتصال وحاول مجدداً.':'Could not complete the action. Check your connection and try again.');
 async function publish(e:React.FormEvent){e.preventDefault();if(busy || (!text.trim()&&!photo))return;setBusy(true);setStatus('');setProgress(0);
  try {
   if(!attempt.current || attempt.current.file!==photo)attempt.current={id:newPostId(),file:photo,url:''};
   const current=attempt.current;
   if(photo && !current.url){current.url=(await uploadChatMedia({chatId:'social-feed',messageId:current.id,fileOrBlob:photo,onProgress:p=>{if(alive.current)setProgress(p);}})).downloadUrl;}
   await publishPost(current.id,name,text,current.url);
   if(alive.current){setText('');setPhoto(null);attempt.current=null;if(input.current)input.current.value='';setStatus(isRtl?'تم نشر المشاركة.':'Post published.');}
  }catch{if(alive.current)error();}finally{if(alive.current)setBusy(false);}
 }
 async function act(id:string,action:()=>Promise<void>){if(pending)return;setPending(id);setStatus('');try{await action();if(alive.current)setConfirm('');}catch{if(alive.current)error();}finally{if(alive.current)setPending('');}}
 const button='min-h-11 rounded-xl px-4 py-3 font-semibold disabled:opacity-50';
 return <section className="flex-1 overflow-y-auto px-4 pb-28 pt-3 bg-[#F5F8F7]" dir={isRtl?'rtl':'ltr'} aria-label={isRtl?'منشورات المجتمع':'Community posts'}>
  <form onSubmit={publish} className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
   <h2 className="font-bold text-[#112330]">{isRtl?'شارك شيئاً يستحق':'Share something worth sharing'}</h2>
   <p className="text-sm text-slate-600">{isRtl?'منشورك ظاهر لجميع مستخدمي هلا المسجلين. لا تنشر معلومات خاصة.':'Your post is visible to all signed-in Hala users. Keep private information out.'}</p>
   <label className="block text-sm font-medium">{isRtl?'منشور جديد':'New post'}<textarea disabled={busy} maxLength={2000} rows={3} value={text} onChange={e=>setText(e.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 p-3 resize-y text-base" /></label>
   <div className="text-xs text-slate-500">{text.length}/2000</div>
   {preview && <div><img src={preview} alt={isRtl?'معاينة الصورة':'Photo preview'} className="max-h-64 rounded-xl object-contain"/><button type="button" disabled={busy} className={button} onClick={()=>{setPhoto(null);if(input.current)input.current.value='';}}>{isRtl?'إزالة الصورة':'Remove photo'}</button></div>}
   <div className="flex flex-wrap gap-2 items-center">
    <label className={`${button} border border-slate-300 inline-flex gap-2 items-center cursor-pointer focus-within:ring-2 focus-within:ring-teal-700`}><ImagePlus size={18} aria-hidden="true"/>{isRtl?'إضافة صورة':'Add photo'}<input ref={input} disabled={busy} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="sr-only" onChange={e=>{const file=e.target.files?.[0];if(!file)return;if(!['image/jpeg','image/png','image/webp','image/gif'].includes(file.type)||file.size===0||file.size>5*1024*1024){setStatus(isRtl?'اختر صورة حتى ٥ ميغابايت.':'Choose an image up to 5 MB.');e.target.value='';return;}setPhoto(file);setStatus('');}}/></label>
    <button disabled={busy || (!text.trim()&&!photo)} className={`${button} bg-[#087F75] text-white`}>{busy?(photo?`${isRtl?'جارٍ النشر':'Publishing'} ${progress}%`:(isRtl?'جارٍ النشر…':'Publishing…')):(isRtl?'نشر':'Publish')}</button>
   </div>
  </form>
  <p role="status" className="text-sm py-3">{status}</p>
  {failed && <div role="alert" className="rounded-xl border p-3 bg-white"><p>{isRtl?'تعذر تحميل المنشورات.':'Posts could not load.'}</p><button className={button} onClick={()=>listController.current?.retry()}>{isRtl?'إعادة المحاولة':'Retry'}</button></div>}
  {loading && <p role="status">{isRtl?'جارٍ التحميل…':'Loading posts…'}</p>}
  {!loading && !failed && !posts.length && <p className="p-6 text-center text-slate-600">{isRtl?'لا توجد منشورات بعد. كن أول من يشارك.':'No posts yet. Share the first one.'}</p>}
  {hidden.length>0&&<div className="mb-3 text-sm"><p>{isRtl?'الإخفاء خاص بهذا الحساب على هذا الجهاز.':'Hidden posts are saved for this account on this device.'}</p><button className={button} onClick={()=>updateHidden([])}>{isRtl?'إظهار المنشورات المخفية':'Restore hidden posts'} · {hidden.length}</button></div>}
  {!loading&&!failed&&posts.length>0&&visiblePosts.length===0&&<p className="p-4 text-sm">{isRtl?'تم إخفاء كل المنشورات المحملة. يمكنك استعادتها أو تحميل منشورات أقدم.':'All loaded posts are hidden. Restore them or load older posts.'}</p>}
  <div className="space-y-4">{visiblePosts.map(post=><article key={post.id} className="rounded-2xl bg-white border border-slate-200 p-4 space-y-3">
   <header><h3 className="font-bold text-[#112330]">{post.authorName}</h3><time className="text-xs text-slate-500">{post.createdAt?.toDate().toLocaleString(isRtl?'ar-SA':'en-GB') || (isRtl?'جارٍ الحفظ…':'Saving…')}</time></header>
   {post.text && <p className="whitespace-pre-wrap break-words text-base text-slate-800" dir="auto">{post.text}</p>}
   {post.imageUrl && <img src={post.imageUrl} loading="lazy" referrerPolicy="no-referrer" alt={isRtl?`صورة من ${post.authorName}`:`Photo by ${post.authorName}`} className="rounded-xl w-full max-h-96 object-contain bg-slate-50"/>}
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
