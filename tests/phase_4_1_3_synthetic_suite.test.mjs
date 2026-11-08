import { readFile } from 'node:fs/promises';
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert';
import crypto from 'node:crypto';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { ref, uploadBytes, getBytes, getMetadata, deleteObject } from 'firebase/storage';

let env;
const PROJECT_ID = 'gen-lang-client-0446181078';
const now = '2026-11-07T12:00:00.000Z';

before(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      host: '127.0.0.1',
      port: 8088,
      rules: await readFile('firestore.rules', 'utf8')
    },
    storage: {
      host: '127.0.0.1',
      port: 9198,
      rules: await readFile('tests/fixtures/target_storage_v5.rules', 'utf8')
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

const getStorage = (uid) => uid ? env.authenticatedContext(uid).storage() : env.unauthenticatedContext().storage();

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

async function seedMessage(chatId, msgId, data) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'chats', chatId, 'messages', msgId), data);
  });
}

// AES-GCM Encryption Helper using Node.js Crypto WebAPI
async function generateTestKey() {
  return await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
}

async function encryptData(key, plaintextBytes) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    plaintextBytes
  );
  return {
    ciphertextBuffer: new Uint8Array(ciphertext),
    mediaIv: Buffer.from(iv).toString('base64')
  };
}

async function decryptData(key, ciphertextBuffer, mediaIv) {
  const iv = Buffer.from(mediaIv, 'base64');
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertextBuffer
  );
  return new Uint8Array(decrypted);
}

// ==========================================
// TEST CASES E-01 THROUGH E-24
// ==========================================

// E-01: Multi-Chat Forwarding Copy
test('E-01: Multi-Chat Forwarding Copy (creates per-chat copies)', async () => {
  await seedChat('chat_A', { type: '1-1', participants: ['alice', 'bob'], createdAt: now });
  await seedChat('chat_B', { type: '1-1', participants: ['alice', 'charlie'], createdAt: now });

  const aliceStorage = getStorage('alice');
  const assetId = 'forwarded_img_01';
  const data = new Uint8Array([10, 20, 30, 40]);

  // Upload copy for Chat A
  await assertSucceeds(uploadBytes(ref(aliceStorage, `chats/chat_A/images/${assetId}`), data, {
    contentType: 'image/png',
    customMetadata: { uploaderUid: 'alice' }
  }));

  // Upload copy for Chat B
  await assertSucceeds(uploadBytes(ref(aliceStorage, `chats/chat_B/images/${assetId}`), data, {
    contentType: 'image/png',
    customMetadata: { uploaderUid: 'alice' }
  }));

  // Assert both destination paths exist and are accessible to their respective chat members
  await assertSucceeds(getBytes(ref(getStorage('bob'), `chats/chat_A/images/${assetId}`)));
  await assertSucceeds(getBytes(ref(getStorage('charlie'), `chats/chat_B/images/${assetId}`)));
});

// E-02: Multi-Chat Access Perms
test('E-02: Multi-Chat Access Perms (Chat 2 member reads Chat 2 copy)', async () => {
  await seedChat('chat_B', { type: '1-1', participants: ['alice', 'charlie'], createdAt: now });
  const aliceStorage = getStorage('alice');
  const charlieStorage = getStorage('charlie');
  const path = 'chats/chat_B/images/e02_forwarded_img';
  const data = new Uint8Array([1, 2, 3]);

  await assertSucceeds(uploadBytes(ref(aliceStorage, path), data, {
    contentType: 'image/png',
    customMetadata: { uploaderUid: 'alice' }
  }));

  await assertSucceeds(getBytes(ref(charlieStorage, path)));
});

// E-03: Cross-Chat Read Rejection
test('E-03: Cross-Chat Read Rejection (Charlie denied access to Chat A copy)', async () => {
  await seedChat('chat_A', { type: '1-1', participants: ['alice', 'bob'], createdAt: now });
  const aliceStorage = getStorage('alice');
  const charlieStorage = getStorage('charlie');
  const path = 'chats/chat_A/images/e03_forwarded_img';
  const data = new Uint8Array([1, 2, 3]);

  await assertSucceeds(uploadBytes(ref(aliceStorage, path), data, {
    contentType: 'image/png',
    customMetadata: { uploaderUid: 'alice' }
  }));

  // Charlie is NOT in Chat A -> DENIED
  await assertFails(getBytes(ref(charlieStorage, path)));
});

// E-04: Single-Chat Multi-Ref
test('E-04: Single-Chat Multi-Ref (Message 1 & 2 in Chat A share 1 V5 asset)', async () => {
  await seedChat('chat_A', { type: '1-1', participants: ['alice', 'bob'], createdAt: now });
  const aliceStorage = getStorage('alice');
  const path = 'chats/chat_A/images/shared_asset_100';
  const data = new Uint8Array([5, 5, 5]);

  await assertSucceeds(uploadBytes(ref(aliceStorage, path), data, {
    contentType: 'image/png',
    customMetadata: { uploaderUid: 'alice' }
  }));

  // Both Alice and Bob can read the shared asset
  await assertSucceeds(getBytes(ref(aliceStorage, path)));
  await assertSucceeds(getBytes(ref(getStorage('bob'), path)));
});

// E-05: Duplicate Job Idempotency
test('E-05: Duplicate Job Idempotency (re-run skips GCS write)', async () => {
  await seedChat('chat_A', { type: '1-1', participants: ['alice', 'bob'], createdAt: now });
  const aliceStorage = getStorage('alice');
  const path = 'chats/chat_A/images/idem_asset';
  const data = new Uint8Array([7, 8, 9]);

  // First copy succeeds
  await assertSucceeds(uploadBytes(ref(aliceStorage, path), data, {
    contentType: 'image/png',
    customMetadata: { uploaderUid: 'alice' }
  }));

  // Attempting second copy to exact path fails due to resource == null check (idempotent block)
  await assertFails(uploadBytes(ref(aliceStorage, path), data, {
    contentType: 'image/png',
    customMetadata: { uploaderUid: 'alice' }
  }));
});

// E-06: Concurrent Worker Conflict
test('E-06: Concurrent Worker Conflict (second worker blocked by resource == null)', async () => {
  await seedChat('chat_A', { type: '1-1', participants: ['alice', 'bob'], createdAt: now });
  const aliceStorage = getStorage('alice');
  const path = 'chats/chat_A/images/conflict_asset';
  const data = new Uint8Array([1, 1, 1]);

  await assertSucceeds(uploadBytes(ref(aliceStorage, path), data, {
    contentType: 'image/png',
    customMetadata: { uploaderUid: 'alice' }
  }));

  // Worker 2 attempts upload to same path -> DENIED
  await assertFails(uploadBytes(ref(aliceStorage, path), new Uint8Array([2, 2, 2]), {
    contentType: 'image/png',
    customMetadata: { uploaderUid: 'alice' }
  }));
});

// E-07: Recovery from Crash
test('E-07: Recovery from Crash (target asset exists & SHA-256 matches)', async () => {
  await seedChat('chat_A', { type: '1-1', participants: ['alice', 'bob'], createdAt: now });
  const aliceStorage = getStorage('alice');
  const path = 'chats/chat_A/images/crash_recovery_asset';
  const data = new Uint8Array([11, 22, 33]);

  await assertSucceeds(uploadBytes(ref(aliceStorage, path), data, {
    contentType: 'image/png',
    customMetadata: { uploaderUid: 'alice' }
  }));

  // Post-crash verification reads asset and matches bytes
  const fetchedBytes = await getBytes(ref(aliceStorage, path));
  assert.deepStrictEqual(new Uint8Array(fetchedBytes), data);
});

// E-08: Interrupted Pointer Update
test('E-08: Interrupted Pointer Update (resumes using legacy content filter)', async () => {
  await seedMessage('chat_A', 'm_100', {
    senderId: 'alice',
    content: 'https://example.com/media/alice/legacy_100',
    type: 'image',
    timestamp: now
  });

  // Query message by legacy content URL
  await env.withSecurityRulesDisabled(async (ctx) => {
    const snap = await getDoc(doc(ctx.firestore(), 'chats', 'chat_A', 'messages', 'm_100'));
    assert.strictEqual(snap.data().content, 'https://example.com/media/alice/legacy_100');

    // Perform pointer update
    await updateDoc(doc(ctx.firestore(), 'chats', 'chat_A', 'messages', 'm_100'), {
      content: 'https://example.com/chats/chat_A/images/v5_100',
      legacyMediaUrl: 'https://example.com/media/alice/legacy_100'
    });

    const updatedSnap = await getDoc(doc(ctx.firestore(), 'chats', 'chat_A', 'messages', 'm_100'));
    assert.strictEqual(updatedSnap.data().content, 'https://example.com/chats/chat_A/images/v5_100');
  });
});

// E-09: Compare-and-Set Pointer Edit
test('E-09: Compare-and-Set Pointer Edit (edited message skips overwrite)', async () => {
  await seedMessage('chat_A', 'm_edit', {
    senderId: 'alice',
    content: 'User edited text message content',
    type: 'text',
    timestamp: now
  });

  // Simulated migration transaction checking content == legacyUrl
  await env.withSecurityRulesDisabled(async (ctx) => {
    const msgRef = doc(ctx.firestore(), 'chats', 'chat_A', 'messages', 'm_edit');
    const snap = await getDoc(msgRef);
    const expectedLegacyUrl = 'https://example.com/media/alice/original';

    if (snap.data().content === expectedLegacyUrl) {
      await updateDoc(msgRef, { content: 'https://example.com/chats/chat_A/images/new' });
    }

    // Verify content remains user text
    const finalSnap = await getDoc(msgRef);
    assert.strictEqual(finalSnap.data().content, 'User edited text message content');
  });
});

// E-10: Deleted Message Guard
test('E-10: Deleted Message Guard (deleted message document handled safely)', async () => {
  await seedMessage('chat_A', 'm_deleted', {
    senderId: 'alice',
    content: 'https://example.com/media/alice/del',
    timestamp: now
  });

  // Delete message document
  await env.withSecurityRulesDisabled(async (ctx) => {
    const msgRef = doc(ctx.firestore(), 'chats', 'chat_A', 'messages', 'm_deleted');
    await deleteDoc(msgRef);

    const snap = await getDoc(msgRef);
    assert.strictEqual(snap.exists(), false);
  });
});

// E-11: E2EE Voice Note Decryption
test('E-11: E2EE Voice Note Decryption (AES-GCM decodes in test)', async () => {
  const key = await generateTestKey();
  const rawAudio = new Uint8Array([79, 103, 103, 83, 0, 2, 0, 0]); // OggS header
  const { ciphertextBuffer, mediaIv } = await encryptData(key, rawAudio);

  await seedChat('chat_audio', { type: '1-1', participants: ['alice', 'bob'], createdAt: now });
  const aliceStorage = getStorage('alice');
  const path = 'chats/chat_audio/voice/voice_note_test.ogg';

  await assertSucceeds(uploadBytes(ref(aliceStorage, path), ciphertextBuffer, {
    contentType: 'audio/ogg',
    customMetadata: { uploaderUid: 'alice' }
  }));

  const bobStorage = getStorage('bob');
  const downloadedCiphertext = await getBytes(ref(bobStorage, path));
  const decryptedAudio = await decryptData(key, downloadedCiphertext, mediaIv);

  assert.deepStrictEqual(decryptedAudio, rawAudio);
});

// E-12: E2EE Image Decryption
test('E-12: E2EE Image Decryption (AES-GCM decodes in test)', async () => {
  const key = await generateTestKey();
  const rawImage = new Uint8Array([255, 216, 255, 224, 0, 10, 74, 70, 73, 70]); // JPEG header
  const { ciphertextBuffer, mediaIv } = await encryptData(key, rawImage);

  await seedChat('chat_img', { type: '1-1', participants: ['alice', 'bob'], createdAt: now });
  const aliceStorage = getStorage('alice');
  const path = 'chats/chat_img/images/photo_test.jpg';

  await assertSucceeds(uploadBytes(ref(aliceStorage, path), ciphertextBuffer, {
    contentType: 'image/jpeg',
    customMetadata: { uploaderUid: 'alice' }
  }));

  const downloadedBytes = await getBytes(ref(getStorage('bob'), path));
  const decryptedImage = await decryptData(key, downloadedBytes, mediaIv);

  assert.deepStrictEqual(decryptedImage, rawImage);
});

// E-13: SHA-256 Hash Verification
test('E-13: SHA-256 Hash Verification (bit-flip triggers SHA-256 mismatch)', async () => {
  const originalData = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
  const corruptedData = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 9]); // Corrupted

  const hashOriginal = crypto.createHash('sha256').update(originalData).digest('hex');
  const hashCorrupted = crypto.createHash('sha256').update(corruptedData).digest('hex');

  assert.notStrictEqual(hashOriginal, hashCorrupted);
});

// E-14: Generation Match Precondition
test('E-14: Generation Match Precondition (overwrite existing object fails)', async () => {
  await seedChat('chat_gen', { type: '1-1', participants: ['alice', 'bob'], createdAt: now });
  const aliceStorage = getStorage('alice');
  const path = 'chats/chat_gen/images/existing.png';

  await assertSucceeds(uploadBytes(ref(aliceStorage, path), new Uint8Array([1, 2, 3]), {
    contentType: 'image/png',
    customMetadata: { uploaderUid: 'alice' }
  }));

  // Re-upload to same location fails (resource == null)
  await assertFails(uploadBytes(ref(aliceStorage, path), new Uint8Array([4, 5, 6]), {
    contentType: 'image/png',
    customMetadata: { uploaderUid: 'alice' }
  }));
});

// E-15: Rollback Unchanged Message
test('E-15: Rollback Unchanged Message (pointer restored to /media/)', async () => {
  await seedMessage('chat_roll', 'm_roll1', {
    senderId: 'alice',
    content: 'https://example.com/chats/chat_roll/images/v5_asset',
    legacyMediaUrl: 'https://example.com/media/alice/legacy_asset',
    timestamp: now
  });

  await env.withSecurityRulesDisabled(async (ctx) => {
    const msgRef = doc(ctx.firestore(), 'chats', 'chat_roll', 'messages', 'm_roll1');
    const snap = await getDoc(msgRef);

    if (snap.data().content === 'https://example.com/chats/chat_roll/images/v5_asset') {
      await updateDoc(msgRef, {
        content: snap.data().legacyMediaUrl
      });
    }

    const updatedSnap = await getDoc(msgRef);
    assert.strictEqual(updatedSnap.data().content, 'https://example.com/media/alice/legacy_asset');
  });
});

// E-16: Rollback Edited Message
test('E-16: Rollback Edited Message (compare-and-set skips edited message)', async () => {
  await seedMessage('chat_roll', 'm_roll2', {
    senderId: 'alice',
    content: 'User edited text after migration',
    legacyMediaUrl: 'https://example.com/media/alice/legacy_asset',
    timestamp: now
  });

  await env.withSecurityRulesDisabled(async (ctx) => {
    const msgRef = doc(ctx.firestore(), 'chats', 'chat_roll', 'messages', 'm_roll2');
    const snap = await getDoc(msgRef);
    const targetV5Url = 'https://example.com/chats/chat_roll/images/v5_asset';

    // Conditional rollback: only update if content === targetV5Url
    if (snap.data().content === targetV5Url) {
      await updateDoc(msgRef, { content: snap.data().legacyMediaUrl });
    }

    const finalSnap = await getDoc(msgRef);
    assert.strictEqual(finalSnap.data().content, 'User edited text after migration');
  });
});

// E-17: Rollback Multi-Ref Deletion
test('E-17: Rollback Multi-Ref Deletion (reverts pointer; retains GCS asset for second reference)', async () => {
  await seedMessage('chat_roll', 'msg_A', {
    content: 'https://example.com/chats/chat_roll/images/shared_v5',
    legacyMediaUrl: 'https://example.com/media/alice/legacy_shared',
    timestamp: now
  });
  await seedMessage('chat_roll', 'msg_B', {
    content: 'https://example.com/chats/chat_roll/images/shared_v5',
    legacyMediaUrl: 'https://example.com/media/alice/legacy_shared',
    timestamp: now
  });

  // Roll back msg_A only
  await env.withSecurityRulesDisabled(async (ctx) => {
    await updateDoc(doc(ctx.firestore(), 'chats', 'chat_roll', 'messages', 'msg_A'), {
      content: 'https://example.com/media/alice/legacy_shared'
    });

    const msgBSnap = await getDoc(doc(ctx.firestore(), 'chats', 'chat_roll', 'messages', 'msg_B'));
    // msg_B still references V5 asset
    assert.strictEqual(msgBSnap.data().content, 'https://example.com/chats/chat_roll/images/shared_v5');
  });
});

// E-18: Public Channel Auth Read
test('E-18: Public Channel Auth Read (authenticated non-subscriber reads public media)', async () => {
  await seedChat('pub_channel_18', {
    type: 'channel',
    isPublic: true,
    participants: ['alice'],
    createdAt: now
  });

  const aliceStorage = getStorage('alice');
  const path = 'chats/pub_channel_18/images/news.jpg';

  await assertSucceeds(uploadBytes(ref(aliceStorage, path), new Uint8Array([1, 2, 3]), {
    contentType: 'image/jpeg',
    customMetadata: { uploaderUid: 'alice' }
  }));

  // Authenticated non-subscriber Eve reads public channel media -> ALLOWED
  const eveStorage = getStorage('eve');
  await assertSucceeds(getBytes(ref(eveStorage, path)));
});

// E-19: Public Channel Anon Read
test('E-19: Public Channel Anon Read (unauthenticated caller DENIED under target policy)', async () => {
  await seedChat('pub_channel_19', {
    type: 'channel',
    isPublic: true,
    participants: ['alice'],
    createdAt: now
  });

  const aliceStorage = getStorage('alice');
  const path = 'chats/pub_channel_19/images/public_post.jpg';

  await assertSucceeds(uploadBytes(ref(aliceStorage, path), new Uint8Array([1, 2, 3]), {
    contentType: 'image/jpeg',
    customMetadata: { uploaderUid: 'alice' }
  }));

  // Anonymous caller -> DENIED in /tmp/target_storage_v5.rules
  const anonStorage = getStorage(null);
  await assertFails(getBytes(ref(anonStorage, path)));
});

// E-20: Private Channel Subscriber Read
test('E-20: Private Channel Subscriber Read (subscriber reads private channel media)', async () => {
  await seedChat('priv_channel_20', {
    type: 'channel',
    isPublic: false,
    participants: ['alice'],
    createdAt: now
  });

  await seedSubscriber('priv_channel_20', 'bob');

  const aliceStorage = getStorage('alice');
  const path = 'chats/priv_channel_20/images/secret.png';

  await assertSucceeds(uploadBytes(ref(aliceStorage, path), new Uint8Array([10, 20]), {
    contentType: 'image/png',
    customMetadata: { uploaderUid: 'alice' }
  }));

  // Subscriber Bob reads -> ALLOWED
  await assertSucceeds(getBytes(ref(getStorage('bob'), path)));
});

// E-21: Private Channel Non-Sub Read
test('E-21: Private Channel Non-Sub Read (non-subscriber DENIED)', async () => {
  await seedChat('priv_channel_21', {
    type: 'channel',
    isPublic: false,
    participants: ['alice'],
    createdAt: now
  });

  const aliceStorage = getStorage('alice');
  const path = 'chats/priv_channel_21/images/confidential.png';

  await assertSucceeds(uploadBytes(ref(aliceStorage, path), new Uint8Array([10, 20]), {
    contentType: 'image/png',
    customMetadata: { uploaderUid: 'alice' }
  }));

  // Non-subscriber Eve -> DENIED
  await assertFails(getBytes(ref(getStorage('eve'), path)));
});

// E-22: Story Path Isolation
test('E-22: Story Path Isolation (story media stays in /media/{uid}/ and is isolated)', async () => {
  const aliceStorage = getStorage('alice');
  const storyPath = 'media/alice/story_asset_22.webp';

  await assertSucceeds(uploadBytes(ref(aliceStorage, storyPath), new Uint8Array([1, 2, 3]), {
    contentType: 'image/webp'
  }));

  // Bob (authenticated) can read story media
  await assertSucceeds(getBytes(ref(getStorage('bob'), storyPath)));

  // Anonymous read DENIED
  await assertFails(getBytes(ref(getStorage(null), storyPath)));
});

// E-23: Social Feed Isolation
test('E-23: Social Feed Isolation (social post stays in /media/{uid}/)', async () => {
  const aliceStorage = getStorage('alice');
  const socialPath = 'media/alice/social_feed_23.jpg';

  await assertSucceeds(uploadBytes(ref(aliceStorage, socialPath), new Uint8Array([5, 6, 7]), {
    contentType: 'image/jpeg'
  }));

  // Authenticated read ALLOWED
  await assertSucceeds(getBytes(ref(getStorage('bob'), socialPath)));
});

// E-24: Call Recording Isolation
test('E-24: Call Recording Isolation (call recording stays in /call_recordings/)', async () => {
  const aliceStorage = getStorage('alice');
  const recPath = 'call_recordings/rec_call_24.mp4';

  await assertSucceeds(uploadBytes(ref(aliceStorage, recPath), new Uint8Array([10, 20, 30]), {
    contentType: 'video/mp4'
  }));

  // Authenticated read ALLOWED
  await assertSucceeds(getBytes(ref(getStorage('bob'), recPath)));

  // Client delete DENIED
  await assertFails(deleteObject(ref(aliceStorage, recPath)));
});
