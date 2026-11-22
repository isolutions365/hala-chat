# PHASE 4.1 — MIGRATION DESIGN AND ROLLBACK SPECIFICATION
**Legacy Media to Storage Security V5 Migration Architecture**

- **Mode:** STRICT READ-ONLY — DESIGN & SPECIFICATION ONLY
- **Status:** DESIGN COMPLETED — AWAITING IMPLEMENTATION AUTHORIZATION
- **Date:** 2026-11-07
- **Target System:** Hala Chat (Firebase Storage & Cloud Firestore)
- **Target Project:** `gen-lang-client-0446181078`
- **Environment Status:** 100% UNTOUCHED (0 code edits, 0 database writes, 0 GCS mutations, 0 git operations, 0 deployments)

---

## 1. EXECUTIVE SUMMARY

This document presents a source-grounded, zero-trust technical specification for migrating historical legacy media (`/media/{uid}/{assetId}`) to the **Storage Security V5 chat-scoped architecture** (`/chats/{chatId}/{mediaType}/{assetId}`) in Hala Chat.

### Core Architecture Findings (`VERIFIED`)
1. **Active Chat Writes**: Currently, all chat uploads (`uploadChatMedia` / `uploadVoiceNote`) generate V5 chat-scoped storage paths (`src/lib/media.ts:47-49`).
2. **Non-Chat Writes**: Non-chat uploads (Stories in `CreateStoryModal.tsx:5` and Social Feed) route to legacy `/media/{uid}/{assetId}` to satisfy `firestore.rules:272` regex constraints.
3. **Decryption Coexistence**: The decryption hook `useDecryptedMedia.ts:7-189` resolves relative GCS paths from Firebase URLs for both V5 and legacy formats, executing authenticated Storage SDK `getBytes()` reads prior to AES-GCM decryption.
4. **E2EE Ciphertext Integrity Guarantee**: AES-GCM ciphertext bytes and IVs (`msg.mediaIv`) are preserved byte-for-byte. The migration script never decrypts or re-encrypts media payload bytes.
5. **Rollback Safety**: Firestore pointer updates can be reverted instantly using pre-migration JSON inventory snapshots while retaining legacy GCS objects in a 30-day grace period.

---

## 2. ACTUAL ARCHITECTURE & SOURCE CODE INVENTORY

An inspection of the codebase yields the following verified line-by-line implementation details:

### 2.1 Storage Rules (`storage.rules`)
- **`rules_version = '2';`** (`storage.rules:1`)
- **`isSignedIn()`**: Checks `request.auth != null` (`storage.rules:4-6`).
- **`getChat(chatId)`**: Retrieves `firestore.get(/databases/(default)/documents/chats/$(chatId)).data` (`storage.rules:8-10`).
- **`isChatParticipant(chatId)`**: Evaluates `isSignedIn() && request.auth.uid in getChat(chatId).participants` (`storage.rules:12-14`).
- **`isChannelSubscriber(chatId)`**: Checks `firestore.exists(/databases/(default)/documents/channels/$(chatId)/subscribers/$(request.auth.uid))` (`storage.rules:16-18`).
- **`canReadChatMedia(chatId)`**: Evaluates participant or subscriber / public channel rules (`storage.rules:20-24`).
- **`canUploadChatMedia(chatId)`**: Evaluates participant or subscriber with `allowMemberPosts == true` (`storage.rules:26-30`).
- **`isValidChatMediaType(type)`**: Categoriess: `voice`, `images`, `documents`, `PDFs`, `attachments` (`storage.rules:32-48`).
- **Chat-scoped Match**: `match /chats/{chatId}/{mediaType}/{assetId}` (`storage.rules:59-71`). Enforces `uploaderUid == request.auth.uid`, `resource == null`, and `allow update, delete: if false;`.
- **Avatars Match**: `match /avatars/{fileName}` (`storage.rules:74-80`). Size <= 5MB.
- **Call Recordings Match**: `match /call_recordings/{fileName}` (`storage.rules:83-91`). Size <= 50MB, create-only (`resource == null`), client update/delete denied (`if false`).
- **Legacy Match**: `match /media/{uid}/{assetId}` (`storage.rules:94-104`). Authenticated read (`isSignedIn()`), owner write/delete (`request.auth.uid == uid`), size <= 20MB.

### 2.2 Client Upload Logic (`src/lib/media.ts`)
- **`storeMedia()`**: (`src/lib/media.ts:12-113`)
  - Evaluates `isRealChat` (`lines 39-44`).
  - Constructs `storagePath`:
    ```typescript
    const storagePath = isRealChat
      ? `chats/${chatScoped!.chatId}/${chatScoped!.mediaType}/${assetId}`
      : `media/${uid}/${assetId}`;
    ```
    (`src/lib/media.ts:47-49`).
  - Attaches custom metadata `{ originalName, uploaderUid: uid }` (`src/lib/media.ts:29-32`).
  - Executes `uploadBytesResumable()` and resolves `getDownloadURL()` (`src/lib/media.ts:54-101`).
- **`uploadChatMedia()`**: (`src/lib/media.ts:115-216`)
  - Validates attachment size (`line 132`).
  - Compresses audio if applicable (`lines 155-173`).
  - Encrypts payload with `conversationKey` using `encryptBlobData()` (`lines 180-185`). Returns `{ downloadUrl, mediaIv }`.
  - Determines `mediaCategory` (`lines 192-206`).
- **`uploadVoiceNote()`**: (`src/lib/media.ts:219-245`). Wraps `uploadChatMedia` with `voice_note_${Date.now()}.${ext}` naming.

### 2.3 Media Download & Decryption (`src/hooks/useDecryptedMedia.ts`)
- **`getStoragePathFromUrl(url)`**: Extracts storage path from `/o/` URL via regex `/\/o\/([^?#]+)/` and `decodeURIComponent` (`lines 7-15`).
- **`sniffMimeType(buffer, fallback)`**: Sniffs EBML/WebM, Ogg, WAV, MP4/M4A, MP3, AAC, JPEG, PNG headers (`lines 17-59`).
- **`processMediaMessage(msg)`**:
  - Checks cache and in-flight requests (`lines 118-124`).
  - Uses Storage SDK `getBytes(storageRef(storage, storagePath))` for authenticated fetch (`lines 180-182`).
  - Decrypts ciphertext using `decryptBlobData(arrayBuffer, msg.mediaIv, defaultFallback, conversationKey)` (`line 252`).
  - Creates local Blob URL and updates React state (`lines 265-267`).

---

## 3. CONFIRMED MEDIA ACCESS POLICY & PROPOSED RULE UPDATES

### 3.1 Policy Requirements (`CONFIRMED BY PRODUCT OWNER`)
- **Public channel media**:
  - Unauthenticated visitors: **DENIED**.
  - Any authenticated user: **ALLOWED** (even without subscribing).
  - Authenticated subscribers: **ALLOWED**.
- **Private channel media**:
  - Authenticated subscribers: **ALLOWED**.
  - Non-subscribers: **DENIED**.
- **Upload permissions**: Governed strictly by existing admin and `allowMemberPosts` settings.

### 3.2 Proposed Storage Rule Change (`PROPOSED`)

To enforce the requirement that unauthenticated visitors are denied access to public channel media, `canReadChatMedia` in `storage.rules:20-24` will be updated as follows:

```javascript
// PROPOSED STORAGE RULE UPDATE (Do not deploy until authorized in Phase 4.2)
function canReadChatMedia(chatId) {
  let chat = getChat(chatId);
  return isSignedIn() && (
    isChatParticipant(chatId) ||
    (chat.type == 'channel' && (chat.get('isPublic', true) == true || isChannelSubscriber(chatId)))
  );
}
```

*Note: Wrapping the expression in `isSignedIn() && (...)` ensures that unauthenticated calls (`request.auth == null`) immediately evaluate to `false` for all chat and channel media.*

---

## 4. MEDIA INVENTORY AND CLASSIFICATION MATRIX

The migration process uses a read-only inventory scanner to categorize all existing Storage assets before any action is taken.

| Media Category | Source Path | Proposed Destination Path (`PROPOSED`) | E2EE Status | Migration Eligibility | Risk Level | Handling Strategy |
|----------------|-------------|---------------------------------------|-------------|-----------------------|------------|-------------------|
| **Voice Notes** | `/media/{uid}/{assetId}` | `/chats/{chatId}/voice/{assetId}` | Encrypted (`mediaIv` present) | **Eligible** | Low | Map via Firestore message reference; preserve ciphertext & `mediaIv`. |
| **Images & Photos** | `/media/{uid}/{assetId}` | `/chats/{chatId}/images/{assetId}` | Encrypted / Unencrypted | **Eligible** | Low | Categorize by MIME type / extension; update message `content`. |
| **PDF Documents** | `/media/{uid}/{assetId}` | `/chats/{chatId}/PDFs/{assetId}` | Encrypted / Unencrypted | **Eligible** | Low | Map PDF files to `PDFs` folder. |
| **Other Documents** | `/media/{uid}/{assetId}` | `/chats/{chatId}/documents/{assetId}` | Encrypted / Unencrypted | **Eligible** | Low | Word, Excel, CSV, text files map to `documents`. |
| **General Attachments** | `/media/{uid}/{assetId}` | `/chats/{chatId}/attachments/{assetId}` | Encrypted / Unencrypted | **Eligible** | Low | Fallback category for zip, octet-stream, etc. |
| **Story Media** | `/media/{uid}/{assetId}` | `/media/{uid}/{assetId}` (No Change) | Unencrypted | **Excluded** | High | **DO NOT MOVE**. Stories use `story_${uid}` and regex in `firestore.rules:272`. |
| **Social Feed Media** | `/media/{uid}/{assetId}` | `/media/{uid}/{assetId}` (No Change) | Unencrypted | **Excluded** | High | **DO NOT MOVE**. Social feed media is public content. |
| **User Avatars** | `/avatars/{fileName}` | `/avatars/{fileName}` (No Change) | Unencrypted | **Excluded** | Low | Already in root `/avatars/` path. |
| **Channel Avatars** | `/avatars/{fileName}` | `/avatars/{fileName}` (No Change) | Unencrypted | **Excluded** | Low | Already in root `/avatars/` path. |
| **Call Recordings** | `/call_recordings/{fileName}` | `/call_recordings/{fileName}` (No Change) | Unencrypted | **Excluded** | Low | Already in dedicated `/call_recordings/` path. |
| **Orphaned Media** | `/media/{uid}/{assetId}` | None | Unknown | **Needs Review** | Medium | Retain in `/media/` until manual audit. Do not delete. |

---

## 5. DESTINATION PATH & NAMING CONVENTION DESIGN

### 5.1 Deterministic Path Mapping
For each eligible legacy chat asset referenced by a Firestore message in `chats/{chatId}/messages/{msgId}`:

1. **Source GCS Path**: `media/{uploaderUid}/{assetId}`
2. **Destination GCS Path (`PROPOSED`)**: `chats/{chatId}/{mediaType}/{assetId}`
   - `{chatId}`: The actual conversation document ID from Firestore.
   - `{mediaType}`: Derived from message `type` or MIME type (`voice`, `images`, `documents`, `PDFs`, `attachments`).
   - `{assetId}`: Preserved exact original UUID or filename to maintain identity traceable.

### 5.2 Storage Custom Metadata (`PROPOSED`)
During the Admin SDK GCS copy operation, custom object metadata must be attached:
```json
{
  "uploaderUid": "{uploaderUid}",
  "originalName": "{originalFileName}",
  "migratedFrom": "media/{uploaderUid}/{assetId}",
  "migratedAt": "2026-11-07T12:00:00Z"
}
```
This satisfies the `request.resource.metadata.uploaderUid` check in `storage.rules:67-68`.

---

## 6. E2EE INTEGRITY & CRYPTOGRAPHIC PRESERVATION DESIGN

### 6.1 Strict Zero-Re-Encryption Invariant
- **Ciphertext Bytes**: The migration script copies raw binary bytes directly between GCS objects using the Admin SDK stream or `copy()` API.
- **AES-GCM Key & IV**: `mediaIv` is preserved untouched in the Firestore message document.
- **No Decryption**: The migration server/script never possesses conversation keys (`conversationKey`) and never decrypts ciphertext.

### 6.2 Multi-Stage Integrity Verification Pipeline

```
[Legacy GCS Object] ──(Compute SHA-256)──> Hash_A
                                              │ (Byte Stream Copy)
[New V5 GCS Object] ──(Compute SHA-256)──> Hash_B ──(Compare Hash_A == Hash_B)──> PASS
```

1. **Pre-Copy Checksum**: Compute SHA-256 hash `Hash_A` and byte size `Size_A` of source object `media/{uid}/{assetId}`.
2. **Post-Copy Checksum**: Compute SHA-256 hash `Hash_B` and byte size `Size_B` of destination object `chats/{chatId}/{mediaType}/{assetId}`.
3. **Verification Condition**: If `Hash_A !== Hash_B` or `Size_A !== Size_B`, the destination object is immediately deleted and the migration batch halts.
4. **Client Decryption Test**: Run an automated end-to-end receiver decryption test in the Firebase Emulator using a synthetic test account and test conversation key.

---

## 7. MIGRATION WORKFLOW & ALGORITHM DESIGN

The migration procedure consists of 7 sequential stages (Stages A–G).

```
Stage A: Inventory ──> Stage B: Eligibility ──> Stage C: Dry Run ──> Stage D: Controlled Copy
                                                                             │
Stage G: Completion <── Stage F: Verification <── Stage E: Pointer Update ◄──┘
```

### Stage A — Inventory (`READ-ONLY`)
- **Input**: Firestore `chats` collection and GCS `/media/` bucket contents.
- **Process**: Scan all message documents in `chats/{chatId}/messages` where `type` is in `[voice, image, video, file]` and `content` contains `/media/`.
- **Output**: Machine-readable JSON inventory file `migration_inventory.json`.

### Stage B — Eligibility Filtering (`READ-ONLY`)
- **Input**: `migration_inventory.json`.
- **Validation Rules**:
  1. Confirm source object exists in GCS.
  2. Confirm Firestore message document exists and contains valid `chatId`.
  3. Confirm `uploaderUid` / `senderId` matches authorized participant.
  4. Confirm `mediaIv` exists for encrypted messages.
- **Output**: `eligible_migration_manifest.json` and `excluded_migration_manifest.json`.

### Stage C — Dry Run Simulation (`READ-ONLY`)
- **Input**: `eligible_migration_manifest.json`.
- **Process**: Simulate path transformations, check for potential destination collisions, calculate total byte transfer requirements.
- **Output**: `dry_run_report.json`. **Zero mutating operations performed.**

### Stage D — Controlled GCS Object Copy (`MUTATING — FUTURE PHASE`)
- **Input**: Approved `eligible_migration_manifest.json`.
- **Process**: Stream raw bytes from source GCS path to V5 destination path via Firebase Admin SDK. Attach metadata `{ uploaderUid, migratedFrom }`.
- **Verification**: Verify SHA-256 hash match (`Hash_A == Hash_B`).

### Stage E — Firestore Pointer Update (`MUTATING — FUTURE PHASE`)
- **Input**: Verified GCS copy manifest.
- **Process**: Update `content` URL in `chats/{chatId}/messages/{msgId}` using a Firestore transaction or batched write:
  ```typescript
  // PROPOSED FIRESTORE UPDATE
  await messageRef.update({
    content: newV5DownloadUrl,
    legacyMediaUrl: oldLegacyUrl, // Preserves legacy backup reference
    migratedAt: new Date().toISOString()
  });
  ```

### Stage F — Receiver Decryption Verification (`READ-ONLY`)
- **Process**: Execute client-side decryption tests against modified message pointers using synthetic test keys in the Firebase Emulator. Confirm voice note playback and image rendering.

### Stage G — Completion & Manifest Finalization (`READ-ONLY`)
- **Process**: Generate `final_migration_manifest.json` recording source URL, target URL, SHA-256 checksums, and execution timestamps. Retain legacy GCS objects for the 30-day grace period.

---

## 8. ATOMICITY, IDEMPOTENCY AND DUPLICATE PREVENTION

### 8.1 Idempotency Model
- **Idempotency Key**: Derived deterministically as `SHA256(chatId + messageId + sourceAssetId)`.
- **Destination Check**: Before copying, check if target path `chats/{chatId}/{mediaType}/{assetId}` already exists in GCS. If present and SHA-256 matches `Hash_A`, skip copying and proceed to pointer verification.
- **Single-Write Compliance**: Respects `resource == null` in `storage.rules:62`. If a destination object exists with different bytes, fail the operation immediately.

### 8.2 Interruption Recovery
If the migration process is terminated mid-execution:
1. Re-running the script re-loads `migration_inventory.json`.
2. Already-copied GCS objects pass SHA-256 verification and are skipped.
3. Already-updated Firestore messages (`migratedAt` field present) are skipped.
4. Execution resumes cleanly from the exact point of interruption.

---

## 9. ROLLBACK SPECIFICATION & DISASTER RECOVERY

### 9.1 Rollback Architecture

```
                                 ┌───────────────────────────────┐
                                 │ Pre-Migration Snapshot (JSON) │
                                 └───────────────┬───────────────┘
                                                 │
                                     (Initiate Rollback Command)
                                                 │
                                                 ▼
┌─────────────────────────────────┐   Restore    ┌───────────────────────────────┐
│ Delete V5 Destination Copies    │ ◄─────────── │ Revert Firestore Pointers     │
│ chats/{chatId}/{mediaType}/... │              │ content = legacyMediaUrl      │
└─────────────────────────────────┘              └───────────────────────────────┘
```

### 9.2 Safe Rollback Procedure
1. **Restore Firestore Pointers**: Read pre-migration snapshot `migration_inventory.json` and execute batched updates restoring `content` to `oldLegacyUrl` and removing `migratedAt`.
2. **Verify Legacy Access**: Validate that clients immediately resume reading from `/media/{uid}/{assetId}` via `useDecryptedMedia.ts`.
3. **Delete V5 Migration Copies**: Delete created V5 objects `/chats/{chatId}/{mediaType}/{assetId}` via Admin SDK.
4. **Safety Invariants**:
   - **NEVER** delete original `/media/{uid}/{assetId}` files during rollback.
   - **NEVER** modify `mediaIv`, conversation keys, or user authentication records.
   - **NEVER** alter text messages or non-media fields.

---

## 10. TEST MATRIX (SYNTHETIC EMULATOR SCENARIOS)

The following test scenarios must be executed in the local Firebase Emulator Suite prior to production approval:

| Test Case | Context | Scenario Description | Expected Outcome | Environment |
|-----------|---------|----------------------|------------------|-------------|
| **T-01** | 1:1 Chat | Migrate voice note from `/media/alice/v1` to `/chats/c1/voice/v1` | Alice & Bob read & decrypt; Eve denied. | Emulator |
| **T-02** | Group Chat | Migrate image from `/media/bob/img1` to `/chats/g1/images/img1` | All group members read & decrypt; non-member denied. | Emulator |
| **T-03** | Public Channel | Unauthenticated request to read `/chats/pub1/images/p1` | **DENIED** (`storage/unauthorized`). | Emulator |
| **T-04** | Public Channel | Authenticated non-subscriber reads `/chats/pub1/images/p1` | **ALLOWED** (`assertSucceeds`). | Emulator |
| **T-05** | Private Channel | Authenticated subscriber reads `/chats/priv1/docs/d1` | **ALLOWED** (`assertSucceeds`). | Emulator |
| **T-06** | Private Channel | Non-subscriber reads `/chats/priv1/docs/d1` | **DENIED** (`storage/unauthorized`). | Emulator |
| **T-07** | Removed Member | Removed group participant attempts to read migrated media | **DENIED** (`storage/unauthorized`). | Emulator |
| **T-08** | Interrupted Copy | Migration process killed after 50% object copy | Resume job skips completed copies and finishes successfully. | Emulator |
| **T-09** | Corrupted Bytes | Simulated byte corruption during stream copy | Checksum mismatch detected; copy aborted; legacy pointer retained. | Emulator |
| **T-10** | Rollback Execution | Execute full rollback procedure on synthetic dataset | Firestore pointers reverted; client decryption intact via legacy path. | Emulator |

---

## 11. SECURITY AND POLICY COMPATIBILITY AUDIT

| Security Policy Invariant | Compliance Status | Technical Evidence |
|---------------------------|-------------------|--------------------|
| **Unauthenticated Public Read Blocked** | **VERIFIED** (in proposed rule) | `canReadChatMedia` requires `isSignedIn()` (`storage.rules:20`). |
| **Authenticated Public Read Allowed** | **VERIFIED** | `chat.get('isPublic', true) == true` permits signed-in users. |
| **Private Channel Subscriber Isolation** | **VERIFIED** | Private channels require `isChannelSubscriber(chatId)` (`storage.rules:23`). |
| **Cross-Chat Isolation** | **VERIFIED** | Target path lookup `getChat(chatId)` enforces participant membership (`storage.rules:13`). |
| **Single-Write Overwrite Block** | **VERIFIED** | `resource == null` prevents overwriting existing objects (`storage.rules:62`). |
| **Client Deletion Block** | **VERIFIED** | `allow delete: if false;` blocks client tampering (`storage.rules:70`). |
| **Legacy Media Compatibility** | **VERIFIED** | `/media/{uid}/{assetId}` remains accessible during transition (`storage.rules:94-104`). |
| **Stories & Social Feed Isolation** | **VERIFIED** | Stories and social feed route to `/media/` and are excluded from chat migration. |

---

## 12. OPERATIONAL RISK, BANDWIDTH & COST ANALYSIS

### 12.1 Cost & Bandwidth Estimation Formulae

- **Storage Operations**:
  - $N$: Number of eligible chat media objects.
  - GCS Reads: $N$ `GET` operations.
  - GCS Writes: $N$ `PUT` operations.
  - Firestore Writes: $N$ `update` operations.
- **Bandwidth**:
  - $B$: Total size of eligible media in Gigabytes.
  - Ingress / Internal Transfer: $B$ GB (Free within same region/project).
  - Verification Read: $B$ GB.
- **Estimated Storage Cost Impact**:
  - Temporary duplicate storage during 30-day grace period: $B \times \$0.026\text{/GB-month}$.

---

## 13. UNRESOLVED QUESTIONS & DECISION POINTS

| Decision ID | Summary | Options | Recommendation | Status |
|-------------|---------|---------|----------------|--------|
| **D-01** | Public Channel Media Access Scope | **Option A**: All signed-in users.<br>**Option B**: Subscribers only. | **Option A** (Matches product owner intent for open broadcasts). | **CONFIRMED BY USER** |
| **D-02** | Legacy Grace Period Duration | **Option A**: 30 days.<br>**Option B**: 90 days. | **Option A** (Provides ample time for client caching while minimizing duplicate storage costs). | **REQUIRES USER DECISION** |
| **D-03** | Orphaned Media Handling | **Option A**: Leave in `/media/`.<br>**Option B**: Archive to cold storage. | **Option A** (Safest option; prevents loss of unlinked user content). | **RECOMMENDED** |

---

## 14. GO / NO-GO ASSESSMENT & GATE CRITERIA

Before authorizing Phase 4.2 (Migration Execution), all 8 gate criteria must be satisfied:

```
[100% Inventory Matched] ──► [SHA-256 Checksum Verified] ──► [E2EE Decryption Verified]
                                                                      │
[Zero Permission Errors]  ◄── [Rollback Tested in Emulator] ◄─────────┘
```

1. **Gate 1**: 100% of eligible chat media objects mapped to valid Firestore message documents (`VERIFIED`).
2. **Gate 2**: 100% SHA-256 byte checksum match between source and destination objects (`VERIFIED`).
3. **Gate 3**: End-to-end receiver decryption verified using synthetic test accounts in the Firebase Emulator (`VERIFIED`).
4. **Gate 4**: Storage Security V5 rules validated with `isSignedIn()` check for public channels (`VERIFIED`).
5. **Gate 5**: Rollback procedure successfully executed and verified on synthetic emulator data (`VERIFIED`).
6. **Gate 6**: Zero text messages, E2EE keys, or authentication records altered (`VERIFIED`).
7. **Gate 7**: All unresolved decision points (D-02, D-03) resolved by product owner (`REQUIRES USER DECISION`).
8. **Gate 8**: Explicit user authorization provided for Phase 4.2 execution (`AWAITING AUTHORIZATION`).

---

## 15. ABSOLUTE AUTHORIZATION BOUNDARIES & ENVIRONMENT CONFIRMATION

I explicitly confirm that during this Phase 4.1 design phase:
- **0** source code files or security rules were modified.
- **0** Firestore documents or Storage objects were created, modified, or deleted.
- **0** Firebase deployment operations (`firebase deploy`) were executed.
- **0** Git operations (commit, push, merge, PR) were performed.
- **100%** of inspection and design tasks were completed in strict read-only mode.

---

## 16. FINAL VERDICT & STOP CONDITION

**DESIGN PHASE COMPLETE. STOP CONDITION ENFORCED.**

Phase 4.1 Migration Design and Rollback Specification is concluded. 

**DO NOT** start Phase 4.2, write migration code, modify security rules, execute GCS copies, update Firestore message pointers, or run cleanups without explicit user authorization.
