# Phone authentication patch

Failed SMS requests must stay on the phone entry screen with an error. They must never open a simulated verification flow. Verification uses Firebase's confirmation result; there is no locally accepted demo code or generated user ID.

## Automated checks

Use Node.js 22.18+ or 24 for the native TypeScript test runner:

```sh
npm run test:auth
npm run lint
npm run build
```

The auth tests use fake confirmation sessions and do not send SMS or connect to production Firebase. They cover missing sessions, malformed codes, Firebase rejection, verified identity, and failed send/resend responses.

## Manual integration checks before merge

Use a dedicated Firebase test project and its configured test phone numbers. Do not depend on the removed `123456` bypass. A configured Firebase test number can still use its configured code through Firebase's normal confirmation flow.

1. Send a code successfully, enter an incorrect code, then the configured correct code. Only the verified identity may continue.
2. Simulate an SMS/network/quota failure. The phone screen must display the error and remain on screen.
3. Wait for resend to become available. A failed resend must show an error without resetting the cooldown; a successful resend must replace the verification session and restart the cooldown.
4. Edit the phone number and request a new code. The previous confirmation session must be discarded.
5. Navigate from phone entry to OTP, then resend. The persistent reCAPTCHA container must remain mounted; each request creates a fresh verifier.

## Remaining release blockers

The checked-in `firestore.rules` contains unconditional `allow read, write: if true` rules for chats, messages, groups, calls and other data. This frontend patch does not protect those resources from direct requests. Actual deployed rules were not inspected or changed. Authorization rules and their emulator tests need a separate, full data-model review before production release.

Other follow-up work: session restoration after refresh, distinguishing missing profiles from failed profile reads, multi-device messaging, media permissions, notification delivery, and real-device call testing. Existing screen components do not establish that these flows work end to end.

No Firebase rules, SMS settings, deployment, or live user data are changed by this patch.
