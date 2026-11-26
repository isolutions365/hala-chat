import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateMediaUpload, normalizeBaseMimeType, MAX_MEDIA_BYTES } from '../src/lib/mediaPolicy.ts';
test('media accepts bounded images, recorded audio/video with codecs, and encrypted bytes', () => {
 for (const type of [
  'image/jpeg',
  'image/png',
  'video/mp4',
  'video/mp4;codecs=avc1,mp4a.40.2',
  'video/mp4; codecs="avc1.42E01E, mp4a.40.2"',
  'video/webm',
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/quicktime',
  'video/3gpp',
  'video/x-matroska;codecs=avc1,opus',
  'audio/webm;codecs=opus',
  'application/octet-stream',
 ]) assert.doesNotThrow(() => validateMediaUpload({size:MAX_MEDIA_BYTES,type}));
});
test('normalizeBaseMimeType strips codec parameters cleanly', () => {
 assert.equal(normalizeBaseMimeType('video/webm;codecs=vp9,opus'), 'video/webm');
 assert.equal(normalizeBaseMimeType('video/mp4; codecs="avc1, mp4a.40.2"'), 'video/mp4');
 assert.equal(normalizeBaseMimeType(''), '');
});
test('media rejects empty, oversized and executable content', () => {
 for (const file of [{size:0,type:'image/png'},{size:MAX_MEDIA_BYTES+1,type:'image/png'},{size:10,type:'text/html'},{size:10,type:'image/svg+xml'}]) assert.throws(() => validateMediaUpload(file));
});
