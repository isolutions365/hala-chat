import { collection, documentId, query, where, orderBy, limit, doc, onSnapshot, runTransaction, serverTimestamp } from 'firebase/firestore';
import { CREATOR_SEARCH_LIMIT } from './creatorNameSearch.mjs';
import { getFirebaseAuth, getFirebaseDb } from './firebase';
export const FOLLOW_LIMIT = 30;
export function watchFollowing(uid:string, next:(ids:string[])=>void, error:()=>void) {
 // Real-time is required so another device's follow changes update this feed.
 return onSnapshot(doc(getFirebaseDb(),'users',uid,'preferences','following'), snapshot=>
  next(Object.keys(snapshot.data()?.creators ?? {}).sort()), error);
}
export async function setCreatorFollow(creatorId:string, followed:boolean) {
 const uid=getFirebaseAuth().currentUser?.uid;
 if(!uid || creatorId===uid || !creatorId || creatorId.length>128 || creatorId.includes('/'))throw Error('Invalid creator');
 const target=doc(getFirebaseDb(),'users',uid,'preferences','following');
 await runTransaction(getFirebaseDb(),async transaction=>{
  const snapshot=await transaction.get(target);
  const creators:Record<string,true>={...(snapshot.data()?.creators ?? {})};
  if(followed)Object.defineProperty(creators,creatorId,{value:true,enumerable:true,configurable:true,writable:true});
  else delete creators[creatorId];
  if(Object.keys(creators).length>FOLLOW_LIMIT)throw Error('following-limit');
  transaction.set(target,{creators,updatedAt:serverTimestamp()});
 });
}

export function watchCreatorNames(ids:string[], next:(names:Record<string,string>)=>void,error:()=>void) {
 if(!ids.length){next({});return ()=>{};}
 // Keep displayed public names current when a creator edits their profile.
 return onSnapshot(query(collection(getFirebaseDb(),'users_public'),where(documentId(),'in',ids)),snapshot=>
  next(Object.fromEntries(snapshot.docs.map(item=>[item.id,String(item.data().name || '')]))),error);
}

export type CreatorProfile = {name:string;bio:string;avatar:string};
// Visible matches must reflect public name/profile edits without a new search.
// Filter and cap results on the server instead of downloading the directory.
export function watchCreatorsByName(prefix:string,end:string,next:(profiles:(CreatorProfile & {id:string})[])=>void,error:()=>void) {
 return onSnapshot(query(collection(getFirebaseDb(),'users_public'),where('name','>=',prefix),where('name','<',end),orderBy('name'),limit(CREATOR_SEARCH_LIMIT)),snapshot=>next(snapshot.docs.map(item=>{
  const data=item.data();
  return {id:item.id,name:typeof data.name==='string'?data.name:'',bio:typeof data.status==='string'?data.status:'',avatar:typeof data.avatar_url==='string'?data.avatar_url:''};
 })),error);
}
export function watchCreatorProfile(id:string,next:(profile:CreatorProfile|null)=>void,error:()=>void) {
 // A document listener keeps public profile edits current while this screen is open.
 return onSnapshot(doc(getFirebaseDb(),'users_public',id),snapshot=>{
  const data=snapshot.data();
  next(data?{name:typeof data.name==='string'?data.name:'',bio:typeof data.status==='string'?data.status:'',avatar:typeof data.avatar_url==='string'?data.avatar_url:''}:null);
 },error);
}
