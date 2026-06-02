import { useInfiniteQuery } from '@tanstack/react-query';

import { getGroupFeed, type FeedPage } from '@/api/feed';

/**
 * Query key for a group's feed. Shared with useDeletePost so the optimistic
 * cache surgery and invalidation target the same entry.
 */
export function feedQueryKey(groupId: string) {
  return ['groups', groupId, 'feed'] as const;
}

/**
 * Infinite, cursor-paged group feed (newest-visible first). `next_cursor` from
 * each page drives the next fetch; a null cursor means no more pages.
 *
 * staleTime is 50 minutes: the backend signs media URLs for ~1h, so pages go
 * stale (and refetch with fresh URLs) before those URLs expire.
 */
export function useGroupFeed(groupId: string | undefined) {
  return useInfiniteQuery({
    queryKey: feedQueryKey(groupId as string),
    queryFn: ({ pageParam }) => getGroupFeed(groupId as string, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last: FeedPage) => last.next_cursor ?? undefined,
    staleTime: 50 * 60 * 1000,
    enabled: !!groupId,
  });
}
