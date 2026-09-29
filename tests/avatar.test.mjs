import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compressAvatar } from '../src/lib/imageCompression.ts';

test('profile fallback reduces large images and rejects unreadable images', async () => {
  const original = { FileReader: globalThis.FileReader, Image: globalThis.Image, document: globalThis.document };
  let broken = false;
  const sizes = [];
  globalThis.FileReader = class { readAsDataURL() { this.onload({ target: { result: 'data:image/jpeg;base64,test' } }); } };
  globalThis.Image = class { width = 1600; height = 1200; set src(value) { broken ? this.onerror() : this.onload(); } };
  globalThis.document = { createElement() { return { width: 0, height: 0, getContext: () => ({ drawImage() {} }), toDataURL() { sizes.push(this.width); return 'data:image/jpeg;base64,' + 'a'.repeat(this.width > 280 ? 90000 : 40000); }, toBlob(callback) { callback(new Blob(['image'])); } }; } };
  try {
    const result = await compressAvatar(new Blob(['image']));
    assert.ok(result.length <= 60000);
    assert.deepEqual(sizes, [400, 280]);
    broken = true;
    await assert.rejects(compressAvatar(new Blob(['bad'])), /Failed to load image/);
  } finally { Object.assign(globalThis, original); }
});
