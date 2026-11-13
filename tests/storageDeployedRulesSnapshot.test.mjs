import { readFile } from 'node:fs/promises';
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} from '@firebase/rules-unit-testing';
import { ref, uploadBytes, getBytes, deleteObject } from 'firebase/storage';

// Snapshot of the Storage rules the project owner pasted from Firebase Console
// on 2026-11-13. Update this fixture only after re-checking the deployed rules.
let env;

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-hala-deployed-storage-rules',
    storage: {
      host: '127.0.0.1',
      port: 9198,
      rules: await readFile('tests/fixtures/storage.deployed.rules', 'utf8'),
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

test('deployed avatar rule enforces owner-prefixed filenames and image types', async () => {
  const alice = storageFor('alice');
  const bob = storageFor('bob');
  const avatarPath = 'avatars/alice_1731500000000.jpg';
  const image = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);

  await assertSucceeds(uploadBytes(ref(alice, avatarPath), image, {
    contentType: 'image/jpeg',
  }));

  await assertFails(uploadBytes(ref(bob, 'avatars/alice_1731500000001.jpg'), image, {
    contentType: 'image/jpeg',
  }));

  await assertFails(uploadBytes(ref(alice, 'avatars/alice_bad.svg'), image, {
    contentType: 'image/svg+xml',
  }));

  // Deployed rules grant create but not update. The app's timestamped avatar
  // filenames avoid overwriting an existing object.
  await assertFails(uploadBytes(ref(alice, avatarPath), image, {
    contentType: 'image/jpeg',
  }));
});

test('deployed avatar rule permits authenticated get, but only owner may delete', async () => {
  const alice = storageFor('alice');
  const bob = storageFor('bob');
  const anonymous = storageFor(null);
  const avatarPath = 'avatars/alice_1731500000002.jpg';

  await assertSucceeds(uploadBytes(ref(alice, avatarPath), new Uint8Array([1, 2, 3]), {
    contentType: 'image/jpeg',
  }));

  await assertSucceeds(getBytes(ref(bob, avatarPath)));
  await assertFails(getBytes(ref(anonymous, avatarPath)));
  await assertFails(deleteObject(ref(bob, avatarPath)));
  await assertSucceeds(deleteObject(ref(alice, avatarPath)));
});

test('deployed media rule keeps existing authenticated recipient download compatibility', async () => {
  const alice = storageFor('alice');
  const bob = storageFor('bob');
  const anonymous = storageFor(null);
  const mediaPath = 'media/alice/encrypted-asset';
  const ciphertext = new Uint8Array([11, 22, 33, 44]);

  await assertSucceeds(uploadBytes(ref(alice, mediaPath), ciphertext, {
    contentType: 'application/octet-stream',
    customMetadata: { uploaderUid: 'alice' },
  }));

  const download = getBytes(ref(bob, mediaPath));
  await assertSucceeds(download);
  const received = await download;
  assert.deepEqual(Array.from(new Uint8Array(received)), Array.from(ciphertext));
  await assertFails(getBytes(ref(anonymous, mediaPath)));
});

test('deployed media rule rejects cross-owner writes and overwrites', async () => {
  const alice = storageFor('alice');
  const bob = storageFor('bob');
  const mediaPath = 'media/alice/one-time-asset';

  await assertFails(uploadBytes(ref(bob, mediaPath), new Uint8Array([1, 2]), {
    contentType: 'application/octet-stream',
  }));

  await assertSucceeds(uploadBytes(ref(alice, mediaPath), new Uint8Array([1, 2]), {
    contentType: 'application/octet-stream',
  }));

  await assertFails(uploadBytes(ref(alice, mediaPath), new Uint8Array([3, 4]), {
    contentType: 'application/octet-stream',
  }));
});
