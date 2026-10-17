import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const source=readFileSync(new URL('../src/lib/webrtc.ts',import.meta.url),'utf8').replace(/import \{ sendCallSignaling, subscribeToCallSignaling \} from '.\/firebase';/,`export let received; export const sent=[]; const sendCallSignaling=async(...args)=>{sent.push(args);}; const subscribeToCallSignaling=(_id,_uid,callback)=>{received=callback;return ()=>{};};`);
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
globalThis.RTCPeerConnection = class {};
const moduleUnderTest=await import('data:text/javascript;base64,'+Buffer.from(compiled).toString('base64'));
const {HalaWebRTCController}=moduleUnderTest;
globalThis.RTCSessionDescription=class {constructor(value){Object.assign(this,value);}};

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

test('camera replacement keeps original on failure and stops late tracks after hangup',async()=>{
 const descriptor=Object.getOwnPropertyDescriptor(globalThis,'navigator');let oldStops=0,newStops=0;
 const old={kind:'video',enabled:false,getSettings:()=>({facingMode:'user'}),stop:()=>oldStops++};
 const fresh={kind:'video',enabled:true,stop:()=>newStops++};
 let tracks=[old];const stream={getVideoTracks:()=>tracks,getTracks:()=>tracks,removeTrack:t=>tracks=tracks.filter(x=>x!==t),addTrack:t=>tracks.push(t)};
 const c=new HalaWebRTCController({callId:'test',currentUserId:'a',targetUserId:'b',isVideo:true});c.localStream=stream;
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{mediaDevices:{getUserMedia:async()=>{throw Error('busy');}}}});
 try{
  assert.equal(await c.switchCamera(),stream);assert.equal(oldStops,0);
  navigator.mediaDevices.getUserMedia=async()=>({getVideoTracks:()=>[fresh],getTracks:()=>[fresh]});
  c.pc={getSenders:()=>[{track:old,replaceTrack:async()=>{throw Error('negotiation');}}],close:()=>{}};
  await c.switchCamera();assert.equal(newStops,1);assert.equal(oldStops,0);
  let resolve;navigator.mediaDevices.getUserMedia=()=>new Promise(r=>resolve=r);
  const pending=c.switchCamera();c.close();resolve({getVideoTracks:()=>[fresh],getTracks:()=>[fresh]});
  assert.equal(await pending,null);assert.equal(newStops,2);assert.equal(oldStops,1);
 }finally{Object.defineProperty(globalThis,'navigator',descriptor);}
});
test('successful camera switch preserves disabled camera and prevents overlapping requests',async()=>{
 const descriptor=Object.getOwnPropertyDescriptor(globalThis,'navigator');let stops=0,requests=0,resolve;
 const old={kind:'video',enabled:false,getSettings:()=>({facingMode:'user'}),stop:()=>stops++},fresh={kind:'video',enabled:true,stop:()=>{}};
 let tracks=[old];const stream={getVideoTracks:()=>tracks,getTracks:()=>tracks,removeTrack:t=>tracks=tracks.filter(x=>x!==t),addTrack:t=>tracks.push(t)};
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{mediaDevices:{getUserMedia:()=>{requests++;return new Promise(r=>resolve=r);}}}});
 try{const c=new HalaWebRTCController({callId:'test',currentUserId:'a',targetUserId:'b',isVideo:true});c.localStream=stream;const pending=c.switchCamera();await c.switchCamera();assert.equal(requests,1);resolve({getVideoTracks:()=>[fresh],getTracks:()=>[fresh]});await pending;assert.equal(fresh.enabled,false);assert.equal(stops,1);assert.deepEqual(tracks,[fresh]);}finally{Object.defineProperty(globalThis,'navigator',descriptor);}
});

test('offer failure closes media and notifies the user once',async()=>{
 let stopped=0,closed=0,errorName='';
 const c=new HalaWebRTCController({callId:'test',currentUserId:'a',targetUserId:'b',isVideo:false,onError:e=>errorName=e.name});
 c.localStream={getTracks:()=>[{stop:()=>stopped++}]};
 c.pc={createOffer:async()=>{throw Error('network');},close:()=>closed++};
 await c.createAndSendOffer();assert.equal(stopped,1);assert.equal(closed,1);assert.equal(errorName,'NetworkError');assert.equal(c.pc,null);
});
test('offer completing after hangup does not resume negotiation',async()=>{
 let resolve,descriptions=0,errors=0;
 const c=new HalaWebRTCController({callId:'test',currentUserId:'a',targetUserId:'b',isVideo:false,onError:()=>errors++});
 c.pc={createOffer:()=>new Promise(r=>resolve=r),setLocalDescription:async()=>descriptions++,close:()=>{}};
 const pending=c.createAndSendOffer();c.close();resolve({sdp:'synthetic'});await pending;assert.equal(descriptions,0);assert.equal(errors,0);
});

test('incoming answer creation completing after hangup sends no answer',async()=>{
 let resolve,localDescriptions=0;const before=moduleUnderTest.sent.length;
 const c=new HalaWebRTCController({callId:'test',currentUserId:'b',targetUserId:'a',isVideo:false});
 c.pc={getSenders:()=>[],setRemoteDescription:async()=>{},createAnswer:()=>new Promise(r=>resolve=r),setLocalDescription:async()=>localDescriptions++,close:()=>{}};
 c.listenForSignaling();const pending=moduleUnderTest.received({type:'offer',sdp:{sdp:'synthetic'}});await Promise.resolve();c.close();resolve({sdp:'answer'});await pending;
 assert.equal(localDescriptions,0);assert.equal(moduleUnderTest.sent.length,before);
});
test('incoming offer setup failure releases microphone and reports recovery',async()=>{
 let stopped=0,errorName='';const c=new HalaWebRTCController({callId:'test',currentUserId:'b',targetUserId:'a',isVideo:false,onError:e=>errorName=e.name});
 c.localStream={getTracks:()=>[{stop:()=>stopped++}]};c.pc={getSenders:()=>[],setRemoteDescription:async()=>{throw Error('invalid');},close:()=>{}};
 c.listenForSignaling();await moduleUnderTest.received({type:'offer',sdp:{sdp:'synthetic'}});assert.equal(stopped,1);assert.equal(errorName,'NetworkError');assert.equal(c.pc,null);
});
