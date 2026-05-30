import { useQueryClient } from '@tanstack/react-query';
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
 *
 * On success we invalidate the ['profile', 'me'] query so any landing screen
 * already rendering the GET refetches and shows the new timezone instead of
 * the stale "UTC" default from the initial post-signup row.
 */
export function useTimezoneSync(): void {
  const { status, session } = useSession();
  const lastSyncedUserId = useRef<string | null>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (status !== 'authenticated') {
      lastSyncedUserId.current = null;
      return;
    }
    if (lastSyncedUserId.current === session.user.id) return;
    lastSyncedUserId.current = session.user.id;

    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    // TEMP DIAGNOSTIC: log what Intl resolved to. Remove once Phase 1 ships.
    // eslint-disable-next-line no-console
    console.log('[timezone-sync] sending timezone:', timezone || '(empty)');

    if (!timezone) return;

    patchProfileMe({ timezone })
      .then(() => {
        // eslint-disable-next-line no-console
        console.log('[timezone-sync] PATCH ok; invalidating profile query');
        queryClient.invalidateQueries({ queryKey: ['profile', 'me'] });
      })
      .catch((err: unknown) => {
        // eslint-disable-next-line no-console
        console.warn('[timezone-sync] PATCH /profile/me failed:', err);
      });
  }, [status, session, queryClient]);
}
