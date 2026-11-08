import { readFile } from 'node:fs/promises';
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, setDoc, deleteDoc } from 'firebase/firestore';
import { ref, uploadBytes, getBytes, getMetadata, deleteObject } from 'firebase/storage';

let env;
const now = '2026-11-07T12:00:00.000Z';

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'gen-lang-client-0446181078',
    firestore: {
      host: '127.0.0.1',
      port: 8088,
      rules: await readFile('firestore.rules', 'utf8')
    },
    storage: {
      host: '127.0.0.1',
      port: 9198,
      rules: await readFile('storage.rules', 'utf8')
    }
  });
});

after(async () => {
  if (env) {
    await env.cleanup();
  }
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.clearStorage();
});

// Helper for storage context
const getStorage = (uid) => uid ? env.authenticatedContext(uid).storage() : env.unauthenticatedContext().storage();

// Helper to seed Firestore chat & subscriber documents with rules disabled
async function seedChat(chatId, data) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'chats', chatId), data);
  });
}

async function seedSubscriber(channelId, subscriberUid) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'channels', channelId, 'subscribers', subscriberUid), {
      channel_id: channelId,
      user_id: subscriberUid,
      joined_at: now
    });
  });
}

// 1. Authorized 1:1 chat participant upload and read
test('1. Authorized 1:1 chat participant upload and read', async () => {
  await seedChat('chat_1to1', {
    type: '1-1',
    participants: ['alice', 'bob'],
    createdAt: now
  });

  const aliceStorage = getStorage('alice');
  const bobStorage = getStorage('bob');
  const path = 'chats/chat_1to1/images/photo.png';
  const data = new Uint8Array([1, 2, 3, 4]);

  // Alice uploads with valid metadata
  await assertSucceeds(uploadBytes(ref(aliceStorage, path), data, {
    contentType: 'image/png',
    customMetadata: { uploaderUid: 'alice' }
  }));

  // Bob (participant) reads
  await assertSucceeds(getBytes(ref(bobStorage, path)));
  await assertSucceeds(getMetadata(ref(bobStorage, path)));
});

// 2. Unauthorized non-participant upload and read rejection
test('2. Unauthorized non-participant upload and read rejection', async () => {
  await seedChat('chat_1to1_locked', {
    type: '1-1',
    participants: ['alice', 'bob'],
    createdAt: now
  });

  const aliceStorage = getStorage('alice');
  const eveStorage = getStorage('eve');
  const anonStorage = getStorage(null);
  const path = 'chats/chat_1to1_locked/images/secret.png';
  const data = new Uint8Array([1, 2, 3]);

  // Seed file as Alice
  await assertSucceeds(uploadBytes(ref(aliceStorage, path), data, {
    contentType: 'image/png',
    customMetadata: { uploaderUid: 'alice' }
  }));

  // Eve attempts to read -> FAIL
  await assertFails(getBytes(ref(eveStorage, path)));

  // Anonymous attempts to read -> FAIL
  await assertFails(getBytes(ref(anonStorage, path)));

  // Eve attempts to upload -> FAIL
  await assertFails(uploadBytes(ref(eveStorage, 'chats/chat_1to1_locked/images/eve.png'), data, {
    contentType: 'image/png',
    customMetadata: { uploaderUid: 'eve' }
  }));

  // Anonymous attempts to upload -> FAIL
  await assertFails(uploadBytes(ref(anonStorage, 'chats/chat_1to1_locked/images/anon.png'), data, {
    contentType: 'image/png',
    customMetadata: { uploaderUid: 'anon' }
  }));
});

// 3. Authorized group member upload and read
test('3. Authorized group member upload and read', async () => {
  await seedChat('group_project', {
    type: 'group',
    participants: ['alice', 'bob', 'charlie'],
    createdBy: 'alice',
    createdAt: now
  });

  const charlieStorage = getStorage('charlie');
  const bobStorage = getStorage('bob');
  const path = 'chats/group_project/voice/update.webm';
  const data = new Uint8Array([10, 20, 30]);

  // Charlie uploads voice note
  await assertSucceeds(uploadBytes(ref(charlieStorage, path), data, {
    contentType: 'audio/webm',
    customMetadata: { uploaderUid: 'charlie' }
  }));

  // Bob reads
  await assertSucceeds(getBytes(ref(bobStorage, path)));
});

// 4. Removed group member access rejection
test('4. Removed group member access rejection', async () => {
  // Initially Charlie is in group
  await seedChat('group_dyn', {
    type: 'group',
    participants: ['alice', 'bob', 'charlie'],
    createdAt: now
  });

  const charlieStorage = getStorage('charlie');
  const path = 'chats/group_dyn/images/board.png';
  const data = new Uint8Array([5, 6, 7]);

  // Alice uploads while Charlie is member
  const aliceStorage = getStorage('alice');
  await assertSucceeds(uploadBytes(ref(aliceStorage, path), data, {
    contentType: 'image/png',
    customMetadata: { uploaderUid: 'alice' }
  }));

  // Charlie can read
  await assertSucceeds(getBytes(ref(charlieStorage, path)));

  // Now Charlie is removed from participants
  await seedChat('group_dyn', {
    type: 'group',
    participants: ['alice', 'bob'],
    createdAt: now
  });

  // Charlie can no longer read existing media
  await assertFails(getBytes(ref(charlieStorage, path)));

  // Charlie cannot upload new media
  await assertFails(uploadBytes(ref(charlieStorage, 'chats/group_dyn/documents/spec.pdf'), data, {
    contentType: 'application/pdf',
    customMetadata: { uploaderUid: 'charlie' }
  }));
});

// 5. Channel subscriber access
test('5. Channel subscriber access', async () => {
  // Private channel
  await seedChat('channel_private_1', {
    type: 'channel',
    isPublic: false,
    participants: ['alice'],
    createdAt: now
  });

  // Bob is subscriber in subcollection
  await seedSubscriber('channel_private_1', 'bob');

  const aliceStorage = getStorage('alice');
  const bobStorage = getStorage('bob');
  const path = 'chats/channel_private_1/images/announcement.jpg';
  const data = new Uint8Array([1, 2, 3]);

  // Alice uploads
  await assertSucceeds(uploadBytes(ref(aliceStorage, path), data, {
    contentType: 'image/jpeg',
    customMetadata: { uploaderUid: 'alice' }
  }));

  // Bob (subscriber) can read
  await assertSucceeds(getBytes(ref(bobStorage, path)));
});

// 6. Non-subscriber access rejection for private channels
test('6. Non-subscriber access rejection for private channels', async () => {
  await seedChat('channel_private_locked', {
    type: 'channel',
    isPublic: false,
    participants: ['alice'],
    createdAt: now
  });

  const aliceStorage = getStorage('alice');
  const eveStorage = getStorage('eve');
  const path = 'chats/channel_private_locked/documents/secret.pdf';
  const data = new Uint8Array([1, 2]);

  // Alice uploads
  await assertSucceeds(uploadBytes(ref(aliceStorage, path), data, {
    contentType: 'application/pdf',
    customMetadata: { uploaderUid: 'alice' }
  }));

  // Eve (not subscriber, not participant) cannot read
  await assertFails(getBytes(ref(eveStorage, path)));

  // Eve cannot upload
  await assertFails(uploadBytes(ref(eveStorage, 'chats/channel_private_locked/images/eve.jpg'), data, {
    contentType: 'image/jpeg',
    customMetadata: { uploaderUid: 'eve' }
  }));
});

// 7. Public channel access according to actual application policy
test('7. Public channel access according to actual application policy', async () => {
  await seedChat('channel_public_news', {
    type: 'channel',
    isPublic: true,
    participants: ['alice'],
    createdAt: now
  });

  const aliceStorage = getStorage('alice');
  const eveStorage = getStorage('eve'); // authenticated non-subscriber
  const anonStorage = getStorage(null);
  const path = 'chats/channel_public_news/images/broadcast.png';
  const data = new Uint8Array([1, 2, 3, 4]);

  // Alice uploads
  await assertSucceeds(uploadBytes(ref(aliceStorage, path), data, {
    contentType: 'image/png',
    customMetadata: { uploaderUid: 'alice' }
  }));

  // Authenticated non-subscriber Eve can read public channel media
  await assertSucceeds(getBytes(ref(eveStorage, path)));

  // Unauthenticated caller: Current storage.rules permits public read for public channels (open broadcast)
  await assertSucceeds(getBytes(ref(anonStorage, path)));
});

// 8. Subscriber upload permission according to allowMemberPosts
test('8. Subscriber upload permission according to allowMemberPosts', async () => {
  // Case A: allowMemberPosts = false
  await seedChat('channel_readonly', {
    type: 'channel',
    isPublic: true,
    allowMemberPosts: false,
    participants: ['alice'],
    createdAt: now
  });
  await seedSubscriber('channel_readonly', 'bob');

  const bobStorage = getStorage('bob');
  const data = new Uint8Array([1, 2]);

  // Bob is subscriber, but allowMemberPosts is false -> upload DENIED
  await assertFails(uploadBytes(ref(bobStorage, 'chats/channel_readonly/images/bob_try.png'), data, {
    contentType: 'image/png',
    customMetadata: { uploaderUid: 'bob' }
  }));

  // Case B: allowMemberPosts = true
  await seedChat('channel_interactive', {
    type: 'channel',
    isPublic: true,
    allowMemberPosts: true,
    participants: ['alice'],
    createdAt: now
  });
  await seedSubscriber('channel_interactive', 'bob');

  // Bob is subscriber, allowMemberPosts is true -> upload ALLOWED
  await assertSucceeds(uploadBytes(ref(bobStorage, 'chats/channel_interactive/images/bob_post.png'), data, {
    contentType: 'image/png',
    customMetadata: { uploaderUid: 'bob' }
  }));

  // Eve is NOT subscriber -> upload DENIED even if allowMemberPosts is true
  const eveStorage = getStorage('eve');
  await assertFails(uploadBytes(ref(eveStorage, 'chats/channel_interactive/images/eve_post.png'), data, {
    contentType: 'image/png',
    customMetadata: { uploaderUid: 'eve' }
  }));
});

// 9. Forged uploaderUid rejection
test('9. Forged uploaderUid rejection', async () => {
  await seedChat('chat_forgery_test', {
    type: '1-1',
    participants: ['alice', 'bob'],
    createdAt: now
  });

  const aliceStorage = getStorage('alice');
  const data = new Uint8Array([1, 2, 3]);

  // Alice forges uploaderUid as 'bob' -> FAIL
  await assertFails(uploadBytes(ref(aliceStorage, 'chats/chat_forgery_test/images/forged.png'), data, {
    contentType: 'image/png',
    customMetadata: { uploaderUid: 'bob' }
  }));

  // Alice omits metadata entirely -> FAIL
  await assertFails(uploadBytes(ref(aliceStorage, 'chats/chat_forgery_test/images/nometa.png'), data, {
    contentType: 'image/png'
  }));

  // Alice provides empty customMetadata -> FAIL
  await assertFails(uploadBytes(ref(aliceStorage, 'chats/chat_forgery_test/images/emptymeta.png'), data, {
    contentType: 'image/png',
    customMetadata: {}
  }));
});

// 10. Cross-chat path manipulation rejection
test('10. Cross-chat path manipulation rejection', async () => {
  await seedChat('chat_target', {
    type: '1-1',
    participants: ['alice', 'bob'],
    createdAt: now
  });

  await seedChat('chat_other', {
    type: '1-1',
    participants: ['eve', 'mallory'],
    createdAt: now
  });

  const eveStorage = getStorage('eve');
  const data = new Uint8Array([1, 2, 3]);

  // Eve attempts to write to chat_target
  await assertFails(uploadBytes(ref(eveStorage, 'chats/chat_target/images/infiltrate.png'), data, {
    contentType: 'image/png',
    customMetadata: { uploaderUid: 'eve' }
  }));
});

// 11. Existing object overwrite rejection
test('11. Existing object overwrite rejection', async () => {
  await seedChat('chat_overwrite', {
    type: '1-1',
    participants: ['alice', 'bob'],
    createdAt: now
  });

  const aliceStorage = getStorage('alice');
  const path = 'chats/chat_overwrite/images/original.png';
  const data1 = new Uint8Array([1, 1, 1]);
  const data2 = new Uint8Array([2, 2, 2]);

  // First upload succeeds
  await assertSucceeds(uploadBytes(ref(aliceStorage, path), data1, {
    contentType: 'image/png',
    customMetadata: { uploaderUid: 'alice' }
  }));

  // Second upload to exact same path fails (resource == null check)
  await assertFails(uploadBytes(ref(aliceStorage, path), data2, {
    contentType: 'image/png',
    customMetadata: { uploaderUid: 'alice' }
  }));
});

// 12. Client-side delete rejection for V5 chat media
test('12. Client-side delete rejection for V5 chat media', async () => {
  await seedChat('chat_delete_test', {
    type: '1-1',
    participants: ['alice', 'bob'],
    createdAt: now
  });

  const aliceStorage = getStorage('alice');
  const bobStorage = getStorage('bob');
  const path = 'chats/chat_delete_test/images/permanent.png';
  const data = new Uint8Array([1, 2, 3]);

  // Upload succeeds
  await assertSucceeds(uploadBytes(ref(aliceStorage, path), data, {
    contentType: 'image/png',
    customMetadata: { uploaderUid: 'alice' }
  }));

  // Alice cannot delete
  await assertFails(deleteObject(ref(aliceStorage, path)));

  // Bob cannot delete
  await assertFails(deleteObject(ref(bobStorage, path)));
});

// 13. Legacy /media/{uid}/{assetId} compatibility
test('13. Legacy /media/{uid}/{assetId} compatibility', async () => {
  const aliceStorage = getStorage('alice');
  const bobStorage = getStorage('bob');
  const anonStorage = getStorage(null);
  const path = 'media/alice/legacy_asset_001';
  const data = new Uint8Array([10, 20, 30]);

  // Alice creates her legacy asset with valid legacy content type
  await assertSucceeds(uploadBytes(ref(aliceStorage, path), data, {
    contentType: 'image/jpeg'
  }));

  // Bob (authenticated) can read for client decryption
  await assertSucceeds(getBytes(ref(bobStorage, path)));

  // Anonymous read is denied
  await assertFails(getBytes(ref(anonStorage, path)));

  // Bob cannot write to Alice's legacy path
  await assertFails(uploadBytes(ref(bobStorage, 'media/alice/imposter'), data, {
    contentType: 'image/jpeg'
  }));

  // Alice cannot overwrite existing asset
  await assertFails(uploadBytes(ref(aliceStorage, path), data, {
    contentType: 'image/jpeg'
  }));

  // Bob cannot delete Alice's legacy asset
  await assertFails(deleteObject(ref(bobStorage, path)));

  // Alice CAN delete her own legacy asset
  await assertSucceeds(deleteObject(ref(aliceStorage, path)));
});

// 14. Avatar ownership and unauthorized overwrite/delete behavior
test('14. Avatar ownership and unauthorized overwrite/delete behavior', async () => {
  const aliceStorage = getStorage('alice');
  const anonStorage = getStorage(null);
  const path = 'avatars/alice_avatar.jpg';
  const data = new Uint8Array([1, 2, 3]);

  // Authenticated user creates avatar
  await assertSucceeds(uploadBytes(ref(aliceStorage, path), data, {
    contentType: 'image/jpeg'
  }));

  // Authenticated user can read avatar
  const bobStorage = getStorage('bob');
  await assertSucceeds(getBytes(ref(bobStorage, path)));

  // Anonymous read is denied
  await assertFails(getBytes(ref(anonStorage, path)));

  // Anonymous write is denied
  await assertFails(uploadBytes(ref(anonStorage, 'avatars/anon.jpg'), data, {
    contentType: 'image/jpeg'
  }));

  // Oversized avatar (> 5MB) is denied
  const oversizedData = new Uint8Array(5 * 1024 * 1024 + 10);
  await assertFails(uploadBytes(ref(aliceStorage, 'avatars/huge.jpg'), oversizedData, {
    contentType: 'image/jpeg'
  }));

  // Authenticated user can update/delete avatar
  await assertSucceeds(uploadBytes(ref(aliceStorage, path), new Uint8Array([4, 5, 6]), {
    contentType: 'image/jpeg'
  }));
  await assertSucceeds(deleteObject(ref(aliceStorage, path)));
});

// 15. Call recording participant authorization and overwrite protection
test('15. Call recording participant authorization and overwrite protection', async () => {
  const aliceStorage = getStorage('alice');
  const bobStorage = getStorage('bob');
  const anonStorage = getStorage(null);
  const path = 'call_recordings/call_abc123.mp4';
  const data = new Uint8Array([1, 2, 3, 4]);

  // Signed in user uploads call recording
  await assertSucceeds(uploadBytes(ref(aliceStorage, path), data, {
    contentType: 'video/mp4'
  }));

  // Signed in user can read call recording
  await assertSucceeds(getBytes(ref(bobStorage, path)));

  // Anonymous cannot read call recording
  await assertFails(getBytes(ref(anonStorage, path)));

  // Overwriting call recording is DENIED (resource == null check)
  await assertFails(uploadBytes(ref(aliceStorage, path), data, {
    contentType: 'video/mp4'
  }));

  // Client deletion of call recording is DENIED (allow delete: if false)
  await assertFails(deleteObject(ref(aliceStorage, path)));

  // Oversized call recording (> 50MB) is DENIED
  const hugeRec = new Uint8Array(50 * 1024 * 1024 + 10);
  await assertFails(uploadBytes(ref(aliceStorage, 'call_recordings/huge.mp4'), hugeRec, {
    contentType: 'video/mp4'
  }));
});

// 16. Stories and social media compatibility
test('16. Stories and social media compatibility', async () => {
  // Stories and social feed route to /media/{uid}/{assetId}
  const aliceStorage = getStorage('alice');
  const bobStorage = getStorage('bob');
  const storyPath = 'media/alice/story_post_1001.webp';
  const socialPath = 'media/alice/social_post_2002.jpg';
  const data = new Uint8Array([10, 20, 30, 40]);

  // Alice uploads story media
  await assertSucceeds(uploadBytes(ref(aliceStorage, storyPath), data, {
    contentType: 'image/webp'
  }));

  // Alice uploads social feed media
  await assertSucceeds(uploadBytes(ref(aliceStorage, socialPath), data, {
    contentType: 'image/jpeg'
  }));

  // Bob reads story media
  await assertSucceeds(getBytes(ref(bobStorage, storyPath)));

  // Bob reads social post media
  await assertSucceeds(getBytes(ref(bobStorage, socialPath)));

  // Eve cannot write to Alice's story/social path
  const eveStorage = getStorage('eve');
  await assertFails(uploadBytes(ref(eveStorage, 'media/alice/hacked_story.webp'), data, {
    contentType: 'image/webp'
  }));
});
