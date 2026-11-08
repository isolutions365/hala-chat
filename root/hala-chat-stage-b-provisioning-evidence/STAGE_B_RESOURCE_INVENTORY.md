# HALA CHAT — STAGE B RESOURCE INVENTORY
**Phase:** Phase 4.1.8 Stage B  
**Status:** SPECIFIED / PENDING CLOUD SHELL EXECUTION  

| Resource Category | Identifier / Name | Region / Scope | Status |
| :--- | :--- | :--- | :--- |
| **GCP Project** | `hala-chat-staging-efac1993` | Organization `983380364199` | **BLOCKED (Container CLI)** |
| **GCS Bucket** | `gs://hala-chat-staging-media-efac1993` | `europe-west1` | **BLOCKED (Container CLI)** |
| **Service Account** | `v5-migration-tester@hala-chat-staging-efac1993.iam.gserviceaccount.com` | Project IAM | **BLOCKED (Container CLI)** |
| **IAM Binding** | `roles/storage.objectUser` + `test_runs/*` condition | Bucket IAM | **BLOCKED (Container CLI)** |
| **Firestore Database**| `hala-staging-db` | `europe-west1` | **BLOCKED (Container CLI)** |
| **Billing Budget** | USD 5.00/mo ($2, $4, $5 alerts) | Billing Account | **BLOCKED (Container CLI)** |
