export interface SessionUser { uid: string; phoneNumber: string | null }
export type SessionState<T> =
  | { status: 'signed-out' } | { status: 'loading' } | { status: 'error' }
  | { status: 'ready'; user: SessionUser; profile: T | null };

// Ignore stale profile responses after sign-out, account switching or unmount.
export function createSessionRestorer<T>(
  loadProfile: (uid: string) => Promise<T | null>,
  onState: (state: SessionState<T>) => void,
  timeoutMs = 12000,
) {
  let generation = 0;
  let disposed = false;
  return {
    async restore(user: SessionUser | null) {
      const request = ++generation;
      if (disposed) return;
      if (!user) { onState({ status: 'signed-out' }); return; }
      onState({ status: 'loading' });
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const profile = await Promise.race([
          loadProfile(user.uid),
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => reject(new Error('Profile lookup timed out')), timeoutMs);
          }),
        ]);
        if (!disposed && request === generation) onState({ status: 'ready', user, profile });
      } catch {
        if (!disposed && request === generation) onState({ status: 'error' });
      } finally { clearTimeout(timer); }
    },
    dispose() { disposed = true; ++generation; },
  };
}

