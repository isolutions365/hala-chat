import { readFile } from 'node:fs/promises';
import { test, before, after } from 'node:test';
import assert from 'node:assert';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { ref, uploadBytes, getMetadata, deleteObject, getDownloadURL } from 'firebase/storage';

let env;
before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-hala-legacy-compatibility',
    storage: {
      host: '127.0.0.1',
      port: 9198,
      rules: await readFile('/app/applet/app/applet/storage.rules.candidate', 'utf8')
    }
  });
});

after(async () => {
  await env?.cleanup();
});

test('Legacy Compatibility & Create-Only Enforcement', async () => {
  const aliceStorage = env.authenticatedContext('alice').storage();
  const bobStorage = env.authenticatedContext('bob').storage();
  const assetPath = `media/alice/legacy-asset-${Date.now()}`;
  const avatarPath = `avatars/alice-avatar-${Date.now()}`;
  const metadata = { contentType: 'image/jpeg' };

  // 1. Alice creates new media — MUST PASS
  const aliceRef = ref(aliceStorage, assetPath);
  await assertSucceeds(uploadBytes(aliceRef, new Uint8Array(10), metadata));

  // 2. Bob reads Alice's media — MUST PASS (Legacy Auth policy)
  const bobRef = ref(bobStorage, assetPath);
  await assertSucceeds(getMetadata(bobRef));

  // 3. Alice cannot overwrite (resource == null check) — MUST FAIL
  await assertFails(uploadBytes(aliceRef, new Uint8Array(20), metadata));

  // 4. Alice deletes own object — MUST PASS
  await assertSucceeds(deleteObject(aliceRef));

  // 5. Alice creates again after deletion — MUST PASS
  await assertSucceeds(uploadBytes(aliceRef, new Uint8Array(10), metadata));

  // 6. Bob deletes Alice's object — MUST FAIL
  await assertFails(deleteObject(bobRef));

  // 7. Avatar rules unaffected — Alice updates avatar
  const avatarRef = ref(aliceStorage, avatarPath);
  await assertSucceeds(uploadBytes(avatarRef, new Uint8Array(100), { contentType: 'image/png' }));
  await assertSucceeds(uploadBytes(avatarRef, new Uint8Array(200), { contentType: 'image/png' })); // Avatars allow update

  // 8. MIME validation check
  const badMimeRef = ref(aliceStorage, `media/alice/bad-mime-${Date.now()}`);
  await assertFails(uploadBytes(badMimeRef, new Uint8Array(10), { contentType: 'application/x-executable' }));

  // 9. Size limit check
  const bigRef = ref(aliceStorage, `media/alice/big-${Date.now()}`);
  await assertFails(uploadBytes(bigRef, new Uint8Array(21 * 1024 * 1024), metadata));
});
