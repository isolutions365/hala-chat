# Implementation Plan - Fix Mobile Network Login Timeout & Network Errors

Resolve the 'Network request failed or connection timeout' error encountered when users attempt to log in using mobile network data or unstable connections at the phone OTP request step.

## Proposed Changes

### 1. Robust Mobile Network Retry & Timeout Handling (`src/lib/firebase.ts`)
- **Exponential Backoff & Auto-Retry**:
  - Update `requestPhoneOtp(fullPhoneNumber)` to automatically retry up to 3 times when encountering network errors (`auth/network-request-failed`, connection timeout, or reCAPTCHA handshake timeouts) common on mobile data (4G/5G/LTE).
  - Clean up and purge the previous reCAPTCHA instance and DOM before each retry (`recaptchaVerifier?.clear()`, `containerEl.innerHTML = ''`).
- **Network Request Timeout Wrapper**:
  - Add a timeout safeguard to prevent `signInWithPhoneNumber` from hanging indefinitely on slow mobile connections, triggering a clean fallback retry.
- **Improved Error Classification**:
  - Distinguish between offline status (`navigator.onLine === false`), mobile network handshake latency, carrier SMS rate-limiting, and standard errors with localized (Arabic & English) guidance.

### 2. UI Enhancements for Instant Network Recovery (`src/components/PhoneAuthScreen.tsx`)
- **Interactive Retry Button**:
  - In `PhoneAuthScreen.tsx`, when a network error or timeout occurs, display a prominent "إعادة المحاولة" / "Retry" action button within the error card so the user can re-trigger OTP without re-typing their phone number.
- **Offline / Connectivity Detection**:
  - Show a real-time status banner if the device is offline or experiencing connection drops.
- **Loading State Feedback**:
  - Update loading message during retries (e.g., "جاري تأكيد الاتصال وإرسال الرمز..." / "Connecting & sending code...") so users know their request is making progress on mobile data.

### 3. OTP Verification Resend Protection (`src/components/OtpVerificationScreen.tsx`)
- Ensure the resend button uses the same auto-retry logic with network error recovery so users on mobile networks can resend OTPs without getting stuck.

## Verification Plan
1. Compile applet (`compile_applet`) and run TypeScript linting (`lint_applet`).
2. Test phone OTP submission with simulated network delay/retries to ensure seamless recovery without throwing `auth/network-request-failed`.
3. Verify that both mobile networks and Wi-Fi environments can send OTP and receive confirmation smoothly.
