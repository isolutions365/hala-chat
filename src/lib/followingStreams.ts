export const FOLLOW_LIMIT = 90;
export function creatorBatches(ids:string[]) {
 const unique=[...new Set(ids)];
 if(unique.length>FOLLOW_LIMIT)throw Error('following-limit');
 return Array.from({length:Math.ceil(unique.length/30)},(_,index)=>unique.slice(index*30,index*30+30));
}
// Publish only complete snapshots. Any failed source stops the entire view so a
// partial feed cannot incorrectly look like the end of someone's following feed.
export function combineLiveSources<T>(sources:((next:(items:T[])=>void,error:()=>void)=>()=>void)[],next:(items:T[])=>void,error:()=>void) {
 let active=true;
 const values=new Map<number,T[]>(),stops:(()=>void)[]=[];
 const stop=()=>{active=false;stops.splice(0).forEach(unsubscribe=>unsubscribe());};
 const fail=()=>{if(active){stop();error();}};
 if(!sources.length)next([]);
 sources.forEach((source,index)=>{
  if(!active)return;
  try {
   const unsubscribe=source(items=>{if(!active)return;values.set(index,items);if(values.size===sources.length)next(sources.flatMap((_,i)=>values.get(i)!));},fail);
   if(active)stops.push(unsubscribe);else unsubscribe();
  } catch { fail(); }
 });
 return stop;
}
export function newestPosts<T extends {id:string;createdAt?:{seconds:number;nanoseconds:number}|null}>(posts:T[],count:number):T[] {
 return [...new Map(posts.map(post=>[post.id,post])).values()].sort((a,b)=>{
  const left=a.createdAt,right=b.createdAt;
  return (right?.seconds??0)-(left?.seconds??0)||(right?.nanoseconds??0)-(left?.nanoseconds??0)||(a.id<b.id?1:a.id>b.id?-1:0);
 }).slice(0,count);
}
