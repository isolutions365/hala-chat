import { readFile } from 'node:fs/promises';
import { test, before, after, beforeEach } from 'node:test';
import { initializeTestEnvironment, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc } from 'firebase/firestore';

let env;
const now='2026-10-02T10:00:00.000Z';
const profile=id=>({id,name:id,phone:'+966500000000',avatar_url:null,status:'Hello',created_at:now,last_seen:now});
const chat={type:'1-1',participants:['alice','bob'],participantDetails:{alice:{name:'Alice'},bob:{name:'Bob'}},unreadCount:{alice:0,bob:0},typing:{alice:false,bob:false},lastMessage:null,createdAt:now,updatedAt:now};
const db=id=>env.authenticatedContext(id,{phone_number:'+966500000000'}).firestore();
const baseMessage=(senderId='alice')=>({senderId,senderName:senderId,content:'Test',type:'text',status:'sent',timestamp:now,readBy:[],reactions:{},deletedFor:[]});
async function attempt(label, fn) {
  try { await fn(); console.log('[RULE-DIAG] '+label+': PASS'); }
  catch (error) { console.log('[RULE-DIAG] '+label+': FAIL — '+String(error?.message||error)); }
}
before(async()=>{env=await initializeTestEnvironment({projectId:'demo-hala-rule-diag',firestore:{host:'127.0.0.1',port:8088,rules:await readFile('firestore.rules','utf8')}});});
after(async()=>{await env?.cleanup();});
beforeEach(async()=>{
 await env.clearFirestore();
 await env.withSecurityRulesDisabled(async ctx=>{
  const d=ctx.firestore();
  await Promise.all(['alice','bob'].map(id=>setDoc(doc(d,'users',id),profile(id))));
  await setDoc(doc(d,'chats','private'),chat);
 });
});
test('diagnostic: standard message create expression budget',async()=>{
 await attempt('standard message create',()=>assertSucceeds(setDoc(doc(db('alice'),'chats','private','messages','normal'),baseMessage())));
});
test('diagnostic: poll create expression budget',async()=>{
 const pollData={question:'Where?',options:[{id:'a',text:'A',votes:[]},{id:'b',text:'B',votes:[]}],allowMultiple:false,totalVotes:0};
 await attempt('two-option poll create',()=>assertSucceeds(setDoc(doc(db('alice'),'chats','private','messages','poll'),{...baseMessage(),type:'poll',pollData})));
});
test('diagnostic: poll vote update expression budget',async()=>{
 const pollData={question:'Where?',options:[{id:'a',text:'A',votes:[]},{id:'b',text:'B',votes:[]}],allowMultiple:false,totalVotes:0};
 await env.withSecurityRulesDisabled(async ctx=>setDoc(doc(ctx.firestore(),'chats','private','messages','poll'),{...baseMessage(),type:'poll',pollData}));
 await attempt('one valid poll vote update',()=>assertSucceeds(updateDoc(doc(db('bob'),'chats','private','messages','poll'),{'pollVotes.bob':['a']})));
});
test('diagnostic: normal message edit expression budget',async()=>{
 await env.withSecurityRulesDisabled(async ctx=>setDoc(doc(ctx.firestore(),'chats','private','messages','normal'),baseMessage()));
 await attempt('sender normal message edit',()=>assertSucceeds(updateDoc(doc(db('alice'),'chats','private','messages','normal'),{content:'Edited'})));
});
