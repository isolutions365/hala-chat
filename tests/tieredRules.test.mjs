import { readFile } from 'node:fs/promises';
import { test, before, after, beforeEach } from 'node:test';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, getDocs, updateDoc, collection, serverTimestamp } from 'firebase/firestore';

let env;
const now = '2026-10-02T10:00:00.000Z';

const sampleProfile = (id, phone = '+966500000000', email = null) => ({
  id,
  name: id,
  phone,
  avatar_url: null,
  status: 'Hello',
  created_at: now,
  last_seen: now,
  ...(email ? { email, email_verified: true, emailVerified: true } : {})
});

const samplePublic = (id) => ({
  id,
  name: id,
  avatar_url: null,
  status: 'Hello',
  public_key: '',
  publicKeyFingerprint: ''
});

const sampleChat = () => ({
  type: '1-1',
  participants: ['phoneUser', 'linkedUser'],
  participantDetails: { phoneUser: { name: 'phoneUser' }, linkedUser: { name: 'linkedUser' } },
  unreadCount: { phoneUser: 0, linkedUser: 0 },
  typing: { phoneUser: false, linkedUser: false },
  lastMessage: null,
  createdAt: now,
  updatedAt: now
});

const sampleMessage = (senderId) => ({
  senderId,
  senderName: senderId,
  content: 'Hello',
  type: 'text',
  status: 'sent',
  timestamp: now,
  readBy: [],
  reactions: {},
  deletedFor: []
});

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-hala-tiered-rules',
    firestore: {
      host: '127.0.0.1',
      port: 8088,
      rules: await readFile('firestore.rules', 'utf8')
    }
  });
});

after(async () => {
  await env?.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const d = ctx.firestore();
    await setDoc(doc(d, 'users', 'phoneUser'), sampleProfile('phoneUser', '+966500000000'));
    await setDoc(doc(d, 'users_public', 'phoneUser'), samplePublic('phoneUser'));
    await setDoc(doc(d, 'users_public', 'emailUser'), samplePublic('emailUser'));
    await setDoc(doc(d, 'chats', 'c1'), sampleChat());
  });
});

const getDb = (authCtx) => {
  if (!authCtx) return env.unauthenticatedContext().firestore();
  return env.authenticatedContext(authCtx.uid, authCtx.token || {}).firestore();
};

test('1. Unverified email user is denied everywhere (chats, social, users)', async () => {
  const db = getDb({ uid: 'unverifiedUser', token: { email: 'unverified@test.com', email_verified: false } });
  
  await assertFails(getDoc(doc(db, 'chats', 'c1')));
  await assertFails(getDocs(collection(db, 'social_posts')));
  await assertFails(getDoc(doc(db, 'stories', 's1')));
  await assertFails(setDoc(doc(db, 'users', 'unverifiedUser'), sampleProfile('unverifiedUser', '+966500000099')));
});

test('2. Verified email-only user is denied on chats, messages, calls', async () => {
  const db = getDb({ uid: 'emailUser', token: { email: 'email@test.com', email_verified: true } });

  await assertFails(getDoc(doc(db, 'chats', 'c1')));
  await assertFails(setDoc(doc(db, 'chats', 'c1', 'messages', 'm1'), sampleMessage('emailUser')));
  await assertFails(getDoc(doc(db, 'calls', 'call1')));
});

test('3. Verified email-only user CAN create own user doc and social post', async () => {
  const db = getDb({ uid: 'emailUser', token: { email: 'email@test.com', email_verified: true } });

  // Create own user profile with phone: ''
  const emailProfile = {
    id: 'emailUser',
    name: 'emailUser',
    phone: '',
    avatar_url: null,
    status: 'Hello',
    created_at: now,
    last_seen: now,
    email: 'email@test.com',
    email_verified: true
  };
  await assertSucceeds(setDoc(doc(db, 'users', 'emailUser'), emailProfile));
  await assertSucceeds(setDoc(doc(db, 'users_public', 'emailUser'), samplePublic('emailUser')));

  // Create social post
  const post = {
    authorId: 'emailUser',
    authorName: 'emailUser',
    text: 'Hello world',
    imageUrl: '',
    createdAt: serverTimestamp(),
    likes: {}
  };
  await assertSucceeds(setDoc(doc(db, 'social_posts', 'p1'), post));
});

test('4. Phone user functions unchanged', async () => {
  const db = getDb({ uid: 'phoneUser', token: { phone_number: '+966500000000' } });

  await assertSucceeds(getDoc(doc(db, 'chats', 'c1')));
  await assertSucceeds(setDoc(doc(db, 'chats', 'c1', 'messages', 'm2'), sampleMessage('phoneUser')));
});
