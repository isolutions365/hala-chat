# HALA CHAT — PHASE 4.1.8: STAGE A
## GCS STAGING BUCKET CONFIGURATION SPECIFICATION

**Phase:** 4.1.8  
**Mode:** Stage A — Staging Environment Design  
**Status:** SPECIFICATION COMPLETE — PENDING STAGE B AUTHORIZATION  

---

## 1. GCS STAGING BUCKET CONFIGURATION MATRIX

The table below specifies the exact configuration parameters for the proposed staging bucket `gs://hala-chat-staging-media-efac1993`:

| Configuration Setting | Parameter Value | Security / Operational Rationale | Verification Method |
| :--- | :--- | :--- | :--- |
| **Bucket Name** | `hala-chat-staging-media-efac1993` | Uniquely identifies bucket as non-production staging. | `gcloud storage buckets describe` |
| **Location / Region** | `europe-west1` | Matches production region (Belgium) for low latency. | Bucket location metadata |
| **Storage Class** | `STANDARD` | Optimal performance for high-frequency test cycles. | Storage class property |
| **Uniform Bucket-Level Access** | `ENABLED` | Enforces IAM-only security policy; disables legacy ACLs. | `iamConfiguration.uniformBucketLevelAccess.enabled` |
| **Public Access Prevention** | `ENFORCED` | Strictly blocks all public reading or unauthenticated requests. | `iamConfiguration.publicAccessPrevention == 'enforced'` |
| **Object Versioning** | `ENABLED` | Retains past object versions for 30 days for rollback recovery testing. | `versioning.enabled == true` |
| **Lifecycle Auto-Purge Rule** | Delete `test_runs/*` objects age > 7 days | Automatically reclaims storage and purges old synthetic test artifacts. | `lifecycle.rule` JSON policy |
| **Encryption at Rest** | Google-Managed Encryption Keys (GMEK) | Standard AES-256 server-side encryption at rest. | Default GCS encryption setting |
| **Max Object Size Guardrail** | 50 MB per object | Prevents cost explosions or accidental large file uploads. | Client/SDK metadata validation |
| **Data Access Audit Logging** | ENABLED (Read & Write) | Writes Cloud Audit Logs for all GCS object read/write/delete ops. | GCP Audit Logs console |

---

## 2. LIFECYCLE RULE JSON POLICY

Upon Stage B authorization, the following lifecycle rule will be applied to `gs://hala-chat-staging-media-efac1993`:

```json
{
  "rule": [
    {
      "action": { "type": "Delete" },
      "condition": {
        "age": 7,
        "matchesPrefix": ["test_runs/"]
      }
    }
  ]
}
```

---

## 3. ZERO PUBLIC ACCESS GUARANTEE
- Public URLs (`https://storage.googleapis.com/...`) are **strictly blocked**.
- All receiver testing retrieves media bytes using authenticated Storage SDK calls (`getBytes()`) evaluated against security rules or authenticated service account tokens.
