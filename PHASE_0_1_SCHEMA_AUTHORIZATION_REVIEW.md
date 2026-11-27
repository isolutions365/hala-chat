# PHASE 0.1 — SCHEMA & AUTHORIZATION REVIEW

**Status:** AUDIT COMPLETE
**Executive Verdict:** NOT READY (CRITICAL SCHEMA SYNC BUG IDENTIFIED)

## 1. SCHEMA TRACE: `is_public` vs `isPublic`

The audit confirms a split-collection architecture for channels.

| Field Name | Collection | File:Line | Role |
|------------|------------|-----------|------|
| `isPublic` | `chats` | `src/types.ts:166` | Primary UI/Messaging state. |
| `is_public` | `channels` | `src/types.ts:120` | Discovery and Discovery-Rule state. |
| `isPublic` | `chats` | `firestore.rules:79` | Validated in `isValidChat`. |
| `is_public` | `channels` | `firestore.rules:223` | Validated in `valid` (channel). |

### Verification of Implementation
- **Creation**: `createNewChannel` (`src/lib/firebase.ts:2246`) writes `isPublic` to `chats` and `is_public` to `channels`.
- **Update**: `updateChannelSettings` (`src/lib/firebase.ts:2462`) updates both fields.
- **Rules**: `channelPublic(id)` (`firestore.rules:32`) reads `channels/{id}.is_public`.

## 2. AUTHORITATIVE CHANNEL SCHEMA

The authoritative schema is **distributed across two collections linked by a common ID**:
1. **`chats/{id}`**: Authoritative for membership (`participants`), permissions (`adminIds`), and messaging state.
2. **`channels/{id}`**: Authoritative for discovery rules (`is_public`) and subscriber parentage (`subscribers` subcollection).

### CRITICAL BUG: Subscriber Count Desync
- `joinChannel` (`src/lib/firebase.ts:2406`) updates `subscriberCount` in the `chats` collection but **FAILS** to update `subscriber_count` in the `channels` collection.
- **Impact**: Public discovery queries (which use the `channels` collection) will display stale or incorrect subscriber counts.

## 3. AUTHORIZATION MATRIX

| Operation | Authorization Document | Required Field / Condition |
|-----------|------------------------|-----------------------------|
| Public Channel Read | `channels/{id}` | `is_public == true` |
| Private Channel Read | `channels/{id}` + `subscribers` | `exists(channels/{id}/subscribers/{uid})` |
| Subscriber Join | `channels/{id}` | `is_public == true` (or owner) |
| Post to Channel | `chats/{id}` | `uid == ownerId` or `allowMemberPosts == true` |
| Chat Read (1-1/Grp) | `chats/{id}` | `uid in participants` |
| Media Upload (V5) | `chats/{id}` | `uid in participants` |
| Avatar Upload | `users/{uid}` | `uid == auth.uid` |

## 4. STORAGE V5 COMPATIBILITY

Proposed Path: `/chats/{chatId}/{mediaType}/{assetId}`

### Findings
- **Cross-Service Lookup**: Required. Storage rules must use `firestore.get(/databases/(default)/documents/chats/$(chatId))` to verify `participants`.
- **Metadata Trust**: `uploaderUid` must be enforced via `request.resource.metadata`.
- **Domain Gap**: `channels` authorization currently relies on a separate `subscribers` subcollection. Storage rules will need to check both `chats/{chatId}.participants` AND `exists(/channels/{chatId}/subscribers/{uid})` for full channel media compatibility.
- **Legacy Support**: Current `media/{uid}/{assetId}` must be preserved for historical messages.

## 5. TEST INVENTORY (14 FILES)

- **`rules.test.mjs`**: Covers Firestore channel/chat logic. **Missing** adversarial tests for cross-service storage lookups.
- **`mediaPolicy.test.mjs`**: Covers client-side size/type validation.
- **`storageDiagnostic.test.mjs`**: Covers URL parsing logic.
- **Coverage Gap**: No tests currently exist for the proposed V5 path authorization or `uploaderUid` metadata enforcement.

## 6. VOICE NOTE BLUEPRINT CORRECTIONS

- **WAV Bypass**: Confirmed. `VoiceMessageRecorder.tsx` already detects Opus/AAC. `compressAudio` should be bypassed if `blob.type` is already a supported compressed format.
- **UI Bottleneck**: Confirmed. Synchronous encryption in `encryptBlobData` and `blob.arrayBuffer()` will block the event loop for large files.
- **Race Conditions**: `storage/object-not-found` is likely due to the client attempting to read a message reference before Storage upload completion is fully propagated in a high-concurrency environment.
- **Verification**: Use `getMetadata()` in the SDK to verify upload success before writing to Firestore.

## 7. CRITICAL BLOCKERS

1. **Subscriber Count Desync**: `joinChannel` and `leaveChannel` must be updated to maintain sync between `chats` and `channels` collections.
2. **Storage V5 Path Complexity**: Authorization for channel media requires two lookups (`chats` for admins, `subscribers` for members), which may hit Firestore lookup limits in Storage rules if not optimized.

## 8. SAFETY CONFIRMATION

- No source files, rules, or production data were modified.
- SHA-256 hashes verified against Phase 0 baseline.

| File | Baseline SHA-256 | Current SHA-256 |
|------|------------------|-----------------|
| `storage.rules` | `c6153431...` | `c6153431...` (MATCH) |
| `firestore.rules` | `8a41ab87...` | `8a41ab87...` (MATCH) |
| `src/lib/media.ts` | `c8ede080...` | `c8ede080...` (MATCH) |

---
**Audit Complete. Waiting for approval to begin Phase 1 Implementation with corrections.**
