import React,{useEffect,useRef,useState} from 'react';
import {addPostComment,deletePostComment,watchPostComments,type PostComment} from '../lib/socialFeed';
export function PostComments({postId,ownerId,uid,name,isRtl}:{postId:string;ownerId:string;uid:string;name:string;isRtl:boolean}) {
 const [comments,setComments]=useState<PostComment[]>([]),[text,setText]=useState(''),[loading,setLoading]=useState(true),[error,setError]=useState(false),[retry,setRetry]=useState(0),[busy,setBusy]=useState(false),[status,setStatus]=useState(''),[confirm,setConfirm]=useState('');
 const generation=useRef(0);
 useEffect(()=>{setText('');setConfirm('');setStatus('');},[postId,uid]);
 useEffect(()=>{const current=++generation.current;setComments([]);setLoading(true);setError(false);setBusy(false);const stop=watchPostComments(postId,items=>{if(current===generation.current){setComments(items);setLoading(false);}},()=>{if(current===generation.current){setError(true);setLoading(false);}});return()=>{generation.current++;stop();};},[postId,retry,uid]);
 async function perform(action:()=>Promise<void>,clear=false){if(busy)return;const current=generation.current;setBusy(true);setStatus('');try{await action();if(current===generation.current){if(clear)setText('');setConfirm('');setStatus(isRtl?'تم الحفظ.':'Saved.');}}catch{if(current===generation.current)setStatus(isRtl?'تعذر الحفظ. تحقق من الاتصال وحاول مجدداً.':'Could not save. Check your connection and retry.');}finally{if(current===generation.current)setBusy(false);}}
 const button='min-h-11 rounded-xl px-3 py-2 font-medium disabled:opacity-50';
 return <section aria-label={isRtl?'التعليقات':'Comments'} className="border-t border-slate-200 pt-3 space-y-3">
  <p className="text-sm text-slate-500">{isRtl?'التعليقات ظاهرة لجميع مستخدمي هلا المسجلين.':'Comments are visible to all signed-in Hala users.'}</p>
  {loading && <p role="status">{isRtl?'جارٍ تحميل التعليقات…':'Loading comments…'}</p>}
  {error && <div role="alert"><p>{isRtl?'تعذر تحميل التعليقات.':'Comments could not load.'}</p><button disabled={busy} className={button} onClick={()=>setRetry(n=>n+1)}>{isRtl?'إعادة المحاولة':'Retry comments'}</button></div>}
  {!loading&&!error&&!comments.length&&<p className="text-sm text-slate-500">{isRtl?'لا توجد تعليقات بعد.':'No comments yet.'}</p>}
  <form onSubmit={e=>{e.preventDefault();void perform(()=>addPostComment(postId,name,text),true);}} className="space-y-2">
   <label className="block text-sm">{isRtl?'أضف تعليقاً':'Add a comment'}<textarea maxLength={1000} rows={2} disabled={busy} value={text} onChange={e=>setText(e.target.value)} className="block w-full mt-1 p-3 border border-slate-300 rounded-xl text-base"/></label>
   <button disabled={busy||error||!text.trim()} className={`${button} bg-[#087F75] text-white`}>{busy?(isRtl?'جارٍ الحفظ…':'Saving…'):(isRtl?'إرسال التعليق':'Post comment')}</button>
  </form>
  <p role="status" className="text-sm">{status}</p>
  {comments.map(comment=><article key={comment.id} className="rounded-xl bg-slate-50 p-3"><h4 className="font-semibold text-sm">{comment.authorName}</h4><p dir="auto" className="whitespace-pre-wrap break-words">{comment.text}</p>
   {(comment.authorId===uid||ownerId===uid)&&<button disabled={busy} className={`${button} text-slate-600 text-sm`} onClick={()=>setConfirm(comment.id)}>{isRtl?'حذف التعليق':'Delete comment'}</button>}
   {confirm===comment.id&&<div><p className="text-sm">{isRtl?'حذف هذا التعليق نهائياً؟':'Permanently delete this comment?'}</p><button disabled={busy} className={`${button} text-red-700`} onClick={()=>void perform(()=>deletePostComment(postId,comment.id))}>{isRtl?'حذف':'Delete'}</button><button disabled={busy} className={button} onClick={()=>setConfirm('')}>{isRtl?'إلغاء':'Cancel'}</button></div>}
  </article>)}
  {comments.length===50&&<p className="text-xs text-slate-500">{isRtl?'تظهر أحدث ٥٠ تعليقاً.':'Showing the latest 50 comments.'}</p>}
 </section>;
}
