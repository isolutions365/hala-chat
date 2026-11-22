# HALA CHAT — MEDIA AND STORAGE ARCHITECTURE V1.0

**Document Class:** Storage System & Media Pipeline Specification  
**Author:** Lead Media Systems Engineer & Database Architect  
**Scope:** Storage Security V5, Resumable Uploads, Magic Byte Sniffing, Reference Index & GC  
**Status:** COMPLETE & AUDITED  

---

## 1. STORAGE SECURITY V5 ISOLATION PATHWAY

All media assets in Hala Chat are strictly isolated into dedicated Firebase Storage path categories:

```
+-----------------------------------------------------------------------------------+
|                        STORAGE V5 PATH CATEGORIZATION                             |
+-----------------------------------------------------------------------------------+
 1. Chat Media (V5 Path):
    - Path: /chats/{chatId}/{mediaType}/{assetId}
    - mediaType Enum: 'voice' | 'images' | 'documents' | 'PDFs' | 'attachments'
    - Access: Enforces chat membership / subscriber checks against Firestore docs.

 2. User Avatars:
    - Path: /avatars/{uid}_{timestamp}.jpg
    - Access: Public read; write restricted to profile owner.

 3. Legacy User Media (V1-V4 Compatibility):
    - Path: /media/{uid}/{assetId}
    - Access: Authenticated read; write restricted to owner.

 4. Ephemeral Stories:
    - Path: /stories/{storyId}/{assetId}
    - Access: Enforces story privacy controls (Close Friends, Contacts, Public).

 5. Social Feed Media:
    - Path: /posts/{postId}/{assetId}
    - Access: Public authenticated read.
+-----------------------------------------------------------------------------------+
```

---

## 2. CLIENT-SIDE ENCRYPTION & COMPRESSION PIPELINE

Before any media payload leaves the client device, it passes through the 4-stage processing pipeline in `src/lib/media.ts`:

```
[ Raw File Input ]
       │
       ▼
[ Stage 1: Validation ] -> validateMediaUpload(file) checks file size & MIME
       │
       ▼
[ Stage 2: Compression ] -> Voice: compressAudio() | Image: compressImage()
       │
       ▼
[ Stage 3: Encryption ] -> encryptBlobData(blob, conversationKey)
       │                   Generates 12-byte IV -> SubtleCrypto.encrypt(AES-GCM)
       ▼
[ Stage 4: Resumable Upload ] -> storeMedia() issues uploadBytesResumable()
```

### 2.1 Magic-Byte Sniffing (9 Supported Formats)
Upon downloading encrypted or unencrypted media bytes, `sniffDecryptedMimeType()` in `src/lib/crypto.ts` inspects binary magic headers to prevent wrong server MIME headers from corrupting media rendering:

- **WebM Audio/Video:** `0x1A45DFA3` (`EBML`)
- **OGG Audio:** `0x4F676753` (`OggS`)
- **WAV Audio:** `0x52494646` (`RIFF`)
- **MP4 / M4A Video/Audio:** `0x66747970` (`ftyp` at byte offset 4)
- **MP3 Audio:** `0x494433` (`ID3`) or frame sync `0xFFE0`
- **AAC Audio:** Syncword `0xFFF0`
- **JPEG Image:** `0xFFD8FF00`
- **PNG Image:** `0x89504E47` (`\x89PNG`)
- **PDF Document:** `%PDF-1.` (`0x25504446`)

---

## 3. MEDIA REFERENCE INDEX & 6-STAGE GC PIPELINE

To support multi-chat media forwarding without leaving orphan objects or breaking shared asset links, Firestore maintains a central `media_references/{assetHash}` index:

```typescript
interface MediaReferenceIndexDoc {
  legacyStoragePath: string;
  sha256Hash: string;
  refCount: number;                   // Count of active Firestore messages referencing asset
  referencingMessageIds: string[];
  migratedCopies: { [chatId: string]: { v5StoragePath: string; copiedAt: string } };
  status: 'ACTIVE' | 'PENDING_PURGE' | 'PURGED';
  purgeEligibleAfter: string | null;  // ISO timestamp (Creation + 30 days)
}
```

### 6-Stage Garbage Collection Daemon
1. **Candidate Discovery:** Finds `media_references` where `refCount == 0` and `status == 'ACTIVE'`.
2. **Reference Verification:** Issues `collectionGroup('messages')` query to double-check zero active message pointers.
3. **30-Day Grace Period:** Verifies `purgeEligibleAfter < now` (30 days minimum retention).
4. **Atomic CAS Lock:** Transitions doc status to `PENDING_PURGE` via Firestore transaction.
5. **GCS Object Deletion:** Deletes object passing `ifGenerationMatch` precondition. Writes log to `gc_audit_log`.
6. **Tombstone Finalization:** Sets doc status to `PURGED`.
