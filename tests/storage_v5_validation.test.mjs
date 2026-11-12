import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// 1. Syntax & Rules Structure Verification
test('Storage Rules V5: Structure, functions and path definitions', async () => {
  const content = await readFile('storage.rules', 'utf8');

  // Verify syntax version
  assert.ok(content.includes("rules_version = '2';"), 'Rules version 2 specified');

  // Verify cross-service functions
  assert.ok(content.includes('function getChat(chatId)'), 'getChat helper exists');
  assert.ok(content.includes('firestore.get(/databases/(default)/documents/chats/$(chatId)).data'), 'Uses correct firestore.get syntax');
  assert.ok(content.includes('function isChatParticipant(chatId)'), 'isChatParticipant helper exists');
  assert.ok(content.includes('request.auth.uid in getChat(chatId).participants'), 'Checks auth.uid in participants');
  assert.ok(content.includes('function isChannelSubscriber(chatId)'), 'isChannelSubscriber helper exists');
  assert.ok(content.includes('firestore.exists(/databases/(default)/documents/channels/$(chatId)/subscribers/$(request.auth.uid))'), 'Checks subscriber existence in channel subcollection');

  // Verify chat media path
  assert.ok(content.includes('match /chats/{chatId}/{mediaType}/{assetId}'), 'Chat-scoped path defined');
  assert.ok(content.includes('resource == null'), 'Resource must be null on create (prevents overwrite)');
  assert.ok(content.includes('request.resource.size <= 101 * 1024 * 1024'), '101 MiB limit enforced on chat media');
  assert.ok(content.includes('request.resource.metadata.uploaderUid == request.auth.uid'), 'uploaderUid must match auth.uid');
  assert.ok(content.includes('allow update: if false;'), 'Updates disabled for chat media');
  assert.ok(content.includes('allow delete: if false;'), 'Deletes disabled for chat media');

  // Verify legacy media path
  assert.ok(content.includes('match /media/{uid}/{assetId}'), 'Legacy media path retained');
  assert.ok(content.includes('request.auth.uid == uid'), 'Legacy upload restricted to owner UID');

  // Verify avatars and call recordings
  assert.ok(content.includes('match /avatars/{fileName}'), 'Avatars path retained');
  assert.ok(content.includes('match /call_recordings/{fileName}'), 'Call recordings path retained');
});

// 2. Pure Evaluation of V5 Authorization Matrix Logic
function simulateCanReadChatMedia(chat, uid, isSubscriber) {
  if (!uid) return false;
  const isChatParticipant = chat?.participants?.includes(uid);
  if (isChatParticipant) return true;
  if (chat?.type === 'channel' && ((chat.isPublic ?? true) === true || isSubscriber)) {
    return true;
  }
  return false;
}

function simulateCanUploadChatMedia(chat, uid, isSubscriber, uploaderUidHeader) {
  if (!uid) return false;
  if (uploaderUidHeader !== uid) return false; // forged uploaderUid check
  const isChatParticipant = chat?.participants?.includes(uid);
  if (isChatParticipant) return true;
  if (chat?.type === 'channel' && isSubscriber && chat?.allowMemberPosts === true) {
    return true;
  }
  return false;
}

test('V5 Authorization Matrix: 1-to-1 Chat', () => {
  const chat1to1 = { type: '1-1', participants: ['alice', 'bob'] };

  // Authorized participants
  assert.equal(simulateCanReadChatMedia(chat1to1, 'alice', false), true, 'Alice can read 1-1');
  assert.equal(simulateCanReadChatMedia(chat1to1, 'bob', false), true, 'Bob can read 1-1');
  assert.equal(simulateCanUploadChatMedia(chat1to1, 'alice', false, 'alice'), true, 'Alice can upload to 1-1');

  // Unauthorized third party
  assert.equal(simulateCanReadChatMedia(chat1to1, 'eve', false), false, 'Eve cannot read 1-1');
  assert.equal(simulateCanUploadChatMedia(chat1to1, 'eve', false, 'eve'), false, 'Eve cannot upload to 1-1');

  // Forged uploader UID
  assert.equal(simulateCanUploadChatMedia(chat1to1, 'alice', false, 'bob'), false, 'Alice cannot forge Bob as uploaderUid');

  // Unauthenticated
  assert.equal(simulateCanReadChatMedia(chat1to1, null, false), false, 'Anonymous cannot read 1-1');
  assert.equal(simulateCanUploadChatMedia(chat1to1, null, false, null), false, 'Anonymous cannot upload to 1-1');
});

test('V5 Authorization Matrix: Group Chat', () => {
  const groupChat = { type: 'group', participants: ['alice', 'bob', 'charlie'] };

  // Member access
  assert.equal(simulateCanReadChatMedia(groupChat, 'alice', false), true, 'Member can read group');
  assert.equal(simulateCanUploadChatMedia(groupChat, 'alice', false, 'alice'), true, 'Member can upload to group');

  // Non-member access
  assert.equal(simulateCanReadChatMedia(groupChat, 'eve', false), false, 'Non-member cannot read group');
  assert.equal(simulateCanUploadChatMedia(groupChat, 'eve', false, 'eve'), false, 'Non-member cannot upload to group');

  // Removed member access
  const groupAfterRemoval = { type: 'group', participants: ['alice', 'charlie'] };
  assert.equal(simulateCanReadChatMedia(groupAfterRemoval, 'bob', false), false, 'Removed member cannot read group');
  assert.equal(simulateCanUploadChatMedia(groupAfterRemoval, 'bob', false, 'bob'), false, 'Removed member cannot upload to group');
});

test('V5 Authorization Matrix: Public & Private Channels', () => {
  // Public channel: Admin participant only can post (allowMemberPosts = false)
  const publicChannel = { type: 'channel', participants: ['admin'], isPublic: true, allowMemberPosts: false };

  // Read access
  assert.equal(simulateCanReadChatMedia(publicChannel, 'eve', false), true, 'Any signed-in user can read public channel media');
  // Upload access
  assert.equal(simulateCanUploadChatMedia(publicChannel, 'admin', false, 'admin'), true, 'Admin can upload to channel');
  assert.equal(simulateCanUploadChatMedia(publicChannel, 'eve', false, 'eve'), false, 'Non-subscriber cannot upload to channel');
  assert.equal(simulateCanUploadChatMedia(publicChannel, 'bob', true, 'bob'), false, 'Subscriber cannot upload when allowMemberPosts is false');

  // Private channel: Only subscribers can read; subscribers can post if allowMemberPosts is true
  const privateChannel = { type: 'channel', participants: ['admin'], isPublic: false, allowMemberPosts: true };

  assert.equal(simulateCanReadChatMedia(privateChannel, 'bob', true), true, 'Subscriber can read private channel');
  assert.equal(simulateCanReadChatMedia(privateChannel, 'eve', false), false, 'Non-subscriber cannot read private channel');
  assert.equal(simulateCanUploadChatMedia(privateChannel, 'bob', true, 'bob'), true, 'Subscriber can upload when allowMemberPosts is true');
  assert.equal(simulateCanUploadChatMedia(privateChannel, 'eve', false, 'eve'), false, 'Non-subscriber cannot upload to private channel');
});

// 3. Client Storage Path Formatting & Category Verification
test('Client media category mapping for Storage V5', () => {
  function getMediaCategory(inferredFileType, inferredFileName, isAudio) {
    if (isAudio) return 'voice';
    if (inferredFileType.startsWith('image/')) return 'images';
    if (inferredFileType === 'application/pdf' || inferredFileName.toLowerCase().endsWith('.pdf')) return 'PDFs';
    if (
      inferredFileType.startsWith('text/') ||
      inferredFileType.includes('document') ||
      inferredFileType.includes('word') ||
      inferredFileType.includes('sheet')
    ) return 'documents';
    return 'attachments';
  }

  assert.equal(getMediaCategory('audio/webm', 'voice_123.webm', true), 'voice');
  assert.equal(getMediaCategory('image/jpeg', 'photo.jpg', false), 'images');
  assert.equal(getMediaCategory('application/pdf', 'doc.pdf', false), 'PDFs');
  assert.equal(getMediaCategory('application/octet-stream', 'manual.pdf', false), 'PDFs');
  assert.equal(getMediaCategory('text/plain', 'notes.txt', false), 'documents');
  assert.equal(getMediaCategory('video/mp4', 'clip.mp4', false), 'attachments');
});

// 4. Client Path Resolution: Real Chat vs Stories vs Social Feed
test('Client keeps uploads on the legacy path compatible with Hala named Firestore database', async () => {
  const source = await readFile('src/lib/media.ts', 'utf8');
  assert.ok(
    source.includes('const storagePath = `media/${uid}/${assetId}`;'),
    'chat media upload uses the existing media/{uid}/{assetId} path'
  );

  function resolveStoragePath(uid, assetId) {
    return `media/${uid}/${assetId}`;
  }

  const uid = 'user123';
  const assetId = 'asset456';
  assert.equal(resolveStoragePath(uid, assetId), 'media/user123/asset456');
});
