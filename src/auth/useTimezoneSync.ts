import { useEffect, useRef } from 'react';

import { patchProfileMe } from '@/api/profile';

import { useSession } from './SessionProvider';

/**
 * On every transition into 'authenticated' (cold start with a restored session,
 * or fresh sign-in via deep link), PATCH the device's IANA timezone to the
 * server. Fire-and-forget; idempotent on the server.
 *
 * CLAUDE.md: "Timezones: prompt windows are per-user local; the client keeps
 * profiles.timezone current."
 *
 * The ref-guard prevents re-firing during a single authenticated stretch
 * (otherwise React StrictMode double-invokes or token refreshes would each
 * cause an extra PATCH). A sign-out → sign-in cycle resets it.
 */
export function useTimezoneSync(): void {
  const { status, session } = useSession();
  const lastSyncedUserId = useRef<string | null>(null);

  useEffect(() => {
    if (status !== 'authenticated') {
      lastSyncedUserId.current = null;
      return;
    }
    if (lastSyncedUserId.current === session.user.id) return;
    lastSyncedUserId.current = session.user.id;

    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!timezone) return; // extremely unlikely on RN, but harmless to guard

    patchProfileMe({ timezone }).catch((err: unknown) => {
      // Don't surface to the user — next launch retries.
      // eslint-disable-next-line no-console
      console.warn('[timezone-sync] PATCH /profile/me failed:', err);
    });
  }, [status, session]);
}
