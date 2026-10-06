const prefix='hala.hiddenPosts.';
export function readHiddenPosts(uid:string):string[] {
 try {const value=JSON.parse(localStorage.getItem(prefix+uid)||'[]');return Array.isArray(value)?[...new Set(value.filter((id):id is string=>typeof id==='string' && id.length>0 && id.length<=128))].slice(-200):[];}catch{return [];}
}
export function saveHiddenPosts(uid:string,ids:string[]):boolean {
 try {localStorage.setItem(prefix+uid,JSON.stringify([...new Set(ids)].slice(-200)));return true;}catch{return false;}
}
