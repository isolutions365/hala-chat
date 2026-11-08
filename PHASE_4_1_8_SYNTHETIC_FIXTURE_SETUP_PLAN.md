# HALA CHAT — PHASE 4.1.8: STAGE A
## SYNTHETIC TEST FIXTURE SETUP PLAN

**Phase:** 4.1.8  
**Mode:** Stage A — Test Fixture Design  
**Status:** PLAN COMPLETE — FIXTURES READY FOR PROCEDURAL SYNTHESIS  

---

## 1. SYNTHETIC FIXTURE CATEGORIZATION MATRIX

To verify media handling across all execution layers (decryption, sniffing, DOM rendering, and security rejection), fixtures are organized into 4 distinct container tiers:

| Fixture ID | Category / Target Format | Fixture Specification & Header Bytes | Intended Test Usage | Generation Strategy |
| :--- | :--- | :--- | :--- | :--- |
| **FIX-01** | Valid Playable Audio (WAV) | 1-second 44.1kHz mono PCM WAV container (`RIFF....WAVEfmt `) | DOM `<audio>` element playback assertion | Procedural node script via `node:fs` |
| **FIX-02** | Valid Playable Audio (WebM) | 1-second Opus WebM audio container (`0x1A45DFA3` EBML) | DOM `<audio>` element playback assertion | Synthesized via WebCodecs/FFmpeg synth |
| **FIX-03** | Valid Renderable Image (JPEG) | 10x10 pixel solid green JPEG image (`0xFFD8FF00`) | DOM `<img>` element rendering assertion | Procedural Canvas / Buffer synth |
| **FIX-04** | Valid Renderable Image (PNG) | 10x10 pixel transparent PNG image (`0x89504E47`) | DOM `<img>` element rendering assertion | Procedural Canvas / Buffer synth |
| **FIX-05** | Valid Parseable PDF Document | 1-page minimal PDF document (`%PDF-1.4...%%EOF`) | PDF previewer parsing assertion | Minimal PDF string generator |
| **FIX-06** | Minimal Format Signature | 16-byte buffer starting with exact magic bytes | Fast MIME sniffing validation (`sniffDecryptedMimeType`) | In-line Uint8Array in test suite |
| **FIX-07** | Invalid / Corrupted Payload | Random 1KB garbage buffer | Negative error handling validation (`OperationError`) | `crypto.getRandomValues()` |

---

## 2. PROCEDURAL GENERATION CODE (ZERO USER MEDIA)

All fixtures are generated procedurally on-the-fly during test setup using native Node.js APIs (`node:crypto`, `node:buffer`). Zero user files, production attachments, or copyrighted media are stored or used.
