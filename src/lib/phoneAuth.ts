import type { ConfirmationResult } from 'firebase/auth';

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
  return session.confirm(code);
}
