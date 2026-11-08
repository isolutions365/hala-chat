import { readFile } from 'node:fs/promises';
import { test, before, after } from 'node:test';
import assert from 'node:assert';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { ref, uploadBytes, uploadBytesResumable, getMetadata, deleteObject, updateMetadata } from 'firebase/storage';

let env;
before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-hala-candidate',
    storage: {
      host: '127.0.0.1',
      port: 9198,
      rules: await readFile('/tmp/storage.rules.candidate', 'utf8')
    }
  });
});

after(async () => {
  await env?.cleanup();
});

test('Focused Storage Create-Only Enforcement (resource == null)', async () => {
  const aliceStorage = env.authenticatedContext('alice').storage();
  const bobStorage = env.authenticatedContext('bob').storage();
  const assetPath = `media/alice/test-asset-${Date.now()}`;
  const metadata = { contentType: 'image/jpeg' };

  // 1. Alice creates a new object — MUST PASS
  console.log('Test 1: Alice creates new object...');
  const aliceRef = ref(aliceStorage, assetPath);
  await assertSucceeds(uploadBytes(aliceRef, new Uint8Array(10), metadata));
  console.log('Test 1 PASSED');

  // 2. Bob reads Alice's object — MUST PASS
  console.log('Test 2: Bob reads Alice object metadata...');
  const bobRef = ref(bobStorage, assetPath);
  await assertSucceeds(getMetadata(bobRef));
  console.log('Test 2 PASSED');

  // 3. Bob uploads to Alice's path — MUST FAIL
  console.log('Test 3: Bob uploads to Alice path...');
  const bobAliceRef = ref(bobStorage, assetPath);
  await assertFails(uploadBytes(bobAliceRef, new Uint8Array(10), metadata));
  console.log('Test 3 PASSED');

  // 4. Alice overwrites the same path with uploadBytes — MUST FAIL
  console.log('Test 4: Alice overwrites with uploadBytes...');
  await assertFails(uploadBytes(aliceRef, new Uint8Array(20), metadata));
  console.log('Test 4 PASSED');

  // 5. Alice overwrites the same path with uploadBytesResumable — MUST FAIL
  console.log('Test 5: Alice overwrites with uploadBytesResumable...');
  const task = uploadBytesResumable(aliceRef, new Uint8Array(15), metadata);
  await assertFails(new Promise((resolve, reject) => {
    task.on('state_changed', null, reject, () => resolve(task.snapshot));
  }));
  console.log('Test 5 PASSED');

  // 6. Alice updates existing object metadata — MUST FAIL (or update disallowed)
  console.log('Test 6: Alice updates metadata...');
  await assertFails(updateMetadata(aliceRef, { customMetadata: { updated: 'true' } }));
  console.log('Test 6 PASSED');

  // 7. Bob deletes Alice's object — MUST FAIL
  console.log('Test 7: Bob deletes Alice object...');
  await assertFails(deleteObject(bobRef));
  console.log('Test 7 PASSED');

  // 8. Alice deletes her own object — MUST PASS
  console.log('Test 8: Alice deletes own object...');
  await assertSucceeds(deleteObject(aliceRef));
  console.log('Test 8 PASSED');
});
