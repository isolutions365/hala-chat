import { test, before, after } from 'node:test';
import { readFile } from 'node:fs/promises';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, setDoc } from 'firebase/firestore';

let env;
const now = '2026-11-12T20:00:00.000Z';
const db = (uid) => env.authenticatedContext(uid, { phone_number: '+966500000000' }).firestore();

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-hala-location-rules',
    firestore: {
      host: '127.0.0.1',
      port: 8088,
      rules: await readFile('firestore.rules', 'utf8')
    }
  });
  await env.withSecurityRulesDisabled(async (ctx) => {
    const d = ctx.firestore();
    for (const uid of ['alice', 'bob', 'eve']) {
      await setDoc(doc(d, 'users', uid), {
        id: uid, name: uid, phone: '+966500000000', avatar_url: null,
        status: 'Hello', created_at: now, last_seen: now
      });
    }
    await setDoc(doc(d, 'chats', 'location-private'), {
      type: '1-1',
      participants: ['alice', 'bob'],
      participantDetails: { alice: { name: 'Alice' }, bob: { name: 'Bob' } },
      unreadCount: { alice: 0, bob: 0 },
      typing: { alice: false, bob: false },
      lastMessage: null,
      createdAt: now,
      updatedAt: now
    });
  });
});

after(async () => { await env?.cleanup(); });

test('chat member can send an encrypted location message', async () => {
  const message = {
    senderId: 'alice',
    senderName: 'Alice',
    content: 'e2ee:v1:encrypted-location-payload',
    type: 'location',
    status: 'sent',
    timestamp: now,
    readBy: [],
    deliveredTo: [],
    reactions: {},
    reactionsBy: {},
    pollVotes: {},
    deletedFor: []
  };
  await assertSucceeds(setDoc(doc(db('alice'), 'chats', 'location-private', 'messages', 'loc-1'), message));
});

test('non-member cannot send a location message into another chat', async () => {
  const message = {
    senderId: 'eve',
    senderName: 'Eve',
    content: 'e2ee:v1:encrypted-location-payload',
    type: 'location',
    status: 'sent',
    timestamp: now,
    readBy: [],
    deliveredTo: [],
    reactions: {},
    reactionsBy: {},
    pollVotes: {},
    deletedFor: []
  };
  await assertFails(setDoc(doc(db('eve'), 'chats', 'location-private', 'messages', 'loc-2'), message));
});
