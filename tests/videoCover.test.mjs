import {test} from 'node:test';
import assert from 'node:assert/strict';
import {captureVideoCover} from '../src/lib/videoCover.ts';
test('cover capture bounds dimensions and rejects unreadable frames',async()=>{
 const previous=globalThis.document;let canvas;globalThis.document={createElement:()=>canvas={getContext:()=>({drawImage(){}}),toBlob:cb=>cb(new Blob(['jpeg'],{type:'image/jpeg'}))}};
 try{const video={readyState:2,seeking:false,videoWidth:3840,videoHeight:2160};const blob=await captureVideoCover(video);assert.equal(canvas.width,960);assert.equal(canvas.height,540);assert.equal(blob.type,'image/jpeg');await assert.rejects(captureVideoCover({...video,seeking:true}));await assert.rejects(captureVideoCover({...video,readyState:1}));}finally{globalThis.document=previous;}
});
test('cover capture rejects failed or oversized encodes',async()=>{
 const previous=globalThis.document;let encoded=null;globalThis.document={createElement:()=>({getContext:()=>({drawImage(){}}),toBlob:cb=>cb(encoded)})};
 try{const video={readyState:2,seeking:false,videoWidth:100,videoHeight:100};await assert.rejects(captureVideoCover(video));encoded=new Blob([new Uint8Array(1024*1024+1)]);await assert.rejects(captureVideoCover(video));}finally{globalThis.document=previous;}
});
