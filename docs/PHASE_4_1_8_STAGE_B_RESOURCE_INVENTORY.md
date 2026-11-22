# HALA CHAT — PHASE 4.1.8 STAGE B
## STAGING RESOURCE INVENTORY SPECIFICATION

**Phase:** Phase 4.1.8 Stage B  
**Status:** INVENTORY SPECIFICATION COMPLETE  

---

## 1. APPROVED STAGING RESOURCE INVENTORY

| Resource Type | Resource Identifier / Name | Region / Scope | Provisioning Status |
| :--- | :--- | :--- | :--- |
| **GCP Project** | `hala-chat-staging-efac1993` | Global | **BLOCKED (CLI Not Available)** |
| **GCS Bucket** | `gs://hala-chat-staging-media-efac1993` | `europe-west1` | **BLOCKED** |
| **Service Account** | `v5-migration-tester@hala-chat-staging-efac1993.iam.gserviceaccount.com` | Project IAM | **BLOCKED** |
| **IAM Binding** | `roles/storage.objectUser` with `test_runs/*` condition | Bucket IAM | **BLOCKED** |
| **Firestore Database**| `hala-staging-db` | `europe-west1` | **BLOCKED** |
| **Billing Budget** | USD 5.00 / month with $2, $4, $5 alerts | Billing Account | **BLOCKED** |
