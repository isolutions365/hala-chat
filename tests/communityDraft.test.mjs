import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readCommunityDraft,saveCommunityDraft} from '../src/lib/communityDraft.ts';
test('community drafts restore per account, bound text and clear after publish',()=>{
 const values=new Map();globalThis.localStorage={getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
 assert.equal(saveCommunityDraft('a','Draft'),true);assert.equal(readCommunityDraft('a'),'Draft');assert.equal(readCommunityDraft('b'),'');
 saveCommunityDraft('b','b'.repeat(2100));assert.equal(readCommunityDraft('b').length,2000);saveCommunityDraft('a','');assert.equal(readCommunityDraft('a'),'');assert.equal(readCommunityDraft('b').length,2000);assert.equal(saveCommunityDraft('','bad'),false);
});
test('corrupt or blocked storage cannot break the composer',()=>{
 globalThis.localStorage={getItem:()=>'{broken',setItem:()=>{throw Error('blocked')},removeItem:()=>{throw Error('blocked')}};assert.equal(readCommunityDraft('a'),'');assert.equal(saveCommunityDraft('a','draft'),false);assert.equal(saveCommunityDraft('a',''),false);
 localStorage.getItem=()=>JSON.stringify({text:'wrong schema'});assert.equal(readCommunityDraft('a'),'');
});
