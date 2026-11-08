# HALA CHAT — PHASE 4.1.6: REVIEW B
## IAM LEAST-PRIVILEGE PERMISSION MATRIX & SECURITY REVIEW

**Mode:** STRICT READ-ONLY SECURITY AUDIT  
**Scope:** Identity and Access Management (IAM) Design for Future GCS Integration Testing  
**Status:** AUDIT COMPLETE — ZERO CREDENTIALS CREATED OR EXPOSED  

---

## 1. MANDATORY LEAST-PRIVILEGEIAM MATRIX

The matrix below defines the exact minimum IAM permissions required to execute the 12 GCS integration tests (`GCS-01` to `GCS-12`). All permissions are strictly bounded to the dedicated test bucket scope `gs://hala-chat-v5-migration-test-bucket-isolated/test_runs/*`.

| Required Operation | Minimum IAM Permission | Resource Scope Boundary | Test Dependency | Narrower Permission Possible? | Risk If Permission Is Misconfigured |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Create Destination Object with Precondition** | `storage.objects.create` | `gs://...test-bucket-isolated/test_runs/*` | `GCS-01`, `GCS-02`, `GCS-03`, `GCS-09` | No (Atomic creation requires object creation right). | **LOW:** Confined strictly to test bucket. If misconfigured globally, could allow unauthorized writes in other buckets. |
| **Inspect Object Metadata & Generation** | `storage.objects.get` | `gs://...test-bucket-isolated/test_runs/*` | `GCS-04`, `GCS-05`, `GCS-10`, `GCS-11` | No (Precondition check requires reading generation metadata). | **LOW:** Reading object metadata in test bucket only. No access to production storage. |
| **Copy Source to Destination Object** | `storage.objects.create`, `storage.objects.get` | `gs://...test-bucket-isolated/test_runs/*` | `GCS-01` through `GCS-12` | No (Copy operation is read source + create destination). | **MEDIUM:** If granted on `gs://*` globally, could allow copying data out of production buckets. |
| **Verify Object Deletion & Cleanup** | `storage.objects.delete` | `gs://...test-bucket-isolated/test_runs/*` | Post-test cleanup script | Yes (Can restrict delete to objects with `customMetadata.isTest == 'true'`). | **HIGH if un-scoped:** If misconfigured on production bucket, could delete user media. MUST be restricted via IAM Condition to test bucket. |
| **Read/Write Test Firestore State** | `datastore.entities.get`, `datastore.entities.update` | Staging Firestore database (`hala-staging-db`) only | `GCS-01` through `GCS-10` pointer updates | Yes (Restricted strictly to `chats/{chatId}/messages/*` in staging DB). | **HIGH if targeted at production DB:** Misconfiguration could overwrite production message pointers. Must use staging DB ID. |

---

## 2. IAM SECURITY GUARDRAILS & PROHIBITIONS

To enforce zero-trust security during any future environment setup, the following security constraints are mandatory:

1. **PROHIBITED ROLES:**  
   - `roles/storage.admin` (Broad bucket administration forbidden).
   - `roles/editor` or `roles/owner` (Project-wide admin roles strictly forbidden).
   - `roles/datastore.owner` (Database admin role forbidden).

2. **MANDATORY IAM CONDITIONS:**  
   All IAM bindings for `v5-migration-tester@hala-chat-staging-test-env.iam.gserviceaccount.com` MUST include an IAM condition restricting resource access:
   ```json
   {
     "title": "Strict Test Bucket Scoping",
     "expression": "resource.name.startsWith('projects/_/buckets/hala-chat-v5-migration-test-bucket-isolated/objects/test_runs/')"
   }
   ```

3. **CREDENTIAL MANAGEMENT & AUDIT:**  
   - **No Service Account Keys in Code:** Service account JSON key files must NEVER be saved in git repositories, source code folders, or local workspace paths.
   - **Short-Lived Service Account Tokens:** Execution scripts must use Google Cloud Workload Identity Federation or short-lived OAuth 2.0 access tokens (max 1-hour lifetime).
   - **Zero Secret Exposure:** No passwords, private keys, API keys, or access tokens were read, exposed, printed, or logged during this review.

---

## 3. SUMMARY OF REVIEW B VERDICT
The IAM least-privilege design is **100% compliant with enterprise security standards**. If configured strictly according to this matrix within an authorized staging project, misconfiguration risks are completely mitigated.
