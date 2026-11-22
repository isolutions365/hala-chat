# HALA CHAT — MODULE BOUNDARY MATRIX

**Status:** COMPLETED SPECIFICATION  
**Date:** 2026-11-07  
**Scope:** Strict Interface Contracts & Boundaries for 19 Autonomous Feature Modules

---

## 1. MODULE BOUNDARY DEFINITIONS

This matrix defines the exact input, output, state ownership, and failure boundaries for all 19 feature engines in Hala Chat.

| Module Name | UI Components | State & Storage Ownership | Input Contract | Output Contract | Isolation & Fallback Policy |
|-------------|---------------|---------------------------|----------------|-----------------|-----------------------------|
| **1. Text Chat Engine** | `ConversationScreen.tsx`, `ChatMessageItem.tsx` | Message list state, active chat key | `SendMessageInput { text, chatId }` | `MessageModel` (Firestore write) | Text errors trigger local retry. Does not block media engines. |
| **2. Voice Notes Engine** | `VoiceRecorder.tsx`, `VoicePlayer.tsx` | Audio recorder state, waveform cache | `RecordAudioInput { maxDuration: 120s }` | `{ downloadUrl, mediaIv, duration }` | Audio recorder failure falls back to text input interface. |
| **3. Image Engine** | `ImagePicker.tsx`, `ImageViewer.tsx` | Image canvas state, compression cache | `File / Blob (image/*)` | `{ downloadUrl, mediaIv, dimensions }` | Image failure shows retry toast. Does not crash conversation view. |
| **4. Video Engine** | `VideoPlayer.tsx`, `VideoUploadModal.tsx` | Video playback state, thumbnail cache | `File / Blob (video/*)` | `{ downloadUrl, mediaIv, posterUrl }` | Video decode failure degrades to fallback download link. |
| **5. PDF Engine** | `PDFViewer.tsx`, `PDFAttachmentItem.tsx` | PDF page canvas cache | `File / Blob (application/pdf)` | `{ downloadUrl, mediaIv, pageCount }` | PDF preview failure degrades to file download action. |
| **6. Documents Engine** | `DocumentAttachmentItem.tsx` | File upload progress map | `File (msword, excel, text)` | `{ downloadUrl, mediaIv, fileName }` | Document upload failure isolates error to attachment bubble. |
| **7. General Attachments Engine** | `AttachmentMenuModal.tsx` | Upload queue map | `Blob (octet-stream, zip)` | `{ downloadUrl, mediaIv, fileSize }` | Size limit (20MB) failure shows alert without blocking chat. |
| **8. Location Sharing Engine** | `LocationPickerModal.tsx` | GPS location state | `GeolocationCoordinates` | `LocationPayload { lat, lng, address }` | GPS timeout allows manual location entry on static map. |
| **9. Calling Engine** | `CallModal.tsx`, `ActiveCallScreen.tsx` | WebRTC PeerConnection, signaling state | `InitiateCallInput { calleeId, type }` | `CallModel` (Firestore signaling) | Call crash clears call overlay; chat view remains 100% active. |
| **10. Group Chat Engine** | `GroupSettingsModal.tsx` | Participant details map, admin list | `UpdateGroupInput { groupId, participants }` | Transaction result (`chats/{id}`) | Transaction collision retries automatically; preserves chat list. |
| **11. Channels Engine** | `ChannelViewScreen.tsx`, `SubscriberList.tsx` | Subscriber list, channel policy | `ChannelActionInput { channelId, action }` | Transaction result (`channels/{id}`) | Subscriber count desync self-heals via transaction recount. |
| **12. Stories Engine** | `CreateStoryModal.tsx`, `StoryViewerScreen.tsx` | Story list state, view counts | `PublishStoryInput { mediaBlob, caption }` | `StoryModel` (`stories/{id}`) | Story upload failure does not affect active chat sessions. |
| **13. Social Feed Engine** | `SocialFeedModal.tsx`, `CommentSection.tsx` | Feed posts state, likes map | `PostInput { text, imageBlob }` | `SocialPostModel` (`social_posts`) | Feed errors isolated to feed modal window. |
| **14. Notifications Engine** | `NotificationToast.tsx` | Push token, toast queue | `TriggerNotificationInput { title, body }` | In-app toast / Web Push | Notification error falls back to visual unread badge counts. |
| **15. Profile & Avatar Engine** | `ProfileSetupScreen.tsx`, `SettingsModal.tsx` | User profile state, avatar Blob cache | `UpdateProfileInput { name, avatarBlob }` | `UserProfile` (`users/{uid}`) | Avatar upload failure keeps existing avatar without breaking profile. |
| **16. Settings Engine** | `TwoStepSettings.tsx`, `PrivacyModal.tsx` | Block list, PIN verification state | `UpdatePrivacyInput { blockedUsers, pin }` | Firestore user settings doc | PIN error stays in settings modal; chat remains locked until set. |
| **17. Offline Sync Engine** | `OfflineSyncManager.ts` | IndexedDB pending queue, sync status | `NetworkStatus { isOnline }` | Reconciled queue events | Sync failure retries with exponential backoff + random jitter. |
| **18. Search Engine** | `GlobalSearchModal.tsx` | In-memory message index | `SearchQueryInput { query, filter }` | `SearchResultItem[]` | Search index failure falls back to server-side query filters. |
| **19. Session Engine** | `RestoreChatsScreen.tsx` | Auth session token, keypair cache | `SessionRestoreInput { phone, pin }` | Verified Auth Session | Auth expiry prompts re-login without deleting local encrypted keypair. |

---

## 2. COMMUNICATIONS CONTRACT RULES

1. **No Direct Inter-Module Imports**: Feature modules MUST NOT import internal components or state setters from another feature module.
2. **Event Bus / Message Passing**: Inter-module communication (e.g. Call Engine notifying Notification Engine) MUST occur via decoupled custom events (`CustomEvent`) or typed callbacks.
3. **Data Immutability**: All payloads passed across module boundaries MUST be immutable frozen objects (`Object.freeze()`).
