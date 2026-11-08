# HALA CHAT — PHASE 4.1.8: STAGE A
## STAGING SETUP BLOCKER REGISTER

**Phase:** 4.1.8  
**Mode:** Stage A — Blocker Register  
**Status:** REGISTER COMPLETE — ALL BLOCKERS DOCUMENTED WITH STAGE B RESOLUTION PATHWAYS  

---

## 1. STAGE A UNRESOLVED BLOCKER REGISTER

The table below catalogs every blocker that prevents immediate cloud integration testing, detailing its technical resolution requirements for Stage B:

| Blocker ID | Priority Level | Blocker Description | Required Resolution Action | Responsible Role / Authorization Needed |
| :--- | :---: | :--- | :--- | :--- |
| **BLK-01** | **P1** | Staging GCP project `hala-chat-staging-efac1993` is uncreated. | Provision dedicated non-production GCP project. | User explicit Stage B authorization |
| **BLK-02** | **P1** | Staging GCS bucket `hala-chat-staging-media-efac1993` is uncreated. | Provision bucket in `europe-west1` with public access prevention. | User explicit Stage B authorization |
| **BLK-03** | **P1** | Service account `v5-migration-tester@...` and scoped IAM binding are uncreated. | Create SA and apply conditional IAM policy on `objects/test_runs/*`. | User explicit Stage B authorization |
| **BLK-04** | **P2** | GCP Billing Budget Alert is unconfigured. | Configure $5.00 monthly budget alert in GCP Console. | User explicit Stage B authorization |

---

## 2. BLOCKER RESOLUTION SUMMARY
All 4 blockers are **infrastructure provisioning tasks** that can be resolved deterministically in Stage B once explicit authorization is granted by the user. Zero code refactoring or security rule changes are required.
