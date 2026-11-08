# HALA CHAT — DEPENDENCY AND COUPLING AUDIT

**Status:** COMPLETED AUDIT  
**Date:** 2026-11-07  
**Scope:** Source Code Coupling, Monolithic File Inspection, and Decoupling Plan

---

## 1. EXISTING CODEBASE COUPLING AUDIT

A line-by-line inspection of the actual Hala Chat codebase reveals critical coupling points across monolithic files:

### 1.1 Monolithic Source Files (`VERIFIED`)

| File Path | Total Lines | Primary Responsibilities | Identified Coupling Risks |
|-----------|:-----------:|--------------------------|---------------------------|
| `src/App.tsx` | 1,085 lines | Top-level state, screen navigation, Auth flow, Call listening, Session restore, PWA install banner, Two-Step PIN, Profile setup | **CRITICAL COUPLING**: `App.tsx` directly handles phone auth, session restore, active call state, profile setup, and screen routing in a single file. |
| `src/components/ConversationScreen.tsx` | ~3,850 lines | Chat view UI, message list, voice recording, image/file picker, camera capture, media viewer modal, Majlis planning, Poll voting | **CRITICAL COUPLING**: Combines UI rendering with inline media upload handlers, Majlis plan updates, and voice recording controls. |
| `src/lib/firebase.ts` | ~3,480 lines | Firebase SDK init, Phone Auth, User Profile CRUD, Chat CRUD, Message CRUD, Call Signaling, Story CRUD, Storage helpers | **HIGH COUPLING**: Monolithic helper file containing Firestore operations for 12 distinct feature categories. |
| `src/lib/media.ts` | 279 lines | Compression triggers, Web Crypto encryption, Storage upload (`storeMedia`), path formatting | **MODERATE COUPLING**: Combines audio compression, image compression export, AES-GCM encryption, and Storage uploads. |

---

## 2. COUPLING ANALYSIS BY FEATURE CATEGORY

### 2.1 Voice Notes & Audio Pipeline
- **Current File**: `src/lib/audioCompression.ts` (148 lines) & `src/lib/media.ts:219-245` (`uploadVoiceNote`).
- **Coupling Behavior**: `uploadVoiceNote` calls `uploadChatMedia`, which compresses audio, encrypts payload via `encryptBlobData`, determines `mediaCategory = 'voice'`, and uploads to Storage (`src/lib/media.ts:193`).
- **Regression Analysis**: In Phase 2, `audioCompression.ts` was updated to bypass re-compression for native Opus/WebM audio blobs, fixing the 5–10s upload delay and WAV conversion bug (`tests/audioPlaybackFlow.test.mjs:1-10`).
- **Proposed Decoupling**: Isolate `VoiceNoteEngine` into `src/modules/voice/` containing dedicated recorder hook `useVoiceRecorder` and player component `VoicePlayer`.

### 2.2 Decrypted Media Hook (`useDecryptedMedia.ts`)
- **Current File**: `src/hooks/useDecryptedMedia.ts` (349 lines).
- **Coupling Behavior**: Manages download and decryption for all media types (`voice`, `image`, `video`, `file`). Extracts storage paths from `/o/` URLs (`lines 7-15`), executes `getBytes()` SDK calls (`lines 180-182`), sniffs MIME types (`lines 17-59`), and decrypts AES-GCM payloads.
- **Proposed Decoupling**: Retain `useDecryptedMedia` as a dedicated media decryption service, but extract MIME-sniffing into a standalone utility `mimeSniffer.ts`.

---

## 3. DECOUPLING RECOMMENDATIONS & TARGET ARCHITECTURE

```
src/
├── core/                        # Shared Low-Level Primitives ONLY
│   ├── firebase/                # Firebase App & SDK Init
│   ├── crypto/                  # Web Crypto AES-GCM / ECDH Primitives
│   └── network/                 # Browser Network Listener
├── modules/                     # 19 Autonomous Feature Modules
│   ├── text-chat/               # Text Chat Engine
│   ├── voice-notes/             # Voice Notes Engine
│   ├── images/                  # Image Engine
│   ├── calls/                   # WebRTC Calling Engine
│   ├── channels/                # Channels Engine
│   ├── stories/                 # Stories Engine
│   └── social-feed/             # Social Feed Engine
└── shared/                      # UI Primitive Components (Buttons, Modals)
```
