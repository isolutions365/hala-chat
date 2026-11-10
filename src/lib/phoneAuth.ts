import { PhoneAuthProvider, linkWithCredential, signInWithCredential, type ConfirmationResult } from 'firebase/auth';
import { getFirebaseAuth } from './firebase.ts';

export type OtpRequestResult =
  | { success: true; confirmationResult: ConfirmationResult }
  | { success: false; error: string };

// Both first-send and resend must receive a real Firebase SMS session.
export function requireOtpSession(result: OtpRequestResult): ConfirmationResult {
  if (!result.success) {
    throw new Error('error' in result ? result.error : 'Failed to send OTP');
  }
  if (!result.confirmationResult) throw new Error('Failed to start phone verification');
  return result.confirmationResult;
}

export async function confirmPhoneOtp(session: ConfirmationResult | null, code: string) {
  if (!session) throw new Error('Please request a new verification code.');
  if (!/^\d{6}$/.test(code)) throw new Error('Enter a valid six-digit verification code.');

  const authInstance = getFirebaseAuth();
  const currentUser = authInstance.currentUser;

  // If current session is anonymous, link phone credential to migrate anonymous account to phone
  if (currentUser && currentUser.isAnonymous) {
    try {
      const credential = PhoneAuthProvider.credential(session.verificationId, code);
      const userCred = await linkWithCredential(currentUser, credential);
      console.log('[Phone Auth Migration] Successfully linked anonymous session to phone:', userCred.user.uid);
      return userCred;
    } catch (linkErr: any) {
      console.warn('[Phone Auth Migration] linkWithCredential notice:', linkErr.code, linkErr.message);
      if (linkErr.code === 'auth/credential-already-in-use') {
        const credential = PhoneAuthProvider.credential(session.verificationId, code);
        const userCred = await signInWithCredential(authInstance, credential);
        console.log('[Phone Auth Migration] Signed in existing phone user account:', userCred.user.uid);
        return userCred;
      }
      return await session.confirm(code);
    }
  }

  return await session.confirm(code);
}
