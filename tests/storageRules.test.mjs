import { readFile } from 'node:fs/promises';
import { test, before, after } from 'node:test';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { ref, uploadBytes } from 'firebase/storage';

let env;
const MiB = 1024 * 1024;
const storageFor = uid => env.authenticatedContext(uid).storage();

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-hala-storage-rules',
    storage: {
      host: '127.0.0.1',
      port: 9198,
      rules: await readFile('storage.rules', 'utf8')
    }
  });
});

after(async () => {
  await env?.cleanup();
});

test('legacy media path accepts encrypted 100 MiB payload plus client overhead', async () => {
  const bytes = new Uint8Array(100 * MiB + 64 * 1024);
  const file = ref(storageFor('alice'), 'media/alice/large-chat-media');
  await assertSucceeds(uploadBytes(file, bytes, { contentType: 'application/octet-stream' }));
});

test('legacy media path rejects files above the 101 MiB Storage ceiling', async () => {
  const bytes = new Uint8Array(101 * MiB + 1);
  const file = ref(storageFor('alice'), 'media/alice/oversized-chat-media');
  await assertFails(uploadBytes(file, bytes, { contentType: 'application/octet-stream' }));
});

test('legacy media uploads remain owner-scoped', async () => {
  const file = ref(storageFor('bob'), 'media/alice/not-owned');
  await assertFails(uploadBytes(file, new Uint8Array([1]), { contentType: 'application/octet-stream' }));
});
