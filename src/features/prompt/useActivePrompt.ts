import { useQuery } from '@tanstack/react-query';

import { getPrompt, type PromptView } from '@/api/prompts';

/**
 * Single source of truth for the active-prompt screen. `refetchOnMount:
 * 'always'` matches the pattern used by getGroup in [id].tsx — every entry
 * into a prompt screen revalidates against the server so the `state` field
 * (active / late / missed) is fresh.
 *
 * The countdown hook calls `refetch()` when the on-time or late deadline is
 * crossed so we re-read the server's recomputed `state` without ever
 * inferring lateness on the client (CLAUDE.md non-negotiable #4).
 */
export function useActivePrompt(promptId: string | undefined) {
  return useQuery<PromptView>({
    queryKey: ['prompts', promptId],
    queryFn: () => getPrompt(promptId as string),
    enabled: !!promptId,
    refetchOnMount: 'always',
  });
}
