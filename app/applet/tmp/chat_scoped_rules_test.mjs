import { readFile } from 'node:fs/promises';
import { test, before, after, beforeEach } from 'node:test';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, setDoc } from 'firebase/firestore';
import { ref, uploadBytes, getMetadata, deleteObject } from 'firebase/storage';

let env;
const now = new Date().toISOString();

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-hala-chat-scoped',
    firestore: { host: '127.0.0.1', port: 8088 },
    storage: {
      host: '127.0.0.1',
      port: 9198,
      rules: await readFile('storage.rules.candidate.v3', 'utf8')
    }
  });
});

after(async () => {
  await env?.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    // 1-1 Chat
    await setDoc(doc(db, 'chats', 'chat_1to1'), {
      type: '1-1',
      participants: ['alice', 'bob'],
      updatedAt: now
    });
    // Group Chat
    await setDoc(doc(db, 'chats', 'chat_group'), {
      type: 'group',
      participants: ['alice', 'bob'],
      updatedAt: now
    });
    // Public Channel
    await setDoc(doc(db, 'chats', 'chat_pub_channel'), {
      type: 'channel',
      participants: ['admin'],
      createdBy: 'admin',
      isPublic: true,
      updatedAt: now
    });
    // Private Channel
    await setDoc(doc(db, 'chats', 'chat_priv_channel'), {
      type: 'channel',
      participants: ['admin'],
      createdBy: 'admin',
      isPublic: false,
      updatedAt: now
    });
    // Subscriber for private channel
    await setDoc(doc(db, 'channels', 'chat_priv_channel', 'subscribers', 'bob'), {
      user_id: 'bob',
      joined_at: now
    });
  });
});

test('Chat-Scoped Storage Rules: 1-1 Chat', async () => {
  const alice = env.authenticatedContext('alice').storage();
  const eve = env.authenticatedContext('eve').storage();
  const path = 'chats/chat_1to1/image/asset1';
  const meta = { contentType: 'image/jpeg', customMetadata: { uploaderUid: 'alice' } };

  // Alice (member) can upload
  await assertSucceeds(uploadBytes(ref(alice, path), new Uint8Array(10), meta));
  // Alice (member) can read
  await assertSucceeds(getMetadata(ref(alice, path)));
  // Eve (outsider) cannot read
  await assertFails(getMetadata(ref(eve, path)));
  // Eve (outsider) cannot upload
  await assertFails(uploadBytes(ref(eve, path + '2'), new Uint8Array(10), { ...meta, customMetadata: { uploaderUid: 'eve' } }));
});

test('Chat-Scoped Storage Rules: Group Chat Membership', async () => {
  const alice = env.authenticatedContext('alice').storage();
  const bob = env.authenticatedContext('bob').storage();
  const eve = env.authenticatedContext('eve').storage();
  const path = 'chats/chat_group/audio/voice1';
  const meta = { contentType: 'audio/webm', customMetadata: { uploaderUid: 'alice' } };

  await assertSucceeds(uploadBytes(ref(alice, path), new Uint8Array(10), meta));
  await assertSucceeds(getMetadata(ref(bob, path)));
  await assertFails(getMetadata(ref(eve, path)));

  // Removal test
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'chats', 'chat_group'), {
      type: 'group',
      participants: ['alice'],
      updatedAt: now
    });
  });
  // Bob is now removed
  await assertFails(getMetadata(ref(bob, path)));
});

test('Chat-Scoped Storage Rules: Channels', async () => {
  const admin = env.authenticatedContext('admin').storage();
  const bob = env.authenticatedContext('bob').storage();
  const eve = env.authenticatedContext('eve').storage();
  
  // Public channel read
  const pubPath = 'chats/chat_pub_channel/video/vid1';
  await assertSucceeds(uploadBytes(ref(admin, pubPath), new Uint8Array(10), { contentType: 'video/mp4', customMetadata: { uploaderUid: 'admin' } }));
  await assertSucceeds(getMetadata(ref(eve, pubPath))); // Authenticated users can read public channel media

  // Private channel subscriber read
  const privPath = 'chats/chat_priv_channel/document/doc1';
  await assertSucceeds(uploadBytes(ref(admin, privPath), new Uint8Array(10), { contentType: 'application/pdf', customMetadata: { uploaderUid: 'admin' } }));
  await assertSucceeds(getMetadata(ref(bob, privPath))); // Bob is subscriber
  await assertFails(getMetadata(ref(eve, privPath))); // Eve is not subscriber

  // Upload restrictions: Subscriber cannot upload
  await assertFails(uploadBytes(ref(bob, 'chats/chat_pub_channel/image/fail'), new Uint8Array(10), { contentType: 'image/png', customMetadata: { uploaderUid: 'bob' } }));
});

test('Chat-Scoped Storage Rules: Metadata & Security', async () => {
  const alice = env.authenticatedContext('alice').storage();
  const path = 'chats/chat_1to1/image/secure';
  const meta = { contentType: 'image/jpeg', customMetadata: { uploaderUid: 'alice' } };

  // Forged uploaderUid
  await assertFails(uploadBytes(ref(alice, path), new Uint8Array(10), { ...meta, customMetadata: { uploaderUid: 'bob' } }));
  
  // Missing metadata
  await assertFails(uploadBytes(ref(alice, path), new Uint8Array(10), { contentType: 'image/jpeg' }));

  // MIME mismatch
  await assertFails(uploadBytes(ref(alice, 'chats/chat_1to1/audio/mismatch'), new Uint8Array(10), { contentType: 'image/jpeg', customMetadata: { uploaderUid: 'alice' } }));

  // Overwrite protection
  await assertSucceeds(uploadBytes(ref(alice, path), new Uint8Array(10), meta));
  await assertFails(uploadBytes(ref(alice, path), new Uint8Array(20), meta));

  // Client delete denial
  await assertFails(deleteObject(ref(alice, path)));
});
