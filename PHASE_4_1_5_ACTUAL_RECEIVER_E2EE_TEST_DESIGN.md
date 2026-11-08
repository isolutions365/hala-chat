# HALA CHAT — PHASE 4.1.5: DESIGN B
## ACTUAL HALA CHAT RECEIVER E2EE COMPATIBILITY TEST DESIGN

**Mode:** STRICT READ-ONLY DESIGN SPECIFICATION  
**Scope:** Receiver-Side End-to-End Encryption (E2EE) Pipeline & Historical Media Compatibility  
**Status:** DESIGN ONLY — GROUNDED IN ACTUAL SOURCE CODE (`src/lib/crypto.ts`, `src/lib/media.ts`, `src/hooks/useDecryptedMedia.ts`)  

---

## 1. END-TO-END HALA CHAT MEDIA LIFECYCLE TRACE

A complete audit of the codebase reveals the exact operational pipeline executing during media send and receive operations:

```
+-----------------------------------------------------------------------------------+
|                              SENDER PIPELINE                                      |
+-----------------------------------------------------------------------------------+
 1. Input: File / Blob (Audio, Image, PDF, Document)
 2. Compression (Audio: compressAudio() | Image: compressImage())
 3. Validation: validateMediaUpload() (Size limit & basic MIME check)
 4. E2EE Encryption: encryptBlobData(blob, conversationKey)
    -> Generates 12-byte random IV via window.crypto.getRandomValues()
    -> Executes AES-GCM 256-bit encryption via SubtleCrypto.encrypt()
    -> Encodes IV to Base64 (ivB64)
 5. Storage Upload: uploadChatMedia() -> storeMedia()
    -> Firebase Storage SDK: uploadBytesResumable()
    -> Path: /chats/{chatId}/{mediaType}/{assetId} (V5) OR /media/{uid}/{assetId} (Legacy)
    -> Metadata: contentType = 'application/octet-stream' (encrypted bytes)
 6. Firestore Document: addDoc(collection(db, 'chats', chatId, 'messages'))
    -> Fields: content (Storage URL), mediaIv (ivB64), fileType, fileName, senderId...

+-----------------------------------------------------------------------------------+
|                             RECEIVER PIPELINE                                     |
+-----------------------------------------------------------------------------------+
 1. Real-time Subscription: onSnapshot(collection(db, 'chats', chatId, 'messages'))
 2. React Hook Trigger: useDecryptedMedia(messages, conversationKey, activeChatId)
 3. Byte Retrieval: processMediaMessage()
    -> Primary Path: Storage SDK getBytes(storageRef(storage, storagePath))
    -> Fallback 1: Direct HTTP fetch(url)
    -> Fallback 2 (Dev): /api/media-proxy?url=...
 4. Key Resolution: conversationKey (Derived via derive1on1SessionKey() or decryptGroupSymmetricKey())
 5. Decryption Execution: decryptBlobData(encryptedArrayBuffer, ivB64, mimeType, key)
    -> Converts ivB64 -> Uint8Array(12)
    -> Calls window.crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, encryptedArrayBuffer)
 6. MIME Sniffing & Blob Creation:
    -> sniffDecryptedMimeType(decryptedBuffer, fallbackMime)
    -> Inspects magic bytes (EBML/WebM: 0x1A45DFA3, OGG: 0x4F676753, WAV: 0x52494646, MP4: 0x66747970, MP3: 0x494433, JPEG: 0xFFD8FF, PNG: 0x89504E47)
    -> Returns Blob URL via URL.createObjectURL(new Blob([decryptedBuffer], { type: actualMime }))
 7. DOM Rendering: Audio player, Image viewer, PDF viewer or File download button.
```

---

## 2. HARNESS CATEGORIZATION & TEST METHODOLOGY

To guarantee that tests prove **actual production application compatibility** rather than isolated cryptographic theory, all test designs strictly mandate **Category A Execution**:

- **Category A (MANDATORY):** Actual Hala Chat production functions (`encryptBlobData`, `decryptBlobData`, `uploadChatMedia`, `useDecryptedMedia` logic, `sniffDecryptedMimeType`) imported directly into the test runner.
- **Category B (FORBIDDEN FOR PROOF):** Generic stand-alone AES-GCM scripts.
- **Category C (FORBIDDEN FOR PROOF):** Mocked encryption or bypass stubs.

---

## 3. DETAILED RECEIVER E2EE TEST SCENARIOS (E2EE-01 THROUGH E2EE-15)

---

### E2EE-01: New Encrypted Voice Note Sender-to-Receiver Round Trip

- **Functions Involved:** `uploadVoiceNote`, `uploadChatMedia`, `encryptBlobData`, `getBytes`, `decryptBlobData`, `useDecryptedMedia`.
- **Synthetic Identities:** Sender `user_alice` (UID: `usr_a`), Receiver `user_bob` (UID: `usr_b`).
- **Synthetic Keys:** ECDH P-256 derived AES-GCM 256-bit key (`sessionKey_AB`).
- **Test Media Format:** Audio WebM blob (`audio/webm`, 250KB Opus voice recording).
- **Firestore Metadata Required:** `type: 'voice'`, `content: 'https://firebasestorage.../chats/chat_123/voice/v01'`, `mediaIv: 'dGVzdF9pdl8xMjM0NQ=='`.
- **Storage Path:** `chats/chat_123/voice/asset_v01.enc`.
- **Expected Decryption Result:** Valid `blob:http...` URL. Decrypted bytes start with WebM magic `0x1A45DFA3`. Audio element plays without error.
- **Expected Error Handling:** None (Success).
- **Pass/Fail Criteria:** PASS if WebM magic bytes match and audio plays cleanly. Category A.

---

### E2EE-02: New Encrypted Image Sender-to-Receiver Round Trip

- **Functions Involved:** `uploadChatMedia`, `encryptBlobData`, `getBytes`, `decryptBlobData`, `useDecryptedMedia`.
- **Synthetic Identities:** `user_alice` -> `user_bob`.
- **Synthetic Keys:** `sessionKey_AB`.
- **Test Media Format:** JPEG image (`image/jpeg`, 1.2MB photo).
- **Firestore Metadata:** `type: 'image'`, `content: '.../chats/chat_123/images/img01'`, `mediaIv: 'aXZfcGhvdG9fMTIzNA=='`.
- **Storage Path:** `chats/chat_123/images/asset_img01.enc`.
- **Expected Decryption Result:** Valid `blob:` image URL. Decrypted magic bytes `0xFFD8FF00` (JPEG header). Image renders in `<img>` element.
- **Expected Error Handling:** None.
- **Pass/Fail Criteria:** PASS if JPEG magic bytes match and image loads. Category A.

---

### E2EE-03: New Encrypted PDF Sender-to-Receiver Round Trip

- **Functions Involved:** `testFirebasePdfUpload`, `uploadChatMedia`, `encryptBlobData`, `decryptBlobData`.
- **Synthetic Identities:** `user_alice` -> `user_bob`.
- **Synthetic Keys:** `sessionKey_AB`.
- **Test Media Format:** PDF Document (`application/pdf`, 500KB invoice).
- **Firestore Metadata:** `type: 'file'`, `fileName: 'invoice.pdf'`, `fileType: 'application/pdf'`, `mediaIv: 'cGRmX2l2XzU2Nzg5MA=='`.
- **Storage Path:** `chats/chat_123/PDFs/asset_pdf01.enc`.
- **Expected Decryption Result:** Valid PDF blob URL. Decrypted bytes start with `%PDF-1.`. PDF preview opens.
- **Expected Error Handling:** None.
- **Pass/Fail Criteria:** PASS if PDF magic bytes match and preview opens. Category A.

---

### E2EE-04: Historical WAV Voice Note Compatibility (Legacy Unencrypted Media)

- **Functions Involved:** `useDecryptedMedia`, `sniffMimeType`, `decryptBlobData`.
- **Synthetic Identities:** Historical Sender `user_legacy`.
- **Synthetic Keys:** None (`mediaIv` is undefined/null in legacy message doc).
- **Test Media Format:** Unencrypted WAV file (`audio/wav`, RIFF header `0x52494646`).
- **Firestore Metadata:** `type: 'voice'`, `content: 'https://firebasestorage.../media/usr_legacy/wav01'`, `mediaIv: null`.
- **Storage Path:** `media/usr_legacy/wav01`.
- **Expected Decryption Result:** `decryptBlobData` detects unencrypted WAV magic bytes (`0x52494646`) via `sniffDecryptedMimeType` and bypasses Web Crypto decryption instantly, returning raw media blob URL.
- **Expected Error Handling:** Zero decryption errors or loading hangs.
- **Pass/Fail Criteria:** PASS if legacy WAV plays immediately without requiring IV or key. Category A.

---

### E2EE-05: Historical Encrypted Image Compatibility (V1 Security Path)

- **Functions Involved:** `useDecryptedMedia`, `decryptBlobData`.
- **Synthetic Identities:** Historical Sender `user_v1`.
- **Synthetic Keys:** Historical ECDH P-256 session key.
- **Test Media Format:** Encrypted PNG (`image/png`, magic `0x89504E47` inside ciphertext).
- **Firestore Metadata:** `type: 'image'`, `content: 'https://firebasestorage.../media/usr_v1/img_old'`, `mediaIv: 'b2xkX2l2XzExMjIzMw=='`.
- **Storage Path:** `media/usr_v1/img_old`.
- **Expected Decryption Result:** `useDecryptedMedia` fetches legacy Storage path `media/usr_v1/img_old`, decrypts using session key, sniffs PNG magic bytes `0x89504E47`, and displays photo.
- **Expected Error Handling:** None.
- **Pass/Fail Criteria:** PASS if historical media URL under `/media/` decrypts and displays correctly. Category A.

---

### E2EE-06: Missing Media IV Handling

- **Functions Involved:** `useDecryptedMedia`, `processMediaMessage`.
- **Synthetic Identities:** `user_bob`.
- **Synthetic Keys:** Valid key available.
- **Test Media Format:** Encrypted ciphertext bytes stored in GCS.
- **Firestore Metadata:** `type: 'image'`, `content: '.../chats/chat_123/images/img_no_iv'`, `mediaIv: ''` (Empty/Missing).
- **Expected Decryption Result:** `useDecryptedMedia` detects `mediaIv` is absent on encrypted payload. Fallback pipeline checks raw bytes. Raw bytes fail MIME sniff for plain text/media -> System sets status to `error` with detail `{ stage: 'decrypt', code: 'missing_iv' }`.
- **Expected Error Handling:** Non-crashing UI error indicator ("🔒 Encrypted message (Key unavailable)").
- **Pass/Fail Criteria:** PASS if UI handles missing IV defensively without unhandled promise rejection. Category A.

---

### E2EE-07: Incorrect Media IV Handling

- **Functions Involved:** `decryptBlobData`.
- **Synthetic Identities:** `user_bob`.
- **Synthetic Keys:** Valid key.
- **Test Media Format:** Encrypted image payload.
- **Firestore Metadata:** `mediaIv: 'aW52YWxpZF9pdl9iYWQ='` (Corrupted 12-byte IV).
- **Expected Decryption Result:** `SubtleCrypto.decrypt()` throws `OperationError` (AES-GCM authentication tag verification fails). `decryptBlobData` catches error, logs warning, and returns `null`.
- **Expected Error Handling:** Error detail recorded in state `{ stage: 'decrypt', code: 'OperationError' }`.
- **Pass/Fail Criteria:** PASS if AES-GCM tag check catches bad IV and returns null safely. Category A.

---

### E2EE-08: Missing Encryption Key

- **Functions Involved:** `useDecryptedMedia`, `decryptBlobData`.
- **Synthetic Identities:** `user_charlie` (New participant without session key).
- **Synthetic Keys:** `conversationKey: null`.
- **Test Media Format:** Encrypted message payload.
- **Firestore Metadata:** `mediaIv: 'dmFsaWRfaXZfMTIzNDU='`.
- **Expected Decryption Result:** `useDecryptedMedia` checks `if (msg.mediaIv && !conversationKey) return;`. Download is deferred until key is derived. `decryptBlobData` called with `null` key returns `null`.
- **Expected Error Handling:** Message displays key placeholder state ("🔒 Encrypted message (Key unavailable)").
- **Pass/Fail Criteria:** PASS if execution halts cleanly without network fetch when key is missing. Category A.

---

### E2EE-09: Incorrect Encryption Key

- **Functions Involved:** `decryptBlobData`.
- **Synthetic Identities:** `user_eve` (Eavesdropper with wrong key).
- **Synthetic Keys:** `wrongKey` (Random 256-bit AES key).
- **Test Media Format:** Valid encrypted voice note.
- **Firestore Metadata:** Valid `mediaIv`.
- **Expected Decryption Result:** `SubtleCrypto.decrypt()` fails GCM authentication check. Returns `null`. Media remains completely unreadable.
- **Expected Error Handling:** Error logged, decryption returns null, privacy preserved.
- **Pass/Fail Criteria:** PASS if wrong key fails GCM tag check 100% of the time. Category A.

---

### E2EE-10: Corrupted Ciphertext

- **Functions Involved:** `decryptBlobData`.
- **Synthetic Identities:** `user_bob`.
- **Synthetic Keys:** Valid session key.
- **Test Media Format:** Encrypted payload with 1 byte modified in transit.
- **Firestore Metadata:** Valid `mediaIv`.
- **Expected Decryption Result:** `SubtleCrypto.decrypt()` detects MAC mismatch. Throws `OperationError`. `decryptBlobData` returns `null`.
- **Expected Error Handling:** State set to `error`.
- **Pass/Fail Criteria:** PASS if single-bit ciphertext alteration prevents decryption (AES-GCM integrity guarantee). Category A.

---

### E2EE-11: Wrong Chat or Conversation Key

- **Functions Involved:** `decryptGroupSymmetricKey`, `decryptBlobData`.
- **Synthetic Identities:** `user_bob` attempting to read Chat X media using Chat Y group key.
- **Synthetic Keys:** `groupKey_Y`.
- **Test Media Format:** Encrypted group media.
- **Firestore Metadata:** Valid `mediaIv`.
- **Expected Decryption Result:** AES-GCM authentication fails. Returns `null`.
- **Expected Error Handling:** UI displays lock state.
- **Pass/Fail Criteria:** PASS if cross-chat key usage is mathematically rejected. Category A.

---

### E2EE-12: Migrated V5 Media Path with Unchanged Encryption Metadata

- **Functions Involved:** `useDecryptedMedia`, `getStoragePathFromUrl`, `getBytes`, `decryptBlobData`.
- **Synthetic Identities:** `user_alice` -> `user_bob`.
- **Synthetic Keys:** Valid original `sessionKey_AB`.
- **Test Media Format:** Voice note migrated from `/media/usr_a/asset_1` to `/chats/chat_123/voice/asset_1`.
- **Firestore Metadata:** Updated `content: 'https://.../chats/chat_123/voice/asset_1'`, `mediaIv: 'dGVzdF9pdl8xMjM0NQ=='` (UNCHANGED).
- **Storage Path:** `chats/chat_123/voice/asset_1`.
- **Expected Decryption Result:** `getStoragePathFromUrl` resolves path `chats/chat_123/voice/asset_1`. `getBytes` fetches encrypted payload. `decryptBlobData` decrypts with original key and IV. Returns valid blob URL. Audio plays perfectly.
- **Expected Error Handling:** None.
- **Pass/Fail Criteria:** PASS if path migration retains 100% decryption compatibility. Category A.

---

### E2EE-13: Legacy Media Path Compatibility (`/media/{uid}/{assetId}`)

- **Functions Involved:** `useDecryptedMedia`, `getStoragePathFromUrl`, `getBytes`, `decryptBlobData`.
- **Synthetic Identities:** `user_alice` -> `user_bob`.
- **Synthetic Keys:** Valid original `sessionKey_AB`.
- **Test Media Format:** Unmigrated legacy voice note at `media/usr_a/legacy_v1.enc`.
- **Firestore Metadata:** `content: 'https://.../media/usr_a/legacy_v1.enc'`, `mediaIv: 'bGVnYWN5X2l2XzEyMw=='`.
- **Storage Path:** `media/usr_a/legacy_v1.enc`.
- **Expected Decryption Result:** Receiver hook correctly processes legacy `/media/` URL, retrieves bytes via Storage SDK, decrypts ciphertext, and renders media.
- **Expected Error Handling:** None.
- **Pass/Fail Criteria:** PASS if legacy media remains 100% readable without migration. Category A.

---

### E2EE-14: MIME and File-Format Consistency

- **Functions Involved:** `sniffDecryptedMimeType`, `sniffMimeType`, `decryptBlobData`.
- **Synthetic Identities:** Receiver `user_bob`.
- **Synthetic Keys:** Valid key.
- **Test Media Formats:** WebM, OGG, WAV, MP4, MP3, AAC, JPEG, PNG, PDF.
- **Firestore Metadata:** Various `fileType` strings (including wrong or missing MIME types).
- **Expected Decryption Result:** `sniffDecryptedMimeType` inspects magic header bytes of decrypted ArrayBuffer and overrides wrong server MIME types with exact binary type (e.g. `audio/webm`, `image/jpeg`, `application/pdf`).
- **Expected Error Handling:** None.
- **Pass/Fail Criteria:** PASS if magic byte sniffing accurately identifies all 9 formats regardless of server header. Category A.

---

### E2EE-15: Receiver Authentication & Authorization Failure

- **Functions Involved:** `useDecryptedMedia`, `getBytes`.
- **Synthetic Identities:** `user_eavesdropper` (Not a participant in `chat_123`).
- **Synthetic Keys:** N/A.
- **Test Media Format:** Chat media object in Storage.
- **Firestore Metadata:** Target message URL `.../chats/chat_123/voice/asset_01`.
- **Storage Path:** `chats/chat_123/voice/asset_01`.
- **Expected Decryption Result:** Storage SDK call `getBytes(ref)` is rejected at the Firebase Storage Security Rules layer (`storage/unauthorized`). No bytes downloaded. Zero bytes passed to crypto engine.
- **Expected Error Handling:** `isFirebaseStorageNonRetryableError` catches `storage/unauthorized`. Set status to `error` immediately without retry loop.
- **Pass/Fail Criteria:** PASS if Storage Security Rules block non-participant download before decryption step. Category A.

---

## 4. SUMMARY OF DESIGN B DISCIPLINE
This receiver compatibility design guarantees that any future implementation testing will execute **the actual production functions of Hala Chat** (`src/lib/crypto.ts`, `src/lib/media.ts`, `src/hooks/useDecryptedMedia.ts`), ensuring zero divergence between test results and real user experience.
