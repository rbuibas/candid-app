import { useQueryClient } from '@tanstack/react-query';
import { usePathname, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { listActivePrompts, type PromptView } from '@/api/prompts';

/**
 * Handles the "phone off / app killed when the push arrived" case from
 * /docs/02 §7. On authed mount AND on every AppState 'active' transition,
 * query `/prompts/active`; if anything is currently `active` or `late`,
 * route the user straight to it.
 *
 * `missed` is intentionally NOT auto-routed — surfacing a missed prompt on
 * every foreground would be jarring and goes against the "honest, not
 * nagging" tone of the missed state. The user can still navigate to it via
 * a cached push tap.
 *
 * Suppressed when the user is already on a prompts/* path so we don't
 * re-navigate to a screen they're already viewing.
 */
export function useActivePromptHydration(): void {
  const router = useRouter();
  const qc = useQueryClient();
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;

  const tryHydrate = useCallback(async () => {
    if (pathnameRef.current.includes('/prompts/')) return;
    let prompts: PromptView[];
    try {
      prompts = await listActivePrompts();
    } catch {
      return;
    }
    // Seed the cache so the prompt screen reads from it without a second
    // network hop (still re-fetches via refetchOnMount, but warm cache
    // first-paints faster).
    for (const p of prompts) qc.setQueryData(['prompts', p.id], p);

    const actionable = prompts
      .filter((p) => p.state === 'active' || p.state === 'late')
      // Most-recent first: dispatched_at is the natural ordering.
      .sort((a, b) => (a.dispatched_at < b.dispatched_at ? 1 : -1));

    const first = actionable[0];
    if (!first) return;
    router.push({
      pathname: '/(app)/groups/[id]/prompts/[promptId]',
      params: { id: first.group_id, promptId: first.id },
    });
  }, [router, qc]);

  useEffect(() => {
    void tryHydrate();
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') void tryHydrate();
    });
    return () => sub.remove();
  }, [tryHydrate]);
}
