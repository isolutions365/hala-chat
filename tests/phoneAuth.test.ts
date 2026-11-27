import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ConfirmationResult, UserCredential } from 'firebase/auth';
import { confirmPhoneOtp, requireOtpSession } from '../src/lib/phoneAuth.ts';

test('missing Firebase session never accepts demo or arbitrary six-digit codes', async () => {
  for (const code of ['123456', '654321', 'abcdef']) {
    await assert.rejects(confirmPhoneOtp(null, code), /request a new verification code/);
  }
});

test('malformed codes are rejected without calling Firebase', async () => {
  let calls = 0;
  const session = { confirm: async () => { calls++; } } as unknown as ConfirmationResult;
  for (const code of ['', '12345', '1234567', 'abcdef', '12 456']) {
    await assert.rejects(confirmPhoneOtp(session, code), /six-digit/);
  }
  assert.equal(calls, 0);
});

test('six digits must still pass Firebase verification', async () => {
  const failure = new Error('auth/invalid-verification-code');
  const session = {
    verificationId: 'test-session',
    confirm: async () => { throw failure; },
  } as ConfirmationResult;
  await assert.rejects(confirmPhoneOtp(session, '123456'), error => error === failure);
});

test('verified identity comes from Firebase', async () => {
  const credential = { user: { uid: 'firebase-uid', phoneNumber: '+15555550123' } } as UserCredential;
  const session = {
    verificationId: 'test-session',
    confirm: async (code: string) => {
      assert.equal(code, '482901');
      return credential;
    },
  } as ConfirmationResult;
  assert.equal(await confirmPhoneOtp(session, '482901'), credential);
});

test('send and resend errors cannot produce a successful session', () => {
  for (const error of ['SMS quota reached', 'Network error', 'reCAPTCHA failed']) {
    assert.throws(() => requireOtpSession({ success: false, error }), { message: error });
  }
});

test('only a successful request supplies the next verification session', () => {
  const session = { verificationId: 'new-session' } as ConfirmationResult;
  assert.equal(requireOtpSession({ success: true, confirmationResult: session }), session);
  assert.throws(() => requireOtpSession({ success: true, confirmationResult: undefined! }), /start phone verification/);
});
