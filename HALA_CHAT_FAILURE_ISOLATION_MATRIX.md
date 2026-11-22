# HALA CHAT — FAILURE ISOLATION MATRIX

**Status:** COMPLETED SPECIFICATION  
**Date:** 2026-11-07  
**Scope:** Circuit Breakers, Fallbacks, Retry Logic, and Blast-Radius Containment across 19 Engines

---

## 1. FAILURE CONTAINMENT MATRIX

This matrix defines the exact failure scenarios, containment boundaries, circuit breaker parameters, and graceful degradation strategies for every feature engine in Hala Chat.

| Engine | Failure Scenario | Circuit Breaker Policy | Graceful Degradation Strategy | Blast Radius |
|--------|------------------|------------------------|-------------------------------|--------------|
| **1. Text Chat Engine** | Firestore network write timeout (30s) | Retry 3 times with exponential backoff (1s, 2s, 4s); trip after 3 consecutive failures. | Message saved to IndexedDB offline queue; UI displays "Pending Reconnection" indicator. | **ISOLATED to Text Chat Engine.** |
| **2. Voice Notes Engine** | MediaRecorder API unsupported or microphone blocked | Instant circuit breaker trip (0 retries). | Disables voice record button; displays toast "Microphone unavailable". Text input remains 100% active. | **ISOLATED to Voice Recording.** |
| **3. Image Engine** | Canvas image compression memory error or blob exceeds quota | Retry 1 time with reduced resolution; trip on 2nd failure. | Displays "Upload failed — retry" button on image message bubble. Chat session remains active. | **ISOLATED to Image Attachment.** |
| **4. Video Engine** | Video encoding unsupported or GCS upload timeout (180s) | Cancel task after 180s timeout; trip after 2 failures. | Displays raw file attachment link as fallback. Video player falls back to direct download link. | **ISOLATED to Video Media.** |
| **5. PDF Engine** | PDF preview rendering error (`pdf.js` / canvas error) | 0 retries on parse error. | Hides page preview thumbnail; renders standard PDF document file bubble with download button. | **ISOLATED to PDF Preview.** |
| **6. Documents Engine** | File upload interrupted or GCS rate limit | Retry 2 times with jitter backoff (2s, 5s). | Displays document attachment with retry icon. Text messaging remains uninterrupted. | **ISOLATED to Document Upload.** |
| **7. Attachments Engine** | File size exceeds 20MB quota limit | Instant trip (0 retries). | Displays modal alert: "File size exceeds 20MB limit". Upload aborted cleanly. | **ISOLATED to Attachment Menu.** |
| **8. Location Engine** | Geolocation permission denied or GPS timeout (10s) | Fallback to IP/Default location or manual pick after 10s. | Displays interactive map picker for manual pin placement. | **ISOLATED to Location Picker.** |
| **9. Calling Engine** | WebRTC ICE candidate gathering failure or STUN timeout | Trip after 15s connection failure. | Ends call state, plays end call tone, shows "Call Unreachable" notice. Active chat remains open. | **ISOLATED to Call Overlay.** |
| **10. Group Engine** | Group participant update transaction collision | Retry transaction up to 5 times (`runTransaction`). | Displays toast: "Updating group... please retry". Retains current chat list view. | **ISOLATED to Group Settings.** |
| **11. Channels Engine** | Channel subscriber count transaction collision | Retry transaction up to 5 times. | Self-heals subscriber count asynchronously without blocking channel read access. | **ISOLATED to Channel Admin.** |
| **12. Stories Engine** | Story media upload failure to `/media/{uid}/` | Retry 2 times. | Story modal displays "Failed to post story". Active chat sessions unaffected. | **ISOLATED to Story Modal.** |
| **13. Social Feed Engine** | Feed fetch network error (`social_posts`) | Retry 3 times. | Displays offline feed state with "Tap to refresh". Chat system remains fully functional. | **ISOLATED to Social Feed.** |
| **14. Notifications Engine** | Service Worker push registration failure | 0 retries on browser block. | Disables Web Push; falls back to in-app audio chime and title bar badge count. | **ISOLATED to Push Worker.** |
| **15. Profile Engine** | Profile avatar upload failure (5MB limit) | Retry 1 time. | Retains previous avatar; displays error message in profile modal. | **ISOLATED to Settings Modal.** |
| **16. Settings Engine** | Two-Step PIN verification mismatch | 3 attempt limit before 5-minute lockout. | Locks two-factor settings interface; chat remains accessible if already unlocked. | **ISOLATED to Two-Step View.** |
| **17. Offline Sync Engine** | Network disconnect mid-synchronization | Pause queue processor immediately; resume on `online` event. | Retains pending queue in IndexedDB; no data loss or duplicate messages. | **ISOLATED to Background Sync.** |
| **18. Search Engine** | Search index memory allocation overflow | Purge search index cache. | Falls back to server-side Firestore range queries. | **ISOLATED to Search Modal.** |
| **19. Session Engine** | Session restore token invalidation | Trip on 401 Unauthorized. | Redirects to `PhoneAuthScreen` cleanly; preserves local encrypted key backups. | **ISOLATED to Auth Guard.** |

---

## 2. RESILIENCE GUARANTEES

1. **Zero Cascade Invariant**: A failure, uncaught exception, or timeout in any media engine (Voice, Image, PDF, Video, Calling) MUST NEVER crash the core Text Chat Engine or close the active conversation screen.
2. **Idempotent Retries**: All retry logic MUST generate deterministic request tokens to prevent duplicate message or storage creation.
