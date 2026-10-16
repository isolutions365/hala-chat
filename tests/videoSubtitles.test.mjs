import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizeSubtitles} from '../src/lib/videoSubtitles.mjs';
const vtt=(timing='00:00.000 --> 00:02.000',text='Hello')=>`WEBVTT\n\n${timing}\n${text}\n`;
test('plain subtitles normalize BOM, newlines, IDs and Arabic/Urdu text',()=>{
 const result=normalizeSubtitles('\uFEFFWEBVTT\r\n\r\ncue-1\r\n00:00.000 --> 00:02.000\r\nمرحبا\r\nخوش آمدید\r\n',5);
 assert.equal(result.count,1);assert.match(result.vtt,/00:00:00.000 --> 00:00:02.000/);assert.match(result.vtt,/مرحبا\nخوش آمدید/);
 assert.deepEqual(normalizeSubtitles(result.vtt,5),result);
});
test('reject invalid durations, unsupported VTT, malformed timing and markup',()=>{
 for(const duration of [0,-1,31,NaN,Infinity])assert.throws(()=>normalizeSubtitles(vtt(),duration));
 for(const input of ['',vtt().replace('WEBVTT','SRT'),vtt('00:61.000 --> 00:62.000'),vtt('00:02.000 --> 00:01.000'),vtt('00:01.000 --> 00:01.000'),vtt('00:00.000 --> 00:06.000'),vtt(undefined,''),vtt(undefined,'<b>Hello</b>'),vtt(undefined,'bad\u0000text'),vtt('00:00.000 --> 00:02.000 align:start')])assert.throws(()=>normalizeSubtitles(input,5));
});
test('reject overlapping, excessive, oversized cues but allow adjacent cues',()=>{
 const first=vtt();assert.throws(()=>normalizeSubtitles(first+'\n00:01.000 --> 00:03.000\nOverlap',5));
 assert.equal(normalizeSubtitles(first+'\n00:02.000 --> 00:03.000\nNext',5).count,2);
 assert.throws(()=>normalizeSubtitles(vtt(undefined,'x'.repeat(1001)),5));
 assert.throws(()=>normalizeSubtitles('x'.repeat(12001),5));
 assert.throws(()=>normalizeSubtitles('WEBVTT\n\n'+Array(61).fill('00:00.000 --> 00:01.000\nHi').join('\n\n'),30));
});
