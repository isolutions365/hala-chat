# HALA CHAT — PHASE 4.1.8.3: COST AND LIFECYCLE DECISION
## LIFECYCLE POLICY ALTERNATIVES (OPTION A VS. OPTION B)

**Phase:** Phase 4.1.8.3  
**Status:** AWAITING USER SELECTION (OPTION A OR OPTION B)  

---

## 1. BACKGROUND & CONFLICT RESOLUTION

Stage A proposed 30-day Object Versioning alongside a 7-day lifecycle purge. To prevent policy conflict, the user must explicitly select between Option A and Option B before lifecycle rules are applied to `gs://hala-chat-staging-media-efac1993`.

---

## 2. LIFECYCLE POLICY OPTIONS

### **Option A: Aggressive Cost Saving (Recommended for Test Runs)**
- **Live Objects:** Delete test objects under `test_runs/` after `7 days` (`age: 7`).
- **Noncurrent Versions:** Delete noncurrent object versions after `7 days` (`noncurrentDays: 7`).
- **Consequences:** Minimizes staging storage costs and ensures test storage is quickly reclaimed. Does **not** retain 30-day noncurrent version history.

### **Option B: Extended Version Retention (Rollback Testing Focus)**
- **Live Objects:** Delete test objects under `test_runs/` after `7 days` (`age: 7`).
- **Noncurrent Versions:** Retain noncurrent object versions for `30 days` (`noncurrentDays: 30`).
- **Consequences:** Supports extended migration rollback and version recovery testing. Results in higher storage accumulation and potential cost increase over time.

---

## 3. USER ACTION REQUIRED
Please reply with your explicit choice: **OPTION A** or **OPTION B**. Lifecycle rules will not be applied until this selection is confirmed.
