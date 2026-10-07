import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateShortVideo} from '../src/lib/shortVideo.ts';
test('short video accepts supported formats at duration and size boundaries',()=>{
 for(const type of ['video/mp4','video/webm']) assert.doesNotThrow(()=>validateShortVideo({size:5*1024*1024,type},30));
});
test('short video rejects unsupported, empty, oversized and invalid duration media',()=>{
 for(const file of [{size:0,type:'video/mp4'},{size:5242881,type:'video/mp4'},{size:100,type:'video/quicktime'}]) assert.throws(()=>validateShortVideo(file,10));
 for(const duration of [0,-1,30.01,Infinity,NaN]) assert.throws(()=>validateShortVideo({size:100,type:'video/mp4'},duration));
});
