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

## Infrastructure state
The empty Doha bucket was deleted with approval. Default bucket gen-lang-client-0446181078.firebasestorage.app was recreated in US-EAST1 on 1 October 2026. The project remains on Blaze. Free-region quotas do not guarantee a zero bill.

## Navigation follow-up
- Replaced the crowded top switcher with a navy four-item bottom navigation: Chats, Moments, Discover and Profile; Calls and QR remain in the header.
- Brought the greeting and off-white home surface closer to the selected reference.
- Discover embeds the existing real channel browser, with a visible join-failure message and deferred chat opening after the subscription supplies a newly joined channel.
- Moments now presents available images in a two-column card grid, retaining the existing viewer and creation flows.

## Limits and remaining product scope
- These are prototype rules, not a comprehensive production security certification. Nested legacy maps/counters and abuse/rate controls need further hardening. Some denied emulator attacks reached the expression limit; covered legitimate paths passed.
- Download tokens are bearer links; possession grants access. Removing chat membership does not revoke already shared/downloaded files. End-to-end encryption device recovery, key verification and rotation are not complete.
- Physical camera/microphone permissions, real two-device calls, production SMS/Storage media and all social publishing flows are not newly verified in this pass.
- Full reels/editor, creator feed, advanced communities, moderation/admin tooling and push delivery are future implementation work. Their presence is not claimed as complete.
- Phone-number directory enumeration was removed; use display-name discovery or contact QR/user ID.
- Majlis initially displays 20 plans; Load older plans expands the live query by 20 with one look-ahead record. This keeps loaded plans current but re-reads the expanded window; it is not cursor-based historical paging.

I've set up prototype Security Rules to keep the data in Firestore safe. They are designed to be secure for owner-only private profiles, participant-scoped conversations, authenticated senders and per-user voting. However, you should review and verify them before broadly sharing your app. If you'd like, I can help you harden these rules.

## Publication status — 4 October 2026
- Firestore and Storage rule releases completed successfully for the configured Hala named database and existing bucket. Compilation passed during deployment.
- Hosting preview successfully published from tested implementation e3c1b44: https://gen-lang-client-0446181078--github-preview-yggqk6fs.web.app/
- Preview expires 5 October 2026 at 21:22:18 (CLI-reported local time). This is a preview release, not a merge to main or a production Hosting release.
- Browser opened the deployed welcome screen and verified the expected /assets/index-CLCC7mFP.js production module. No browser console errors were captured on this screen. Production SMS, signed-in flows and real media/call tests were not performed in this deployment pass.
- Six display-profile projections and one legacy story were migrated on 2 October, with previous rules backed up locally.
- Integrated main branch 50316a7 while retaining tested session recovery, shared planning, encrypted message handling, bounded media and private rules. Preserved bio editor, sticker search, voice playback/recording and compression improvements. Bio changes sync the display directory; pins remain per-user.
- Post-merge verification: all 19 unit tests, TypeScript and production build passed. The unchanged rules passed 16 emulator scenarios. Two-account browser E2E evidence predates the merge. Initial JS remains large (1.384 MB / 390 KB gzip).
- Local Firebase OAuth refreshed the authorized admin account after the remote-login endpoint failed. No account security settings or permissions were expanded.

## Follow-up reliability release — 4 October 2026
- Added Load older plans, explicit subscription retry, loading/empty feedback and stale subscription guards to shared Majlis. Existing items remain visible during loading/failure. Vote/confirm/task actions wait for detail loading and are disabled after subscription errors.
- Phone entry now uses the app-selected country: Saudi +966 initially and the prior selection when returning from OTP. Text selection follows the approved teal palette.
- All 22 unit tests, TypeScript and production build passed. Three new tests cover expansion, failure/retry, and stale/disposed callbacks.
- Local browser fixture verified first-load failure, Retry recovery, loading/opening plan 25, end-of-list button removal and Arabic layout with selection retained. This fixture isolates UI behavior; it is not a production Firebase integration test.
- Existing preview channel republished successfully; expires 5 October 2026 at 21:37:00 (CLI local time). Production entry module is /assets/index-m_3LiacF.js. No rules, billing or cloud resources changed.
- Real signed-in media and device call checks still require an authenticated app session and physical devices. Creator feed, reels/editor, push delivery and advanced moderation remain separate unfinished feature work.

## Community feed implementation — 5 October 2026 (publication pending)
- Discover now contains Community and Channels. Community supports text (2,000 characters), optional image (5 MB), live likes/unlikes and owner deletion with a confirmation. Composer explicitly states the signed-in audience. Arabic/English labels and RTL layout included.
- social_posts uses the existing named database; standard real-time snapshots are necessary for likes/deletion to update immediately. Queries load the latest 40 posts. Rules require exact schema, authenticated ownership, own profile name, server creation timestamp, empty initial likes, own like mutations, and uploader-scoped bucket URLs.
- Prototype limits: 500 likes per post; latest 40 posts only; no comments, moderation queue or feed pagination yet. Uploaded media remains a bearer URL; deleting a post removes its Firestore record, not already downloaded/shared images or the Storage object. Orphan upload cleanup remains future work.
- 22 unit tests, TypeScript and production build passed; 18 emulator scenarios passed including feed query, author/name spoofing, oversized/empty payloads, foreign image path, own-like integrity and owner deletion. Local synthetic browser fixture verified publish, like, delete cancellation and Arabic layout; production photo delivery is not yet verified.
- Publication pending Firebase admin reauthentication. User reports OTP entry screen opens but SMS does not arrive. Code only opens OTP after Firebase returns a verification session; this does not establish SMS delivery. Read-only Auth-config request failed because admin CLI credentials expired; browser automation failed to load its request-header policy. No SMS settings, quotas or billing changed.

I've set up prototype Security Rules to keep the data in Firestore safe. They are designed to be secure for authenticated community readers, owner-created posts and each user's own likes. However, you should review and verify them before broadly sharing your app. If you'd like, I can help you harden these rules.

## Publication and SMS diagnosis — 5 October 2026
- Admin OAuth refreshed successfully. New social_posts rules compiled and were released to the configured named database. Community feed preview published successfully at the existing yggqk6fs URL; expires 6 October at 20:46:44 CLI local time. This supersedes the pending-publication note above. Production entry module index-CT283g4W.js.
- Read-only Authentication config: phone provider enabled, zero test numbers, Saudi/Gulf allowlist active, preview domain authorized. No custom quota value returned. No SMS configuration or billing changes were made.
- Last-48-hour project metrics showed one Saudi SIGN_IN SMS sent at 2026-10-04 20:04:13 UTC (23:04:13 Saudi). No blocked or verified series returned. These aggregate metrics do not prove handset delivery or tie a specific number to the send. User was asked to make one fresh request and provide carrier/time. No phone number or OTP stored in this report.
- SMS delivery remains unresolved pending fresh-request correlation/carrier information. Browser automation unavailable during this diagnostic pass; deployment verified by CLI, live HTTP verification recorded separately when completed.
- Live preview HTTP returned 200 and referenced expected index-CT283g4W.js after publication.

## Signed-in verification and comments — 5 October 2026
- User confirmed real SMS receipt and successful login. Production browser session verified: conversation opens, main navigation returns, Community query resolves to empty state, Channels resolves to empty state, Moments opens, profile/settings opens and profile image loads (400 x 265). No captured console errors in the checked paths. No posts/messages/calls were sent to real users during these checks.
- Added Community comments: authenticated audience, 1,000-character nonblank multiline text, server timestamp, author identity/name validation, delete confirmation. Author can delete own comment; post owner can moderate comments on their post. Unrelated readers cannot delete; deleted parent hides comments and rejects new replies. Comment author can still delete their orphaned comment.
- Feed now starts at 20 and expands by 20 via explicit Load older posts, up to 200 preview posts, with one look-ahead record. Existing tested live-list controller preserves loaded content on failures, supports retry and ignores stale callbacks. Expanded windows are re-read; this is bounded live-window expansion, not cursor archive paging. Comments show latest 50 only and attach a listener only while opened.
- Validation: 22 unit tests, 20 Firebase emulator scenarios, TypeScript and production build passed. New rules cover spoofed names/identity, whitespace/oversized text, multiline success, timestamp, query bounds, unrelated deletion, parent-owner moderation, own deletion and deleted-parent denial.
- Local component fixture: loaded post 25, verified final Load older removal, submitted multiline comment, cancelled deletion, checked Arabic labels and console. Real-device audio/video calls and production comment/photo writes remain unverified.
- Existing prototype rule disclaimer applies. Rate/abuse controls, full archive paging, media and orphan comment cleanup, reels/editor, push delivery and broader moderation remain unfinished.

- Comment rules compiled and deployed successfully; comments/feed preview published 5 October, initial release expires 6 October 21:01:39 CLI local time. Browser verified production module index-DPC9RNBa.js and restored authenticated session. Community query loaded in Arabic.
- Reload testing exposed interface language resetting to Arabic. Added validated device-local Arabic/English preference with safe fallback when browser storage is unavailable. This is a small preference fix; no account data or authentication behavior changed.

## Report and hide controls — 6 October 2026
- Added private post reports with reason/details, one immutable report per reporter/post, original text evidence and server creation time. Reports are readable only by their reporter through the client; author and other users are denied. Client status updates/deletion and forged evidence are denied. Reports do not automatically remove content. Admin review/triage UI and response workflow are not implemented yet; reports are stored in Firebase.
- Added hide on this device, account-scoped persisted IDs (up to 200) and restore-all control. Hidden posts remain in Firebase and accessible elsewhere; hiding is a personal display preference, not a privacy/access restriction. Unavailable storage gives session-only feedback.
- TypeScript, production build, all 24 unit tests and 22 Firebase rules emulator scenarios pass. New tests cover account isolation, malformed/storage errors, limits, report privacy/spoofing/status immutability and preserved evidence after parent deletion.
- Local browser fixture verifies report failure then retry, hide persisting after reload, restoration and Arabic report labels. No real report or public test post was submitted. Production publication status follows when confirmed.

- Publication confirmed: refreshed authorized admin login, Firestore rules compiled/released, report/hide preview deployed at existing yggqk6fs URL. Expires 7 October 2026 at 19:01:21 CLI local time. Production module index-CwmEIckX.js. Main and production Hosting remain unchanged.

## Community photo viewing — 6 October 2026
- Added full-screen photo dialog using native modal keyboard containment, labelled close button, Escape dismissal, scroll lock and focus restoration. Broken images offer Retry, retaining retry focus if loading fails again. Arabic labels and direction included.
- Browser fixture checks passed: open, Escape close/focus return, failed-image retry with restored focus, Arabic labels and 390 × 844 mobile layout. Fixture used generated geometric image data, not private media. Viewport restored after testing.
- TypeScript and production build passed. Backend rules and data models unchanged; previous 24 unit/22 rules scenarios remain applicable and were not rerun for this UI-only change. No new paid resource or account setting changed.
