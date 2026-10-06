import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLivePlanList } from '../src/lib/livePlanList.ts';
function harness() {
 const subscriptions=[];const states=[];
 const list=createLivePlanList((count,next,error)=>{
  const subscription={count,next,error,stopped:false};subscriptions.push(subscription);
  return ()=>{subscription.stopped=true;};
 },state=>states.push(state));
 list.start();return {list,subscriptions,states};
}
test('older plans expand in twenties, without duplicates or a false final-page button',()=>{
 const {list,subscriptions,states}=harness();
 assert.equal(subscriptions[0].count,21);
 subscriptions[0].next(Array.from({length:21},(_,id)=>({id})));
 assert.equal(states.at(-1).items.length,20);assert.equal(states.at(-1).hasMore,true);
 list.more();list.more();
 assert.equal(subscriptions.length,2);assert.equal(subscriptions[0].stopped,true);
 assert.equal(subscriptions[1].count,41);
 subscriptions[1].next(Array.from({length:35},(_,id)=>({id})));
 assert.equal(states.at(-1).items.length,35);assert.equal(states.at(-1).hasMore,false);
 list.more();assert.equal(subscriptions.length,2);
});
test('failed expansion retains visible plans and retries the requested range',()=>{
 const {list,subscriptions,states}=harness();
 subscriptions[0].next(Array.from({length:21},(_,id)=>id));list.more();
 subscriptions[1].error();
 assert.equal(states.at(-1).error,true);assert.equal(states.at(-1).items.length,20);
 list.more();assert.equal(subscriptions.length,2);
 list.retry();assert.equal(subscriptions[2].count,41);
 subscriptions[2].next([1,2]);assert.equal(states.at(-1).error,false);
 assert.deepEqual(states.at(-1).items,[1,2]);
});
test('superseded and disposed listeners cannot replace another chat or retry result',()=>{
 const {list,subscriptions,states}=harness();
 subscriptions[0].error();list.retry();subscriptions[1].next(['current']);
 subscriptions[0].next(['stale']);subscriptions[0].error();
 assert.deepEqual(states.at(-1).items,['current']);assert.equal(states.at(-1).error,false);
 const count=states.length;list.dispose();subscriptions[1].next(['late']);subscriptions[1].error();
 list.retry();list.more();assert.equal(states.length,count);assert.equal(subscriptions[1].stopped,true);
});
