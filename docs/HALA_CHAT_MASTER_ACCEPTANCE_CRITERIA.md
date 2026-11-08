# HALA CHAT — MASTER ACCEPTANCE CRITERIA V1.0

**Document Class:** Quality Assurance & Acceptance Criteria Specification  
**Author:** Lead QA Architect & Principal Systems Auditor  
**Scope:** Verifiable Acceptance Criteria Across All 6 Product Divisions & 23 Subsystems  
**Status:** COMPLETE & VERIFIABLE  

---

## 1. QUALITY ACCEPTANCE METRICS MATRIX

Every feature release must pass the following verifiable acceptance criteria prior to production deployment:

| Division / Subsystem | Functional Acceptance Criteria | Technical Benchmark | Security & Privacy Constraint | Pass/Fail Verification Method |
| :--- | :--- | :--- | :--- | :--- |
| **Division A: Text Messaging** | Text messages send and render in recipient view instantly with delivery checkmark. | Send latency < 200ms | Payload encrypted with AES-GCM 256-bit client-side. | Automated E2E test asserts ciphertext in network payload & plaintext in DOM. |
| **Division A: Voice Notes** | Voice note records, displays real-time waveform, uploads, and plays back smoothly. | Upload progress 0-100%; playback startup < 300ms | Audio encrypted client-side; zero unencrypted audio in GCS. | Synthetic voice note test runner verifies magic bytes & AES-GCM decryption. |
| **Division A: WebRTC Calls** | 1:1 voice/video call connects audio and video streams between peers. | Call connection setup < 800ms; ICE restart < 1.5s | Media streams encrypted via DTLS-SRTP. | WebRTC stats log asserts `bytesReceived > 0` and zero packet loss. |
| **Division B: Social Feed** | User can publish text, photo, and video posts; comments and likes update in real-time. | Feed scroll 60 FPS; image load < 400ms | Public posts marked unencrypted; private media URLs secure. | Feed load test asserts chronological post sorting and comment depth. |
| **Division B: Reels / Short Video** | Vertical video feed swipes seamlessly between clips with background audio. | Video transition lag < 100ms; pre-fetch next 2 clips | Anonymized recommendation telemetry. | WebGL frame counter verifies 60 FPS during vertical swipe transitions. |
| **Division B: Ephemeral Stories** | Story uploads, displays view counter, and expires automatically after 24 hours. | Story upload < 2s; server purge at 24h + 1m | Close Friends privacy filter strictly enforced. | Automated test verifies story media purge 24 hours post-upload. |
| **Division C: Community Servers**| Server channels load text and voice rooms; permission roles regulate posting rights. | Channel switch < 150ms; room permission eval < 10ms | Private channels enforce subscriber rules. | Permission test asserts non-admin denied posting in read-only channels. |
| **Division D: Creator Hub & Live**| Creator live stream broadcasts video to 1,000+ viewers with real-time chat overlay. | Live video latency < 2.0s; chat delay < 200ms | Virtual gift transactions authenticated. | Load test asserts 1,000 CCU live stream stability without dropped frames. |
| **Division E: AI Services** | Arabic <-> English translation converts text accurately; voice note transcribes to text. | Translation response < 350ms; transcription < 2s | 100% explicit user consent before AI call. | Consent modal test verifies zero unconsented text sent to `/api/ai-proxy`. |
| **Division F: Business & Mini Apps**| Sandboxed Mini App opens in iframe container and interacts with user via secure API. | Mini App launch < 800ms | Sandbox prevents Mini App from accessing E2EE keys. | Security test verifies sandbox iframe blocked from reading `IndexedDB`. |

---

## 2. SYSTEM-WIDE NON-FUNCTIONAL ACCEPTANCE CRITERIA

1. **Accessibility Acceptance:** 100% of UI components pass WCAG 2.1 AA screen reader checks and dynamic font scaling without overlapping text elements.
2. **Bidi Acceptance:** Switching between English (LTR) and Arabic (RTL) flips UI navigation, text alignment, and icon orientation symmetrically without page reload.
3. **Failure Isolation Acceptance:** Injecting network errors into Firebase Storage or shutting down storage emulators causes ZERO errors in text messaging or WebRTC calls.
