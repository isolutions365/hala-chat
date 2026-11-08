# HALA CHAT — SECURITY AND E2EE BOUNDARY SPECIFICATION

**Status:** COMPLETED SPECIFICATION  
**Date:** 2026-11-07  
**Scope:** E2EE Cryptographic Invariants, Web Crypto API Boundaries, and Firebase Security Rules Protection

---

## 1. CRYPTOGRAPHIC ARCHITECTURE & E2EE INVARIANTS

Hala Chat uses end-to-end encryption for all 1:1 and group text messages, voice notes, images, PDFs, and file attachments.

### 1.1 Non-Negotiable Security Invariants (`VERIFIED`)
1. **Zero Key Regeneration**: User identity keypairs (`ECDH P-256`) and conversation keys (`AES-GCM 256-bit`) MUST NEVER be reset, regenerated, or replaced during feature updates or modular refactoring.
2. **Stateless Web Crypto Processing**: Payload encryption (`encryptBlobData` / `encryptTextMessage`) and decryption (`decryptBlobData` / `decryptTextMessage`) operate as stateless functional pipelines using `window.crypto.subtle`.
3. **Ciphertext Preservation**: Media migration scripts and background workers process raw binary ciphertext ArrayBuffers directly without decrypting or re-encrypting payloads.
4. **IV Preservation**: The initial vector `mediaIv` (base64 string) stored in Firestore message documents (`types.ts:237`) MUST remain unmodified.

---

## 2. E2EE DATA FLOW & COMPONENT ISOLATION

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                CLIENT E2EE PIPELINE                                    │
│                                                                                        │
│  [Plaintext Payload] ──► [Web Crypto Subtle API] ──► [AES-GCM Encrypted ArrayBuffer]     │
│                                (AES-GCM-256)                   │                       │
│                                                                ▼                       │
│  [Firestore Document] ◄── [Media IV & Metadata]    [Firebase Storage Upload]          │
│   (msgId, mediaIv)                                 (chats/{chatId}/{mediaType}/{id})   │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. FIREBASE SECURITY RULES BOUNDARIES

### 3.1 Storage Security V5 Rules Compliance (`storage.rules`)
- **Chat-Scoped Paths (`chats/{chatId}/{mediaType}/{assetId}`)**: Enforces `request.auth.uid in getChat(chatId).participants` for 1:1 and group chats. Channels enforce `isPublic` / `isChannelSubscriber` for reads and `allowMemberPosts` for subscriber uploads.
- **Single-Write Protection**: `resource == null` prevents overwriting existing objects.
- **Client Tamper Defense**: `allow update, delete: if false;` prevents client-side deletion or modification of shared chat media.
- **Legacy Path Compatibility (`media/{uid}/{assetId}`)**: Preserved for Stories and Social Feed posts matching `firestore.rules:272` regex.

---

## 4. ISOLATED KEY CACHING & MEMORY MANAGEMENT

- **`DecryptionCacheService` (`lruDecryptionCache.test.mjs`)**: Manages in-memory decrypted Blob URL caches using a bounded LRU eviction policy (maximum 100 items). Evicted Blob URLs are revoked (`URL.revokeObjectURL`) to prevent memory leaks.
- **Zero Key Persistence in Unencrypted Storage**: Conversation keys (`CryptoKey` objects) MUST NEVER be stored in `localStorage` or `sessionStorage` in unencrypted form.
