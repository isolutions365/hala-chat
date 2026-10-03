import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateMediaUpload, MAX_MEDIA_BYTES } from '../src/lib/mediaPolicy.ts';
test('media accepts bounded images, recorded audio and encrypted bytes', () => {
 for (const type of ['image/jpeg','image/png','video/mp4','audio/webm;codecs=opus','application/octet-stream']) assert.doesNotThrow(() => validateMediaUpload({size:MAX_MEDIA_BYTES,type}));
});
test('media rejects empty, oversized and executable content', () => {
 for (const file of [{size:0,type:'image/png'},{size:MAX_MEDIA_BYTES+1,type:'image/png'},{size:10,type:'text/html'},{size:10,type:'image/svg+xml'}]) assert.throws(() => validateMediaUpload(file));
});
