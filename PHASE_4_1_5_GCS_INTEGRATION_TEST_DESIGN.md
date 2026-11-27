# HALA CHAT — PHASE 4.1.5: DESIGN A
## ISOLATED GCS INTEGRATION TEST DESIGN SPECIFICATION

**Mode:** STRICT READ-ONLY DESIGN SPECIFICATION  
**Scope:** Real Google Cloud Storage (GCS) Preconditions, Object-Copy Semantics, and Error Handling  
**Status:** DESIGN ONLY — NO EXECUTION, NO DEPLOYMENT, NO CLOUD BUCKET CREATION AUTHORIZED  

---

## 1. EXECUTIVE SUMMARY & ISOLATION INFRASTRUCTURE REQUIREMENTS

The synthetic Firebase Storage Emulator used in Phase 4.1.3 validates client security rules evaluation (`resource == null`), but **does not execute or validate true Google Cloud Storage (GCS) generation preconditions** (e.g., `ifGenerationMatch=0` object creation headers or generation-scoped atomic rewrite calls provided by the Google Cloud Storage API / Node.js `@google-cloud/storage` SDK).

This document specifies the technical design for a future, isolated GCS integration test suite using a dedicated non-production GCS test bucket.

### 1.1 Dedicated Test Project & Bucket Requirements
- **Test Cloud Project ID:** `hala-chat-staging-test-env` (STRICTLY ISOLATED from production `gen-lang-client-0446181078` and production Firebase `ai-studio-hala-efac1993-f3c4-44ed-b676-ccb87cb486aa`).
- **Test GCS Bucket Name:** `gs://hala-chat-v5-migration-test-bucket-isolated`
- **Region:** `europe-west1` (Matching production region).
- **Bucket Configuration:** Standard Storage class, Uniform Bucket-Level Access ENABLED, Object Versioning ENABLED.

### 1.2 Least-Privilege Synthetic IAM Credentials
- **Service Account:** `v5-migration-tester@hala-chat-staging-test-env.iam.gserviceaccount.com`
- **IAM Roles:**
  - `roles/storage.objectAdmin` (Restricted via IAM condition strictly to `gs://hala-chat-v5-migration-test-bucket-isolated/*`).
  - `roles/datastore.user` (Restricted to test Firestore instance `hala-staging-db`).
- **Forbidden Privileges:** No access to production GCS buckets (`gs://*hala*prod*`), no IAM policy modification, no project-wide administrative rights.

### 1.3 Synthetic Object Naming & Lifecycle
- **Test Path Namespace:** `test_runs/{test_run_id}/chats/{chatId}/{mediaType}/{assetId}`
- **Test Run ID Format:** `tr_YYYYMMDD_HHMMSS_<rand8>`
- **Retention & Auto-Cleanup Policy:** Lifecycle rule attached to `gs://hala-chat-v5-migration-test-bucket-isolated` configured to automatically purge test objects older than 7 days (`Age: 7`). Immediate post-test cleanup script executes after each test run.

### 1.4 Execution Evidence & Cost Controls
- **Audit Logging:** Every test operation logs `test_id`, `source_path`, `source_generation`, `dest_path`, `dest_generation`, `gcs_response_status`, `ifGenerationMatch_header`, `duration_ms`.
- **Cost Guardrails:** Maximum 100MB total test payload per test run; rate-limited worker concurrency max 4 threads; total monthly budget cap set to $5.00.

---

## 2. DETAILED TEST SCENARIOS (GCS-01 THROUGH GCS-12)

> **CRITICAL NOTE ON EMULATOR LIMITATIONS:**  
> In Firebase Storage Emulator, upload logic relies on client-side security rules (`allow create: if resource == null`). In true GCS API calls (Node.js SDK `bucket.file().copy()` or `file.createWriteStream({ preconditionOpts: { ifGenerationMatch: 0 } })`), atomicity is enforced at the GCS object metadata layer via HTTP headers (`x-goog-if-generation-match: 0`).  
> *The tests below design the validation of these exact GCS-level preconditions.*

---

### GCS-01: Create Destination Object Only When It Does Not Exist

- **Preconditions:** Source object `test_runs/tr_01/chats/chat_src/voice/v01.enc` exists with generation `17000000000001`. Destination object `test_runs/tr_01/chats/chat_dst/voice/v01.enc` does **NOT** exist.
- **Synthetic Fixture:** 100KB encrypted AES-GCM blob. SHA-256: `a1b2c3...`.
- **Operation:** Execute copy operation with GCS precondition header `ifGenerationMatch: 0` (`x-goog-if-generation-match: 0`).
- **Expected GCS Behavior:** HTTP `200 OK`. Destination created with assigned generation `17000000000002` and matching SHA-256 hash.
- **Expected Firestore Behavior:** Migration pointer updated to `chats/chat_dst/voice/v01.enc`.
- **Failure Handling:** None expected.
- **Recovery Behavior:** N/A.
- **Evidence to Capture:** GCS response headers (`x-goog-generation`, `x-goog-hash`), HTTP status 200.
- **Pass/Fail Criteria:** PASS if destination object is created and generation match header succeeds.

---

### GCS-02: Verify `ifGenerationMatch=0` Precondition Enforcement

- **Preconditions:** Destination object `test_runs/tr_02/chats/chat_dst/voice/v02.enc` **ALREADY EXISTS** (Generation `17000000000010`).
- **Synthetic Fixture:** Test encrypted blob.
- **Operation:** Attempt to copy source object to destination path specifying `ifGenerationMatch: 0`.
- **Expected GCS Behavior:** GCS API rejects operation with HTTP `412 Precondition Failed` (`conditionNotMet`). Original destination content and generation remain completely unmodified.
- **Expected Firestore Behavior:** Migration worker catches HTTP 412 error and halts overwrite attempt.
- **Failure Handling:** Worker logs destination conflict without mutating Firestore record.
- **Recovery Behavior:** Trigger conflict resolution (check destination SHA-256 vs source SHA-256).
- **Evidence to Capture:** GCS error response `412 Precondition Failed`, original object generation check.
- **Pass/Fail Criteria:** PASS if HTTP 412 is raised and existing object is preserved without modification.

---

### GCS-03: Concurrent Workers Attempting to Create Same Destination

- **Preconditions:** Destination path `test_runs/tr_03/chats/chat_dst/voice/v03.enc` does not exist. Two migration workers (Worker Alpha, Worker Beta) trigger copy simultaneously.
- **Synthetic Fixture:** Identical media payload (SHA-256: `c3d4e5...`).
- **Operation:** Parallel API requests from Alpha and Beta both passing `ifGenerationMatch: 0`.
- **Expected GCS Behavior:** Exactly **ONE** worker receives HTTP `200 OK` (e.g. Alpha gets generation `17000000000020`). The second worker receives HTTP `412 Precondition Failed` (Beta rejected).
- **Expected Firestore Behavior:** Winning worker updates pointer; losing worker detects HTTP 412, verifies destination hash matches, and skips duplicate Firestore update safely.
- **Failure Handling:** HTTP 412 treated as idempotent skip if hash matches.
- **Recovery Behavior:** Non-destructive continuation.
- **Evidence to Capture:** Dual request execution logs, timestamp diffs, HTTP 200 vs HTTP 412 statuses.
- **Pass/Fail Criteria:** PASS if exactly one write succeeds and no data corruption occurs.

---

### GCS-04: Existing Destination Object with Identical SHA-256 (Idempotent Hit)

- **Preconditions:** Destination object exists at `test_runs/tr_04/chats/chat_dst/voice/v04.enc` with SHA-256 `d4e5f6...`. Source object has identical SHA-256 `d4e5f6...`.
- **Synthetic Fixture:** 500KB encrypted image blob.
- **Operation:** Worker detects destination existence (or gets HTTP 412 with `ifGenerationMatch: 0`), reads destination GCS `md5Hash` / `sha256` metadata.
- **Expected GCS Behavior:** No re-upload or re-copy performed.
- **Expected Firestore Behavior:** Compare-and-set pointer update marks message record migrated.
- **Failure Handling:** N/A.
- **Recovery Behavior:** Worker proceeds to next record.
- **Evidence to Capture:** Hash comparison log, GCS bandwidth saved (0 bytes transferred).
- **Pass/Fail Criteria:** PASS if operation terminates idempotently with matching hashes verified.

---

### GCS-05: Existing Destination Object with Different SHA-256 (Collision Conflict)

- **Preconditions:** Destination exists at `test_runs/tr_05/chats/chat_dst/voice/v05.enc` with SHA-256 `e5f6a7...`. Source has SHA-256 `001122...` (Path collision or corrupted object).
- **Synthetic Fixture:** Two distinct blobs mapping to same target asset path.
- **Operation:** Worker attempts copy with `ifGenerationMatch: 0` -> Receives HTTP 412. Worker inspects destination hash -> Hash mismatch detected.
- **Expected GCS Behavior:** Existing destination preserved.
- **Expected Firestore Behavior:** Firestore message state marked `MIGRATION_ERROR_PATH_COLLISION`. Message media pointer remains pointing safely to legacy path.
- **Failure Handling:** Non-destructive error logging to admin audit log.
- **Recovery Behavior:** Human/admin review queue.
- **Evidence to Capture:** Audit log entry detailing source vs destination SHA-256 mismatch.
- **Pass/Fail Criteria:** PASS if conflict is flagged and neither source nor destination data is corrupted.

---

### GCS-06: Source Object Missing During Copy

- **Preconditions:** Firestore record references `media/user_99/missing_asset.enc`, but object was deleted or missing in GCS.
- **Synthetic Fixture:** Orphaned Firestore document pointer.
- **Operation:** Worker executes GCS copy request for `media/user_99/missing_asset.enc`.
- **Expected GCS Behavior:** GCS API returns HTTP `404 Not Found` (`notFound`).
- **Expected Firestore Behavior:** Message state set to `MIGRATION_SKIPPED_SOURCE_MISSING`. Legacy URL retained.
- **Failure Handling:** Worker logs missing asset notice without crashing process.
- **Recovery Behavior:** Flag record for missing-media tombstone rendering.
- **Evidence to Capture:** GCS HTTP 404 response body, Firestore error state record.
- **Pass/Fail Criteria:** PASS if worker handles 404 cleanly without pipeline termination.

---

### GCS-07: Copy Interrupted Before Completion (Network Cut / Timeout)

- **Preconditions:** Source object size 15MB. Destination does not exist.
- **Synthetic Fixture:** 15MB video chunk.
- **Operation:** Initiate GCS rewrite/copy call and inject network drop at 50% bytes transferred.
- **Expected GCS Behavior:** GCS multipart rewrite session expires or cancels. No partial/corrupted object finalized at destination path.
- **Expected Firestore Behavior:** Firestore message state remains `MIGRATION_IN_PROGRESS` or resets to `UNMIGRATED` upon lock expiry.
- **Failure Handling:** Retry handler picks up task after backoff.
- **Recovery Behavior:** Worker re-attempts copy from start using `ifGenerationMatch: 0`.
- **Evidence to Capture:** Connection reset error log, GCS `stat` call confirming target path remains empty.
- **Pass/Fail Criteria:** PASS if no partial object is committed at target path.

---

### GCS-08: Worker Crashes After Copy But Before Firestore Pointer Update

- **Preconditions:** GCS copy succeeds (Destination `test_runs/tr_08/...` created with Generation `17000000000099`). Worker process suffers `SIGKILL` before executing Firestore transaction.
- **Synthetic Fixture:** Encrypted PDF blob.
- **Operation:** Execute copy, terminate process immediately post-copy.
- **Expected GCS Behavior:** Destination object exists and is intact in GCS.
- **Expected Firestore Behavior:** Message record still points to legacy path (Unmigrated).
- **Failure Handling:** Lock timeout expires (e.g. 5 minutes). Second worker takes lock.
- **Recovery Behavior:** Worker 2 checks target path -> Discovers intact object with matching SHA-256 -> Executes CAS Firestore update directly without re-copying.
- **Evidence to Capture:** Lock expiration log, Worker 2 recovery timestamp.
- **Pass/Fail Criteria:** PASS if recovery worker completes migration seamlessly without duplicate GCS writes.

---

### GCS-09: Retry After Interrupted Copy

- **Preconditions:** A prior copy attempt failed midway (GCS-07). Target path is empty or incomplete.
- **Synthetic Fixture:** Encrypted voice recording.
- **Operation:** Execute migration retry worker.
- **Expected GCS Behavior:** New copy request issued with `ifGenerationMatch: 0`. Upload succeeds HTTP 200.
- **Expected Firestore Behavior:** Firestore record state transitions from `RETRYING` to `MIGRATED`.
- **Failure Handling:** Exponential backoff (1s, 2s, 4s).
- **Recovery Behavior:** Full operational recovery.
- **Evidence to Capture:** Retry attempt counter log, final success status.
- **Pass/Fail Criteria:** PASS if retry succeeds cleanly.

---

### GCS-10: Source Generation Changes Between Discovery and Copy

- **Preconditions:** Worker reads source metadata (Generation `1001`). External process modifies source object (Generation changes to `1002`).
- **Synthetic Fixture:** Mutable non-chat storage asset.
- **Operation:** Copy call passes `ifSourceGenerationMatch: 1001`.
- **Expected GCS Behavior:** GCS API returns HTTP `412 Precondition Failed` for source generation mismatch.
- **Expected Firestore Behavior:** Migration fails safe.
- **Failure Handling:** Worker re-reads source metadata and re-evaluates.
- **Recovery Behavior:** Re-read & restart pipeline.
- **Evidence to Capture:** HTTP 412 source generation mismatch response log.
- **Pass/Fail Criteria:** PASS if concurrent mutation of source prevents corrupted copy.

---

### GCS-11: Destination Object Metadata and Content Integrity

- **Preconditions:** Source object has custom metadata (`originalName: 'invoice.pdf'`, `uploaderUid: 'user_123'`, `contentType: 'application/pdf'`).
- **Synthetic Fixture:** Document payload.
- **Operation:** Execute GCS copy. Inspect destination metadata and raw bytes.
- **Expected GCS Behavior:** Destination object has identical `contentType`, `customMetadata`, `crc32c`, and `md5Hash`.
- **Expected Firestore Behavior:** Firestore pointer updated.
- **Failure Handling:** Integrity check compares source vs destination `crc32c` post-copy.
- **Recovery Behavior:** Delete corrupted target if `crc32c` fails.
- **Evidence to Capture:** Source vs target GCS metadata JSON comparison report.
- **Pass/Fail Criteria:** PASS if 100% metadata and byte-for-byte checksum fidelity is verified.

---

### GCS-12: Unauthorized GCS Operations Are Rejected

- **Preconditions:** Unauthenticated client or worker with invalid service account credentials attempts GCS write or copy to `test_runs/tr_12/...`.
- **Synthetic Fixture:** Malicious upload payload.
- **Operation:** Issue GCS copy/write request without valid OAuth 2.0 Bearer token or bucket IAM permissions.
- **Expected GCS Behavior:** HTTP `401 Unauthorized` or HTTP `403 Forbidden` (`storage.objects.create` access denied).
- **Expected Firestore Behavior:** Operation denied. No storage or database mutation occurs.
- **Failure Handling:** Exception caught and reported as authorization breach attempt.
- **Recovery Behavior:** N/A.
- **Evidence to Capture:** GCS HTTP 401/403 XML/JSON error response log.
- **Pass/Fail Criteria:** PASS if unauthorized request is strictly blocked.

---

## 3. SUMMARY OF DESIGN A DISCIPLINE
This test design establishes **exact, unyielding preconditions for actual GCS behavior**. It guarantees that when executed in a future authorized staging environment, every GCS edge case is handled safely without data loss, race conditions, or unauthorized overwrites.
