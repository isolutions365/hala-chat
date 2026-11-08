import { readFile } from 'node:fs/promises';
import { test, before, after, beforeEach } from 'node:test';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, setDoc, deleteDoc } from 'firebase/firestore';
import { ref, uploadBytes, getMetadata } from 'firebase/storage';

let env;
const now = new Date().toISOString();

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-hala-chat-scoped-v4',
    firestore: { host: '127.0.0.1', port: 8088 },
    storage: {
      host: '127.0.0.1', port: 9198,
      rules: await readFile('/app/applet/storage.rules.candidate.v4', 'utf8')
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
    // Private 1:1
    await setDoc(doc(db, 'chats', 'chat_1to1'), {
      type: '1-1',
      participants: ['alice', 'bob']
    });
    // Group
    await setDoc(doc(db, 'chats', 'chat_group'), {
      type: 'group',
      participants: ['alice', 'bob']
    });
    // Public Channel (only admins can post)
    await setDoc(doc(db, 'chats', 'channel_pub'), {
      type: 'channel',
      participants: ['admin'],
      isPublic: true,
      allowMemberPosts: false
    });
    // Private Channel (subscribers can post)
    await setDoc(doc(db, 'chats', 'channel_priv_open'), {
      type: 'channel',
      participants: ['admin'],
      isPublic: false,
      allowMemberPosts: true
    });
    // Subscriber for private channel
    await setDoc(doc(db, 'channels', 'channel_priv_open', 'subscribers', 'bob'), {
      user_id: 'bob'
    });
  });
});

test('Corrected Rules v4: Private & Group Authorization', async () => {
  const alice = env.authenticatedContext('alice').storage();
  const eve = env.authenticatedContext('eve').storage();
  const path = 'chats/chat_1to1/image/img1';
  const meta = { contentType: 'image/png', customMetadata: { uploaderUid: 'alice' } };

  // Alice can upload and read
  await assertSucceeds(uploadBytes(ref(alice, path), new Uint8Array(1), meta));
  await assertSucceeds(getMetadata(ref(alice, path)));
  // Eve denied
  await assertFails(getMetadata(ref(eve, path)));
  
  // Group removal
  const groupPath = 'chats/chat_group/audio/v1';
  await assertSucceeds(uploadBytes(ref(alice, groupPath), new Uint8Array(1), { ...meta, contentType: 'audio/webm' }));
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'chats', 'chat_group'), { type: 'group', participants: ['alice'] });
  });
  // Bob (removed) denied
  await assertFails(getMetadata(env.authenticatedContext('bob').storage(), groupPath));
});

test('Corrected Rules v4: Channel Subscriber Policy', async () => {
  const admin = env.authenticatedContext('admin').storage();
  const bob = env.authenticatedContext('bob').storage();
  const eve = env.authenticatedContext('eve').storage();

  // Public channel read for all auth users
  const pubPath = 'chats/channel_pub/video/v1';
  await assertSucceeds(uploadBytes(ref(admin, pubPath), new Uint8Array(1), { contentType: 'video/mp4', customMetadata: { uploaderUid: 'admin' } }));
  await assertSucceeds(getMetadata(ref(eve, pubPath)));

  // Private channel subscriber read
  const privPath = 'chats/channel_priv_open/document/d1';
  await assertSucceeds(uploadBytes(ref(admin, privPath), new Uint8Array(1), { contentType: 'application/pdf', customMetadata: { uploaderUid: 'admin' } }));
  await assertSucceeds(getMetadata(ref(bob, privPath)));
  await assertFails(getMetadata(ref(eve, privPath)));

  // Subscriber upload if allowMemberPosts is true
  await assertSucceeds(uploadBytes(ref(bob, 'chats/channel_priv_open/image/bob_img'), new Uint8Array(1), { contentType: 'image/jpeg', customMetadata: { uploaderUid: 'bob' } }));
  
  // Subscriber upload if allowMemberPosts is false (Public Channel)
  await assertFails(uploadBytes(ref(bob, 'chats/channel_pub/image/fail'), new Uint8Array(1), { contentType: 'image/jpeg', customMetadata: { uploaderUid: 'bob' } }));
});

test('Corrected Rules v4: Adversarial & General Restrictions', async () => {
  const alice = env.authenticatedContext('alice').storage();
  const path = 'chats/chat_1to1/image/adv';
  const meta = { contentType: 'image/png', customMetadata: { uploaderUid: 'alice' } };

  // Forged uploaderUid
  await assertFails(uploadBytes(ref(alice, path), new Uint8Array(1), { ...meta, customMetadata: { uploaderUid: 'bob' } }));
  
  // MIME/Path mismatch
  await assertFails(uploadBytes(ref(alice, 'chats/chat_1to1/audio/wrong'), new Uint8Array(1), meta));

  // Overwrite protection
  await assertSucceeds(uploadBytes(ref(alice, path), new Uint8Array(1), meta));
  await assertFails(uploadBytes(ref(alice, path), new Uint8Array(2), meta));
  
  // Anonymous access
  const anon = env.unauthenticatedContext().storage();
  await assertFails(getMetadata(ref(anon, path)));
});
