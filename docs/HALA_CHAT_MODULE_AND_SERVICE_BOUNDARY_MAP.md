# HALA CHAT — MODULE AND SERVICE BOUNDARY MAP V1.0

**Document Class:** Software Architecture & Module Boundary Specification  
**Author:** Principal Software Architect & Lead Developer  
**Scope:** Strict Module Interfaces, Isolation Contracts, and Anti-Coupling Rules  
**Status:** COMPLETE & COMPLIANT WITH RESILIENT MODULAR BLUEPRINT V1  

---

## 1. MODULE BOUNDARY & CONTRACT MATRIX

To guarantee that failure or performance degradation in one subsystem can **never break another subsystem**, all Hala Chat modules interact strictly through defined TypeScript contracts and event buses:

| Module Name | Allowed Imports | Forbidden Imports | Public Contract Interface | Internal State Scope | Failure Isolation Strategy |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`CryptoEngine`** | Native Web Crypto API | UI components, Storage SDK, DOM elements | `encryptBlobData()`, `decryptBlobData()`, `derive1on1SessionKey()` | In-memory key cache & IndexedDB `HalaCryptoDB` | Crypto failure returns `null`; never throws unhandled UI exceptions. |
| **`MediaStorage`** | `FirebaseStorage`, `CryptoEngine` | UI components, Voice Recorder, Call Manager | `uploadChatMedia()`, `uploadVoiceNote()`, `storeMedia()` | Active upload tasks (`UploadTask`) | 180s upload timeout; error returns rejected promise with error code. |
| **`DecryptedMediaHook`**| `MediaStorage`, `CryptoEngine` | React UI components | `useDecryptedMedia(messages, conversationKey, chatId)` | In-flight fetch promises & Object Blob URL cache | Download/decryption error sets individual message status to `'error'`. |
| **`TextMessaging`** | `FirebaseFirestore`, `CryptoEngine` | `MediaStorage`, WebRTC Call Manager | `sendMessage()`, `subscribeToUserChats()`, `subscribeToMessages()` | Active Firestore `onSnapshot` unsubscribes | Network drop queues writes in local cache; UI updates optimistically. |
| **`WebRTCCalling`** | `FirebaseFirestore`, WebRTC API | `MediaStorage`, Feed Manager | `useWebRTC(callId, isCaller)`, `initiateCall()`, `endCall()` | PeerConnection, Local/Remote MediaStream | ICE failure triggers automatic reconnection; call drop does NOT affect text chat. |
| **`SocialFeed`** | `FirebaseFirestore`, `MediaStorage` | `CryptoEngine` (Private Keys) | `fetchFeedPosts()`, `createPost()`, `likePost()` | Feed posts array & pagination cursor | Feed storage outage renders text posts; image error shows placeholder. |
| **`CommunityServers`** | `FirebaseFirestore` | Direct Private Chat hooks | `createCommunityServer()`, `fetchServerChannels()` | Server Channels & Role Permissions | Server error isolated to Community tab; main chat operates normally. |

---

## 2. EVENT BUS & IPC CONTRACTS

Modules communicate across feature boundaries using a typed, decoupled Event Bus:

```typescript
// Event Contract Interface
export interface HalaEventMap {
  'auth:state_changed': { user: FirebaseUser | null; profile: UserModel | null };
  'chat:active_changed': { previousChatId: string; newChatId: string };
  'media:upload_progress': { messageId: string; percent: number };
  'media:decrypted_ready': { messageId: string; blobUrl: string };
  'call:incoming_invite': { callId: string; callerName: string; callType: 'voice' | 'video' };
  'network:status_changed': { isOnline: boolean };
}

export class HalaEventBus {
  private static instance: HalaEventBus;
  private listeners: Map<string, Set<(data: any) => void>> = new Map();

  public static getInstance(): HalaEventBus {
    if (!HalaEventBus.instance) HalaEventBus.instance = new HalaEventBus();
    return HalaEventBus.instance;
  }

  public emit<K extends keyof HalaEventMap>(event: K, data: HalaEventMap[K]): void {
    const callbacks = this.listeners.get(event);
    if (callbacks) callbacks.forEach(fn => fn(data));
  }

  public on<K extends keyof HalaEventMap>(event: K, fn: (data: HalaEventMap[K]) => void): () => void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(fn);
    return () => this.listeners.get(event)?.delete(fn);
  }
}
```

---

## 3. ANTI-COUPLING ENFORCEMENT RULES

1. **Rule 1 — Zero Private Key Leaks:** The `SocialFeed`, `CommunityServers`, and `Analytics` modules are **STRICTLY FORBIDDEN** from importing or accessing private user encryption keys (`priv_{uid}`).
2. **Rule 2 — Independent Media Transports:** The `TextMessaging` service must never wait for media uploads to complete before rendering text messages. Media uploads run asynchronously in background tasks.
3. **Rule 3 — DOM Isolation:** Crypto and Storage services must never reference DOM elements (`window.document`) or React state variables directly. All interactions occur via returned Promise promises or Event Bus notifications.
