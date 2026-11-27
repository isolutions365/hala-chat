# HALA CHAT — PHASE 4.1.8: STAGE A
## E2EE TEST SECURITY & HARNESS PLAN

**Phase:** 4.1.8  
**Mode:** Stage A — Cryptographic Harness Design  
**Status:** PLAN COMPLETE — ZERO TOUCH OF PRODUCTION CRYPTO KEYS  

---

## 1. CATEGORY A PRODUCTION PIPELINE INVOCATION

The E2EE test harness exercises **100% real production code** (`src/lib/crypto.ts`, `src/lib/media.ts`, `src/hooks/useDecryptedMedia.ts`) using isolated synthetic credentials:

```
+-----------------------------------------------------------------------------------+
|                        CATEGORY A TEST HARNESS FLOW MAP                           |
+-----------------------------------------------------------------------------------+
 1. Synthetic Identity Generation:
    - Sender: `usr_alice_synth` | Receiver: `usr_bob_synth`
    
 2. In-Memory Keypair Generation:
    - Web Crypto P-256 Keypairs generated in-memory during setup.
    - Zero touch of production IndexedDB (`HalaCryptoDB`) or real user keys.

 3. Production Encryption Invocation:
    - `encryptBlobData(blob, sessionKey)` executes real SubtleCrypto AES-GCM 256-bit encryption.

 4. Production Storage Upload:
    - `uploadChatMedia()` uploads encrypted payload to staging bucket path `test_runs/<tr_id>/...`.

 5. Production Receiver Decryption Invocation:
    - Receiver hook retrieves ArrayBuffer via Storage SDK `getBytes()`.
    - `decryptBlobData()` executes real SubtleCrypto AES-GCM decryption and MIME sniffing.
+-----------------------------------------------------------------------------------+
```

---

## 2. CRYPTOGRAPHIC PROTECTION GUARANTEES

- **Zero Key Exposure:** Synthetic private keys remain non-extractable in Web Crypto memory and are purged automatically at test teardown.
- **Zero Production Key Touch:** The test runner never reads, writes, or modifies `users/{uid}.public_key` in the production database.
