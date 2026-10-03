# Hala tested release — 2 October 2026

## Delivered
- Shared Hala Majlis: explicitly share a draft with one existing chat, vote, creator confirms a decision and closes voting, assign tasks to members, owner/assignee completes tasks. Arabic/English labels; private draft retained separately; no AI processing.
- Existing profile appearance, fonts, size, spacing, four-tab navigation and session recovery retained.
- Private user records are owner-only; display directory omits phone/settings/block lists. Chat/message/call/Majlis access is scoped to participants. Sender identities, own votes/reactions, owner actions, field limits and default-deny rules added.
- Media has authenticated uploader paths, explicit supported types, 5 MB limit, progress and timeout errors. Removed unbounded inline chat-media fallback. Bounded profile-photo fallback remains.
- Incoming call query authorization fixed. Automatic external translation removed: it hid received text in a loading state and ran without an explicit per-message choice. Legacy reactions/poll votes remain readable.

## Verification
- 19 unit tests passed: OTP authenticity/failure, profile fallback, typography, session recovery/races/timeouts, media bounds and legacy interaction projection.
- 16 Firebase emulator scenarios passed, including unauthorized/private access, identity/moderation changes, group privilege escalation, sender spoofing, blocking, own reactions/receipts, channel subscription, caller/callee queries/signaling, story privacy, media ownership/size/overwrite, Majlis votes/confirmation/tasks and invalid poll votes.
- Actual browser app with two synthetic local Auth/Firestore/Storage sessions: phone login, profile setup, directory discovery, chat creation, encrypted text received and displayed, shared plan creation, cross-session vote, creator confirmation, assigned task completion.
- One initial emulator connection timeout recovered through Retry. No real SMS or messages to real users were used.
- Firebase server-side dry-run compiled named Firestore and Storage rules successfully.
- Production build and final preview deployment status are recorded below when complete.

## Infrastructure changes
- Backed up both previous rule releases locally before publishing.
- Migrated six existing display-only profiles, verified field whitelist; migrated one legacy story to schema v2 and removed its phone field. Private account documents preserved.
- No new paid cloud resources or billing changes. Existing Blaze usage and quotas still apply.

## Limits and remaining product scope
- These are prototype rules, not a comprehensive production security certification. Nested legacy maps/counters and abuse/rate controls need further hardening. Some denied emulator attacks reached the expression limit; covered legitimate paths passed.
- Download tokens are bearer links; possession grants access. Removing chat membership does not revoke already shared/downloaded files. End-to-end encryption device recovery, key verification and rotation are not complete.
- Physical camera/microphone permissions, real two-device calls, production SMS/Storage media and all social publishing flows are not newly verified in this pass.
- Full reels/editor, creator feed, advanced communities, moderation/admin tooling and push delivery are future implementation work. Their presence is not claimed as complete.
- Phone-number directory enumeration was removed; use display-name discovery or contact QR/user ID.
- Majlis loads the latest 20 plans. A complete archive/pagination interface remains future work.

I've set up prototype Security Rules to keep the data in Firestore safe. They are designed to be secure for owner-only private profiles, participant-scoped conversations, authenticated senders and per-user voting. However, you should review and verify them before broadly sharing your app. If you'd like, I can help you harden these rules.
