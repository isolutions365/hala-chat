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
