# PHASE 1B.4 — VOICE NOTE ROOT CAUSE & IMPLEMENTATION BLUEPRINT

**Status:** AUDIT COMPLETE
**Mode:** READ-ONLY

## 1. ROOT CAUSE VALIDATION

The investigation confirms that the application unnecessarily converts compressed audio into uncompressed PCM WAV.

### Code Evidence
- **File:** `src/lib/audioCompression.ts`
- **Logic:** `compressAudio` (Lines 7-64) decodes the input `Blob` and passes the resulting `AudioBuffer` to `audioBufferToWavBlob`.
- **Output:** `audioBufferToWavBlob` (Lines 69-106) manually constructs a **16-bit PCM Mono WAV** container.
- **MimeType:** Explicitly set to `audio/wav` on Line 105.

### Browser Context
- **MediaRecorder Output:** Modern browsers produce `audio/webm;codecs=opus` (Chrome/Android) or `audio/mp4;codecs=mp4a` (Safari/iOS).
- **Compression Loss:** Converting an Opus stream (e.g., 64kbps) to 16kHz 16-bit PCM (256kbps) results in a **4x increase in file size** without any quality gain, as the source was already lossy.

## 2. FINAL IMPLEMENTATION BLUEPRINT

To resolve the performance bottleneck and align with the V5 Storage Rules, the following refactoring is required:

### A. Media Upload Refactoring (`src/lib/media.ts`)
- **Path Policy:** Shift from `media/{uid}/{uuid}` to `chats/{chatId}/{mediaType}/{assetId}`.
- **Metadata Contract:** Include `uploaderUid`, `mediaType`, `encryptionVersion`, and `chatId` in Storage metadata.
- **Voice Note Optimization:**
    - Skip `compressAudio` if the source is already a compressed format (Opus/AAC) within a reasonable size limit.
    - If compression is needed (e.g. legacy WAV input), use a compressed encoder (like Ogg/Opus or a lightweight WebM wrapper) instead of uncompressed PCM.

### B. Firestore Integration (`src/lib/firebase.ts`)
- Ensure `is_public` vs `isPublic` discrepancy is resolved in the favor of the verified schema.

### C. Security Hardening
- Deploy the V5 storage rules designed in Phase 1A to enforce the new path-based authorization.

---
**Implementation Status:** AUTHORIZATION REQUIRED.
