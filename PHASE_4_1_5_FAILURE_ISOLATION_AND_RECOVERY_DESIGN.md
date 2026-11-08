# HALA CHAT — PHASE 4.1.5: DESIGN D
## FAILURE ISOLATION AND RECOVERY DESIGN SPECIFICATION

**Mode:** STRICT READ-ONLY DESIGN SPECIFICATION  
**Scope:** Subsystem Independence, Blast Radius Containment, and Failure Recovery  
**Status:** DESIGN ONLY — COMPLIANT WITH RESILIENT MODULAR ARCHITECTURE BLUEPRINT V1  

---

## 1. ARCHITECTURAL PRINCIPLE: INDEPENDENT MODULE CONTAINMENT

The **Hala Chat Resilient Modular Architecture Blueprint V1** mandates that every feature operates independently. Migration tools, background verifiers, or security updates in the media pipeline **must never crash or degrade core user communication features**.

### 1.1 Mandatory Isolation Boundary Rules
1. **Migration Isolation:** Migration scripts run as isolated server-side processes or background workers. They **never inject code, locks, or synchronous blocking calls** into client-side messaging hooks.
2. **Fallback Availability:** If a V5 path fetch fails, `useDecryptedMedia` automatically falls back to legacy path retrieval or displays a localized media error card. **Text messaging remains 100% operational.**
3. **Zero Cascade Failure:** A failure in voice note transcription, image compression, or storage upload must be contained strictly to the affected message item.

---

## 2. SUBSYSTEM FAILURE CONTAINMENT MATRIX

| Subsystem Module | Subsystem Responsibility | Failure Scenario | Containment Mechanism | Recovery & User Impact |
| :--- | :--- | :--- | :--- | :--- |
| **1. Text Chat** | Real-time text send, receive, E2EE text encryption. | Media storage quota exceeded or migration job running. | Text messages do not evaluate Storage Rules or interact with GCS. Text path is 100% decoupled from Storage. | **ZERO IMPACT.** Text chat sends and receives with 0ms latency even if Storage is completely offline. |
| **2. Voice Notes** | Recording, WAV compression, E2EE audio blob encryption, playback. | `uploadVoiceNote()` fails due to network drop or GCS timeout. | Error caught in `uploadVoiceNote()`. Message state set to `failed_upload`. Re-send button displayed. | User can retry upload. Audio recording preserved in memory/IndexedDB. Other chat features unaffected. |
| **3. Images** | Image picker, compression, thumbnail generation, E2EE image render. | `useDecryptedMedia()` decryption error on bad IV or corrupted image bytes. | `decryptBlobData()` returns `null`. Error state `{ stage: 'decrypt' }` recorded in hook state for image ID only. | Image placeholder shows "🔒 Encrypted message". Text and other images in chat continue rendering normally. |
| **4. PDF Documents** | PDF file upload, storage, decryption, preview rendering. | GCS returns `storage/unauthorized` or 404 on PDF asset. | PDF renderer catches error. Displays "Unable to load PDF document". | User can click download fallback or re-request file from sender. Rest of chat works. |
| **5. Office Documents** | Word, Excel, generic document attachments. | Upload timeout on large 18MB document. | 180s upload timeout cancels task via `task.cancel()`. Prompts "Upload timed out. Please retry." | Prevents app memory leak or hanging thread. Other attachments unaffected. |
| **6. Stories** | 24-hour ephemeral image/video posts. | Migration script updating chat media paths encounters story media. | Stories use separate path `/media/{uid}/...` or `stories/{storyId}`. Storage Rules evaluate story authorization independently. | Story viewer remains 100% operational. Migration tool explicitly ignores story paths. |
| **7. Social Feed** | Public feed posts, media attachments. | Public channel media policy change. | Feed media queries `users_public` and public post collections independently from chat channels. | Social feed loads feed posts independently. Chat pipeline unaffected. |
| **8. WebRTC Calls** | Voice & Video calling, WebRTC signaling via Firestore. | GCS down or Storage Emulator crashed. | Calling uses WebRTC peer connection and Firestore `calls` collection. Zero dependency on GCS Storage. | **ZERO IMPACT.** Calls operate normally during storage outages. |
| **9. Group Chats** | Multi-user group messaging, group symmetric key distribution. | Member added/removed during group media upload. | Group symmetric key encrypted per-member in Firestore chat doc. V5 storage rules check `request.auth.uid in chat.participants`. | Upload succeeds for current group state. Removed members lose storage read rights instantly. |
| **10. Channels** | Broadcast channels, admin posts, subscriber reads. | Subscriber tries to read private channel media without subscribing. | Storage Rules check channel subscriber document `/channels/{channelId}/subscribers/{uid}` via `exists()`. | Storage returns `storage/unauthorized`. Render hook shows subscription required card. |

---

## 3. MIGRATION TOOLING FAILURE CONTAINMENT

Migration workers execute under strict isolation guardrails:

```
+-------------------------------------------------------------------------+
|                       MIGRATION WORKER PROCESS                          |
|                                                                         |
|  - Reads Firestore in read-only batch mode                              |
|  - Executes GCS-to-GCS copy with ifGenerationMatch: 0                   |
|  - Executes Compare-And-Set (CAS) transaction on message document       |
|                                                                         |
|  CRASH / FAILURE GUARD:                                                 |
|  1. Worker crash does NOT delete legacy media.                          |
|  2. Worker timeout releases Firestore migration lock after 5 minutes.   |
|  3. Client applications NEVER read migration lock state or block.       |
|  4. Client applications seamlessly resolve both V5 and legacy paths.     |
+-------------------------------------------------------------------------+
```

---

## 4. SHARED FOUNDATIONS ISOLATION & PROTECTION

The application relies on shared core infrastructure:
- **Firebase Initialization (`src/lib/firebase.ts`)**
- **Authentication (`getFirebaseAuth()`)**
- **E2EE Key Management (`src/lib/crypto.ts`)**

### Safeguards for Shared Foundations
1. **Immutable Key Safeguard:** Migration tooling **NEVER reads, re-encrypts, or mutates E2EE user private keys** (`priv_{uid}`) or group symmetric keys. Media payload bytes remain encrypted with original AES-GCM parameters during copy operations.
2. **Auth Token Protection:** Migration processes operate using a dedicated service account credentials context. They never impersonate user session tokens or hijack client auth states.
3. **DB Connection Pooling:** Migration batch reads use isolated Firestore client instances to prevent exceeding client listener connection pools.

---

## 5. SUMMARY OF DESIGN D DISCIPLINE
This failure isolation design guarantees that **any potential failure in background migration, media verification, or GCS network connectivity is 100% contained to the individual media element**, leaving text chat, calls, group messaging, and social feed fully functional.
