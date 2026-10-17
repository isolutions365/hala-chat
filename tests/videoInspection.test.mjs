import {test} from 'node:test';
import assert from 'node:assert/strict';
import {inspectShortVideo} from '../src/lib/shortVideo.ts';
test('video metadata inspection releases resources on success and decoder failure',async()=>{
 const originalDocument=globalThis.document,create=URL.createObjectURL,revoke=URL.revokeObjectURL;
 let video,revoked=0,cleaned=0;
 globalThis.document={createElement:()=>video={duration:12,removeAttribute:()=>cleaned++,load:()=>{}}};
 URL.createObjectURL=()=> 'blob:fixture';URL.revokeObjectURL=()=>revoked++;
 try {
  const success=inspectShortVideo({size:100,type:'video/mp4'});video.onloadedmetadata();assert.equal(await success,12);assert.equal(video.onerror,null);
  const failed=inspectShortVideo({size:100,type:'video/mp4'});video.onerror();await assert.rejects(failed,/could not be read/);
  const long=inspectShortVideo({size:100,type:'video/mp4'});video.duration=31;video.onloadedmetadata();await assert.rejects(long,/30 seconds/);
  assert.equal(revoked,3);assert.equal(cleaned,3);
 }finally{globalThis.document=originalDocument;URL.createObjectURL=create;URL.revokeObjectURL=revoke;}
});
test('video metadata inspection times out and ignores late completion',async(t)=>{
 t.mock.timers.enable({apis:['setTimeout']});
 const originalDocument=globalThis.document,create=URL.createObjectURL,revoke=URL.revokeObjectURL;
 let video,revoked=0;globalThis.document={createElement:()=>video={duration:12,removeAttribute:()=>{},load:()=>{}}};URL.createObjectURL=()=> 'blob:fixture';URL.revokeObjectURL=()=>revoked++;
 try{const pending=inspectShortVideo({size:100,type:'video/mp4'}),late=video.onloadedmetadata;const rejected=assert.rejects(pending,/could not be read/);t.mock.timers.tick(12000);await rejected;late();assert.equal(revoked,1);}finally{globalThis.document=originalDocument;URL.createObjectURL=create;URL.revokeObjectURL=revoke;}
});
