import { useQueryClient } from '@tanstack/react-query';
import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';

import { joinGroup } from '@/api/groups';
import { useSession } from '@/auth/SessionProvider';

import { consumePendingInvite, setPendingInvite } from './pendingInvite';

/**
 * Parses an invite deep link. Accepts both `candid://join?code=ABC123` (where
 * expo-linking surfaces `join` as the hostname) and any URL whose path
 * resolves to `join`. The code must be exactly 6 uppercase alphanumeric chars.
 */
export function parseJoinCode(url: string): string | null {
  try {
    const parsed = Linking.parse(url);
    const target = parsed.hostname ?? parsed.path?.replace(/^\/+/, '') ?? null;
    if (target !== 'join') return null;
    const raw = parsed.queryParams?.code;
    const code = Array.isArray(raw) ? raw[0] : raw;
    if (!code) return null;
    const upper = code.toUpperCase();
    return /^[A-Z0-9]{6}$/.test(upper) ? upper : null;
  } catch {
    return null;
  }
}

/**
 * Two-phase deep-link join:
 *  - Capture: any candid://join?code=… that arrives (cold or warm) is queued
 *    via setPendingInvite.
 *  - Consume: once the session is authenticated and a code is queued, POST
 *    /groups/join, invalidate the groups queries, and navigate to the detail
 *    screen.
 *
 * Signed-out callers naturally bridge through sign-in: the queued code waits,
 * the auth gate sends them to /(auth)/sign-in, magic-link callback flips the
 * session, and this effect re-runs.
 *
 * Must be mounted inside both <SessionProvider> and <QueryProvider>.
 */
export function useDeepLinkJoin(): void {
  const { status } = useSession();
  const router = useRouter();
  const qc = useQueryClient();
  const inFlight = useRef(false);

  useEffect(() => {
    const handle = (url: string | null) => {
      if (!url) return;
      const code = parseJoinCode(url);
      if (!code) return;
      setPendingInvite(code);
    };

    Linking.getInitialURL().then(handle);
    const sub = Linking.addEventListener('url', ({ url }) => handle(url));
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (status !== 'authenticated') return;
    if (inFlight.current) return;
    const code = consumePendingInvite();
    if (!code) return;

    inFlight.current = true;
    joinGroup(code)
      .then((group) => {
        qc.setQueryData(['groups', group.id], group);
        qc.invalidateQueries({ queryKey: ['groups'] });
        qc.invalidateQueries({ queryKey: ['groups', group.id, 'members'] });
        router.replace({ pathname: '/(app)/groups/[id]', params: { id: group.id } });
      })
      .catch((err: unknown) => {
        // Drop on the floor: re-queueing risks an infinite loop on a
        // permanently bad code. User can paste manually from /groups/join.
        console.warn('[deep-link-join] failed:', err);
      })
      .finally(() => {
        inFlight.current = false;
      });
  }, [status, router, qc]);
}
