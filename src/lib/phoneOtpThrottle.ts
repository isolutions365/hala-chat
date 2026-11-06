const STORAGE_KEY = 'hala.phoneOtp.cooldownUntil';

/** Returns the remaining client-side cooldown in seconds, or zero when clear/expired. */
export function getPhoneOtpCooldownSeconds(): number {
  try {
    const until = Number(localStorage.getItem(STORAGE_KEY));
    if (!Number.isFinite(until) || until <= Date.now()) {
      localStorage.removeItem(STORAGE_KEY);
      return 0;
    }
    return Math.ceil((until - Date.now()) / 1000);
  } catch {
    return 0;
  }
}

/** Persists a short local guard against repeated OTP requests after Firebase throttling. */
export function setPhoneOtpCooldown(durationMs: number): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(Date.now() + Math.max(0, durationMs)));
  } catch {
    // Storage may be disabled; the in-memory UI cooldown still applies.
  }
}

export function clearPhoneOtpCooldown(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore unavailable local storage.
  }
}
