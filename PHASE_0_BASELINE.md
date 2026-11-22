# PHASE 0 — WORKSPACE BASELINE & SAFETY SNAPSHOT

**Status:** COMPLETED
**Timestamp:** 2026-11-06
**Mode:** READ-ONLY AUDIT

## 1. WORKSPACE INTEGRITY

- **Git Status:** Workspace is **NOT** a Git repository (`fatal: not a git repository`). All state is local-only.
- **Test Inventory:** Verified. All 14 test files listed in `package.json` are present in `tests/`.
- **Environment:**
  - Firebase Project: `gen-lang-client-0446181078`
  - Firestore DB: `ai-studio-hala-efac1993-f3c4-44ed-b676-ccb87cb486aa`
  - Storage Bucket: `gen-lang-client-0446181078.firebasestorage.app`

## 2. CRITICAL FILE HASHLIST (SHA-256)

| File Path | SHA-256 Hash |
|-----------|--------------|
| `storage.rules` | `c6153431da1f5870cc4904befb953cdb4a0ebbe0d1e744895b41dc2241a80c98` |
| `firestore.rules` | `8a41ab874f86e27393d7dc72aa07947bb40186ee78b1f34a7f9854884b500845` |
| `src/lib/media.ts` | `c8ede08035be261cc92898e2563460128e7e6316cd4f3b73526343165a4594fd` |
| `src/lib/crypto.ts` | `5938af9151f4edfb8b6870dde708397c2ee665609c3dd383c9d9c33788ca7c96` |
| `src/lib/audioCompression.ts` | `1f7de0fd36bd205416f03d4bdedcbbbe6c0379f4cefaed4f16a3f2913e83e360` |
| `src/hooks/useDecryptedMedia.ts` | `ec54d637322840f90255d0678dd4a82a074847c94bf2c3624b9f84589d5ce37b` |
| `src/types.ts` | `f9c51b06426a613a78b1d5be6a50f9000ce1274cd2315269d9c7f9074564b74b` |

## 3. IDENTIFIED RISKS & DISCREPANCIES

### A. Schema Mismatch (Critical)
- `firestore.rules` references `is_public` (snake_case) for channel authorization.
- `src/types.ts` and `src/lib/firebase.ts` use `isPublic` (camelCase) in application logic.
- **Impact:** Security rules may fail to recognize "public" status, defaulting to private/denied access.

### B. Security Rules V1 (Legacy)
- `storage.rules` is using a wide-open V1 policy allowing all authenticated users to read/write any file in `/media/`.

### C. Voice Note Performance Bottleneck
- `src/lib/audioCompression.ts` converts all audio to uncompressed 16-bit PCM WAV.
- **Impact:** Increases storage cost and upload time; ignores native browser Opus/AAC compression.

## 4. MEDIA CALL SITE INVENTORY

| Function | Principal Call Sites |
|----------|----------------------|
| `uploadChatMedia` | `ConversationScreen.tsx`, `NewChannelModal.tsx`, `SocialFeed.tsx`, `CreateStoryModal.tsx` |
| `uploadVoiceNote` | `ConversationScreen.tsx` |
| `useDecryptedMedia` | `ConversationScreen.tsx` |
| `storeMedia` | `media.ts` (Internal) |

---
**Verification Complete.** No unpublished code changes detected (based on file hash baseline).
