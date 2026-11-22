# HALA CHAT — PHASE 4.1.8: STAGE A
## FIREBASE TEST ENVIRONMENT ISOLATION SPECIFICATION

**Phase:** 4.1.8  
**Mode:** Stage A — Staging Environment Design  
**Status:** SPECIFICATION COMPLETE — PENDING STAGE B AUTHORIZATION  

---

## 1. DUAL-LAYER FIREBASE TEST ISOLATION

Hala Chat uses a **Dual-Layer Firebase Isolation Strategy** that separates local unit/rules testing from cloud staging integration testing:

```
+-----------------------------------------------------------------------------------+
|                        DUAL-LAYER FIREBASE TEST HARNESS                           |
+-----------------------------------------------------------------------------------+
 LAYER 1: Local Firebase Emulator Suite (Offline Local Harness)
   - Firestore Emulator : 127.0.0.1:8088
   - Storage Emulator   : 127.0.0.1:9198
   - Auth Emulator      : 127.0.0.1:9098
   - Usage: Fast rule verification, synthetic emulator suite (tests E-01 to E-24).

 LAYER 2: Cloud Staging Firebase Project (Separate Cloud Project)
   - Project ID         : hala-chat-staging-efac1993
   - Staging Firestore  : Database ID `hala-staging-db`
   - Staging Storage    : Bucket `gs://hala-chat-staging-media-efac1993`
   - Usage: Real GCS generation precondition tests (GCS-01 to GCS-12).
+-----------------------------------------------------------------------------------+
```

---

## 2. PRODUCTION DATA CONTAMINATION PROTECTION

1. **Zero Production Documents:** No production Firestore collections (`users`, `chats`, `channels`, `messages`, `presence`) are imported into staging.
2. **Synthetic Identity Engine:** All test users are created procedurally with synthetic UIDs (e.g. `usr_alice_synth`, `usr_bob_synth`).
3. **Zero Production Config Imports:** Staging scripts load environment variables strictly from `tests/fixtures/staging.env` (overriding `VITE_FIREBASE_PROJECT_ID` with `hala-chat-staging-efac1993`).
