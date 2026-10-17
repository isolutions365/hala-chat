# Hala agreed feature backlog

## Delivered foundations
Original navy/teal/mint UI; Arabic/English; appearance/font settings; chat and group/channel foundations; atomic channel settings updates with visible save errors, and channel discovery retry/timeout states; SMS login; profile media; Community text/photo/short-video posts, likes, comments, private report submission, hide, local text drafts and loaded-post search; private account-synced creator following (30 creators), server-filtered Following feed and follow management; creator-specific posts/video browsing with public name/photo/bio and profile retry; exact Hala ID creator lookup, copy/manual-copy ID sharing, and bounded public-name prefix search (case-sensitive, up to 20 live results); optional video-frame covers; in-app subtitle timing/text editor, plain WebVTT import and native subtitle tracks (Arabic/English/Urdu); owner-only post/caption editing with conflict protection and an Edited indicator; private/shared Majlis decisions, voting and tasks.

## In progress
Short-video browsing: dedicated view, one player at a time, explicit previous/next and existing likes/comments/report controls. This is not a completed reels editor.

## Remaining major work
- Video editor: trimming, visual effects and device/codec validation. Imported subtitle playback still needs live device verification.
- Creator discovery: expanded public profiles, recommended discovery and case-insensitive/full-text name search and scaling beyond the initial 30-creator following limit.
- Advanced communities: membership workflows and expanded admin controls.
- Moderation/admin: authorized review queue and auditable decisions; reports currently save privately only.
- Push delivery: consent, token lifecycle, delivery backend and cost review.
- E2EE recovery: device verification, key recovery and rotation.
- Media lifecycle: abandoned upload cleanup and deletion policy.
- Abuse controls and production security review.

## Deferred by user
Browser-based playback and live upload verification while browser control is unavailable (deferred 2026-10-15).
Real two-phone calls and physical camera/microphone/network testing. Automated tests do not replace these checks.

## Constraints
No new paid resources without user agreement. No automatic private-message AI processing. Firebase/GCP uses admin@isolutionsico.com; GitHub uses isolutions365. Current releases target preview, not main/live Hosting.
