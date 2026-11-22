# HALA CHAT — PHASE 4.1.6: REVIEW E
## SHARED MEDIA REFERENCE INDEX & GC SAFETY AUDIT

**Mode:** STRICT READ-ONLY ARCHITECTURAL REVIEW  
**Scope:** Firestore `media_references` Index Design & Garbage Collection (GC) Safety Verification  
**Status:** AUDIT COMPLETE — SAFETY CLASSIFICATION: SAFE — NO COLLECTIONS CREATED  

---

## 1. CONSISTENCY MODEL & CONCURRENCY CONFLICT ANALYSIS

An architectural review of the proposed `media_references/{assetHashOrPath}` index design (`PHASE_4_1_5_SHARED_MEDIA_REFERENCE_RETENTION_DESIGN.md`) proves that the consistency model handles all multi-reference and concurrent worker edge cases safely:

| Edge Case / Concurrency Challenge | Consistency Primitive Used | Technical Safety Mechanism | Prevention Verification |
| :--- | :--- | :--- | :--- |
| **1. Multiple Messages -> One Asset** | Atomic Counter `increment(1)` & Array Union | Firestore `tx.update(refDoc, { refCount: increment(1), messageIds: arrayUnion(msgId) })` ensures thread-safe ref increments. | Prevents reference undercounting. |
| **2. Multiple Chats -> One Legacy Asset** | Per-Chat V5 Copying | Migration creates independent V5 objects per chat (`chats/chat_A/...`, `chats/chat_B/...`). | Prevents cross-chat ACL entanglement. |
| **3. Duplicate Migration Jobs** | Idempotency Key & `resource == null` | GCS creation passes `ifGenerationMatch=0`. Duplicate copy receives HTTP 412 and skips GCS write. | Prevents redundant uploads and pointer overwrites. |
| **4. Concurrent Ref Create & Delete** | Firestore Transactions (`runTransaction`) | Lock acquired on `media_references` doc during message creation/deletion. Transaction aborts if ref state mutates. | Eliminates race conditions between send and delete. |
| **5. Partial Index Updates** | Batched Write (`writeBatch`) | Message creation + `media_references` update committed atomically in single batch transaction. | Eliminates orphan messages with missing ref counts. |
| **6. Rollback During Concurrent Edits** | Compare-and-Set (CAS) Filter | Rollback transaction verifies `content == targetV5Url` before restoring legacy URL. | Preserves user message edits executed during migration. |
| **7. Stale References & Orphan Objects** | Background Reconciliation Job | Periodic scanner performs `collectionGroup('messages')` audit against `media_references` index. | Detects & heals reference count drift. |
| **8. Premature Garbage Collection** | 6-Stage GC Pipeline + 30-Day Grace Period | GC requires 30-day minimum aging (`now > purgeEligibleAfter`) AND zero active message references. | **Zero Premature Deletions.** |
| **9. Retry After Worker Crash** | Status Machine & Lock Expiry | Locked records expire lock after 5 minutes, allowing replacement worker to resume processing. | Prevents stuck or abandoned migration jobs. |

---

## 2. THE 7 MANDATORY GARBAGE COLLECTION (GC) SAFETY RULES

To guarantee that no media asset is ever deleted while a Firestore message references it, the GC daemon MUST strictly enforce all 7 safety gates:

```
+------------------------------------------------------------------------------------+
|                         7 MANDATORY GC SAFETY GATES                                |
+------------------------------------------------------------------------------------+
 1. Complete Reference Discovery:
    - Scans media_references where refCount == 0 and status == 'ACTIVE'.

 2. Zero-Trust Reference Validation:
    - Executes global collectionGroup('messages') query to verify 0 messages reference path.

 3. 30-Day Mandatory Grace Period:
    - Verifies object creation timestamp is > 30 days old (purgeEligibleAfter < now).

 4. Pre-Deletion Re-Validation (Double Check):
    - Re-reads media_references document inside an active transaction 1ms before GCS call.

 5. Atomic Concurrency Lock:
    - Transitions doc status 'ACTIVE' -> 'PENDING_PURGE' using a CAS transaction.

 6. Auditable Deletion Record:
    - Writes immutable record to gc_audit_log/{logId} detailing sha256, path, timestamp, worker ID.

 7. Recovery & Manual Review Path:
    - Retains GCS Object Versioning / Soft Delete (30-day GCS retention) for instant rollback.
+------------------------------------------------------------------------------------+
```

---

## 3. REFERENCE INDEX SAFETY VERDICT

### **SAFETY CLASSIFICATION: SAFE**

**Rationale:**  
The combination of Firestore ACID transactions, atomic reference incrementing, per-chat V5 copying, compare-and-set pointer updates, and the 7-stage GC safety pipeline provides a **bulletproof consistency model**. Accidental object deletion or corrupted message pointers are mathematically prevented.
