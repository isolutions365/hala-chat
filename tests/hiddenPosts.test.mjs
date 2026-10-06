import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readHiddenPosts,saveHiddenPosts} from '../src/lib/hiddenPosts.ts';
test('hidden post preferences are account scoped, deduplicated and bounded',()=>{
 const values=new Map();globalThis.localStorage={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v)};
 assert.equal(saveHiddenPosts('alice',['p','p']),true);assert.deepEqual(readHiddenPosts('alice'),['p']);assert.deepEqual(readHiddenPosts('bob'),[]);
 saveHiddenPosts('alice',Array.from({length:220},(_,i)=>'p'+i));assert.equal(readHiddenPosts('alice').length,200);assert.equal(readHiddenPosts('alice')[0],'p20');
 saveHiddenPosts('alice',[]);assert.deepEqual(readHiddenPosts('alice'),[]);
});
test('malformed or unavailable browser storage never breaks the feed',()=>{
 globalThis.localStorage={getItem:()=>'{bad',setItem:()=>{throw Error('blocked');}};assert.deepEqual(readHiddenPosts('alice'),[]);assert.equal(saveHiddenPosts('alice',['p']),false);
 globalThis.localStorage.getItem=()=>JSON.stringify(['good',false,null,{},'x'.repeat(129),'good']);assert.deepEqual(readHiddenPosts('alice'),['good']);
});
