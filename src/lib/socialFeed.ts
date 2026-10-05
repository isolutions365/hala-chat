import { collection, addDoc, doc, setDoc, deleteDoc, deleteField, updateDoc, FieldPath, limit, onSnapshot, orderBy, query, serverTimestamp, type Timestamp } from 'firebase/firestore';
import { getFirebaseAuth, getFirebaseDb } from './firebase';
export interface SocialPost { id: string; authorId: string; authorName: string; text: string; imageUrl: string; createdAt: Timestamp | null; likes: Record<string, boolean> }
export function watchSocialFeed(next: (posts: SocialPost[])=>void,error:()=>void, count=21) {
 // Live snapshots are required for likes and deletion to propagate immediately.
 return onSnapshot(query(collection(getFirebaseDb(),'social_posts'),orderBy('createdAt','desc'),limit(count)),s=>next(s.docs.map(d=>({...d.data(),id:d.id} as SocialPost))),error);
}
export function newPostId() { return doc(collection(getFirebaseDb(),'social_posts')).id; }
export async function publishPost(id:string,authorName:string,text:string,imageUrl:string) {
 const uid=getFirebaseAuth().currentUser?.uid;if(!uid)throw Error('Sign in required');
 const body=text.trim();if(body.length>2000 || (!body && !imageUrl))throw Error('Add text or a photo');
 await setDoc(doc(getFirebaseDb(),'social_posts',id),{authorId:uid,authorName,text:body,imageUrl,createdAt:serverTimestamp(),likes:{}});
}
export async function likePost(id:string,liked:boolean) {
 const uid=getFirebaseAuth().currentUser?.uid;if(!uid)throw Error('Sign in required');
 await updateDoc(doc(getFirebaseDb(),'social_posts',id),new FieldPath('likes',uid),liked?true:deleteField());
}
export async function deletePost(id:string) { await deleteDoc(doc(getFirebaseDb(),'social_posts',id)); }

export interface PostComment { id:string; authorId:string; authorName:string; text:string; createdAt:Timestamp|null }
export function watchPostComments(postId:string,next:(comments:PostComment[])=>void,error:()=>void) {
 return onSnapshot(query(collection(getFirebaseDb(),'social_posts',postId,'comments'),orderBy('createdAt','desc'),limit(50)),s=>next(s.docs.map(d=>({...d.data(),id:d.id} as PostComment))),error);
}
export async function addPostComment(postId:string,authorName:string,text:string) {
 const uid=getFirebaseAuth().currentUser?.uid;if(!uid)throw Error('Sign in required');
 const body=text.trim();if(!body || body.length>1000)throw Error('Write a comment up to 1000 characters');
 await addDoc(collection(getFirebaseDb(),'social_posts',postId,'comments'),{authorId:uid,authorName,text:body,createdAt:serverTimestamp()});
}
export async function deletePostComment(postId:string,id:string) {await deleteDoc(doc(getFirebaseDb(),'social_posts',postId,'comments',id));}
