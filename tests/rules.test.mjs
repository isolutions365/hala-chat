import { readFile } from 'node:fs/promises';
import { test, before, after, beforeEach } from 'node:test';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, getDocs, updateDoc, deleteDoc, collection, query, where, arrayUnion, serverTimestamp, limit, orderBy, deleteField } from 'firebase/firestore';
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
 await assertFails(uploadBytes(ref(a,path+'big'),new Uint8Array(5*1024*1024+1),metadata));
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

const post=()=>({authorId:'alice',authorName:'alice',text:'Community update',imageUrl:'',createdAt:serverTimestamp(),likes:{}});
test('community posts enforce author, audience, shape and bounded feed queries',async()=>{
 const alice=db('alice'),bob=db('bob');
 await assertSucceeds(setDoc(doc(alice,'social_posts','p'),post()));
 await assertSucceeds(getDocs(query(collection(bob,'social_posts'),orderBy('createdAt','desc'),limit(40))));
 await assertFails(getDocs(collection(bob,'social_posts')));
 await assertFails(getDoc(doc(db(null),'social_posts','p')));
 await assertFails(setDoc(doc(bob,'social_posts','spoof'),post()));
 await assertFails(setDoc(doc(alice,'social_posts','name'),{...post(),authorName:'Someone else'}));
 await assertFails(setDoc(doc(alice,'social_posts','empty'),{...post(),text:''}));
 await assertFails(setDoc(doc(alice,'social_posts','oversized'),{...post(),text:'x'.repeat(2001)}));
 await assertFails(setDoc(doc(alice,'social_posts','extra'),{...post(),phone:'private'}));
 await assertFails(setDoc(doc(alice,'social_posts','fake'),{...post(),likes:{bob:true}}));
 await assertFails(setDoc(doc(alice,'social_posts','url'),{...post(),imageUrl:'https://example.com/tracker'}));
 const base='https://firebasestorage.googleapis.com/v0/b/gen-lang-client-0446181078.firebasestorage.app/o/media%2F';
 await assertSucceeds(setDoc(doc(alice,'social_posts','photo'),{...post(),text:'',imageUrl:base+'alice%2Fphoto?alt=media&token=test'}));
 await assertFails(setDoc(doc(alice,'social_posts','other-photo'),{...post(),imageUrl:base+'bob%2Fphoto?alt=media&token=test'}));
});
test('community likes only change own entry; posts only deleted by owner',async()=>{
 const alice=db('alice'),bob=db('bob');await setDoc(doc(alice,'social_posts','p'),post());
 const ref=doc(bob,'social_posts','p');
 await assertSucceeds(updateDoc(ref,{'likes.bob':true}));
 await assertFails(updateDoc(ref,{'likes.alice':true}));
 await assertFails(updateDoc(ref,{'likes.bob':'fake'}));
 await assertFails(updateDoc(ref,{text:'Hijack'}));
 await assertFails(updateDoc(doc(alice,'social_posts','p'),{authorId:'bob'}));
 await assertSucceeds(updateDoc(ref,{'likes.bob':deleteField()}));
 await assertFails(deleteDoc(ref));await assertSucceeds(deleteDoc(doc(alice,'social_posts','p')));
});

test('comments enforce existing post, own identity, bounded text, server time and read limits',async()=>{
 const alice=db('alice'),bob=db('bob');await setDoc(doc(alice,'social_posts','p'),post());
 const comment={authorId:'bob',authorName:'bob',text:'First line\nSecond line',createdAt:serverTimestamp()};
 await assertSucceeds(setDoc(doc(bob,'social_posts','p','comments','c'),comment));
 await assertSucceeds(getDocs(query(collection(alice,'social_posts','p','comments'),orderBy('createdAt','desc'),limit(50))));
 await assertFails(getDocs(collection(alice,'social_posts','p','comments')));
 await assertFails(getDoc(doc(db(null),'social_posts','p','comments','c')));
 for(const invalid of [{...comment,authorId:'alice'},{...comment,authorName:'alice'},{...comment,text:''},{...comment,text:' \n '},{...comment,text:'x'.repeat(1001)},{...comment,extra:true},{...comment,createdAt:now}]) {
  await assertFails(setDoc(doc(bob,'social_posts','p','comments','invalid'),invalid));
 }
 await assertFails(setDoc(doc(bob,'social_posts','absent','comments','c'),comment));
 await assertFails(updateDoc(doc(bob,'social_posts','p','comments','c'),{text:'Edited'}));
 await assertSucceeds(getDocs(query(collection(bob,'social_posts'),orderBy('createdAt','desc'),limit(201))));
 await assertFails(getDocs(query(collection(bob,'social_posts'),limit(202))));
});
test('comment author and post owner can remove comments; outsider cannot; deleted posts hide comments',async()=>{
 const alice=db('alice'),bob=db('bob'),eve=db('eve');await setDoc(doc(alice,'social_posts','p'),post());
 const comment={authorId:'bob',authorName:'bob',text:'Reply',createdAt:serverTimestamp()};
 const ref=doc(bob,'social_posts','p','comments','c');await setDoc(ref,comment);
 await assertFails(deleteDoc(doc(eve,'social_posts','p','comments','c')));
 await assertSucceeds(deleteDoc(doc(alice,'social_posts','p','comments','c')));
 await setDoc(ref,comment);await assertSucceeds(deleteDoc(ref));
 await setDoc(ref,comment);await deleteDoc(doc(alice,'social_posts','p'));
 await assertFails(getDoc(ref));await assertFails(setDoc(doc(bob,'social_posts','p','comments','new'),comment));
 await assertSucceeds(deleteDoc(ref));
});

test('post reports are private, authentic and immutable for clients',async()=>{
 const alice=db('alice'),bob=db('bob');await setDoc(doc(alice,'social_posts','p'),post());
 const report={reporterId:'bob',authorId:'alice',postText:'Community update',reason:'Spam',details:'Test report',createdAt:serverTimestamp(),status:'pending'};
 const target=doc(bob,'social_posts','p','reports','bob');
 await assertSucceeds(setDoc(target,report));await assertSucceeds(getDoc(target));
 await assertFails(getDoc(doc(alice,'social_posts','p','reports','bob')));
 await assertFails(getDoc(doc(db('eve'),'social_posts','p','reports','bob')));
 await assertFails(getDoc(doc(db(null),'social_posts','p','reports','bob')));
 await assertFails(getDocs(collection(bob,'social_posts','p','reports')));
 await assertFails(updateDoc(target,{status:'resolved'}));await assertFails(deleteDoc(target));
 await deleteDoc(doc(alice,'social_posts','p'));await assertSucceeds(getDoc(target));
});
test('reports reject forged evidence, reporter identity and unsupported fields',async()=>{
 const alice=db('alice'),bob=db('bob');await setDoc(doc(alice,'social_posts','p'),post());
 const report={reporterId:'bob',authorId:'alice',postText:'Community update',reason:'Spam',details:'',createdAt:serverTimestamp(),status:'pending'};
 const target=doc(bob,'social_posts','p','reports','bob');
 for(const invalid of [{...report,reporterId:'eve'},{...report,authorId:'eve'},{...report,postText:'Fabrication'},{...report,reason:'Ban'},{...report,status:'resolved'},{...report,details:'x'.repeat(1001)},{...report,secret:'extra'},{...report,createdAt:now}]) await assertFails(setDoc(target,invalid));
 await assertFails(setDoc(doc(bob,'social_posts','absent','reports','bob'),report));
 await assertFails(setDoc(doc(alice,'social_posts','p','reports','alice'),{...report,reporterId:'alice'}));
});

test('short video posts validate ownership, duration and immutable media',async()=>{
 const alice=db('alice');
 const base='https://firebasestorage.googleapis.com/v0/b/gen-lang-client-0446181078.firebasestorage.app/o/media%2F';
 const video={...post(),text:'',videoUrl:base+'alice%2Fclip?alt=media&token=test',videoDuration:30};
 await assertSucceeds(setDoc(doc(alice,'social_posts','video'),video));
 for(const change of [{videoDuration:31},{videoDuration:0},{videoDuration:'10'},{videoUrl:'https://example.com/video'},{videoUrl:base+'bob%2Fclip'},{imageUrl:base+'alice%2Fphoto'},{videoUrl:''}]) await assertFails(setDoc(doc(alice,'social_posts','invalid-video'),{...video,...change}));
 await assertSucceeds(updateDoc(doc(db('bob'),'social_posts','video'),{'likes.bob':true}));
 await assertFails(updateDoc(doc(alice,'social_posts','video'),{videoDuration:12}));
 await assertFails(updateDoc(doc(alice,'social_posts','video'),{videoUrl:base+'alice%2Fother'}));
});

test('following list is owner-only and cannot be enumerated',async()=>{
 const ref=doc(db('alice'),'users/alice/preferences/following');
 await assertSucceeds(setDoc(ref,{creators:{bob:true},updatedAt:serverTimestamp()}));
 await assertSucceeds(getDoc(ref));
 for(const actor of [null,'bob']) {
  const other=doc(db(actor),'users/alice/preferences/following');
  await assertFails(getDoc(other));
  await assertFails(setDoc(other,{creators:{eve:true},updatedAt:serverTimestamp()}));
  await assertFails(deleteDoc(other));
  await assertFails(getDocs(collection(db(actor),'users/alice/preferences')));
 }
 await assertSucceeds(updateDoc(ref,{creators:{bob:true,eve:true},updatedAt:serverTimestamp()}));
 await assertSucceeds(updateDoc(ref,{creators:{eve:true},updatedAt:serverTimestamp()}));
 await assertSucceeds(deleteDoc(ref));
});
test('following validates create and update, bounds identifiers and forbids orphan accounts',async()=>{
 const ref=doc(db('alice'),'users/alice/preferences/following');
 const invalid=[{creators:{alice:true}},{creators:{bob:false}},{creators:['bob']},{creators:{bob:true,eve:true}},{creators:{['x'.repeat(129)]:true}},{creators:{'a/b':true}},{creators:{bob:true},admin:true},{creators:{bob:true},updatedAt:'yesterday'}];
 for(const data of invalid)await assertFails(setDoc(ref,{updatedAt:serverTimestamp(),...data}));
 await assertFails(setDoc(ref,{updatedAt:serverTimestamp()}));
 await assertFails(setDoc(doc(db('missing'),'users/missing/preferences/following'),{creators:{bob:true},updatedAt:serverTimestamp()}));
 await assertSucceeds(setDoc(ref,{creators:{},updatedAt:serverTimestamp()}));
 for(const data of invalid)await assertFails(updateDoc(ref,{updatedAt:serverTimestamp(),...data}));
 await assertFails(updateDoc(ref,{creators:deleteField(),updatedAt:serverTimestamp()}));
 for(let i=0;i<30;i++)await assertSucceeds(updateDoc(ref,{['creators.creator'+i]:true,updatedAt:serverTimestamp()}));
 await assertFails(updateDoc(ref,{'creators.creator30':true,updatedAt:serverTimestamp()}));
});
test('following feed server query includes only chosen creators',async()=>{
 await env.withSecurityRulesDisabled(async context=>{
  const d=context.firestore();
  for(const author of ['bob','eve'])await setDoc(doc(d,'social_posts',author),{authorId:author,authorName:author,text:'fixture',imageUrl:'',likes:{},createdAt:serverTimestamp()});
 });
 const result=await assertSucceeds(getDocs(query(collection(db('alice'),'social_posts'),where('authorId','in',['bob']),orderBy('createdAt','desc'),limit(21))));
 if(result.size!==1||result.docs[0].data().authorId!=='bob')throw Error('Following query leaked unrelated posts');
 await assertFails(getDocs(query(collection(db(null),'social_posts'),where('authorId','in',['bob']),orderBy('createdAt','desc'),limit(21))));
});

test('video covers require owned media on video posts and are immutable',async()=>{
 const alice=db('alice');const base='https://firebasestorage.googleapis.com/v0/b/gen-lang-client-0446181078.firebasestorage.app/o/media%2F';
 const video={...post(),videoUrl:base+'alice%2Fclip?alt=media',videoDuration:10,videoCoverUrl:base+'alice%2Fcover?alt=media'};
 const target=doc(alice,'social_posts','covered');await assertSucceeds(setDoc(target,video));
 for(const cover of ['https://example.com/cover',base+'bob%2Fcover?alt=media','x'.repeat(5001),42])await assertFails(setDoc(doc(alice,'social_posts','badcover'),{...video,videoCoverUrl:cover}));
 await assertFails(setDoc(doc(alice,'social_posts','noclip'),{...post(),videoCoverUrl:video.videoCoverUrl}));
 await assertFails(updateDoc(target,{videoCoverUrl:base+'alice%2Freplacement?alt=media'}));
 await assertSucceeds(updateDoc(doc(db('bob'),'social_posts','covered'),{'likes.bob':true}));
});
