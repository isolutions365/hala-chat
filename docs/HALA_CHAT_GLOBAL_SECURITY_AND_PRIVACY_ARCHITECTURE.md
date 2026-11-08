# HALA CHAT — GLOBAL SECURITY AND PRIVACY ARCHITECTURE V1.0

**Document Class:** Cybersecurity & Cryptographic Architecture Specification  
**Author:** Cybersecurity Architect & Cryptographic Systems Engineer  
**Scope:** Zero-Trust End-to-End Encryption, Storage V5 Rules, Key Management, and Privacy Boundaries  
**Status:** COMPLETE & AUDITED  

---

## 1. END-TO-END ENCRYPTION (E2EE) CRYPTOGRAPHIC SPECIFICATION

Hala Chat uses the native Web Crypto API (`window.crypto.subtle`) to implement zero-trust client-side End-to-End Encryption across all private messaging, voice notes, photos, videos, and document attachments:

```
+-----------------------------------------------------------------------------------+
|                        CRYPTOGRAPHIC PRIMITIVES & ALGORITHMS                      |
+-----------------------------------------------------------------------------------+
 1. Asymmetric Key Agreement:
    - Algorithm: ECDH (Elliptic Curve Diffie-Hellman)
    - Curve: NIST P-256 (secp256r1)
    - Export Format: JWK (JSON Web Key)

 2. Symmetric Data Encryption:
    - Algorithm: AES-GCM (Galois/Counter Mode)
    - Key Length: 256 bits
    - Initialization Vector (IV): 12-byte random Uint8Array via window.crypto.getRandomValues()
    - Integrity Tag Length: 128 bits (GCM authentication tag)

 3. Private Key Backup & PIN Derivation:
    - Key Derivation Function: PBKDF2 (Password-Based Key Derivation Function 2)
    - Salt: 16-byte random Uint8Array
    - Iteration Count: 600,000 iterations
    - Hash Function: SHA-256
+-----------------------------------------------------------------------------------+
```

---

## 2. E2EE KEY MANAGEMENT & MULTI-DEVICE ARCHITECTURE

### 2.1 1-on-1 Session Key Derivation
1. Sender `Alice` imports her private ECDH key `priv_Alice` from local IndexedDB (`HalaCryptoDB`).
2. Sender `Alice` fetches recipient `Bob`'s active public key `pub_Bob` from Firestore collection `users_public/{uid}.public_key`.
3. Web Crypto executes `deriveKey()`:
   ```typescript
   const sessionKey = await window.crypto.subtle.deriveKey(
     { name: 'ECDH', public: peerPublicKey },
     ownPrivateKey,
     { name: 'AES-GCM', length: 256 },
     false, // non-extractable
     ['encrypt', 'decrypt']
   );
   ```
4. Computed `sessionKey` is cached in memory (`memoryKeyCache`) and used for zero-latency AES-GCM encryption.

### 2.2 Group Chat Symmetric Key Exchange
1. Group creator generates a random 256-bit AES-GCM symmetric key `groupSymmetricKey`.
2. Group creator iterates through all group members, deriving 1-on-1 session keys with each member's public key.
3. Group creator encrypts `groupSymmetricKey` raw bytes using each member's derived session key, generating encrypted key envelopes (`encryptedGroupKeys`).
4. Encrypted key envelopes are stored in the group Firestore document `chats/{chatId}.encryptedGroupKeys.{memberUid}`.
5. Member joins group -> decrypts key envelope using own private key -> caches `groupSymmetricKey` locally.

### 2.3 Account Recovery & PIN Key Backups
- If a user changes devices, private keys are restored using the PIN Backup mechanism:
  - User enters 6-digit PIN.
  - `deriveKeyFromPin(pin, salt)` computes AES-GCM backup key via PBKDF2 (600,000 iterations).
  - Private key backup payload is decrypted and saved locally in IndexedDB `HalaCryptoDB`.
  - **Zero Server Exposure:** Firebase servers store only the encrypted ciphertext blob (`blob`), salt (`salt`), and IV (`iv`). The PIN is never transmitted over the network.

---

## 3. FIRESTORE & STORAGE V5 AUTHORIZATION ARCHITECTURE

```
+-----------------------------------------------------------------------------------+
|                        STORAGE V5 AUTHORIZATION MATRIX                            |
+-----------------------------------------------------------------------------------+
 Path: /chats/{chatId}/{mediaType}/{assetId}

 Read Rule:
   - Request must be authenticated (request.auth != null).
   - User MUST be listed in chats/$(chatId).data.participants OR
     User MUST be subscriber in channels/$(chatId)/subscribers/$(uid) OR
     Channel MUST be public (channels/$(chatId).data.isPublic == true).

 Create Rule:
   - Request must be authenticated.
   - Resource MUST not already exist (resource == null) -> non-overwrite.
   - User MUST have posting permission in chat or channel.

 Update / Delete Rule:
   - Blocked for client SDKs (allow update, delete: if false;).
+-----------------------------------------------------------------------------------+
```

---

## 4. PRIVACY BOUNDARIES & DATA PORTABILITY

1. **Private vs. Public Data Segregation:**
   - **Private Content (E2EE):** 1-on-1 chats, group chats, voice notes, call audio/video, personal media. Stored strictly as AES-GCM ciphertext.
   - **Public Content:** Public broadcast channels, social feed posts, public community servers, user display names, and public avatars. Stored in unencrypted collections (`users_public`, `posts`, `channels`).
2. **Account Deletion & Data Export:**
   - User can trigger `Export My Data` to download a JSON archive of personal profile, contacts, and message metadata.
   - User can trigger `Delete Account`:
     - Firestore document `users/{uid}` and `users_public/{uid}` deleted.
     - User's contacts subcollection purged.
     - Presence record deleted.
     - FCM push tokens invalidated.
