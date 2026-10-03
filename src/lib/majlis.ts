import { addDoc, collection, doc, limit, onSnapshot, orderBy, query, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { getFirebaseAuth, getFirebaseDb } from './firebase';
export interface MajlisPlan { id: string; ownerId: string; title: string; date: string; notes: string; optionA: string; optionB: string; optionC: string; status: 'open' | 'confirmed'; confirmedOption: string }
export interface MajlisTask { id: string; title: string; assigneeId: string; done: boolean }
function planRef(chatId: string, planId: string) { return doc(getFirebaseDb(), 'chats', chatId, 'majlis', planId); }
export function watchMajlis(chatId: string, next: (plans: MajlisPlan[]) => void, error: () => void) {
 return onSnapshot(query(collection(getFirebaseDb(),'chats',chatId,'majlis'),orderBy('createdAt','desc'),limit(20)), snap => next(snap.docs.map(d=>({...d.data(),id:d.id} as MajlisPlan))), error);
}
export async function createMajlis(chatId: string, draft: Pick<MajlisPlan,'title'|'date'|'notes'|'optionA'|'optionB'|'optionC'>) {
 const uid=getFirebaseAuth().currentUser?.uid;
 if (!uid) throw Error('Please sign in again.');
 await addDoc(collection(getFirebaseDb(),'chats',chatId,'majlis'), {...draft,ownerId:uid,status:'open',confirmedOption:'',createdAt:serverTimestamp()});
}
export function watchMajlisVotes(chatId: string, id: string, next: (votes: Record<string,string>)=>void, error:()=>void) {
 return onSnapshot(collection(planRef(chatId,id),'votes'), snap=>next(Object.fromEntries(snap.docs.map(d=>[d.id,d.data().option]))), error);
}
export async function voteMajlis(chatId: string, id: string, option: string) {
 const uid=getFirebaseAuth().currentUser?.uid;
 if (!uid) throw Error('Please sign in again.');
 await setDoc(doc(planRef(chatId,id),'votes',uid),{option,updatedAt:serverTimestamp()});
}
export async function confirmMajlis(chatId: string, id: string, option: string) { await updateDoc(planRef(chatId,id),{status:'confirmed',confirmedOption:option}); }
export function watchMajlisTasks(chatId:string,id:string,next:(tasks:MajlisTask[])=>void,error:()=>void) {
 return onSnapshot(collection(planRef(chatId,id),'tasks'),snap=>next(snap.docs.map(d=>({...d.data(),id:d.id} as MajlisTask))),error);
}
export async function addMajlisTask(chatId:string,id:string,title:string,assigneeId:string) { await addDoc(collection(planRef(chatId,id),'tasks'),{title:title.trim(),assigneeId,done:false,createdAt:serverTimestamp()}); }
export async function completeMajlisTask(chatId:string,id:string,taskId:string,done:boolean) { await updateDoc(doc(planRef(chatId,id),'tasks',taskId),{done}); }
