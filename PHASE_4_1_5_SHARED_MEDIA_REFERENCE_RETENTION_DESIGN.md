# HALA CHAT — PHASE 4.1.5: DESIGN C
## SHARED MEDIA REFERENCE RETENTION AND GARBAGE COLLECTION DESIGN

**Mode:** STRICT READ-ONLY DESIGN SPECIFICATION  
**Scope:** Multi-Message / Multi-Chat Shared Media Retention, Deletion Safety, and Garbage Collection  
**Status:** DESIGN ONLY — NO DATA OR STORAGE DELETION AUTHORIZED  

---

## 1. CURRENT ARCHITECTURE AUDIT & MULTI-REFERENCE CHALLENGES

An inspection of the Hala Chat codebase (`src/lib/firebase.ts`, `src/lib/media.ts`, `src/types/index.ts`) reveals the following structural realities:

1. **Current Firestore Data Model:** Messages store a single string URL field (`content`) and optional IV (`mediaIv`). There is **no explicit reference counter**, **no reference index document**, and **no central media registry** in Firestore.
2. **Forwarded Media Pattern:** When a user forwards an encrypted or legacy message from Chat A to Chat B, the application currently copies the message document, creating a second message pointing to the **exact same underlying Storage URL**.
3. **V5 Chat-Scoped Storage Model:** Storage Security V5 isolates access to `chats/{chatId}/{mediaType}/{assetId}`. Multi-chat forwarding under V5 mandates creating a **per-chat GCS object copy** so Chat B members can authorize their reads against `chats/chat_B/...` without depending on Chat A access rights.
4. **Risks of Uncoordinated Deletion:**
   - If User A deletes their message in Chat A, or if a legacy cleanup job deletes a legacy asset `/media/user_A/asset_1`, User B's message in Chat B will break ("Media Not Found").
   - If a migration rollback occurs for Chat A while Chat B remains migrated, deleting the legacy asset breaks Chat A.

---

## 2. MULTI-REFERENCE SCENARIO ANALYSIS

---

### Scenario C-01: Single Legacy Asset Referenced by Multiple Messages in Same Chat
- **Context:** A user posts a voice note, and later quotes/forwards it within the same chat, producing 2 message documents pointing to `/media/user_A/voice_01.enc`.
- **V5 Migration Behavior:** Migration copies object to `chats/chat_A/voice/asset_V5.enc`. **Both** message documents in Chat A are updated via compare-and-set to point to `chats/chat_A/voice/asset_V5.enc`.
- **Retention Guard:** Legacy asset `/media/user_A/voice_01.enc` is NOT deleted immediately. It enters the 30-day retention grace period.

### Scenario C-02: Single Legacy Asset Referenced by Multiple Distinct Chats
- **Context:** Message in Chat A (1-on-1) is forwarded to Chat B (Group) and Channel C (Public). All 3 messages initially reference `/media/user_A/photo_01.enc`.
- **V5 Migration Behavior:** Migration process performs **isolated per-chat copies**:
  - Copy 1 -> `chats/chat_A/images/asset_A.enc`
  - Copy 2 -> `chats/chat_B/images/asset_B.enc`
  - Copy 3 -> `chats/channel_C/images/asset_C.enc`
  - Each chat's message pointer is updated to its own chat-scoped path.
- **Security Invariant:** Each chat target receives its own GCS object, preventing cross-chat ACL dependencies or privilege leaks.

### Scenario C-03: Single Message Deletion While Others Still Reference Asset
- **Context:** User deletes Message 1 in Chat A. Message 2 in Chat B still references the migrated asset.
- **Protection Rule:** Client message deletion ONLY deletes the Firestore message document `chats/chat_A/messages/msg_1`. **It NEVER issues a GCS `deleteObject()` call directly.** GCS cleanup is strictly managed asynchronously by the Garbage Collection service.

### Scenario C-04: Partial Migration & Rollback Safety
- **Context:** Chat A migration succeeds. Chat B migration fails or is rolled back to legacy pointers.
- **Protection Rule:** Legacy source media `/media/user_A/photo_01.enc` remains 100% untouched throughout the entire migration process. Chat B continues serving legacy media safely.

---

## 3. DESIGN OF THE REFERENCE INDEX & DELETION PROTECTION SYSTEM

To ensure zero media loss, the future migration architecture introduces an explicit **Media Reference Index** collection in Firestore: `media_references/{assetHashOrPath}`.

```typescript
interface MediaReferenceIndexDoc {
  legacyStoragePath: string;          // e.g. "media/user_A/asset_123.enc"
  sha256Hash: string;                 // Hex SHA-256 digest of ciphertext
  refCount: number;                   // Active Firestore message references
  referencingMessageIds: string[];    // List of "chats/{chatId}/messages/{msgId}"
  migratedCopies: {                   // Map of chat-scoped V5 copies
    [chatId: string]: {
      v5StoragePath: string;          // e.g. "chats/chat_A/voice/asset_v5.enc"
      copiedAt: string;
    };
  };
  status: 'ACTIVE' | 'PENDING_PURGE' | 'PURGED';
  purgeEligibleAfter: string | null;  // ISO timestamp (Creation + 30 days)
  createdAt: string;
  updatedAt: string;
}
```

---

## 4. SAFE GARBAGE COLLECTION PROCEDURE (6-STAGE PIPELINE)

The Garbage Collection (GC) daemon executes under strict safety controls. **No deletion occurs without passing all 6 stages:**

```
[ Stage 1: Candidate Discovery ]
       │  Scans media_references where refCount == 0
       ▼
[ Stage 2: Cross-Database Reference Verification ]
       │  Executes collectionGroup query across ALL messages for legacyStoragePath & v5StoragePath
       ▼
[ Stage 3: 30-Day Retention Grace Period Check ]
       │  Verifies currentTimestamp > purgeEligibleAfter (30 days minimum retention)
       ▼
[ Stage 4: Compare-And-Set (CAS) Lock & Status Shift ]
       │  Firestore Transaction: Atomically transitions status 'ACTIVE' -> 'PENDING_PURGE'
       ▼
[ Stage 5: GCS Object Deletion & Audit Logging ]
       │  Deletes GCS object with ifGenerationMatch precondition; writes audit document to gc_audit_log
       ▼
[ Stage 6: Final Tombstone Confirmation ]
       │  Updates media_references document status to 'PURGED'
```

### Detailed Stage Specifications

1. **Stage 1 — Candidate Discovery:**  
   Query `media_references` for documents where `refCount == 0` and `status == 'ACTIVE'`.
2. **Stage 2 — Reference Verification (Zero-Trust Double-Check):**  
   Issue a global Firestore `collectionGroup('messages')` query matching `content == legacyStoragePath` or `content == v5StoragePath`. If ANY message document is returned, reset `refCount`, update `referencingMessageIds`, and abort candidate purge immediately.
3. **Stage 3 — Grace Period Enforcement:**  
   Verify that `purgeEligibleAfter` timestamp is at least 30 days in the past (`now > purgeEligibleAfter`). If within 30 days, skip candidate.
4. **Stage 4 — Compare-and-Set Lock:**  
   Execute Firestore transaction:
   ```typescript
   await runTransaction(db, async (tx) => {
     const docSnap = await tx.get(refDocRef);
     if (docSnap.data().refCount > 0) throw new Error('ABORT_ACTIVE_REFERENCES');
     tx.update(refDocRef, { status: 'PENDING_PURGE', lockedAt: serverTimestamp() });
   });
   ```
5. **Stage 5 — GCS Deletion & Audit Log:**  
   Delete GCS object passing `ifGenerationMatch: targetGeneration`. Write immutable audit record to `gc_audit_log/{logId}` containing `deletedPath`, `generation`, `sha256`, `deletedByWorkerId`, `timestamp`.
6. **Stage 6 — Recovery & Tombstone:**  
   Update `media_references` doc to `status: 'PURGED'`. If GCS deletion fails, revert status to `ACTIVE`.

---

## 5. RECOVERY PROCEDURE FOR ACCIDENTAL DELETION CLAIMS
If a user reports missing media:
1. Search `gc_audit_log` by `sha256` or `messageId`.
2. If `status == 'PENDING_PURGE'`, restore object immediately from GCS Soft Delete / Object Versioning (30-day GCS retention enabled).
3. If `status == 'ACTIVE'`, verify Firestore message pointer and correct path resolution.

---

## 6. SUMMARY OF DESIGN C DISCIPLINE
This retention and GC specification ensures that **no media object is ever deleted while a Firestore message references it**, and mandates a 30-day safety buffer with explicit reference index verification prior to any storage reclamation.
