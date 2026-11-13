import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('encrypted media with an IV never falls back to serving ciphertext as plaintext', async () => {
  const source = await readFile(new URL('../src/lib/crypto.ts', import.meta.url), 'utf8');
  const start = source.indexOf('export async function decryptBlobData(');
  const end = source.indexOf('/**\n * Derive AES-GCM Key from 6-digit PIN', start);
  assert.notEqual(start, -1, 'decryptBlobData must exist');
  assert.notEqual(end, -1, 'decryptBlobData must end before PIN derivation');
  const implementation = source.slice(start, end);

  const encryptedBranch = implementation.indexOf('if (ivB64) {');
  const legacyFallback = implementation.indexOf('const sniffedUnencrypted = sniffDecryptedMimeType(encryptedArrayBuffer, mimeType);');
  assert.notEqual(encryptedBranch, -1, 'IV-bearing encrypted payloads must have a dedicated branch');
  assert.notEqual(legacyFallback, -1, 'legacy plaintext fallback must remain available');
  assert.ok(legacyFallback > encryptedBranch, 'legacy fallback must run only after the IV-bearing branch');

  const encryptedHandling = implementation.slice(encryptedBranch, legacyFallback);
  assert.match(encryptedHandling, /if\s*\(!key\)\s*return null;/, 'missing keys must not expose ciphertext');
  assert.match(encryptedHandling, /catch\s*\(err\)[\s\S]*?return null;/, 'decryption failures must not expose ciphertext');
});

test('group media decryption retries when the encrypted group key arrives after chat load', async () => {
  const source = await readFile(new URL('../src/components/ConversationScreen.tsx', import.meta.url), 'utf8');
  assert.match(
    source,
    /activeChat\.encryptedGroupKeys\?\.\[currentUserId\]/,
    'group key package changes must re-run session key initialization'
  );
});


test('media SDK reads have a timeout and retry failures leave loading state', async () => {
  const source = await readFile(new URL('../src/hooks/useDecryptedMedia.ts', import.meta.url), 'utf8');
  assert.match(source, /function withMediaTimeout<T>/, 'media downloads must have a bounded timeout helper');
  assert.equal((source.match(/withMediaTimeout\\(getBytes\\(storageReference\\), 10000, 'sdk'\\)/g) || []).length, 2, 'both gs:// and HTTPS Firebase Storage SDK reads must be bounded');
  const retryBlock = source.slice(source.indexOf('const isNonRetryable ='), source.indexOf('finally {', source.indexOf('const isNonRetryable =')));
  assert.match(retryBlock, /setMediaStatuses\(prev => \(\{ \.\.\.prev, \[msg\.id\]: 'error' \}\)\)/, 'failed attempts must expose an error/retry state instead of a permanent spinner');
});
