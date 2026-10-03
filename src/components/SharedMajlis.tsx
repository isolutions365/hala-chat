import React, { useEffect, useState } from 'react';
import type { ChatModel } from '../types';
import { addMajlisTask, completeMajlisTask, confirmMajlis, createMajlis, voteMajlis, watchMajlis, watchMajlisTasks, watchMajlisVotes, type MajlisPlan, type MajlisTask } from '../lib/majlis';

export function SharedMajlis({ uid, isRtl, chats, draft }: { uid: string; isRtl: boolean; chats: ChatModel[]; draft: {title:string;date:string;notes:string} }) {
 const [chatId,setChatId]=useState('');
 const [plans,setPlans]=useState<MajlisPlan[]>([]);
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
 useEffect(()=>{
  setPlans([]);setSelected('');setStatus('');
  if (!chatId) return;
  return watchMajlis(chatId,setPlans,failed);
 },[chatId,isRtl]);
 useEffect(()=>{
  setVotes({});setTasks([]);
  if (!chatId || !selected) return;
  const stopVotes=watchMajlisVotes(chatId,selected,setVotes,failed);
  const stopTasks=watchMajlisTasks(chatId,selected,setTasks,failed);
  return ()=>{stopVotes();stopTasks();};
 },[chatId,selected,isRtl]);
 async function perform(action:()=>Promise<void>,success:string) {
  setBusy(true);setStatus('');
  try { await action();setStatus(success); } catch { failed(); } finally {setBusy(false);}
 }
 const field='w-full mt-2 p-3 rounded-xl border border-slate-300 bg-white text-slate-900';
 const button='rounded-xl bg-[#087F75] text-white px-4 py-3 disabled:opacity-40';
 return <section className="mt-6 border-t border-slate-200 pt-5 space-y-4" aria-label={isRtl?'التخطيط المشترك':'Shared planning'}>
  <h3 className="font-bold text-lg">{isRtl?'خططوا معاً':'Plan together'}</h3>
  <p className="text-sm text-slate-600">{isRtl?'تتم مشاركة العنوان والموعد والملاحظات مع أعضاء المحادثة التي تختارها فقط. لا يتم إرسال شيء إلى الذكاء الاصطناعي.':'Your title, date and notes are shared with the selected chat’s members. Nothing is sent to AI.'}</p>
  <label className="block text-sm">{isRtl?'اختر محادثة':'Choose a chat'}
   <select value={chatId} onChange={e=>setChatId(e.target.value)} className={field}>
    <option value="">{isRtl?'اختر…':'Choose…'}</option>
    {chats.filter(c=>c.type!=='channel').map(c=><option key={c.id} value={c.id}>{c.name || c.title || c.participants.filter(id=>id!==uid).map(id=>c.participantDetails?.[id]?.name || id).join(', ')}</option>)}
   </select>
  </label>
  {chat && <>
   <form className="space-y-3" onSubmit={e=>{e.preventDefault();void perform(()=>createMajlis(chatId,{title:draft.title.trim(),date:draft.date,notes:draft.notes,optionA:options[0].trim(),optionB:options[1].trim(),optionC:options[2].trim()}),isRtl?'تمت مشاركة الخطة.':'Plan shared.');}}>
    <p className="text-sm">{isRtl?'خيارات للتصويت على هذه المسودة':'Voting choices for this draft'}</p>
    {options.map((value,i)=><label key={i} className="block text-sm">{isRtl?`الخيار ${i+1}${i===2?' (اختياري)':''}`:`Choice ${i+1}${i===2?' (optional)':''}`}<input required={i<2} maxLength={120} value={value} onChange={e=>setOptions(old=>old.map((v,j)=>j===i?e.target.value:v))} className={field}/></label>)}
    <button disabled={busy || !draft.title.trim()} className={button}>{isRtl?'مشاركة المسودة مع هذه المحادثة':'Share draft with this chat'}</button>
   </form>
   <label className="block text-sm">{isRtl?'الخطط المشتركة':'Shared plans'}<select className={field} value={selected} onChange={e=>setSelected(e.target.value)}><option value="">{isRtl?'اختر خطة…':'Choose a plan…'}</option>{plans.map(p=><option key={p.id} value={p.id}>{p.title}</option>)}</select></label>
  </>}
  {plan && <div className="space-y-3 rounded-2xl bg-white p-4 border border-slate-200">
   <h4 className="font-bold">{plan.title}</h4><p className="text-sm">{plan.date}</p><p className="text-sm whitespace-pre-wrap">{plan.notes}</p>
   {(['a','b','c'] as const).map((key,i)=>{
    const text=[plan.optionA,plan.optionB,plan.optionC][i]; if(!text)return null;
    const count=Object.values(votes).filter(v=>v===key).length;
    return <div key={key} className="flex flex-wrap items-center gap-2">
     <button type="button" disabled={busy || plan.status==='confirmed'} aria-pressed={votes[uid]===key}
      className={`flex-1 min-w-0 rounded-xl border px-3 py-3 text-start ${votes[uid]===key?'border-[#087F75] bg-teal-50':'border-slate-300'}`}
      onClick={()=>void perform(()=>voteMajlis(chatId,plan.id,key),isRtl?'تم حفظ صوتك.':'Your vote is saved.')}>
      {text} · {count}{plan.confirmedOption===key?' ✓':''}
     </button>
     {plan.ownerId===uid && plan.status==='open' && <button type="button" disabled={busy} className="text-sm underline p-2" onClick={()=>void perform(()=>confirmMajlis(chatId,plan.id,key),isRtl?'تم تأكيد القرار.':'Decision confirmed.')}>{isRtl?'تأكيد':'Confirm'}</button>}
    </div>;
   })}
   {plan.status==='confirmed' && <p className="font-semibold text-[#087F75]">{isRtl?'تم تأكيد القرار وأُغلق التصويت.':'Decision confirmed. Voting is closed.'}</p>}
   <h5 className="font-semibold pt-3">{isRtl?'المهام':'Tasks'}</h5>
   {tasks.map(task=><label key={task.id} className="flex items-center gap-3 text-sm"><input type="checkbox" checked={task.done} disabled={busy || (uid!==plan.ownerId && uid!==task.assigneeId)} onChange={e=>void perform(()=>completeMajlisTask(chatId,plan.id,task.id,e.target.checked),isRtl?'تم تحديث المهمة.':'Task updated.')}/><span>{task.title} · {chat?.participantDetails?.[task.assigneeId]?.name || task.assigneeId}</span></label>)}
   {plan.ownerId===uid && <form onSubmit={e=>{e.preventDefault();void perform(async()=>{await addMajlisTask(chatId,plan.id,taskTitle,assignee);setTaskTitle('');},isRtl?'تمت إضافة المهمة.':'Task added.');}} className="space-y-2">
    <label className="block text-sm">{isRtl?'مهمة جديدة':'New task'}<input required maxLength={200} value={taskTitle} onChange={e=>setTaskTitle(e.target.value)} className={field}/></label>
    <label className="block text-sm">{isRtl?'المسؤول':'Assigned to'}<select className={field} value={assignee} onChange={e=>setAssignee(e.target.value)}>{chat?.participants.map(id=><option key={id} value={id}>{chat.participantDetails?.[id]?.name || id}</option>)}</select></label>
    <button disabled={busy || !taskTitle.trim()} className={button}>{isRtl?'إضافة مهمة':'Add task'}</button>
   </form>}
  </div>}
  <p role="status" className="text-sm">{status}</p>
 </section>;
}
