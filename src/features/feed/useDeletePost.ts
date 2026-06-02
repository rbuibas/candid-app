import { useMutation, useQueryClient, type InfiniteData } from '@tanstack/react-query';

import { type FeedPage } from '@/api/feed';
import { deletePost } from '@/api/posts';

import { feedQueryKey } from './useGroupFeed';

/**
 * Delete the caller's own post. Optimistically removes it from every page of
 * the group feed cache, rolls back on error, and revalidates on settle so the
 * server's tombstone state wins. The post vanishes from this device instantly;
 * other members see it gone on their next feed fetch.
 */
export function useDeletePost(groupId: string) {
  const qc = useQueryClient();
  const key = feedQueryKey(groupId);

  return useMutation({
    mutationFn: (postId: string) => deletePost(postId),
    onMutate: async (postId: string) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<InfiniteData<FeedPage>>(key);
      if (previous) {
        qc.setQueryData<InfiniteData<FeedPage>>(key, {
          ...previous,
          pages: previous.pages.map((page) => ({
            ...page,
            items: page.items.filter((item) => item.id !== postId),
          })),
        });
      }
      return { previous };
    },
    onError: (_err, _postId, context) => {
      if (context?.previous) {
        qc.setQueryData(key, context.previous);
      }
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: key });
    },
  });
}
