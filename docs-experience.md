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

## Short-video Community update (2026-10-07, deployment pending)
Community accepts MP4/WebM attachments up to 5 MiB and 30 seconds, with local metadata validation, preview, existing upload progress/retry, and native inline playback without autoplay. Rules preserve old posts and constrain video owner path, declared duration, single attachment and immutable media.
Validation: TypeScript and production build passed; 26 unit tests and 23 emulator rules scenarios passed. Synthetic browser clip rendered controls, but the in-app browser crashed on playback; codec/device playback and a real upload remain unverified. No real user post was created.
Firebase deploy failed because admin credentials expired; this update has NOT reached the preview. Rules remain prototype protections: declared duration can be forged by a custom client; no server-side media inspection/transcoding or moderation service was added. Existing Storage size limits apply. No new paid resources provisioned.

### Short-video deployment completed (2026-10-07)
After reauthentication, named-database Firestore rules and github-preview Hosting deployed successfully. HTTP 200 and expected bundle index-ZAs8gVIx.js verified. Preview expires 2026-10-08 19:56:41 Asia/Riyadh. Earlier credential blocker resolved; playback/device and real-upload verification limits above remain. Production live Hosting unchanged.

### Video verification follow-up (2026-10-07)
GitHub deployment-notes sync recovered. Added metadata inspection regression coverage for decoder failure, excessive duration, cleanup, 12-second timeout and late callbacks; all 28 unit tests pass (23 rules scenarios previously passed; rules unchanged).
Local synthetic multi-frame WebM played to completion: currentTime=duration=1.110994, ended=true, autoplay=false. Missing-video request showed fallback and Retry remounted the player. Earlier crash did not recur in this check. Real-device codecs and actual Firebase video upload remain unverified. No production content written and no runtime changes in this follow-up.

### Call lifecycle fixes (2026-10-07)
Closing a call while getUserMedia permission is pending now permanently disposes that controller: late tracks are stopped, no peer/signaling subscription is created, and video fallback requests stop after closure. Denied/unavailable media reports failure instead of negotiating with no microphone. ActiveCallScreen ignores media results after unmount and only creates an offer with acquired media. Pending ICE queue clears on close.
Validation: 30 unit tests pass, including late-permission/hangup and denied microphone regressions; TypeScript passes. No real contacts called. Cross-device connection, restrictive networks (STUN-only; no TURN provisioned), camera-switch recovery and detailed permission messaging remain follow-up work.

### Camera replacement recovery (2026-10-07)
Camera switching now acquires/replaces before stopping the original track, retains the original on permission/replacement failure, serializes concurrent switches, preserves the latest enabled state, and stops replacement tracks if the call closes during acquisition/replacement. Regression tests cover failure, hangup, disabled camera and concurrent requests. All 32 unit tests pass. Physical two-device tests deferred at the user's request; no real contacts called and no TURN service added.

### Call error recovery messages (2026-10-07)
Preserve media error types and show Arabic/English recovery instructions in an announced call-screen alert for denied permissions, missing devices, busy devices and unsupported browsers. Unsupported capture/RTC is detected before requesting media. Failed setup closes any captured tracks and signaling resources. No raw error details appear in the user-facing alert. Unit suite: 33 passed; physical phone tests remain deferred. Full network failure/reconnection UI remains future work.

### Connection deadline and network-loss recovery (2026-10-07)
RTC connecting is bounded at 30 seconds; disconnected has a 15-second recovery grace period. Connected cancels the deadline, duplicate states do not extend it, and closed/unmounted sessions cancel timers. Persistent failure closes local media and shows bilingual recovery instructions. Ringing/new is deliberately not timed by this guard. Firestore call status is not automatically changed: users can end the call using the existing control. 36 unit tests pass including recovery, duplicate events and disposal. Physical network/call verification remains deferred.

### Community text drafts (2026-10-08)
Composer text persists on the current device per account, capped at 2,000 characters. Clear text draft removes stored text; successful publication clears it. Attachments are not persisted; the UI states that they must be reselected after reload. Blocked storage shows recovery advice. Account-keyed composer remount prevents draft/attachment state crossing accounts.
Validation: 38 unit tests and production build passed. Local synthetic browser fixture verified refresh restores text and successful local publish clears it after another reload. No real post published. No backend rules/resources changed.

### Outgoing call offer failure cleanup (2026-10-09)
Offer creation/local-description/signaling-send failure now closes captured media and reports the existing NetworkError recovery message instead of only logging. Async offer creation and local description check the captured peer after each await, preventing negotiation from resuming after hangup. 40 unit tests passed, including offer failure cleanup and late offer completion. No real contacts called. Incoming answer/candidate handling and physical network tests remain separate follow-up work.

### Incoming call setup lifecycle (2026-10-09)
Incoming offer/answer processing captures its peer and checks session liveness after awaited remote description, ICE application, answer creation and local description. Late completion after hangup cannot continue negotiation or send a new answer. Offer/answer processing failure closes local media and reports NetworkError instead of being silently logged. 42 unit tests pass including late-answer completion and incoming setup failure cleanup. Real two-device calling remains deferred; no real contacts called.

### Community loaded-post search (2026-10-09)
Added account-session search by author name and post text, with literal multi-term matching, case/whitespace normalization and Arabic vowel/tatweel normalization. Only already loaded nonhidden posts are searched; no extra database query occurs while typing. Clear search, result count and no-match state are bilingual. Load older posts remains explicit and extends the searchable loaded window, bounded at 200 posts.
Validation: 44 unit tests, TypeScript and production build passed. Local synthetic browser verified author matching (one Alice result) and no-match state. No real content published.

### Dedicated short-video browsing (2026-10-09)
Community now has All posts / Short videos modes. Video mode renders one loaded matching video post at a time, with previous/next controls, position counter, no autoplay and existing likes/comments/report/hide actions. Selected ID remains stable as data changes; removal falls back to an available video. Loaded-post scope and empty state are explicit. This delivers browsing only, not trimming/effects/creator-follow feeds.
Validation: TypeScript and build passed. Local browser verified switching to video view, next-video boundary, exactly one video element, hiding current video and Arabic labels. Fixture media URLs were synthetic; actual playback was verified in the earlier media pass. No production posts created. See docs-feature-backlog.md for remaining agreed scope.


## Creator following — October 2026
Community now includes Everyone / Following sources, creator follow/unfollow and an expandable management list. Following is private to the account and synced through an owner-only preferences document. Up to 30 creators are supported; Following queries social_posts by authorId on the server, then orders by creation time. Existing bounded live pagination, search, hidden posts and short-video view continue to work. Public names come only from users_public; private profiles are not queried for creator display. Transactions preserve concurrent changes from other devices.

Validation: 44 unit tests, TypeScript, production build and 26 Firestore/Storage emulator scenarios passed. Isolated browser fixture confirmed follow, filtered feed, management/unfollow, empty state and Arabic layout. No real contacts or public posts were modified for testing. Physical device call testing remains deferred.

Rules remain a prototype: owner-only access, exact schema, true-valued map, 30-entry limit, bounded IDs, one membership change per write, existing account and server timestamp requirements. Wider launch still requires a full production security review.
