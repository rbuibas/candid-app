import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';

import { listGroups, type GroupWithLifecycle } from '@/api/groups';
import { setActiveGroup, useActiveGroupStore } from '@/stores/activeGroup';

import { resolveActiveGroup } from './resolveActiveGroup';

/**
 * Resolves the single active group (candid-requirements §3) against the live
 * membership list. The resolution states drive the top-level nav guard
 * (app/(app)/(tabs)/_layout.tsx):
 *
 *   - 'loading' — storage not hydrated yet, or the first groups fetch is still
 *     in flight with nothing cached. Render a splash; don't decide yet.
 *   - 'empty'   — the user belongs to no groups. Route to create-or-join; an
 *     empty feed must never be reachable.
 *   - 'ready'   — `group` / `groupId` is the resolved active group.
 *
 * Resolution rules:
 *   1. The persisted active group, if it's still in the list.
 *   2. Otherwise the most recently activated group still present (the local
 *      "most recently joined" signal — see activeGroup store).
 *   3. Otherwise the newest-created group as a proxy (e.g. a fresh reinstall
 *      with several memberships and no local recency).
 *
 * A resolved fallback is written back to the store via an effect so the next
 * launch restores the same group. The resolution itself is computed
 * synchronously, so switching shows no flash of the previous group.
 */
export type ActiveGroupResolution =
  | { status: 'loading' }
  | { status: 'empty' }
  | { status: 'ready'; group: GroupWithLifecycle; groupId: string };

export function useActiveGroup(): ActiveGroupResolution {
  const groupsQ = useQuery({ queryKey: ['groups'], queryFn: listGroups });
  const activeGroupId = useActiveGroupStore((s) => s.activeGroupId);
  const recency = useActiveGroupStore((s) => s.recency);
  const hydrated = useActiveGroupStore((s) => s.hydrated);

  const groups = groupsQ.data;

  const resolved = useMemo<GroupWithLifecycle | undefined>(() => {
    if (!groups) return undefined;
    return resolveActiveGroup(groups, activeGroupId, recency);
  }, [groups, activeGroupId, recency]);

  // Persist a resolved fallback so relaunch restores it. No-op when the
  // persisted id already matches.
  useEffect(() => {
    if (resolved && resolved.id !== activeGroupId) {
      setActiveGroup(resolved.id);
    }
  }, [resolved, activeGroupId]);

  if (!hydrated) return { status: 'loading' };
  if (!groups) return { status: 'loading' };
  if (groups.length === 0) {
    // Keep showing the splash while the very first fetch is still running so a
    // transient empty cache can't bounce an existing member to create-or-join.
    return groupsQ.isLoading ? { status: 'loading' } : { status: 'empty' };
  }
  if (!resolved) return { status: 'loading' };
  return { status: 'ready', group: resolved, groupId: resolved.id };
}
