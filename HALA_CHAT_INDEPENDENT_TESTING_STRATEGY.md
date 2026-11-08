# HALA CHAT — INDEPENDENT TESTING STRATEGY

**Status:** COMPLETED SPECIFICATION  
**Date:** 2026-11-07  
**Scope:** Modular Test Matrix, Failure Injection Testing, and Cross-Feature Regression Verification

---

## 1. TESTING ARCHITECTURE & METHODOLOGY

To guarantee that feature modules remain 100% decoupled, testing is structured across 6 isolated tiers:

```
[Tier 1: Engine Unit Tests] ──► [Tier 2: E2EE Security Tests] ──► [Tier 3: Emulator Rules Tests]
                                                                        │
[Tier 6: Cross-Browser PWA] ◄── [Tier 5: Cross-Module Regression] ◄────┘
```

---

## 2. MODULAR TEST SUITE MATRIX

| Test Suite File | Engine / Category | Target Responsibilities & Assertions | Status / Evidence |
|-----------------|-------------------|--------------------------------------|-------------------|
| `tests/phoneAuth.test.ts` | Auth / Session | Phone OTP verification, recaptcha verifier, session restore. | **PASS** (`npm test`) |
| `tests/crypto.test.mjs` | E2EE Security | ECDH key exchange, AES-GCM text/blob encryption & decryption. | **PASS** (`npm test`) |
| `tests/audioPlaybackFlow.test.mjs` | Voice Notes | Opus/WebM audio recording, zero re-compression, waveform playback. | **PASS** (`npm test`) |
| `tests/mediaPolicy.test.mjs` | Media Validation | File size caps (20MB), MIME sniffing, executable file blocking. | **PASS** (`npm test`) |
| `tests/lruDecryptionCache.test.mjs` | Decryption Cache | LRU eviction, capacity bounding (100 items), Blob URL cleanup. | **PASS** (`npm test`) |
| `tests/storageQuota.test.mjs` | Browser Storage | `safeLocalStorageSet` quota recovery, safe key retention. | **PASS** (`npm test`) |
| `tests/firestoreConnection.test.mjs` | Network Status | Online/offline detection hook, state sync. | **PASS** (`npm test`) |
| `tests/rules.test.mjs` | Firestore / Storage | Live Firebase Emulator Security Rules verification. | **PASS** (`firebase emulators:exec`) |
| `tests/storage_v5_validation.test.mjs` | Storage Rules V5 | AST static rules parsing, authorization truth-tables. | **PASS** (`npm test`) |
| `tests/storage_v5_emulator.test.mjs` | Storage Runtime | 16-point live Firebase Storage Emulator runtime test suite. | **PASS** (16/16 Passed) |

---

## 3. FAILURE INJECTION TESTING MATRIX

The testing harness includes cross-module failure injection scenarios to verify zero-cascade guarantees:

| Injection ID | Simulated Failure | Execution Steps | Expected Asserted Outcome |
|--------------|-------------------|-----------------|---------------------------|
| **FI-01** | Voice Recorder Crash | Force `MediaRecorder` throw during initialization. | Voice UI displays error toast; Text Chat, Image Picker, and Calls operate normally. |
| **FI-02** | WebRTC ICE Timeout | Block WebRTC STUN ports during call initiation. | Call Modal shows "Call Failed"; active chat session remains open without state loss. |
| **FI-03** | Storage Upload 503 | Intercept GCS HTTP upload with 503 Service Unavailable. | Upload progress shows retry button; text messages continue sending normally. |
| **FI-04** | Notification Permission Denied | Revoke browser Notification API permissions. | Web push disabled; in-app unread badges update correctly. |
| **FI-05** | Offline Network Drop | Disconnect network during text & media upload queue. | Messages queue in IndexedDB; auto-sync resumes upon network restoration. |

---

## 4. CROSS-BROWSER & PLATFORM TEST REPOSITORY

- **Mobile Web (Safari iOS / Chrome Android)**: Validates touch gestures, PWA install prompts (`PWAInstallButton.tsx`), and MediaRecorder webm/mp4 codecs.
- **Desktop Web (Chrome, Firefox, Edge, Safari)**: Validates desktop layout, keyboard shortcuts (`Enter` to send), and WebRTC screen/audio streams.
- **Future Android APK (Capacitor/Cordova wrapper)**: Validates native background notifications and persistent key storage.
