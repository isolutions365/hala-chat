# Hala experience delivery

## Implemented in this branch
- Navy / teal / mint foundation across existing app controls, Arabic greeting and Moments naming.
- Profile photo selection, compressed preview, explicit save/cancel, failure feedback, and parent profile update after Firestore success. Updates only avatar_url, preserving other account fields.
- Compressed JPEG upload with the bounded inline fallback from PR #4.
- My Style font family, text size and reading spacing from PR #5 (browser-local preferences).
- Hala Majlis private browser-local draft prototype: title, suggested date and notes. Explicitly labelled as a prototype; no shared voting, AI processing or background message access.

## Verification
- TypeScript and production build passed. Existing production bundle remains large (1.7 MB before gzip).
- Nine existing auth, image-compression and typography tests passed.
- Local browser: synthetic photo selection/preview/save updated the profile; Arabic Majlis draft persisted after reload.
- This is not an authenticated end-to-end Firebase upload test. Preview harness uses a local callback and is excluded from the PR.

## Next release gates and remaining scope
1. Deploy a preview and test authenticated photo upload plus Firestore persistence on a real account.
2. Review Firestore rules before public release; checked-in broad rules are not production-safe. Storage avatar rules were separately published in console; chat media paths remain denied.
3. Complete the approved reference-layout implementation, responsive/RTL/LTR verification and modal accessibility.
4. Verify existing Moments (stories/camera), channels, messages, calls and attachments rather than presenting their presence as verified reliability.
5. Build shared Majlis membership, suggestions, votes, confirmed plan and tasks with server-enforced authorization and tests.
6. Add Discover posts/creators/communities and short-video editing incrementally; these are not implemented by this branch.

## Infrastructure state
The empty Doha bucket was deleted with approval. Default bucket gen-lang-client-0446181078.firebasestorage.app was recreated in US-EAST1 on 1 October 2026. The project remains on Blaze. Free-region quotas do not guarantee a zero bill.

## Navigation follow-up — 2 October 2026
- Replaced the crowded top switcher with a navy four-item bottom navigation: Chats, Moments, Discover and Profile; Calls and QR remain in the header.
- Brought the greeting and off-white home surface closer to the selected reference. This is not a claim of complete 1:1 reference fidelity.
- Discover embeds the existing real channel browser, with a visible join-failure message and deferred chat opening after the subscription supplies a newly joined channel.
- Moments now presents available images in a two-column card grid, retaining the existing viewer and creation flows.
- TypeScript and production build passed; local browser checked Arabic home/Moments/Discover/Profile and English switching. No real channel join, story publication or authenticated Storage upload was performed. The preview uses a synthetic profile and is not a production session.

## Session reliability — 2 October 2026
- Restores signed-in users after reload through Firebase Auth, with server-confirmed profile lookup and retry on failure.
- Prevents late profile responses from restoring an old account after sign-out/account switch; missing profile and offline/error are distinct.
- Removes the static Firestore badge and startup connection probe. Saudi country code is the default.
- Defers chat, conversation and call screens until needed. Initial JavaScript is 1.38 MB (389 KB gzip); bundle warning remains.
- Fifteen automated tests pass, including six session-restoration regression tests. Authenticated browser E2E still requires app login.

