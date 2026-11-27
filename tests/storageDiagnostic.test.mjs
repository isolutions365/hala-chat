import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diagnoseStorageUrl } from '../src/lib/storageDiagnostic.ts';

test('diagnoseStorageUrl correctly parses bucket, path and token from Firebase Storage URL', async () => {
  const sampleUrl = 'https://firebasestorage.googleapis.com/v0/b/test-bucket.appspot.com/o/media%2Fuser123%2Fvoice_note.webm?alt=media&token=abcdef-12345';
  
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, status: 200 });

  try {
    const result = await diagnoseStorageUrl(sampleUrl);
    assert.equal(result.bucket, 'test-bucket.appspot.com');
    assert.equal(result.path, 'media/user123/voice_note.webm');
    assert.equal(result.token, 'abcdef-12345');
    assert.equal(result.reachable, true);
    assert.equal(result.status, 200);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('diagnoseStorageUrl handles unreachable storage URLs gracefully', async () => {
  const sampleUrl = 'https://firebasestorage.googleapis.com/v0/b/test-bucket.appspot.com/o/missing.webm?alt=media&token=bad';
  
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: false, status: 404 });

  try {
    const result = await diagnoseStorageUrl(sampleUrl);
    assert.equal(result.reachable, false);
    assert.equal(result.status, 404);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
