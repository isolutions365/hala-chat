import {test} from 'node:test';
import assert from 'node:assert/strict';
import {creatorBatches,combineLiveSources,newestPosts,FOLLOW_LIMIT} from '../src/lib/followingStreams.ts';
test('following chunks unique creators into bounded queries and enforces the cap',()=>{
 const ids=Array.from({length:FOLLOW_LIMIT},(_,i)=>'creator'+i);
 assert.deepEqual(creatorBatches([...ids,ids[0]]).map(batch=>batch.length),[30,30,30]);
 assert.deepEqual(creatorBatches([]),[]);assert.throws(()=>creatorBatches([...ids,'extra']),/following-limit/);
});
function harness(){const streams=[],published=[];let errors=0;const sources=[0,1,2].map(()=> (next,error)=>{const s={next,error,stopped:0};streams.push(s);return()=>s.stopped++;});const stop=combineLiveSources(sources,items=>published.push(items),()=>errors++);return {streams,published,stop,get errors(){return errors;}};}
test('live following waits for every source, reflects deletes and stops stale callbacks',()=>{
 const h=harness();h.streams[0].next(['a']);h.streams[1].next(['b']);assert.equal(h.published.length,0);
 h.streams[2].next(['c']);assert.deepEqual(h.published.at(-1),['a','b','c']);h.streams[0].next([]);assert.deepEqual(h.published.at(-1),['b','c']);
 h.stop();h.stop();h.streams[1].next(['stale']);assert.equal(h.published.length,2);assert.ok(h.streams.every(s=>s.stopped===1));
});
test('any failed following source stops all subscriptions without publishing partial results',()=>{
 const h=harness();h.streams[0].next(['a']);h.streams[1].error();h.streams[2].next(['c']);h.streams[0].error();assert.equal(h.errors,1);assert.equal(h.published.length,0);assert.ok(h.streams.every(s=>s.stopped===1));
});
test('synchronous source failure and setup throws clean up already registered listeners',()=>{
 let clean=0,started=0,errors=0;
 combineLiveSources([(next,error)=>{error();return()=>clean++;},()=>{started++;return()=>{};}],()=>assert.fail(),()=>errors++);
 assert.equal(clean,1);assert.equal(started,0);assert.equal(errors,1);
 combineLiveSources([()=>()=>clean++,()=>{throw Error('setup');}],()=>assert.fail(),()=>errors++);assert.equal(clean,2);assert.equal(errors,2);
});
test('following merge orders seconds, nanoseconds and document IDs before taking global page',()=>{
 const post=(id,seconds,nanoseconds=0)=>({id,createdAt:{seconds,nanoseconds}});
 const a=post('a',10),b=post('b',10),c=post('c',10,1),d=post('d',11);
 assert.deepEqual(newestPosts([a,c,d,b,a,{id:'pending',createdAt:null}],3).map(p=>p.id),['d','c','b']);
 assert.deepEqual(newestPosts([a,c,d,b],5).map(p=>p.id),['d','c','b','a']);
});
