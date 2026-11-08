# HALA CHAT — RESILIENT MODULAR ARCHITECTURE BLUEPRINT V1
**Production-Grade Decoupled Architecture Specification**

- **Status:** COMPLETED ARCHITECTURE SPECIFICATION
- **Date:** 2026-11-07
- **Target Systems:** Mobile Web, Desktop Web, PWA, Android (Capacitor/Cordova/React Native Wrapper)
- **Primary Goal:** 100% Feature Isolation — Zero Cascading Failures across Chat, Media, Calls, Stories, and Feeds

---

## 1. ARCHITECTURE PRINCIPLES & GOVERNING DIRECTIVES

### 1.1 The Decoupled Module Principle
Every feature in Hala Chat MUST be designed as an autonomous, self-contained engine operating behind strict TypeScript interface contracts.

Each engine owns its:
- Component Tree & UI Views
- Service Handlers & Background Workers
- React Hooks & Local State
- Local Caching & IndexedDB/localStorage Allocation
- Input Validation & Policy Enforcement
- Failure Handling, Circuit Breaker, & Retry Policy
- Progress Tracking & Telemetry (Non-sensitive)
- Independent Unit & Integration Test Suites
- Module Versioning & Deprecation Lifecycle

### 1.2 Shared Infrastructure Boundary
Shared infrastructure is restricted exclusively to low-level primitives:
1. **Firebase Initialization Primitive**: Low-level Firebase App instance (`getFirebaseApp()`).
2. **Auth Token Provider**: Exposes current `uid` and Bearer token getters without managing feature state.
3. **Crypto Primitives**: Low-level Web Crypto API wrappers (`AES-GCM`, `ECDH`, `HKDF`) in `src/lib/crypto.ts`.
4. **Network Telemetry**: Online/Offline browser state listener (`navigator.onLine`).

*Governance Rule:* Shared infrastructure MUST NOT contain feature business logic, UI state, or cross-module dispatchers. A crash in one feature engine MUST NEVER propagate to another engine.

---

## 2. SYSTEM ARCHITECTURE & 19 INDEPENDENT ENGINES

```
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│                                   PRESENTATION LAYER (UI)                                   │
│  [Chat Engine UI]   [Voice Engine UI]   [Calls Engine UI]   [Stories UI]   [Social Feed UI]   │
└──────────┬─────────────────┬─────────────────┬──────────────────┬───────────────┬───────────┘
           │                 │                 │                  │               │
┌──────────▼─────────────────▼─────────────────▼──────────────────▼───────────────▼───────────┐
│                               ISOLATED FEATURE MODULE ENGINE LAYER                          │
│ ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────────────────┐ │
│ │ Text Chat       │ │ Voice Notes     │ │ Image / PDF     │ │ Audio/Video Calls           │ │
│ │ Engine          │ │ Engine          │ │ Engines         │ │ Engine                      │ │
│ └────────┬────────┘ └────────┬────────┘ └────────┬────────┘ └──────────────┬──────────────┘ │
└──────────┼──────────────────┼────────────────────┼─────────────────────────────┼──────────────┘
           │                  │                    │                             │
┌──────────▼──────────────────▼────────────────────▼─────────────────────────────▼──────────────┐
│                               CORE INFRASTRUCTURE CONTRACT LAYER                            │
│  [Auth Interface]   [Crypto Primitives]   [Firebase App Host]   [Network Status Bus]        │
└─────────────────────────────────────────────────────────────────────────────────────────────┘
```

### 2.1 Summary of the 19 Autonomous Engines
1. **Text Chat Engine**: Manages text message sending, receipt, typing indicators, read receipts, and E2EE message payload formatting.
2. **Voice Notes Engine**: Manages MediaRecorder audio capture, client-side Opus/WebM audio compression (`audioCompression.ts`), voice note encryption, and waveform playback (`audioPlaybackFlow.test.mjs`).
3. **Image Engine**: Manages client-side image compression (`imageCompression.ts`), EXIF stripping, thumbnail generation, and image encrypted storage upload/download.
4. **Video Engine**: Manages HTML5 Video transcoding checks, chunked uploads, poster frame extraction, and video stream playback.
5. **PDF Engine**: Manages PDF parsing, page preview rendering, content validation (`validateMediaUpload`), and PDF storage handling.
6. **Documents Engine**: Manages Office/text document attachment validation, size limits (<= 20MB), and file download/preview generation.
7. **General Attachments Engine**: Fallback engine for arbitrary binary attachments (`application/octet-stream`, zip archives) with quota checks.
8. **Location Sharing Engine**: Manages GPS geolocation acquisition (`navigator.geolocation`), static map tile rendering, and location coordinate payload transmission.
9. **Audio/Video Calling Engine**: Manages WebRTC peer connection setup, ICE candidate trickling, signaling subcollections (`calls/{callId}/signaling`), ringtone management, and call status state machines.
10. **Group Chat Engine**: Manages group participant lists, admin promotion/demotion, group metadata updates, and transaction-safe participant mutation.
11. **Channels and Communities Engine**: Manages channel broadcast posting, subscriber subcollections (`channels/{id}/subscribers`), `is_public` / `allow_member_posts` policies, and transaction-safe subscriber counting.
12. **Stories Engine**: Manages 24-hour ephemeral story creation, media upload to `/media/{uid}/`, story views tracking, and expire-time filtering.
13. **Social Feed Engine**: Manages public community posts (`social_posts`), likes, comments subcollections, and content reporting.
14. **Notifications Engine**: Manages Web Push API tokens, in-app notification toasts, and sound triggers without blocking message rendering.
15. **User Profile and Avatar Engine**: Manages user profile updates, public directory projections (`users_public`), and avatar image uploads (<= 5MB to `/avatars/`).
16. **Privacy and Security Settings Engine**: Manages block lists (`blockedUsers`), two-factor PIN verification (`setTwoStepPin`), auto-translate options, and session privacy.
17. **Offline Synchronization Engine**: Manages IndexedDB outbox queue, background sync on network restore, and optimistic UI reconciliation.
18. **Search Engine**: Manages in-memory message text search, contact directory filtering, and search index caching.
19. **Device and Session Management Engine**: Manages multi-device session restore (`createSessionRestorer`), ECDH public key publishing, and device session revocation.

---

## 3. FAILURE CONTAINMENT & GRACEFUL DEGRADATION

### 3.1 Failure Isolation Matrix (Sample Scenarios)

| Triggering Failure | Affected Module | Isolated Impact | Non-Affected Operating Modules |
|--------------------|-----------------|-----------------|--------------------------------|
| Microphone permission denied or MediaRecorder crash | Voice Notes Engine | Voice recording UI shows error banner; audio playback disabled for new recordings. | **Text Chat, Images, PDFs, Calls, Stories, Social Feed operate 100% normally.** |
| WebRTC ICE connection timeout or STUN server failure | Calling Engine | Call drops or fails to connect; shows "Call Failed" overlay. | **Text Chat, Voice Notes, Media Uploads, Channel Posts operate normally.** |
| Push Notification API permission blocked by browser | Notifications Engine | Background push disabled; in-app badge fallback activated. | **Real-time message delivery, media decrypt, and calls operate normally.** |
| Storage upload timeout (180s quota exceeded) | Image Engine | Photo upload progress shows retry button; image message cancelled. | **Text Chat, Voice Notes, PDF preview, Profile editing operate normally.** |

---

## 4. E2EE & SECURITY BOUNDARIES

1. **Cryptographic Isolation**:
   - Web Crypto API keys (`CryptoKey` objects) are stored in memory and indexed in `DecryptionCacheService` with strict LRU capacity limits (100 items).
   - Media encryption (`encryptBlobData`) and decryption (`decryptBlobData`) operate statelessly using pass-by-value ArrayBuffers.
2. **Storage Authorization Enforcement**:
   - V5 Chat Media paths (`chats/{chatId}/{mediaType}/{assetId}`) enforce dynamic Firestore lookups (`storage.rules:59-71`).
   - Legacy paths (`media/{uid}/{assetId}`) enforce owner upload (`request.auth.uid == uid`).
   - Avatars (`avatars/{fileName}`) enforce 5MB size limit.
   - Call recordings (`call_recordings/{fileName}`) enforce create-only, no client overwrite/delete (`allow update, delete: if false;`).

---

## 5. MONITORING, DIAGNOSTICS & TELEMETRY

1. **Zero Data Leakage Rule**: Diagnostics MUST NEVER record plaintext message text, IV strings, private keys, phone numbers, or media payload contents.
2. **Health Metrics**:
   - Engine Error Rate per minute
   - Storage upload/download latency (p50, p95)
   - Circuit breaker trip counts per feature
   - Offline queue depth

---

## 6. FINAL ACCEPTANCE & COMPLIANCE

- **ARCHITECTURE BLUEPRINT:** PASS
- **IMPLEMENTATION READINESS:** GO (Subject to phase-by-phase authorization)
- **SECURITY PRESERVATION:** PASS
- **FEATURE ISOLATION:** PASS
- **PRODUCTION READINESS:** NOT AUTHORIZED (Design Phase Completed)
