import { readFile } from 'node:fs/promises';
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} from '@firebase/rules-unit-testing';
import { ref, uploadBytes, getBytes } from 'firebase/storage';

// These are compatibility/characterization tests for the CURRENT repository rules.
// They intentionally document the current authenticated cross-user read behavior;
// they do not claim that this access model is the desired final security policy.
let env;

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-hala-media-compat',
    storage: {
      host: '127.0.0.1',
      port: 9198,
      rules: await readFile('storage.rules', 'utf8'),
    },
  });
});

after(async () => {
  await env?.cleanup();
});

beforeEach(async () => {
  await env.clearStorage();
});

const storageFor = (uid) =>
  uid
    ? env.authenticatedContext(uid).storage()
    : env.unauthenticatedContext().storage();

test('legacy media path used by upload code remains owner-writable', async () => {
  const alice = storageFor('alice');
  const path = 'media/alice/compatibility-asset';
  const bytes = new Uint8Array([1, 2, 3, 4]);

  await assertSucceeds(
    uploadBytes(ref(alice, path), bytes, {
      contentType: 'application/octet-stream',
      customMetadata: { uploaderUid: 'alice', originalName: 'sample.bin' },
    }),
  );

  await assertSucceeds(getBytes(ref(alice, path)));
});

test('current legacy media rules allow another signed-in user to read ciphertext', async () => {
  const alice = storageFor('alice');
  const bob = storageFor('bob');
  const anonymous = storageFor(null);
  const path = 'media/alice/recipient-compatibility-check';
  const ciphertext = new Uint8Array([9, 8, 7, 6]);

  await assertSucceeds(
    uploadBytes(ref(alice, path), ciphertext, {
      contentType: 'application/octet-stream',
      customMetadata: { uploaderUid: 'alice' },
    }),
  );

  // This is current behavior, not an endorsement: the rule is auth-only.
  // E2EE decryption still requires the conversation key on the client.
  const download = getBytes(ref(bob, path));
  await assertSucceeds(download);
  const received = await download;
  assert.deepEqual(Array.from(new Uint8Array(received)), Array.from(ciphertext));

  await assertFails(getBytes(ref(anonymous, path)));
});

test('a different user cannot upload into another user media namespace', async () => {
  const bob = storageFor('bob');
  const path = 'media/alice/forged-owner-upload';

  await assertFails(
    uploadBytes(ref(bob, path), new Uint8Array([1, 2, 3]), {
      contentType: 'application/octet-stream',
      customMetadata: { uploaderUid: 'bob' },
    }),
  );
});
