# HALA CHAT — PHASE 4.1.8.3: IAM AND BUCKET SECURITY GUIDE
## BUCKET SECURITY & LEAST-PRIVILEGE IAM CONSOLE GUIDE

**Phase:** Phase 4.1.8.3  
**Status:** GUIDE COMPLETE  

---

## 1. BUCKET SECURITY GUARANTEES

- **Uniform Bucket-Level Access:** Disables legacy per-object ACLs, ensuring security rules and IAM policies apply uniformly across all bucket contents.
- **Public Access Prevention (PAP):** Guarantees that no object in the bucket can be made public by any user or service account.
- **Object Versioning:** Retains object versions to support migration rollback testing.

---

## 2. IAM LEAST-PRIVILEGE VERIFICATION

The conditional IAM binding ensures that `v5-migration-tester` can only interact with objects whose resource name begins with `projects/_/buckets/hala-chat-staging-media-efac1993/objects/test_runs/`. It is cryptographically impossible for this service account to read, write, or delete production GCS objects.
