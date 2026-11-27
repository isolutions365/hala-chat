# HALA CHAT — PHASE 4.1.8.1: IAM LEAST-PRIVILEGE REVIEW
## INDEPENDENT IAM SECURITY & SCOPE AUDIT

**Phase:** 4.1.8.1  
**Mode:** Strict Read-Only IAM Audit  
**Auditor:** IAM Least-Privilege Specialist & Firebase Security Architect  
**Status:** REVIEW COMPLETE — IAM CONDITION VALIDATED SECURE  

---

## 1. IAM CONDITION EVALUATION

Proposed service account: `v5-migration-tester@hala-chat-staging-efac1993.iam.gserviceaccount.com`  
Proposed IAM Condition Expression:
```json
resource.type == 'storage.googleapis.com/Bucket' || (resource.type == 'storage.googleapis.com/Object' && resource.name.startsWith('projects/_/buckets/hala-chat-staging-media-efac1993/objects/test_runs/'))
```

### Technical Validation Findings
1. **Bucket-Level Inclusion (`storage.googleapis.com/Bucket`):** Required for Node.js `@google-cloud/storage` SDK initialization when calling `bucket.exists()` or fetching bucket metadata. Without this, the SDK throws initialization errors.
2. **Object-Level Scoping (`resource.name.startsWith(...)`):** Restricts all object creation (`storage.objects.create`), reading (`storage.objects.get`), copying, and deletion (`storage.objects.delete`) strictly to the `test_runs/` namespace.
3. **Exclusion of Privileged Roles:** Project-wide roles (`roles/owner`, `roles/editor`, `roles/storage.admin`) are strictly prohibited. Only `roles/storage.objectUser` with the IAM condition is granted.
