import type { GroupWithLifecycle } from '@/api/groups';

/**
 * Pure resolution of the active group (candid-requirements §3), extracted from
 * useActiveGroup so the rules can be unit-tested in isolation (no React, no
 * query, no native deps — this file imports only a type).
 *
 * Precedence:
 *   1. The persisted active group, if it's still in the list.
 *   2. Otherwise the most recently activated group still present — the local
 *      "most recently joined" signal (create / join / switch all push the id
 *      to the front of `recency`).
 *   3. Otherwise the newest-created group as a last-resort proxy (e.g. a fresh
 *      reinstall with several memberships and no local recency).
 *
 * Returns `undefined` only when `groups` is empty (the caller maps that to the
 * create-or-join state).
 */
export function resolveActiveGroup(
  groups: GroupWithLifecycle[],
  activeGroupId: string | null,
  recency: string[],
): GroupWithLifecycle | undefined {
  if (groups.length === 0) return undefined;

  const byId = new Map(groups.map((g: GroupWithLifecycle) => [g.id, g] as const));

  if (activeGroupId && byId.has(activeGroupId)) return byId.get(activeGroupId);

  const fromRecency = recency.find((id) => byId.has(id));
  if (fromRecency) return byId.get(fromRecency);

  // Newest-created first as the "most recently joined" proxy of last resort.
  return [...groups].sort((a, b) => (a.created_at < b.created_at ? 1 : -1))[0];
}
