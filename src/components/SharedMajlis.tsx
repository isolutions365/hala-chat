import React, { useEffect, useRef, useState } from 'react';
import { createLivePlanList, type PlanListState } from '../lib/livePlanList';
import type { ChatModel } from '../types';
import { addMajlisTask, completeMajlisTask, confirmMajlis, createMajlis, voteMajlis, watchMajlis, watchMajlisTasks, watchMajlisVotes, type MajlisPlan, type MajlisTask } from '../lib/majlis';

export function SharedMajlis({ uid, isRtl, chats, draft, onShareSuccess }: { uid: string; isRtl: boolean; chats: ChatModel[]; draft: {title:string;date:string;notes:string}, onShareSuccess?: ()=>void }) {
 const [chatId,setChatId]=useState('');
 const [list,setList]=useState<PlanListState<MajlisPlan>>({items:[],loading:false,hasMore:false,error:false});
 const plans=list.items;
 const listController=useRef<ReturnType<typeof createLivePlanList<MajlisPlan>> | null>(null);
 const actionGeneration=useRef(0);
 const [retry,setRetry]=useState(0);
 const [detailError,setDetailError]=useState(false);
 const [detailsLoading,setDetailsLoading]=useState(false);
 const [selected,setSelected]=useState('');
 const [votes,setVotes]=useState<Record<string,string>>({});
 const [tasks,setTasks]=useState<MajlisTask[]>([]);
 const [options,setOptions]=useState(['','','']);
 const [taskTitle,setTaskTitle]=useState('');
 const [assignee,setAssignee]=useState(uid);
 const [busy,setBusy]=useState(false);
 const [status,setStatus]=useState('');
 const chat=chats.find(item=>item.id===chatId);
 const plan=plans.find(item=>item.id===selected);
 const failed=()=>setStatus(isRtl?'تعذر الاتصال بالمجلس. حاول مجدداً.':'Could not connect to the plan. Please retry.');
 const formatTime = (ts: any) => {
  if (!ts) return '';
  try {
   const date = ts.toDate ? ts.toDate() : new Date(ts);
   return date.toLocaleTimeString(isRtl ? 'ar-SA' : 'en-US', { hour: '2-digit', minute: '2-digit' });
  } catch { return ''; }
 };
 useEffect(()=>{
  actionGeneration.current++;
  setSelected('');setStatus('');setBusy(false);setAssignee(uid);
  setList({items:[],loading:!!chatId,hasMore:false,error:false});
  if (!chatId) { listController.current=null;return; }
  const controller=createLivePlanList<MajlisPlan>((count,next,error)=>watchMajlis(chatId,next,error,count),setList);
  listController.current=controller;
  controller.start();
  return ()=>{actionGeneration.current++;controller.dispose();listController.current=null;};
 },[chatId,uid]);
 useEffect(()=>{
  let active=true;
  let votesReady=false,tasksReady=false;
  setVotes({});setTasks([]);setDetailError(false);
  setDetailsLoading(!!chatId && !!selected);
  if (!chatId || !selected) return;
  const error=()=>{if(active){setDetailError(true);setDetailsLoading(false);}};
  const ready=()=>{if(votesReady && tasksReady)setDetailsLoading(false);};
  const stopVotes=watchMajlisVotes(chatId,selected,value=>{if(active){setVotes(value);votesReady=true;ready();}},error);
  const stopTasks=watchMajlisTasks(chatId,selected,value=>{if(active){setTasks(value);tasksReady=true;ready();}},error);
  return ()=>{active=false;stopVotes();stopTasks();};
 },[chatId,selected,retry]);

 async function perform(action:()=>Promise<void | string>,success:string, skipBusy = false) {
  const generation=actionGeneration.current;
  if (!skipBusy) setBusy(true);
  setStatus('');
  try { 
   const result = await action();
   if(generation===actionGeneration.current) {
    setStatus(success);
    if (typeof result === 'string') setSelected(result);
    if (!skipBusy) setTimeout(() => setStatus(''), 3000);
   }
  }
  catch { if(generation===actionGeneration.current)failed(); }
  finally {if(generation===actionGeneration.current && !skipBusy)setBusy(false);}
 }

 const unavailable=busy || detailsLoading || detailError || list.error;
 const field='w-full mt-2 p-3 rounded-xl border border-slate-300 bg-white text-slate-900';
 const button='rounded-xl bg-[#087F75] text-white px-4 py-3 disabled:opacity-40';

 return <section className="mt-6 border-t border-slate-200 pt-5 space-y-4" aria-label={isRtl?'التخطيط المشترك':'Shared planning'}>
  <h3 className="font-bold text-lg">{isRtl?'خططوا معاً':'Plan together'}</h3>
  <p className="text-sm text-slate-600">{isRtl?'تتم مشاركة العنوان والموعد والملاحظات مع أعضاء المحادثة التي تختارها فقط. لا يتم إرسال شيء إلى الذكاء الاصطناعي.':'Your title, date and notes are shared with the selected chat’s members. Nothing is sent to AI.'}</p>
  <label className="block text-sm">{isRtl?'اختر محادثة':'Choose a chat'}
   <select disabled={busy} value={chatId} onChange={e=>setChatId(e.target.value)} className={field}>
    <option value="">{isRtl?'اختر…':'Choose…'}</option>
    {chats.filter(c=>c.type!=='channel').map(c=><option key={c.id} value={c.id}>{c.name || c.title || c.participants.filter(id=>id!==uid).map(id=>c.participantDetails?.[id]?.name || id).join(', ')}</option>)}
   </select>
  </label>
  {chat && <>
   <form className="space-y-3" onSubmit={e=>{e.preventDefault();void perform(async ()=>{
     const id = await createMajlis(chatId,{title:draft.title.trim(),date:draft.date,notes:draft.notes,optionA:options[0].trim(),optionB:options[1].trim(),optionC:options[2].trim()});
     setOptions(['','','']);
     onShareSuccess?.();
     return id;
   },isRtl?'تمت مشاركة الخطة.':'Plan shared.');}}>
    <p className="text-sm">{isRtl?'خيارات للتصويت على هذه المسودة':'Voting choices for this draft'}</p>
    {options.map((value,i)=><label key={i} className="block text-sm">{isRtl?`الخيار ${i+1}${i===2?' (اختياري)':''}`:`Choice ${i+1}${i===2?' (optional)':''}`}<input required={i<2} maxLength={120} value={value} onChange={e=>setOptions(old=>old.map((v,j)=>j===i?e.target.value:v))} className={field}/></label>)}
    <button disabled={busy || !draft.title.trim()} className={button}>{isRtl?'مشاركة المسودة مع هذه المحادثة':'Share draft with this chat'}</button>
   </form>
   <label className="block text-sm">{isRtl?'الخطط المشتركة':'Shared plans'}<select disabled={busy} className={field} value={selected} onChange={e=>setSelected(e.target.value)}><option value="">{isRtl?'اختر خطة…':'Choose a plan…'}</option>{plans.map(p=><option key={p.id} value={p.id}>{p.title}</option>)}</select></label>
   <div role="status" aria-live="polite" className="text-sm text-slate-600">
    {list.loading ? (isRtl?'جارٍ تحميل الخطط…':'Loading plans…') : !list.error && plans.length===0 ? (isRtl?'لا توجد خطط مشتركة بعد.':'No shared plans yet.') : null}
   </div>
   {list.hasMore && <button type="button" disabled={list.loading || list.error || busy} className={button} onClick={()=>listController.current?.more()}>{isRtl?'تحميل خطط أقدم':'Load older plans'}</button>}
  </>}
  {(list.error || detailError) && <div role="alert" className="rounded-xl border border-slate-300 p-3 text-sm">
   <p>{isRtl?'تعذر تحديث الخطط. تحقق من الاتصال ثم أعد المحاولة.':'Plans could not refresh. Check your connection and retry.'}</p>
   <button type="button" disabled={busy} className={`${button} mt-2`} onClick={()=>{listController.current?.retry();setRetry(value=>value+1);}}>{isRtl?'إعادة المحاولة':'Retry connection'}</button>
  </div>}
  {plan && <div className="space-y-3 rounded-2xl bg-white p-4 border border-slate-200 shadow-xs animate-in fade-in slide-in-from-bottom-2">
   <h4 className="font-bold text-lg">{plan.title}</h4>
   <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-slate-500">
     <span>📅 {plan.date || (isRtl ? 'لا يوجد تاريخ' : 'No date')}</span>
     <span>👤 {chat?.participantDetails?.[plan.ownerId]?.name || plan.ownerId}</span>
     {plan.createdAt && <span>🕒 {formatTime(plan.createdAt)}</span>}
   </div>
   <p className="text-sm whitespace-pre-wrap text-slate-700 bg-slate-50 p-3 rounded-xl">{plan.notes}</p>
   {detailsLoading && <p role="status" className="text-xs text-slate-500 animate-pulse">{isRtl?'جارٍ تحميل الأصوات والمهام…':'Loading votes and tasks…'}</p>}
   <div className="space-y-2">
   {(['a','b','c'] as const).map((key,i)=>{
    const text=[plan.optionA,plan.optionB,plan.optionC][i]; 
    if(!text && key === 'c') return null;
    const optionText = text || (isRtl ? `خيار ${key.toUpperCase()}` : `Option ${key.toUpperCase()}`);
    const count=Object.values(votes).filter(v=>v===key).length;
    const isSelected = votes[uid]===key;
    const isConfirmed = plan.confirmedOption===key;

    return <div key={key} className="flex items-center gap-2 group">
     <button type="button" disabled={unavailable || plan.status==='confirmed'} aria-pressed={isSelected}
      className={`flex-1 min-w-0 rounded-xl border px-4 py-3 text-start transition-all ${isSelected?'border-[#087F75] bg-teal-50 ring-1 ring-[#087F75] shadow-sm':'border-slate-200 hover:border-slate-300 bg-white'}`}
      onClick={()=>void perform(()=>voteMajlis(chatId,plan.id,key),isRtl?'تم حفظ صوتك.':'Your vote is saved.', true)}>
      <div className="flex justify-between items-center">
        <span className="truncate font-medium">{optionText}</span>
        <div className="flex items-center gap-2 shrink-0 ml-2">
          {!detailsLoading && !detailError && <span className={`text-xs px-2 py-0.5 rounded-full ${isSelected ? 'bg-[#087F75] text-white' : 'bg-slate-100 text-slate-500'}`}>{count}</span>}
          {isConfirmed && <span className="text-[#087F75] font-bold">✓</span>}
        </div>
      </div>
     </button>
     {plan.ownerId===uid && plan.status==='open' && <button type="button" disabled={unavailable} className="text-xs font-bold text-[#087F75] hover:underline px-2 py-3 transition-colors" onClick={()=>void perform(()=>confirmMajlis(chatId,plan.id,key),isRtl?'تم تأكيد القرار.':'Decision confirmed.')}>{isRtl?'تأكيد':'Confirm'}</button>}
    </div>;
   })}
   </div>
   {plan.status==='confirmed' && <div className="flex items-center gap-2 p-3 bg-teal-50 rounded-xl border border-teal-100"><span className="text-lg">✅</span><p className="text-xs font-bold text-[#087F75]">{isRtl?'تم تأكيد القرار وأُغلق التصويت.':'Decision confirmed. Voting is closed.'}</p></div>}
   
   <div className="pt-4 border-t border-slate-100">
     <h5 className="font-bold text-sm mb-3 flex items-center gap-2"><span>📝</span> {isRtl?'المهام والمتابعة':'Tasks and follow-up'}</h5>
     <div className="space-y-2">
      {tasks.length === 0 && !detailsLoading && <p className="text-xs text-slate-400 italic">{isRtl ? 'لا توجد مهام مضافة بعد.' : 'No tasks added yet.'}</p>}
      {tasks.map(task=><label key={task.id} className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${task.done ? 'bg-slate-50 border-slate-100' : 'bg-white border-slate-200 shadow-xs'}`}>
        <input type="checkbox" className="w-4 h-4 rounded-md border-slate-300 text-[#087F75] focus:ring-[#087F75]" checked={task.done} disabled={unavailable || (uid!==plan.ownerId && uid!==task.assigneeId)} onChange={e=>void perform(()=>completeMajlisTask(chatId,plan.id,task.id,e.target.checked),isRtl?'تم تحديث المهمة.':'Task updated.', true)}/>
        <div className="flex-1 min-w-0">
          <span className={`block text-sm font-medium truncate ${task.done ? 'text-slate-400 line-through' : 'text-slate-700'}`}>{task.title}</span>
          <span className="block text-[10px] text-slate-400">👤 {chat?.participantDetails?.[task.assigneeId]?.name || task.assigneeId}</span>
        </div>
      </label>)}
     </div>
   </div>

   {plan.ownerId===uid && <form onSubmit={e=>{e.preventDefault();void perform(async()=>{await addMajlisTask(chatId,plan.id,taskTitle,assignee);setTaskTitle('');},isRtl?'تمت إضافة المهمة.':'Task added.', true);}} className="mt-4 pt-4 border-t border-slate-100 space-y-3">
    <div className="bg-slate-50 p-4 rounded-2xl space-y-3">
      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">{isRtl?'إسناد مهمة جديدة':'إسناد مهمة جديدة'}
        <input required placeholder={isRtl ? 'ما هي المهمة؟' : 'What needs to be done?'} maxLength={200} value={taskTitle} onChange={e=>setTaskTitle(e.target.value)} className={field}/>
      </label>
      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">{isRtl?'المسؤول':'Assigned to'}
        <select className={field} value={assignee} onChange={e=>setAssignee(e.target.value)}>
          {chat?.participants.map(id=><option key={id} value={id}>{chat.participantDetails?.[id]?.name || id}</option>)}
        </select>
      </label>
      <button disabled={unavailable || !taskTitle.trim()} className="w-full rounded-xl bg-slate-900 text-white font-bold px-4 py-3 shadow-sm hover:bg-black transition-colors">{isRtl?'إضافة مهمة':'Add task'}</button>
    </div>
   </form>}
  </div>}
  <p role="status" className="text-sm font-medium text-center text-[#087F75] min-h-[1.25rem]">{status}</p>
 </section>;
}
