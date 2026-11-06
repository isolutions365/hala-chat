import { readFile } from 'node:fs/promises';
import { test, before, after, beforeEach } from 'node:test';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, getDocs, updateDoc, deleteDoc, collection, query, where, arrayUnion } from 'firebase/firestore';
import { ref, uploadBytes, getMetadata, deleteObject } from 'firebase/storage';
let env;
const now='2026-10-02T10:00:00.000Z';
const profile = id => ({id,name:id,phone:'+966500000000',avatar_url:null,status:'Hello',created_at:now,last_seen:now});
const chat = (type='1-1') => ({type,participants:['alice','bob'],participantDetails:{alice:{name:'Alice'},bob:{name:'Bob'}},unreadCount:{alice:0,bob:0},typing:{alice:false,bob:false},lastMessage:null,createdAt:now,updatedAt:now,...(type!=='1-1'?{createdBy:'alice',adminIds:['alice']}:{}),...(type==='channel'?{ownerId:'alice',isPublic:true,allowMemberPosts:false,subscriberCount:2}:{})});
const message = (senderId='alice') => ({senderId,senderName:senderId,content:'Test',type:'text',status:'sent',timestamp:now,readBy:{[senderId]:now},reactions:{},deletedFor:[]});
const db = id => id ? env.authenticatedContext(id,{phone_number:'+966500000000'}).firestore() : env.unauthenticatedContext().firestore();
before(async()=>{ env=await initializeTestEnvironment({projectId:'demo-hala-rules',firestore:{host:'127.0.0.1',port:8088,rules:await readFile('firestore.rules','utf8')},storage:{host:'127.0.0.1',port:9198,rules:await readFile('storage.rules','utf8')}}); });
after(async()=>{await env?.cleanup();});
beforeEach(async()=>{
 await env.clearFirestore();
 await env.withSecurityRulesDisabled(async ctx=>{
  const d=ctx.firestore();
  await Promise.all(['alice','bob','eve'].map(id=>setDoc(doc(d,'users',id),profile(id))));
  await setDoc(doc(d,'chats','private'),chat());
  await setDoc(doc(d,'chats','group'),chat('group'));
  await setDoc(doc(d,'chats','channel'),chat('channel'));
  await setDoc(doc(d,'channels','channel'),{id:'channel',name:'Test',description:'',avatar_url:null,owner_id:'alice',admin_ids:['alice'],is_public:true,allow_member_posts:false,subscriber_count:2,created_at:now});
  await setDoc(doc(d,'chats','private','messages','m'),message());
 });
});
test('anonymous cannot enumerate users or private chats',async()=>{
 await assertFails(getDocs(collection(db(null),'users')));
 await assertFails(getDoc(doc(db(null),'chats','private')));
 await assertFails(setDoc(doc(db(null),'users','eve'),profile('eve')));
});
test('private profile owner only; authenticated directory has no private fields',async()=>{
 await assertSucceeds(getDoc(doc(db('alice'),'users','alice')));
 await assertFails(getDoc(doc(db('bob'),'users','alice')));
 await assertFails(updateDoc(doc(db('bob'),'users','alice'),{name:'Hijack'}));
 const pub={id:'alice',name:'alice',avatar_url:null,status:'Hello',public_key:''};
 await assertSucceeds(setDoc(doc(db('alice'),'users_public','alice'),pub));
 await assertSucceeds(getDoc(doc(db('bob'),'users_public','alice')));
 await assertFails(setDoc(doc(db('alice'),'users_public','alice'),{...pub,phone:'secret'}));
});
test('profile schema/identity/moderation protected on create and update',async()=>{
 await assertSucceeds(setDoc(doc(db('new'),'users','new'),profile('new')));
 await assertFails(updateDoc(doc(db('new'),'users','new'),{id:'alice'}));
 await assertFails(updateDoc(doc(db('new'),'users','new'),{name:'x'.repeat(101)}));
 await assertFails(updateDoc(doc(db('new'),'users','new'),{is_flagged:false}));
 await assertFails(setDoc(doc(db('fake'),'users','fake'),{...profile('fake'),phone:'+123'}));
});
test('private chats require membership, including queries',async()=>{
 await assertSucceeds(getDoc(doc(db('bob'),'chats','private')));
 await assertFails(getDoc(doc(db('eve'),'chats','private')));
 await assertSucceeds(getDocs(query(collection(db('bob'),'chats'),where('participants','array-contains','bob'))));
 await assertFails(getDocs(collection(db('bob'),'chats')));
});
test('members cannot promote themselves or add outsiders',async()=>{
 await assertFails(updateDoc(doc(db('bob'),'chats','group'),{adminIds:['bob']}));
 await assertFails(updateDoc(doc(db('bob'),'chats','group'),{participants:['alice','bob','eve'], 'participantDetails.eve':{name:'Eve'}}));
 await assertFails(updateDoc(doc(db('eve'),'chats','private'),{participants:arrayUnion('eve')}));
 await assertSucceeds(updateDoc(doc(db('alice'),'chats','group'),{name:'New',updatedAt:now}));
});
test('messages require membership and actual sender identity',async()=>{
 await assertSucceeds(setDoc(doc(db('bob'),'chats','private','messages','b'),message('bob')));
 await assertFails(setDoc(doc(db('eve'),'chats','private','messages','e'),message('eve')));
 await assertFails(setDoc(doc(db('bob'),'chats','private','messages','spoof'),message('alice')));
 await assertFails(updateDoc(doc(db('bob'),'chats','private','messages','m'),{content:'Hijack'}));
 await assertSucceeds(updateDoc(doc(db('alice'),'chats','private','messages','m'),{content:'Edited',isEdited:true,editedAt:now}));
});
test('receipts/reactions/deletion-for-me belong to authenticated user',async()=>{
 const m=doc(db('bob'),'chats','private','messages','m');
 await assertSucceeds(updateDoc(m,{'readBy.bob':now,status:'read','reactionsBy.bob':'👍',deletedFor:['bob']}));
 await assertFails(updateDoc(m,{'readBy.eve':now}));
 await assertFails(updateDoc(m,{'reactionsBy.alice':'👎'}));
 await assertFails(updateDoc(m,{deletedFor:['bob','alice']}));
});
test('blocked sender cannot send to recipient',async()=>{
 await assertSucceeds(updateDoc(doc(db('bob'),'users','bob'),{blockedUsers:['alice']}));
 await assertFails(setDoc(doc(db('alice'),'chats','private','messages','blocked'),message()));
});
test('broadcast channel member cannot post or change channel owner',async()=>{
 await assertFails(setDoc(doc(db('bob'),'chats','channel','messages','bad'),message('bob')));
 await assertSucceeds(setDoc(doc(db('alice'),'chats','channel','messages','ok'),message()));
 await assertFails(updateDoc(doc(db('bob'),'chats','channel'),{ownerId:'bob'}));
});
test('public channel subscription grants only channel access; private joins denied',async()=>{
 const e=db('eve');
 await assertSucceeds(setDoc(doc(e,'channels','channel','subscribers','eve'),{channel_id:'channel',user_id:'eve',name:'Eve',avatar_url:null,joined_at:now}));
 await assertSucceeds(getDoc(doc(e,'chats','channel')));
 await assertSucceeds(updateDoc(doc(e,'chats','channel'),{participants:['alice','bob','eve'],'participantDetails.eve':{name:'Eve',role:'member'},subscriberCount:3,updatedAt:now}));
 await assertFails(getDoc(doc(e,'chats','private')));
 await assertFails(setDoc(doc(e,'channels','channel','subscribers','fake'),{channel_id:'channel',user_id:'fake',name:'Fake',avatar_url:null,joined_at:now}));
});
test('call and signaling only for actual parties',async()=>{
 const call={id:'c',callerId:'alice',calleeId:'bob',callerName:'Alice',calleeName:'Bob',type:'voice',status:'ringing',startedAt:now,durationSeconds:0};
 await assertSucceeds(setDoc(doc(db('alice'),'calls','c'),call));
 await assertFails(getDoc(doc(db('eve'),'calls','c')));
 await assertSucceeds(getDocs(query(collection(db('bob'),'calls'),where('calleeId','==','bob'),where('status','==','ringing'))));
 await assertSucceeds(getDocs(query(collection(db('alice'),'calls'),where('callerId','==','alice'))));
 await assertFails(updateDoc(doc(db('alice'),'calls','c'),{status:'ongoing'}));
 await assertSucceeds(updateDoc(doc(db('bob'),'calls','c'),{status:'ongoing',connectedAt:now}));
 await assertFails(updateDoc(doc(db('bob'),'calls','c'),{calleeId:'eve'}));
 await assertSucceeds(setDoc(doc(db('alice'),'calls','c','signaling','s'),{type:'offer',from:'alice',to:'bob',sdp:{type:'offer',sdp:'test'},timestamp:now}));
 await assertFails(setDoc(doc(db('bob'),'calls','c','signaling','fake'),{type:'offer',from:'alice',to:'bob',timestamp:now}));
});
test('story v2 strips phone; authors cannot spoof and viewers cannot edit content',async()=>{
 const story={schemaVersion:2,userId:'alice',userName:'Alice',userAvatar:null,mediaUrl:'https://example.com/test.jpg',mediaType:'image',textOverlay:null,drawingOverlay:null,createdAt:now,expiresAt:now,views:{}};
 await assertSucceeds(setDoc(doc(db('alice'),'stories','s'),story));
 await assertFails(setDoc(doc(db('bob'),'stories','spoof'),story));
 await assertFails(updateDoc(doc(db('alice'),'stories','s'),{userPhone:'+966'}));
 await assertFails(updateDoc(doc(db('bob'),'stories','s'),{mediaUrl:'https://example.com/hijack'}));
 await assertSucceeds(getDocs(query(collection(db('bob'),'stories'),where('schemaVersion','==',2),where('expiresAt','>', '2026-10-01'))));
});
test('media storage denies cross-owner writes, reads, overwrites and excessive sizes',async()=>{
 const a=env.authenticatedContext('alice').storage(); const b=env.authenticatedContext('bob').storage();
 const path='media/alice/test-'+Date.now(); const metadata={contentType:'image/jpeg'};
 await assertSucceeds(uploadBytes(ref(a,path),new Uint8Array(10),metadata));
 await assertFails(getMetadata(ref(b,path)));
 await assertFails(uploadBytes(ref(b,path+'b'),new Uint8Array(10),metadata));
 await assertFails(uploadBytes(ref(a,path),new Uint8Array(10),metadata));
 await assertFails(uploadBytes(ref(a,path+'big'),new Uint8Array(20*1024*1024+1),metadata));
 await assertFails(uploadBytes(ref(a,path+'html'),new Uint8Array(10),{contentType:'text/html'}));
 await assertSucceeds(deleteObject(ref(a,path)));
});
test('Majlis members vote as themselves; only creator confirms; tasks enforce assignment',async()=>{
 const a=db('alice'), b=db('bob'), e=db('eve');
 const {serverTimestamp}=await import('firebase/firestore');
 const plan={ownerId:'alice',title:'Dinner',date:'2026-10-03',notes:'Choose venue',optionA:'A',optionB:'B',optionC:'',status:'open',confirmedOption:'',createdAt:serverTimestamp()};
 await assertSucceeds(setDoc(doc(a,'chats','private','majlis','p'),plan));
 await assertFails(getDoc(doc(e,'chats','private','majlis','p')));
 await assertSucceeds(setDoc(doc(b,'chats','private','majlis','p','votes','bob'),{option:'a',updatedAt:serverTimestamp()}));
 await assertFails(setDoc(doc(b,'chats','private','majlis','p','votes','alice'),{option:'b',updatedAt:serverTimestamp()}));
 await assertFails(setDoc(doc(b,'chats','private','majlis','p','votes','bob'),{option:'c',updatedAt:serverTimestamp()}));
 await assertFails(updateDoc(doc(b,'chats','private','majlis','p'),{status:'confirmed',confirmedOption:'a'}));
 await assertSucceeds(updateDoc(doc(a,'chats','private','majlis','p'),{status:'confirmed',confirmedOption:'a'}));
 await assertFails(setDoc(doc(b,'chats','private','majlis','p','votes','bob'),{option:'b',updatedAt:serverTimestamp()}));
 const task={title:'Book table',assigneeId:'bob',done:false,createdAt:serverTimestamp()};
 await assertSucceeds(setDoc(doc(a,'chats','private','majlis','p','tasks','t'),task));
 await assertSucceeds(updateDoc(doc(b,'chats','private','majlis','p','tasks','t'),{done:true}));
 await assertFails(updateDoc(doc(b,'chats','private','majlis','p','tasks','t'),{assigneeId:'eve'}));
});
test('normal chat activity and per-user settings remain usable',async()=>{
 const m=doc(db('bob'),'chats','private');
 await assertSucceeds(updateDoc(m,{'typing.bob':true}));
 await assertSucceeds(updateDoc(m,{pinnedBy:['bob'],archivedBy:['bob']}));
 await assertFails(updateDoc(m,{pinnedBy:['bob','alice']}));
 await assertSucceeds(updateDoc(m,{lastMessage:{senderId:'bob',content:'Hi',type:'text',timestamp:now,status:'sent'},updatedAt:now,'unreadCount.alice':1}));
 await assertSucceeds(updateDoc(doc(db('alice'),'chats','private'),{'unreadCount.alice':0,'lastMessage.status':'read'}));
});

test('poll voters cannot forge other votes, unknown choices or multiple single-choice votes', async()=>{
 const a=db('alice'), b=db('bob');
 const path=['chats','private','messages','poll'];
 const pollData={question:'Where?',options:[{id:'a',text:'A',votes:[]},{id:'b',text:'B',votes:[]}],allowMultiple:false,totalVotes:0};
 await assertSucceeds(setDoc(doc(a,...path),{...message(),type:'poll',pollData}));
 await assertSucceeds(updateDoc(doc(b,...path),{'pollVotes.bob':['a']}));
 await assertFails(updateDoc(doc(b,...path),{'pollVotes.bob':['fake']}));
 await assertFails(updateDoc(doc(b,...path),{'pollVotes.bob':['a','b']}));
 await assertFails(updateDoc(doc(b,...path),{'pollVotes.alice':['b']}));
 await assertFails(setDoc(doc(a,'chats','private','messages','forged'),{...message(),type:'poll',pollData:{...pollData,options:[{id:'a',text:'A',votes:['bob']},{id:'b',text:'B',votes:[]}]}}));
});
