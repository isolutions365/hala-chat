# HALA CHAT — PHASE 4.1.8: STAGE A
## COST AND RESOURCE CONTROL PLAN

**Phase:** 4.1.8  
**Mode:** Stage A — Financial & Resource Control Design  
**Status:** PLAN COMPLETE — CONSERVATIVE COST GUARDRAILS ESTABLISHED  

---

## 1. RESOURCE BUDGET & VOLUMETRIC CAPS

To prevent any possibility of unexpected billing charges or resource runaway during future integration testing, strict volumetric caps are established:

| Resource Parameter | Allocated Test Cap | Standard GCP Unit Cost | Maximum Monthly Cost Impact |
| :--- | :--- | :--- | :--- |
| **Staging GCS Bucket Storage** | Max 500 MB active test storage | $0.026 / GB / month | **$0.013 / month** |
| **Synthetic Upload Egress / Ingress** | Max 2 GB cumulative transfer | $0.08 / GB egress | **$0.160 / month** |
| **GCS Class A API Operations (Create)** | Max 5,000 requests / month | $0.05 / 10,000 operations | **$0.025 / month** |
| **GCS Class B API Operations (Get)** | Max 20,000 requests / month | $0.004 / 10,000 operations | **$0.008 / month** |
| **Total Monthly Staging Budget Cap** | **$5.00 / month MAX** | Multi-resource cap | **< $5.00 / month** |

---

## 2. BILLING ALERTS & EMERGENCY SHUTDOWN PROCEDURE

1. **Cloud Billing Budget Alert:** Upon Stage B project creation, a GCP Billing Budget Alert is configured to fire automated email alerts to project admins at:
   - **40% Threshold ($2.00)**
   - **80% Threshold ($4.00)**
   - **100% Threshold ($5.00)**
2. **Emergency Teardown Script:** A 1-click cleanup script (`scripts/teardown_staging.sh`) immediately purges all objects in `test_runs/*`, disables the service account, and deletes the staging bucket if costs exceed limits.
