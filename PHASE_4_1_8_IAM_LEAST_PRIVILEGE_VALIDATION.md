# HALA CHAT — PHASE 4.1.8: STAGE A
## IAM LEAST-PRIVILEGE VALIDATION & BINDING SPECIFICATION

**Phase:** 4.1.8  
**Mode:** Stage A — IAM Design Validation  
**Status:** VALIDATION COMPLETE — PENDING STAGE B AUTHORIZATION  

---

## 1. REFINED IAM PERMISSION MATRIX & RESOURCE CONDITIONS

An analysis of GCS API operations confirms that while `storage.objects.*` permissions support IAM resource condition filtering on `objects/test_runs/*`, SDK initialization requires `storage.buckets.get` at the bucket level.

The binding specification below combines bucket-level describe rights with strictly conditioned object-level operations:

```json
{
  "bindings": [
    {
      "role": "roles/storage.objectUser",
      "members": [
        "serviceAccount:v5-migration-tester@hala-chat-staging-efac1993.iam.gserviceaccount.com"
      ],
      "condition": {
        "title": "StrictTestRunsObjectNamespace",
        "description": "Restricts object creation, reading, and deletion strictly to the test_runs/ namespace in the staging bucket.",
        "expression": "resource.type == 'storage.googleapis.com/Bucket' || (resource.type == 'storage.googleapis.com/Object' && resource.name.startsWith('projects/_/buckets/hala-chat-staging-media-efac1993/objects/test_runs/'))"
      }
    }
  ]
}
```

---

## 2. PERMISSION VALIDATION PER TEST SCENARIO

| Test Scenario Group | Required IAM Permission | Evaluated Resource Scope | Scope Validation Verdict |
| :--- | :--- | :--- | :---: |
| **`GCS-01` to `GCS-03`** (Create & Preconditions) | `storage.objects.create` | `.../objects/test_runs/*` | **VALID & SCOPED** |
| **`GCS-04` to `GCS-05`** (Metadata & Hashes) | `storage.objects.get` | `.../objects/test_runs/*` | **VALID & SCOPED** |
| **`GCS-06` to `GCS-10`** (Missing/Copy/Retry) | `storage.objects.create`, `storage.objects.get` | `.../objects/test_runs/*` | **VALID & SCOPED** |
| **`GCS-11`** (Metadata Inspection) | `storage.objects.get` | `.../objects/test_runs/*` | **VALID & SCOPED** |
| **Cleanup Script** (Purge Test Objects) | `storage.objects.delete` | `.../objects/test_runs/*` | **VALID & SCOPED** |

---

## 3. PROHIBITED ROLES CHECKLIST
- `roles/owner` — **FORBIDDEN**
- `roles/editor` — **FORBIDDEN**
- `roles/storage.admin` — **FORBIDDEN**
- `roles/datastore.owner` — **FORBIDDEN**
- Un-scoped `roles/storage.objectAdmin` on all buckets — **FORBIDDEN**
