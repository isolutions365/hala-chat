/**
 * Native Android Firebase Phone Auth client bridge.
 *
 * When running inside the standalone Android APK (with google-services.json + SHA-256
 * configured in Firebase Console and the /api/auth/exchange-native-token Cloud Function
 * deployed), this uses native Android Firebase PhoneAuthProvider (Play Integrity silent
 * background verification) instead of WebView reCAPTCHA puzzles, then exchanges the
 * verified native Firebase ID token for a Firebase Custom Token to sign the WebView JS SDK
 * into the exact same Firebase UID.
 */

import { signInWithCustomToken, type Auth, type ConfirmationResult, type UserCredential } from 'firebase/auth';
import { resolveApiUrl } from './appConfig.ts';

interface NativePhoneAuthBridge {
  isAvailable?: () => boolean;
  sendOtp: (phoneNumber: string, requestId: string) => void;
  verifyCode: (verificationId: string, smsCode: string, requestId: string) => void;
  signOutNative?: () => void;
}

interface NativePhoneAuthEvent {
  requestId: string;
  event: 'codeSent' | 'autoVerified' | 'verified' | 'error';
  code?: string;
  message?: string;
  verificationId?: string;
  idToken?: string;
}

declare global {
  interface Window {
    HalaAndroidPhoneAuth?: NativePhoneAuthBridge;
    __halaNativePhoneAuthCallback?: (payload: NativePhoneAuthEvent) => void;
  }
}

type PendingHandler = (event: NativePhoneAuthEvent) => void;
const pendingHandlers = new Map<string, PendingHandler>();
let callbackWired = false;
let bridgeEndpointReady: boolean | null = null;

function ensureGlobalCallback(): void {
  if (callbackWired || typeof window === 'undefined') return;
  callbackWired = true;
  window.__halaNativePhoneAuthCallback = (payload: NativePhoneAuthEvent) => {
    if (!payload || !payload.requestId) return;
    const handler = pendingHandlers.get(payload.requestId);
    if (handler) {
      handler(payload);
    }
  };
}

export function getNativeAndroidPhoneAuthBridge(): NativePhoneAuthBridge | null {
  if (typeof window === 'undefined') return null;
  const bridge = window.HalaAndroidPhoneAuth;
  if (!bridge || typeof bridge.sendOtp !== 'function' || typeof bridge.verifyCode !== 'function') {
    return null;
  }
  try {
    if (typeof bridge.isAvailable === 'function' && !bridge.isAvailable()) {
      return null;
    }
  } catch {
    return null;
  }
  return bridge;
}

export function signOutNativeAndroidAuth(): void {
  try {
    const bridge = getNativeAndroidPhoneAuthBridge();
    bridge?.signOutNative?.();
  } catch {}
}

async function isExchangeEndpointLive(): Promise<boolean> {
  if (bridgeEndpointReady === true) return true;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(resolveApiUrl('/api/auth/native-bridge-status'), {
      method: 'GET',
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (res.ok) {
      bridgeEndpointReady = true;
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

async function exchangeNativeIdTokenForWebSession(
  authInstance: Auth,
  nativeIdToken: string
): Promise<UserCredential> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(resolveApiUrl('/api/auth/exchange-native-token'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${nativeIdToken}`,
      },
      body: JSON.stringify({}),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      const err = new Error(errBody?.error || `Native token exchange failed (${res.status})`);
      (err as any).code = 'auth/internal-error';
      throw err;
    }

    const data = await res.json();
    if (!data?.customToken || typeof data.customToken !== 'string') {
      const err = new Error('Missing customToken from native token exchange');
      (err as any).code = 'auth/internal-error';
      throw err;
    }

    return await signInWithCustomToken(authInstance, data.customToken);
  } finally {
    clearTimeout(timer);
  }
}

export type NativeOtpAttemptResult =
  | { status: 'sent'; confirmationResult: ConfirmationResult }
  | { status: 'fallback'; reason: string }
  | { status: 'error'; code: string; message: string };

const FALLBACK_TO_WEB_CODES = new Set([
  'auth/not-configured',
  'auth/app-not-authorized',
  'auth/missing-client-identifier',
  'auth/captcha-check-failed',
]);

/**
 * Attempts to start phone verification using the native Android Firebase Auth SDK.
 * Returns `status: 'fallback'` whenever native auth or its backend token-exchange bridge
 * is unavailable or not yet configured with release SHA-256 in Firebase Console.
 */
export async function tryNativeAndroidPhoneOtp(
  authInstance: Auth,
  fullPhoneNumber: string
): Promise<NativeOtpAttemptResult> {
  const bridge = getNativeAndroidPhoneAuthBridge();
  if (!bridge) {
    return { status: 'fallback', reason: 'native-bridge-unavailable' };
  }

  const endpointReady = await isExchangeEndpointLive();
  if (!endpointReady) {
    return { status: 'fallback', reason: 'exchange-endpoint-not-deployed' };
  }

  ensureGlobalCallback();
  const requestId = `send_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  return await new Promise<NativeOtpAttemptResult>((resolve) => {
    let settled = false;
    let autoVerifiedToken: string | null = null;
    let capturedVerificationId = '';

    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        pendingHandlers.delete(requestId);
        resolve({ status: 'fallback', reason: 'native-send-timeout' });
      }
    }, 20000);

    const buildConfirmationResult = (verificationId: string): ConfirmationResult => ({
      verificationId: verificationId || `native-${requestId}`,
      confirm: async (verificationCode: string): Promise<UserCredential> => {
        if (autoVerifiedToken) {
          return await exchangeNativeIdTokenForWebSession(authInstance, autoVerifiedToken);
        }

        const verifyReqId = `verify_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const nativeIdToken = await new Promise<string>((resolveVerify, rejectVerify) => {
          const verifyTimer = setTimeout(() => {
            pendingHandlers.delete(verifyReqId);
            const err = new Error('Verification timed out');
            (err as any).code = 'auth/network-request-failed';
            rejectVerify(err);
          }, 20000);

          pendingHandlers.set(verifyReqId, (ev) => {
            clearTimeout(verifyTimer);
            pendingHandlers.delete(verifyReqId);
            if (ev.event === 'verified' && ev.idToken) {
              resolveVerify(ev.idToken);
            } else {
              const err = new Error(ev.message || 'Invalid verification code');
              (err as any).code = ev.code || 'auth/invalid-verification-code';
              rejectVerify(err);
            }
          });

          bridge.verifyCode(verificationId, verificationCode, verifyReqId);
        });

        return await exchangeNativeIdTokenForWebSession(authInstance, nativeIdToken);
      },
    });

    pendingHandlers.set(requestId, (ev) => {
      if (ev.event === 'autoVerified' && ev.idToken) {
        autoVerifiedToken = ev.idToken;
        if (!settled) {
          settled = true;
          clearTimeout(timeout);
          resolve({
            status: 'sent',
            confirmationResult: buildConfirmationResult(capturedVerificationId),
          });
        }
        return;
      }

      if (ev.event === 'codeSent' && ev.verificationId) {
        capturedVerificationId = ev.verificationId;
        if (!settled) {
          settled = true;
          clearTimeout(timeout);
          // Keep listener briefly in case Android auto-verifies SMS right after codeSent
          setTimeout(() => pendingHandlers.delete(requestId), 60000);
          resolve({
            status: 'sent',
            confirmationResult: buildConfirmationResult(ev.verificationId),
          });
        }
        return;
      }

      if (ev.event === 'error') {
        if (!settled) {
          settled = true;
          clearTimeout(timeout);
          pendingHandlers.delete(requestId);
          const code = ev.code || 'auth/internal-error';
          if (FALLBACK_TO_WEB_CODES.has(code)) {
            resolve({ status: 'fallback', reason: code });
          } else {
            resolve({
              status: 'error',
              code,
              message: ev.message || 'Native phone authentication failed',
            });
          }
        }
      }
    });

    try {
      bridge.sendOtp(fullPhoneNumber, requestId);
    } catch {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        pendingHandlers.delete(requestId);
        resolve({ status: 'fallback', reason: 'native-bridge-invoke-failed' });
      }
    }
  });
}
