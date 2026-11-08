# HALA CHAT — IMPLEMENTATION ROADMAP

**Status:** COMPLETED ROADMAP SPECIFICATION  
**Date:** 2026-11-07  
**Scope:** Phase-by-Phase Modular Refactoring & Deployment Plan

---

## 1. ROADMAP OVERVIEW

This roadmap divides the modular refactoring and migration of Hala Chat into small, independently verifiable phases. Each phase includes explicit scope boundaries, risk analysis, acceptance criteria, regression test requirements, and a rollback plan.

```
[Phase 0: Baseline & Audits] ──► [Phase 1: Channel Consistency] ──► [Phase 2: Voice Note Perf]
                                                                            │
[Phase 4: Modular Refactoring] ◄── [Phase 3.1: Storage V5 Runtime] ◄────────┘
```

---

## 2. PHASE SPECIFICATION MATRIX

### Completed Baseline Phases (`VERIFIED`)
- **Phase 0 (Baseline Inspection)**: Captured SHA-256 file hashes and inventory (`PHASE_0_BASELINE.md`).
- **Phase 0.1 (Channel Schema Audit)**: Audited `is_public` vs `isPublic` and subscriber subcollections (`PHASE_0_1_SCHEMA_AUTHORIZATION_REVIEW.md`).
- **Phase 1 (Channel Transaction Consistency)**: Synchronized channel subscriber counts transactionally (`PHASE_1_2_IMPLEMENTATION_REPORT.md`).
- **Phase 2 (Voice Note Performance Optimization)**: Bypassed re-compression for Opus/WebM audio blobs, resolving WAV conversion delay (`PHASE_1_2_IMPLEMENTATION_REPORT.md`).
- **Phase 3 & 3.1 (Storage Security V5 & Emulator Runtime)**: Implemented V5 chat-scoped paths and passed 16/16 live Firebase Storage Emulator runtime tests (`PHASE_3_1_FIREBASE_EMULATOR_SECURITY_REPORT.md`).

---

### Future Implementation Phases (`PROPOSED`)

#### Phase 4.2 — Synthetic Emulator Migration Validation
- **Scope**: Execute 24-case synthetic Firebase Emulator test suite (`E-01` through `E-24`) validating multi-chat forwarded asset copying, compare-and-set pointer updates, and receiver-side AES-GCM decryption.
- **Dependencies**: Completed Phase 4.1.2 specification (`PHASE_4_1_2_CORRECTED_MIGRATION_SPECIFICATION.md`).
- **Risks**: Test harness timeout or emulator setup failures.
- **Acceptance Criteria**: 24/24 synthetic Emulator tests pass with 100% success.
- **Rollback Plan**: Reset local emulator state (`clearFirestore()`, `clearStorage()`).

#### Phase 5 — Core UI & Component Modularization
- **Scope**: Extract monolithic `ConversationScreen.tsx` into modular engines (`src/modules/text-chat`, `src/modules/voice-notes`, `src/modules/images`).
- **Dependencies**: Phase 4.2 completion.
- **Risks**: UI state desync during component extraction.
- **Acceptance Criteria**: `compile_applet` and `lint_applet` pass with 0 errors; zero regression across all 42 unit tests.
- **Rollback Plan**: Revert component directory edits.

#### Phase 6 — Production Migration Execution
- **Scope**: Run production background migration of legacy `/media/{uid}/{assetId}` chat assets using Firebase Admin SDK.
- **Dependencies**: Explicit user authorization + Phase 4.2 and 5 completion.
- **Risks**: Network interruptions during large object transfers.
- **Acceptance Criteria**: 100% GCS object copy SHA-256 match; 100% Firestore message pointer updates verified.
- **Rollback Plan**: Execute compare-and-set pointer restoration using pre-migration JSON inventory snapshot.

#### Phase 7 — PWA & Android Packaging
- **Scope**: Configure service worker offline caching (`vite-plugin-pwa`), Web App Manifest, and Capacitor Android wrapper for APK generation.
- **Dependencies**: Phase 6 completion.
- **Risks**: Service worker caching stale assets.
- **Acceptance Criteria**: PWA passes Lighthouse audit; APK builds successfully.
- **Rollback Plan**: Disable PWA service worker registration in `main.tsx`.

---

## 3. DECISION MATRIX & AUTHORIZATION STATUS

```
┌────────────────────────────────────────────────────────┬─────────────┐
│ Category                                               │ Decision    │
├────────────────────────────────────────────────────────┼─────────────┤
│ 1. Resilient Modular Architecture Blueprint V1         │ PASS        │
│ 2. Implementation Roadmap Specification                │ PASS        │
│ 3. Phase 4.2 Synthetic Emulator Testing                │ NO-GO       │
│ 4. Phase 5 UI Modular Refactoring                      │ NO-GO       │
│ 5. Phase 6 Production Migration Execution              │ NO-GO       │
└────────────────────────────────────────────────────────┴─────────────┘
```

**AUTHORIZATION BOUNDARY:** All future implementation phases remain **NO-GO** until explicit user authorization is provided for each specific phase.
