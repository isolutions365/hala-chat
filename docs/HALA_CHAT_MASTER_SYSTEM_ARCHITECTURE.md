# HALA CHAT — MASTER SYSTEM ARCHITECTURE V1.0

**Document Class:** System Architecture Specification  
**Author:** Principal Software Architect & Distributed Systems Engineer  
**Scope:** End-to-End System Architecture Across Client, Gateway, Core Services, and Data Layers  
**Status:** COMPLETE & GRADUALLY EVOLVABLE  

---

## 1. HIGH-LEVEL ARCHITECTURE OVERVIEW

Hala Chat employs a **Resilient Hybrid System Architecture**. It leverages the rapid deployment and real-time synchronization capabilities of Firebase (Auth, Firestore, Storage) as a core baseline, while architecting clean extension hooks for custom microservices (WebRTC SFU, WebSocket Gateway, Media Processing Workers, and AI API Proxies).

```
+-----------------------------------------------------------------------------------+
|                            CLIENT PLATFORM LAYER                                  |
|  Android PWA/APK │ Mobile Browsers │ Desktop Web (WhatsApp-Style) │ iOS (Future)  |
+-----------------------------------------------------------------------------------+
                                       │ (HTTPS / WSS / WebRTC)
                                       ▼
+-----------------------------------------------------------------------------------+
|                            API & GATEWAY LAYER                                    |
|  Vite Dev Proxy / Cloudflare Edge Routing │ Auth Bearer Token Token Verification  |
+-----------------------------------------------------------------------------------+
       │                                 │                                  │
       ▼                                 ▼                                  ▼
+------------------------+   +------------------------+   +-------------------------+
| FIREBASE CORE SERVICES |   | CUSTOM REAL-TIME MEDIA |   | AI & INTELLIGENCE NODE  |
| - Firebase Auth        |   | - WebRTC SFU Node      |   | - Server-Side Gemini    |
| - Cloud Firestore      |   | - STUN/TURN Relays     |   |   API Proxy Proxy       |
| - Firebase Storage V5  |   | - Media Processing     |   | - On-Device Whisper.cpp |
| - FCM Push Service     |   |   Worker Queue         |   | - Ar-En Translation     |
+------------------------+   +------------------------+   +-------------------------+
       │                                 │                                  │
       └─────────────────────────────────┴──────────────────────────────────┘
                                       │
                                       ▼
+-----------------------------------------------------------------------------------+
|                        PERSISTENCE & SECURITY LAYER                               |
| Cloud Firestore (Enterprise DB) │ GCS Bucket V5 Isolation │ Web Crypto Key Store  |
+-----------------------------------------------------------------------------------+
```

---

## 2. FRONTEND ARCHITECTURE

1. **Framework & Engine:** React 19 SPA running on Vite 6 with TypeScript strictly enforced.
2. **Styling & Design System:** Tailwind CSS v4 using global CSS custom properties and atomic utility classes.
3. **State Management:**
   - **Local Component State:** React `useState`, `useReducer`, and `useRef` for transient UI interactions.
   - **Global Application State:** React Context Providers (`AuthProvider`, `ChatProvider`, `ThemeContext`).
   - **Real-Time Data State:** Active Firestore `onSnapshot` listeners feeding directly into React state hooks.
4. **Navigation & Multi-Pane Layout:**
   - **Mobile Layout (< 768px):** Single-pane view with smooth slide transitions between Chat List, Chat Room, Feed, and Profile.
   - **Desktop Layout (>= 768px):** WhatsApp Web-style triple-pane layout (Navigation Rail + Conversation List + Active Chat/Feed View + Info Drawer).
5. **Localization & Directionality:** Dynamic RTL (`dir="rtl"`) for Arabic (`ar`) and LTR (`dir="ltr"`) for English (`en`), syncing HTML root attributes seamlessly.

---

## 3. BACKEND & SERVICE EVOLUTION STRATEGY

Rather than attempting a costly rewrite away from Firebase, Hala Chat implements a **Gradual Service Evolution Strategy**:

```
+-----------------------------------------------------------------------------------+
|                           GRADUAL SERVICE EVOLUTION                               |
+-----------------------------------------------------------------------------------+
 STAGE 1 (Current): Pure Firebase Architecture
   - Firestore handles data & messaging; Firebase Storage V5 handles media; FCM push.

 STAGE 2 (Scale 100K+): Hybrid Real-Time Calling & Worker Queue
   - Add dedicated LiveKit / Mediasoup WebRTC SFU nodes for group calls and live streaming.
   - Add async Redis/Node.js media compression worker queue for video transcode.

 STAGE 3 (Scale 1M+): Hybrid WebSocket & Dedicated Database Read Relays
   - Introduce custom WebSocket gateway for high-frequency presence/typing signals.
   - Introduce Cloud SQL / Redis read caches for public channel feeds to preserve Firestore quota.
+-----------------------------------------------------------------------------------+
```

---

## 4. DATA DOMAIN ARCHITECTURE

The application data model is cleanly partitioned into domain entities within Cloud Firestore:

1. **User Identity & Profiles (`/users/{uid}` & `/users_public/{uid}`):**
   - Private user profile (`users/{uid}`): Phone number, FCM tokens, personal settings.
   - Public profile (`users_public/{uid}`): Name, avatar URL, bio status, public key (`public_key`).
2. **Conversations & Messages (`/chats/{chatId}` & `/chats/{chatId}/messages/{msgId}`):**
   - Chat Document: `type` ('1-1' | 'group' | 'channel'), `participants` array, `participantDetails`, `unreadCount`, `typing` status map.
   - Message Document: `senderId`, `content` (Storage URL or text), `mediaIv`, `fileType`, `fileName`, `timestamp`, `editedAt`, `replyTo`.
3. **Channels & Subscribers (`/channels/{channelId}` & `/channels/{channelId}/subscribers/{uid}`):**
   - Channel Document: `title`, `description`, `isPublic`, `createdBy`, `adminIds`, `allowMemberPosts`.
   - Subscriber Subcollection: `joined_at`, `role`.
4. **Social Feed Posts & Stories (`/posts/{postId}` & `/stories/{storyId}`):**
   - Posts: `authorId`, `content`, `mediaUrls`, `likeCount`, `commentCount`, `createdAt`.
   - Stories: `authorId`, `mediaUrl`, `mediaIv`, `expiresAt` (24-hour TTL).

---

## 5. MEDIA ARCHITECTURE & STORAGE V5

Media files are strictly segregated by operational category into Firebase Storage:

- **Chat Media (V5 Path):** `/chats/{chatId}/{mediaType}/{assetId}` where `mediaType` is `'voice' | 'images' | 'documents' | 'PDFs' | 'attachments'`.
- **User Avatars:** `/avatars/{uid}_{timestamp}.jpg`.
- **Legacy User Media:** `/media/{uid}/{assetId}` (Maintained for backwards compatibility).
- **Call Recordings:** `/call_recordings/{callId}_{timestamp}.mp4`.
- **Feed & Story Media:** `/posts/{postId}/{assetId}` and `/stories/{storyId}/{assetId}`.
