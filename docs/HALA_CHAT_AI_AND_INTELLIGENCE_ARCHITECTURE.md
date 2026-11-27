# HALA CHAT — AI AND INTELLIGENCE ARCHITECTURE V1.0

**Document Class:** Artificial Intelligence & Privacy-Preserving Architecture Specification  
**Author:** AI Product Architect & Cybersecurity Architect  
**Scope:** On-Device AI Processing, Server-Side Gateway, Privacy Boundaries, and Translation Services  
**Status:** COMPLETE & PRIVACY-COMPLIANT  

---

## 1. DUAL-TIER AI PROCESSING ENGINE

Hala Chat implements a **Dual-Tier AI Architecture** designed to balance high intelligence capabilities with absolute user privacy:

```
+-----------------------------------------------------------------------------------+
|                        DUAL-TIER AI ARCHITECTURE MAP                              |
+-----------------------------------------------------------------------------------+
 TIER 1: On-Device / Client-Side AI (Zero Server Exposure)
   - Engine: WebAssembly (Wasm) + WebGPU (Whisper.cpp Wasm & Lightweight SLM)
   - Scope: E2EE Voice Note Transcription, Local Search Indexing, Smart Replies
   - Privacy: 100% On-Device. Zero decrypted text bytes leave the client.

 TIER 2: Opt-In Server-Side AI Gateway (Server Proxy)
   - Engine: Server-Side Gemini API Proxy Gateway (`/api/ai-proxy`)
   - Scope: Arabic-English Translation, Unread Thread Summaries, Public Post Safety
   - Privacy Boundary: Operates ONLY when user explicitly triggers action (e.g. "Translate")
     or on public unencrypted social feed content.
+-----------------------------------------------------------------------------------+
```

---

## 2. PRIVACY BOUNDARY & OPT-IN CONSENT MODEL

1. **Zero Unconsented Message Scanning:** Private E2EE messages, voice notes, and media attachments are **NEVER continuously scanned, ingested, or processed by server-side AI models**.
2. **Explicit Action Triggers:** When a user taps "Translate Message" or "Summarize Chat Thread":
   - The client application decrypts the target message payload using local SubtleCrypto keys.
   - The client prompts a 1-time privacy notice explaining that the decrypted text segment will be processed by the AI translation service.
   - Upon confirmation, the decrypted string is sent over TLS Bearer header to the server proxy (`/api/ai-proxy`), translated, and returned directly to the client without storing the string in server logs.
3. **Public Content Safety Scanning:** Public social feed posts, public channel broadcasts, and public community server comments are scanned asynchronously for toxic speech, hate speech, and spam using automated safety classifiers.

---

## 3. CORE AI CAPABILITY MODULES

### 3.1 Arabic <-> English Translation Module
- **Engine:** Gemini API Proxy with custom system prompt enforcing dialect preservation (Egyptian, Gulf, Levantine, Maghrebi) and MSA (Modern Standard Arabic).
- **Latency:** < 350ms response time per text paragraph.

### 3.2 Voice Note Transcription Module
- **On-Device Engine:** `whisper.cpp` compiled to WebAssembly (Quantized `tiny.en` / `tiny.ar` models, ~35MB download cached in IndexedDB).
- **Server-Side Fallback:** Firebase Cloud Function `transcribeVoice()` invoking server-side transcription for low-end mobile devices lacking WebGPU support.

### 3.3 Thread & Meeting Summaries
- Summarizes long unread group chat threads (100+ unread messages) into 3 bullet points highlighting action items, decisions, and mentions.
