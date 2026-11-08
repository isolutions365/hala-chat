# PHASE 4.1.2 — CORRECTED MIGRATION SPECIFICATION & FINAL DESIGN REVIEW

**Mode:** STRICT READ-ONLY — DESIGN CORRECTION ONLY  
**Target System:** Hala Chat (Firebase Cloud Storage & Cloud Firestore)  
**Target Project:** `gen-lang-client-0446181078`  
**Status:** SPECIFICATION COMPLETE — AWAITING SYNTHETIC EMULATOR TESTING AUTHORIZATION  
**Date:** 2026-11-07  
**Environment Status:** 100% UNTOUCHED (0 file edits, 0 database writes, 0 GCS mutations, 0 git operations, 0 deployments)

---

## 1. EXECUTIVE SUMMARY

This specification resolves all `P0` critical and `P1` high audit findings identified in `PHASE_4_1_1_INDEPENDENT_DESIGN_GAP_AUDIT.md`. It provides a fully corrected, recoverable, zero-trust design for migrating legacy media (`/media/{uid}/{assetId}`) to Storage Security V5 chat-scoped paths (`/chats/{chatId}/{mediaType}/{assetId}`).

### Summary of Core Design Corrections
1. **Multi-Chat Forwarded Media Resolution (`RESOLVED IN DESIGN — FIND-01`)**: A legacy asset referenced by messages across multiple chats (Chat A and Chat B) is copied to a dedicated chat-scoped path for *each* chat (`/chats/chatA/...` AND `/chats/chatB/...`). This eliminates the permission denial defect where Chat B participants failed `storage.rules:13` checks against Chat A paths.
2. **Cross-Service Recoverable State Machine (`RESOLVED IN DESIGN — FIND-02`)**: Replaces assumed atomicity with a 14-state machine (`DISCOVERED` -> `COMPLETED`). Implements SHA-256 pre-copy verification and compare-and-set updates to eliminate unlinked orphan objects.
3. **Compare-and-Set Rollback Guard (`RESOLVED IN DESIGN — FIND-03`)**: Replaces blind rollback updates with conditional updates (`where content == migratedV5Url`). Messages edited by users post-migration are preserved and flagged as `MANUAL_REVIEW`.
4. **Receiver-Side Decryptability Test Integration (`RESOLVED IN DESIGN — FIND-04`)**: Establishes mandatory receiver-side AES-GCM decryption tests using synthetic keys in the Firebase Emulator prior to confirming migration success.

---

## 2. AUTHORIZATION BOUNDARIES & ENVIRONMENT INTEGRITY

This phase operates in **STRICT READ-ONLY MODE**:
- **0** source code or security rule files were modified.
- **0** Firestore records or Cloud Storage objects were created, modified, or deleted.
- **0** Firebase CLI deployment commands were run.
- **0** Git operations (commit, push, merge, PR) were initiated.
- All technical specifications and failure matrices were developed through static source analysis.

---

## 3. AUDIT FINDINGS RESOLUTION STATUS MATRIX

| Finding ID | Severity | Problem Statement | Resolution Status in Phase 4.1.2 | Corrective Design Mechanism |
|------------|:--------:|-------------------|----------------------------------|-----------------------------|
| **FIND-01** | **P0** | Single legacy object referenced in multiple chats assigned to only 1 chat path, denying access to secondary chat participants. | **RESOLVED IN DESIGN** | Multi-chat mapping table generates dedicated destination copies (`/chats/{chatId_N}/...`) for each distinct `chatId`. |
| **FIND-02** | **P0** | GCS copy and Firestore update non-atomic; worker crash creates unlinked orphan storage assets. | **RESOLVED IN DESIGN** | 14-state recoverable state machine with idempotency keys and SHA-256 pre-verification checks. |
| **FIND-03** | **P1** | Blind rollback overwrites message text/media if user edited message after migration. | **RESOLVED IN DESIGN** | Conditional compare-and-set rollback: update pointer ONLY IF `content == migratedV5Url`. |
| **FIND-04** | **P1** | Checksum match proves byte transfer fidelity, but not receiver-side E2EE decryption. | **RESOLVED IN DESIGN** | Mandatory receiver-side AES-GCM decryption test suite in synthetic Emulator (`E-11`, `E-12`). |
| **FIND-05** | **P2** | Collection scan misses multi-chat referenced assets. | **RESOLVED IN DESIGN** | Collection group query on `messages` grouped by `content` URL. |
| **FIND-06** | **P3** | Automatic 30-day deletion risks destroying unlinked content. | **RESOLVED IN DESIGN** | Mandatory human approval gate + reconciliation audit before legacy object deletion. |

---

## 4. MULTI-CHAT FORWARDED MEDIA MAPPING DESIGN (`FIND-01`)

### 4.1 Multi-Chat Identity Mapping Model
When a single legacy object `media/{uploaderUid}/{assetId}` is referenced by multiple distinct messages across $N$ unique `chatId` documents:

```
                               ┌──> Destination 1: /chats/chat_101/images/asset_999 (For Chat 101)
[Legacy Object: media/u1/a999] ├──> Destination 2: /chats/chat_202/images/asset_999 (For Chat 202)
                               └──> Destination 3: /chats/chat_303/images/asset_999 (For Chat 303)
```

1. **Source Identity**: `media/{uploaderUid}/{assetId}`
2. **Per-Chat Destination Identity**: `chats/{chatId}/{mediaType}/{assetId}`
3. **Message Reference Identity**: `chats/{chatId}/messages/{msgId}`

### 4.2 Proposed Migration Schema (`PROPOSED`)
Each migration record in `migration_mapping_records` contains:

```typescript
interface MigrationMappingRecord {
  // Primary Keys & Identifiers
  migrationBatchId: string;           // UUID of migration job
  idempotencyKey: string;             // SHA256(chatId + msgId + sourceAssetId)
  
  // Source Object Details
  sourceBucket: string;               // gen-lang-client-0446181078.firebasestorage.app
  sourceObjectPath: string;           // media/{uid}/{assetId}
  sourceGeneration: string;           // GCS object generation
  sourceSha256: string;               // SHA-256 hash of original ciphertext
  sourceSize: number;                 // Raw byte count
  
  // Target Chat & Destination Details
  chatId: string;                     // Target Firestore chat ID
  destinationBucket: string;          // Target GCS bucket
  destinationObjectPath: string;      // chats/{chatId}/{mediaType}/{assetId}
  destinationGeneration?: string;     // GCS target generation once written
  destinationSha256?: string;         // Post-copy verified SHA-256
  
  // Firestore Message Pointer Details
  messageId: string;                  // Target Firestore message ID
  originalContent: string;            // Original legacy download URL / path
  migratedContent?: string;           // New V5 download URL / path
  originalUpdateTime: string;         // Firestore message updateTime before migration
  
  // Execution & Recovery State
  migrationStatus: MigrationState;    // State from 14-state machine
  lastError?: string;                 // Error code / message
  retryCount: number;                 // Execution attempt counter
}
```

---

## 5. GCS OBJECT COPY & IDENTITY VERIFICATION DESIGN

### 5.1 Byte-for-Byte Preservation Rules
1. **Raw Byte Copying**: Stream exact ciphertext bytes using GCS Admin SDK streams or `copy()`.
2. **Zero Cryptographic Mutation**: The migration script **never** decrypts, inspects, or re-encrypts media payload bytes.
3. **GCS Generation Preconditions**:
   - Source read must specify `ifGenerationMatch: sourceGeneration`.
   - Destination write must specify `ifGenerationMatch: 0` (enforces `resource == null` non-existence to prevent overwrite).
4. **Post-Copy Verification**: Compute SHA-256 hash `Hash_Dest` and compare with `Hash_Source`. If `Hash_Dest !== Hash_Source`, delete destination object immediately and transition to `FAILED`.

---

## 6. CROSS-SERVICE MIGRATION STATE MACHINE (`FIND-02`)

To ensure complete recoverability after worker crashes, network interruptions, or transient errors, every migration record transitions through a strict 14-state machine:

```
 [DISCOVERED] ──► [ELIGIBLE] ──► [COPY_PENDING] ──► [COPYING] ──► [COPIED]
                                                                     │
 [POINTER_UPDATED] ◄── [POINTER_UPDATE_PENDING] ◄── [HASH_VERIFIED] ◄┘
         │
         ├──► [RECEIVER_VERIFIED] ──► [COMPLETED]
         │
         └──(Error)──► [FAILED] / [MANUAL_REVIEW] / [ROLLBACK_PENDING] ──► [ROLLED_BACK]
```

### 6.1 State Transitions & Crash Recovery Rules

| State Name | Trigger / Action | Precondition Check | Crash Recovery Action |
|------------|------------------|--------------------|-----------------------|
| `DISCOVERED` | Message referenced `/media/` detected. | Document exists in Firestore. | Re-scan message document. |
| `ELIGIBLE` | Validation passed (Chat ID, E2EE metadata present). | Valid `chatId`, `mediaIv` present. | Proceed to `COPY_PENDING`. |
| `COPY_PENDING` | Batch worker assigned job. | Job leased by worker ID. | Re-assign if lease expires. |
| `COPYING` | Admin SDK streaming bytes to GCS destination. | `ifGenerationMatch: 0` set. | Check if destination exists; if SHA-256 matches, move to `HASH_VERIFIED`; else re-copy. |
| `COPIED` | Bytes fully uploaded to destination path. | GCS returns upload success. | Calculate `Hash_Dest`. |
| `HASH_VERIFIED` | SHA-256 checksum matched (`Hash_Source == Hash_Dest`). | `Hash_Source == Hash_Dest`. | Proceed to `POINTER_UPDATE_PENDING`. |
| `POINTER_UPDATE_PENDING` | Preparing Firestore compare-and-set write. | `Hash_Dest` verified. | Execute transaction update. |
| `POINTER_UPDATED` | Message `content` URL updated to V5 path. | `content == migratedUrl`. | Proceed to `RECEIVER_VERIFIED`. |
| `RECEIVER_VERIFIED` | Receiver decryptability test succeeded. | AES-GCM decodes in test. | Transition to `COMPLETED`. |
| `COMPLETED` | Reference fully migrated and verified. | All checks pass. | Terminal success state. |
| `FAILED` | Transient error limit exceeded ($> 3$ retries). | Error logged. | Retry job or move to `MANUAL_REVIEW`. |
| `MANUAL_REVIEW` | Non-retryable error (message edited, missing key). | Manual review required. | Block automatic processing. |
| `ROLLBACK_PENDING` | Rollback command initiated. | Snapshot exists. | Execute compare-and-set rollback. |
| `ROLLED_BACK` | Pointer restored to legacy URL safely. | `content == legacyUrl`. | Terminal rollback state. |

---

## 7. FIRESTORE POINTER UPDATE DESIGN (COMPARE-AND-SET)

### 7.1 Conditional Update Transaction Logic
To prevent overwriting concurrent message edits or deleted messages, Firestore updates use conditional compare-and-set transactions:

```typescript
// PROPOSED CONDITIONAL POINTER UPDATE
await firestore.runTransaction(async (transaction) => {
  const msgRef = firestore.doc(`chats/${chatId}/messages/${messageId}`);
  const snap = await transaction.get(msgRef);

  if (!snap.exists()) {
    throw new Error('MESSAGE_DELETED');
  }

  const data = snap.data();
  // Ensure message content has not been edited since inventory
  if (data.content !== originalLegacyUrl) {
    throw new Error('MESSAGE_EDITED_BY_USER');
  }

  transaction.update(msgRef, {
    content: newV5DownloadUrl,
    legacyMediaUrl: originalLegacyUrl,
    migratedAt: new Date().toISOString(),
    migrationBatchId: batchId
  });
});
```

---

## 8. COMPARE-AND-SET ROLLBACK DESIGN (`FIND-03`)

### 8.1 Safe Rollback Execution Logic
Rollback MUST NOT blindly overwrite message content. It checks whether the message content matches the exact migrated URL written by the migration batch:

```typescript
// PROPOSED COMPARE-AND-SET ROLLBACK LOGIC
await firestore.runTransaction(async (transaction) => {
  const msgRef = firestore.doc(`chats/${chatId}/messages/${messageId}`);
  const snap = await transaction.get(msgRef);

  if (!snap.exists()) {
    // Message deleted by user; skip rollback safely
    return { status: 'SKIPPED_DELETED' };
  }

  const data = snap.data();
  if (data.content === migratedV5Url) {
    // Revert content pointer safely
    transaction.update(msgRef, {
      content: originalLegacyUrl,
      legacyMediaUrl: FieldValue.delete(),
      migratedAt: FieldValue.delete(),
      migrationBatchId: FieldValue.delete()
    });
    return { status: 'ROLLED_BACK' };
  } else {
    // User edited message post-migration; DO NOT OVERWRITE
    return { status: 'MANUAL_REVIEW_EDITED' };
  }
});
```

---

## 9. E2EE INTEGRITY & RECEIVER-SIDE DECRYPTABILITY (`FIND-04`)

### 9.1 Receiver Decryption Verification Architecture
To prove decryptability beyond SHA-256 hash matching:
1. **Synthetic Keypair Generation**: Create synthetic conversation keys (`conversationKey`) and test messages in the local Firebase Emulator.
2. **AES-GCM Decryption Test**: Execute `decryptBlobData(arrayBuffer, msg.mediaIv, defaultFallback, conversationKey)` (`useDecryptedMedia.ts:252`).
3. **Decryption Pass Criteria**:
   - AES-GCM tag verification succeeds without throwing `OperationError`.
   - MIME sniffing (`sniffMimeType`) matches expected type.
   - Blob size matches original plaintext length.
4. **Decryption Failure Criteria**: Missing `mediaIv`, wrong key, corrupted ciphertext, or altered bytes immediately throw a decryption error and transition state to `FAILED`.

---

## 10. COMPLETE 30 FAILURE-SCENARIO MATRIX

| Failure ID | Trigger Scenario | Machine State | Recovery Action | Safe Auto Retry? | Data Integrity Impact |
|------------|------------------|---------------|-----------------|------------------|-----------------------|
| **FS-01** | Worker crash before copy | `COPY_PENDING` | Re-assign job to active worker. | Yes | None |
| **FS-02** | Worker crash during copy stream | `COPYING` | Re-stream with `ifGenerationMatch: 0`. | Yes | None |
| **FS-03** | Worker crash after GCS copy | `COPIED` | Read target, verify SHA-256. | Yes | None |
| **FS-04** | Worker crash after hash verify | `HASH_VERIFIED` | Re-enter pointer update queue. | Yes | None |
| **FS-05** | Worker crash after Firestore update | `POINTER_UPDATED` | Confirm pointer, move to `RECEIVER_VERIFIED`. | Yes | None |
| **FS-06** | Worker crash before state update | `RECEIVER_VERIFIED` | Re-verify receiver, mark `COMPLETED`. | Yes | None |
| **FS-07** | Duplicate worker processes job | `COPYING` | GCS `ifGenerationMatch: 0` blocks duplicate. | Yes | None |
| **FS-08** | Two workers process same source | `COPYING` | Second worker detects target match & skips write. | Yes | None |
| **FS-09** | Two workers process same chat target | `COPYING` | First write succeeds; second worker verifies. | Yes | None |
| **FS-10** | Existing target with matching hash | `COPYING` | Skip GCS copy; proceed to pointer update. | Yes | None |
| **FS-11** | Existing target with different hash | `COPYING` | Flag `MANUAL_REVIEW`; abort target write. | No | Prevents overwrite |
| **FS-12** | Missing source object in GCS | `ELIGIBLE` | Move state to `FAILED` (`storage/object-not-found`). | No | Missing GCS source |
| **FS-13** | Source generation changed mid-copy | `COPYING` | Abort copy; re-compute source hash. | Yes | Source object edited |
| **FS-14** | Invalid/Missing Chat ID | `ELIGIBLE` | Move state to `MANUAL_REVIEW`. | No | Invalid chat context |
| **FS-15** | Forged uploader identity | `ELIGIBLE` | Verify sender in Firestore; fix metadata. | No | Security check |
| **FS-16** | Multi-chat referenced source asset | `DISCOVERED` | Generate $N$ destination records (1 per chat). | Yes | Prevents permission loss |
| **FS-17** | Multiple messages in same chat reference 1 asset | `DISCOVERED` | Share 1 chat-scoped target; update $N$ pointers. | Yes | Storage efficiency |
| **FS-18** | Message edited during migration | `POINTER_UPDATE_PENDING` | Conditional update fails; mark `MANUAL_REVIEW`. | No | Preserves user edit |
| **FS-19** | Message deleted during migration | `POINTER_UPDATE_PENDING` | Conditional update fails; mark `COMPLETED_DELETED`. | No | Prevents resurrection |
| **FS-20** | Message edited after migration | `ROLLBACK_PENDING` | Rollback skips message; retains user edit. | No | Preserves user edit |
| **FS-21** | Forwarded message created during migration | `DISCOVERED` | Next inventory scan picks up new message. | Yes | Complete coverage |
| **FS-22** | Missing `mediaIv` on encrypted asset | `ELIGIBLE` | Move state to `MANUAL_REVIEW`. | No | Cannot decrypt |
| **FS-23** | Missing conversation key in test | `RECEIVER_VERIFIED` | Test fails; report missing key. | No | Receiver cannot decrypt |
| **FS-24** | Invalid ciphertext / truncated bytes | `HASH_VERIFIED` | SHA-256 fails; delete target GCS copy. | No | Corrupted payload |
| **FS-25** | Post-copy SHA-256 mismatch | `COPIED` | Delete GCS target; retry stream copy. | Yes | Transfer corruption |
| **FS-26** | Custom metadata missing `uploaderUid` | `COPIED` | Re-attach metadata `{ uploaderUid }`. | Yes | Security rules pass |
| **FS-27** | Target object deleted post-migration | `RECEIVER_VERIFIED` | Report error; restore legacy pointer. | No | Storage loss recovery |
| **FS-28** | Rollback interrupted mid-batch | `ROLLBACK_PENDING` | Resume rollback using inventory snapshot. | Yes | Safe recovery |
| **FS-29** | Rollback on edited message | `ROLLBACK_PENDING` | Compare-and-set skips message safely. | No | Preserves user edit |
| **FS-30** | Target asset referenced by another message during rollback | `ROLLBACK_PENDING` | Revert pointer; defer GCS deletion until all references rolled back. | Yes | Prevents premature delete |

---

## 11. SYNTHETIC EMULATOR TEST PLAN (`E-01` THROUGH `E-24`)

The following 24 test cases MUST be executed against the local **Firebase Emulator Suite** in Phase 4.2 prior to production authorization:

| Test ID | Test Title & Purpose | Synthetic Test Setup & Steps | Expected Asserted Outcome | Emulator Tools |
|---------|----------------------|------------------------------|---------------------------|----------------|
| **E-01** | Multi-Chat Forwarding Copy | Seed Chat 1 & Chat 2 referencing `media/u1/a1`. Run copy. | Creates `/chats/chat1/images/a1` AND `/chats/chat2/images/a1`. | Firestore & Storage |
| **E-02** | Multi-Chat Access Perms | Read Chat 2 copy as Chat 2 member. | **ALLOWED** (`assertSucceeds`). | Storage Emulator |
| **E-03** | Cross-Chat Read Rejection | Read Chat 1 copy as Chat 2 member. | **DENIED** (`storage/unauthorized`). | Storage Emulator |
| **E-04** | Single-Chat Multi-Ref | Seed Message 1 & 2 in Chat 1 referencing `media/u1/a2`. | Creates 1 target `/chats/chat1/images/a2`; updates both pointers. | Firestore & Storage |
| **E-05** | Duplicate Job Idempotency | Execute migration job twice on same dataset. | Second run skips GCS write & pointer update (`0 changes`). | Test Runner |
| **E-06** | Concurrent Worker Conflict | Spawn 2 workers on same record simultaneously. | `ifGenerationMatch: 0` blocks second write; no corruption. | Storage Emulator |
| **E-07** | Recovery from Crash | Kill worker in `COPIED` state. Restart worker. | Detects SHA-256 match, skips copy, completes pointer update. | Test Runner |
| **E-08** | Interrupted Pointer Update | Kill worker mid-batch during Firestore updates. | Resumes cleanly using `originalContent` filter. | Firestore Emulator |
| **E-09** | Compare-and-Set Pointer Edit | Edit message content in Firestore before pointer update. | Update fails `MESSAGE_EDITED_BY_USER`; marked `MANUAL_REVIEW`. | Firestore Emulator |
| **E-10** | Deleted Message Guard | Delete message document before pointer update. | Update fails `MESSAGE_DELETED`; marked `COMPLETED_DELETED`. | Firestore Emulator |
| **E-11** | E2EE Voice Note Decryption | Decrypt migrated encrypted voice note in Emulator. | AES-GCM decodes; audio duration & bytes match. | Auth & Storage |
| **E-12** | E2EE Image Decryption | Decrypt migrated encrypted image in Emulator. | AES-GCM decodes; image renders correctly. | Auth & Storage |
| **E-13** | SHA-256 Hash Verification | Stream copy with simulated bit-flip in transit. | `Hash_Source != Hash_Dest` triggers target delete & retry. | Storage Emulator |
| **E-14** | Generation Match Precondition | Attempt write when target exists (`ifGenerationMatch: 0`). | GCS returns HTTP 412 Precondition Failed. | Storage Emulator |
| **E-15** | Rollback Unchanged Message | Run rollback on unedited migrated message. | Pointer restored to `/media/`; decryption succeeds. | Firestore Emulator |
| **E-16** | Rollback Edited Message | Edit message text post-migration; run rollback. | Compare-and-set skips message; user edit preserved. | Firestore Emulator |
| **E-17** | Rollback Multi-Ref Deletion | Roll back 1 of 2 messages referencing same V5 asset. | Pointer reverted; V5 GCS asset retained for remaining reference. | Firestore & Storage |
| **E-18** | Public Channel Auth Read | Read public channel V5 media as authenticated non-subscriber. | **ALLOWED** (`assertSucceeds`). | Storage Emulator |
| **E-19** | Public Channel Anon Read | Read public channel V5 media as unauthenticated caller. | **DENIED** (`storage/unauthorized`). | Storage Emulator |
| **E-20** | Private Channel Subscriber Read | Read private channel V5 media as subscriber. | **ALLOWED** (`assertSucceeds`). | Storage Emulator |
| **E-21** | Private Channel Non-Sub Read | Read private channel V5 media as non-subscriber. | **DENIED** (`storage/unauthorized`). | Storage Emulator |
| **E-22** | Story Path Isolation | Upload story to `story_${uid}`. Run migration scan. | Story remains in `/media/{uid}/`; scan excludes story. | Firestore & Storage |
| **E-23** | Social Feed Isolation | Post image to `social_posts`. Run migration scan. | Post remains in `/media/{uid}/`; scan excludes post. | Firestore & Storage |
| **E-24** | Call Recording Isolation | Save recording to `/call_recordings/`. Run scan. | Recording remains in `/call_recordings/`; client delete denied. | Storage Emulator |

---

## 12. NON-CHAT MEDIA ISOLATION SPECIFICATION

The following non-chat categories are **STRICTLY EXCLUDED** from chat media migration:

1. **Stories (`/media/{uid}/{assetId}`)**:
   - Uploaded via `CreateStoryModal.tsx:5` with `chatId: story_${uid}`.
   - Unencrypted JPEG/WebM media referenced in `stories/{storyId}` documents (`src/lib/firebase.ts:2971`).
   - Must remain in `/media/{uid}/{assetId}` to satisfy `firestore.rules:272`.
2. **Social Feed (`/media/{uid}/{assetId}`)**:
   - Uploaded via `src/lib/socialFeed.ts:12` with `chatId: social-feed`.
   - Public unencrypted post images referenced in `social_posts/{postId}`.
   - Must remain in `/media/{uid}/{assetId}`.
3. **User & Channel Avatars (`/avatars/{fileName}`)**:
   - Profile photos and channel icons (`storage.rules:74-80`).
   - Must remain in `/avatars/{fileName}`.
4. **Call Recordings (`/call_recordings/{fileName}`)**:
   - Audio/video call recordings up to 50MB (`storage.rules:83-91`, `src/lib/firebase.ts:2640`).
   - Unencrypted create-only media. Must remain in `/call_recordings/`.

---

## 13. STORAGE SECURITY V5 COMPATIBILITY

The corrected design maintains 100% compliance with `storage.rules`:
- **Unauthenticated Public Read Blocked**: Updating `canReadChatMedia` to `isSignedIn() && (...)` blocks unauthenticated access (`storage.rules:20-24`).
- **Authenticated Public Read Allowed**: Authenticated users can read public channel media (`chat.isPublic == true`).
- **Private Channel Subscriber Restriction**: Private channels enforce `isChannelSubscriber(chatId)` (`storage.rules:17`).
- **Cross-Chat Isolation**: Enforces `uploaderUid == request.auth.uid` and participant check `request.auth.uid in getChat(chatId).participants` (`storage.rules:13, 68`).
- **Tamper Protection**: Overwrite denied (`resource == null`) and client deletion blocked (`allow delete: if false;` at `storage.rules:62, 70`).

---

## 14. RETENTION, GRACE PERIOD & CLEANUP APPROVAL GATE

### 14.1 Legacy Media Grace Period & Retention Policy
1. **Grace Period**: Legacy objects at `/media/{uid}/{assetId}` MUST be retained in GCS for a minimum of 30 days post-migration.
2. **No Automatic Deletion**: Legacy objects MUST NOT be automatically deleted upon grace period expiration.
3. **Human Approval Gate**: Legacy deletion requires a separate, explicit user authorization phase following a 100% successful reconciliation audit confirming zero active Firestore message references.

---

## 15. OPERATIONAL RISKS & UNRESOLVED QUESTIONS

| Risk ID | Risk Summary | Mitigation | Status |
|---------|--------------|------------|--------|
| **R-01** | Multi-chat forwarded asset copy increases storage footprint. | Trade-off accepted to preserve security rules authorization. Storage cost is negligible ($0.026/GB/mo). | **ACCEPTED** |
| **R-02** | External web share link visitors blocked from viewing media attachments on public channels. | Unauthenticated visitors are prompted to sign in to view attachments. Text content remains visible. | **CONFIRMED BY USER** |
| **R-03** | Network latency during large batch migration. | Migration worker processes records in concurrent chunks of 50 assets with exponential backoff retries. | **DESIGNED** |

---

## 16. SEPARATE GO / NO-GO DECISION MATRIX

```
┌────────────────────────────────────────────────────────┬─────────────┐
│ Domain Category                                        │ Decision    │
├────────────────────────────────────────────────────────┼─────────────┤
│ 1. Corrected Specification Completeness                │ PASS        │
│ 2. Synthetic Emulator Test Suite Design (`E-01`–`E-24`)│ PASS        │
│ 3. Phase 4.2 Migration Implementation Authorization   │ NO-GO       │
│ 4. Future Production Migration Authorization            │ NO-GO       │
│ 5. Legacy Media Cleanup Authorization                  │ NO-GO       │
└────────────────────────────────────────────────────────┴─────────────┘
```

### Decision Explanations
- **Categories 1 & 2 (PASS)**: The design specification and 24-case Emulator test plan are 100% complete and fully resolve all P0/P1 gaps from Phase 4.1.1.
- **Category 3 (NO-GO)**: Implementation authorization is held until the user explicitly authorizes starting Phase 4.2.
- **Category 4 (NO-GO)**: Production execution remains blocked until all 24 synthetic Emulator test cases pass in Phase 4.2.
- **Category 5 (NO-GO)**: Legacy media deletion remains blocked until post-migration reconciliation is complete.

---

## 17. SOURCE FILE & LINE NUMBER EVIDENCE INDEX

- `storage.rules`:
  - `isSignedIn()`: Line 4
  - `getChat(chatId)`: Line 8
  - `isChatParticipant(chatId)`: Line 12
  - `isChannelSubscriber(chatId)`: Line 16
  - `canReadChatMedia(chatId)`: Lines 20–24
  - `canUploadChatMedia(chatId)`: Lines 26–30
  - `match /chats/{chatId}/{mediaType}/{assetId}`: Lines 59–71
  - `match /avatars/{fileName}`: Lines 74–80
  - `match /call_recordings/{fileName}`: Lines 83–91
  - `match /media/{uid}/{assetId}`: Lines 94–104
- `src/lib/media.ts`:
  - `storeMedia()`: Lines 12–113
  - Chat-scoped path construction: Lines 47–49
  - `uploadChatMedia()`: Lines 115–216
  - `uploadVoiceNote()`: Lines 219–245
- `src/hooks/useDecryptedMedia.ts`:
  - `getStoragePathFromUrl()`: Lines 7–15
  - `sniffMimeType()`: Lines 17–59
  - `processMediaMessage()`: Lines 118–311
  - `getBytes()` SDK read: Lines 180–182
  - `decryptBlobData()` AES-GCM decryption: Line 252
- `src/lib/firebase.ts`:
  - Messages reference: Line 2587
  - Calls reference: Line 2640
  - Stories reference: Line 2971
- `src/lib/socialFeed.ts`:
  - Social posts collection: Line 6

---

## 18. EXPLICIT LIST OF OPERATIONS NOT PERFORMED

During Phase 4.1.2:
1. No source code files were edited or created (except writing this report).
2. No security rules (`storage.rules` or `firestore.rules`) were modified or deployed.
3. No Cloud Storage objects were read, copied, moved, uploaded, or deleted.
4. No Firestore message or conversation documents were created, updated, or deleted.
5. No production Firebase commands or migration scripts were executed.
6. No Git commits, branches, merges, or pull requests were initiated.

---

## 19. FINAL VERDICT & STOP CONDITION

**CORRECTED SPECIFICATION COMPLETE. STOP CONDITION ENFORCED.**

Phase 4.1.2 Corrected Migration Specification & Final Design Review is complete.

**DO NOT** begin Phase 4.2 implementation, execute Emulator tests, modify security rules, copy GCS objects, update Firestore pointers, run legacy cleanups, deploy, or perform Git operations without explicit separate user authorization.
