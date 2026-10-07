import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const source=readFileSync(new URL('../src/lib/webrtc.ts',import.meta.url),'utf8').replace(/import \{ sendCallSignaling, subscribeToCallSignaling \} from '.\/firebase';/,`const sendCallSignaling=async()=>{}; const subscribeToCallSignaling=()=>()=>{};`);
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {HalaWebRTCController}=await import('data:text/javascript;base64,'+Buffer.from(compiled).toString('base64'));
test('hangup before permission resolves stops acquired tracks and never starts signaling',async()=>{
 const descriptor=Object.getOwnPropertyDescriptor(globalThis,'navigator');let resolve,stopped=0;
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{mediaDevices:{getUserMedia:()=>new Promise(r=>resolve=r)}}});
 try{const c=new HalaWebRTCController({callId:'test',currentUserId:'a',targetUserId:'b',isVideo:false});const pending=c.initMedia(true);c.close();resolve({getTracks:()=>[{stop:()=>stopped++}]});assert.equal(await pending,null);assert.equal(stopped,1);assert.equal(await c.initMedia(true),null);assert.equal(c.pc,null);}finally{Object.defineProperty(globalThis,'navigator',descriptor);}
});
test('denied microphone reports failure and creates no peer connection',async()=>{
 const descriptor=Object.getOwnPropertyDescriptor(globalThis,'navigator');let errors=0;
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{mediaDevices:{getUserMedia:async()=>{throw new Error('Denied');}}}});
 try{const c=new HalaWebRTCController({callId:'test',currentUserId:'a',targetUserId:'b',isVideo:false,onError:()=>errors++});assert.equal(await c.initMedia(true),null);assert.equal(errors,1);assert.equal(c.pc,null);}finally{Object.defineProperty(globalThis,'navigator',descriptor);}
});
