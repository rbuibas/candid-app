import type { QueryClient } from '@tanstack/react-query';
import * as Network from 'expo-network';

import { feedQueryKey } from '@/features/feed/useGroupFeed';
import { useUploadQueue, type QueueItem } from '@/stores/uploadQueue';

import { deleteQueuedFile } from './queueStorage';
import { runUploadPipeline } from './runUploadPipeline';
import { describeError, isGroupLockedError, isMissedError, isRetryable } from './uploadErrors';

/**
 * Drains the offline capture queue. Invoked by useUploadQueueFlush on app
 * launch, on every foreground, and on the offline→online edge.
 *
 * Concurrency is gated by a module-level flag rather than store state: the
 * triggers (AppState + network listener + manual taps) can fire near-
 * simultaneously, and a single in-flight drain must not be re-entered.
 *
 * Each item runs the full pipeline fresh (runUploadPipeline). Outcomes:
 *   - success      → delete the local file, drop the item, refresh the feed.
 *   - 410 (missed) → delete + surface "you missed this one" (terminal).
 *   - 409 locked   → delete + drop (capture raced the lock; terminal).
 *   - retryable    → keep queued, bump attempt + backoff.
 *   - other 4xx    → delete + drop (won't succeed on retry).
 */
let isFlushing = false;

/** Remove an item's persisted bytes — the media and, for video, its poster. */
async function deleteQueuedFiles(item: QueueItem): Promise<void> {
  await deleteQueuedFile(item.localFilePath);
  if (item.thumbnailLocalFilePath) await deleteQueuedFile(item.thumbnailLocalFilePath);
}

function isEligible(item: QueueItem, now: number): boolean {
  if (item.status === 'pending') return true;
  if (item.status === 'failed')
    return item.nextAttemptAt === undefined || item.nextAttemptAt <= now;
  return false;
}

export async function flushUploadQueue(qc: QueryClient): Promise<void> {
  if (isFlushing) return;

  const store = useUploadQueue.getState();
  if (store.items.length === 0) return;

  // Don't even try while offline — saves a guaranteed failure + backoff bump.
  try {
    const net = await Network.getNetworkStateAsync();
    if (net.isConnected === false) return;
  } catch {
    // If we can't read connectivity, optimistically attempt the flush.
  }

  isFlushing = true;
  try {
    const now = Date.now();
    const batch = useUploadQueue.getState().items.filter((it) => isEligible(it, now));

    for (const item of batch) {
      // Re-read in case a concurrent action removed it between snapshot and turn.
      const current = useUploadQueue.getState().items.find((it) => it.id === item.id);
      if (!current) continue;

      useUploadQueue.getState().setStatus(item.id, 'uploading');
      try {
        await runUploadPipeline(item);
        await deleteQueuedFiles(item);
        useUploadQueue.getState().remove(item.id);
        void qc.invalidateQueries({ queryKey: feedQueryKey(item.groupId) });
        if (item.promptId) {
          void qc.invalidateQueries({ queryKey: ['prompts', item.promptId] });
        }
      } catch (err) {
        if (isMissedError(err)) {
          await deleteQueuedFiles(item);
          useUploadQueue.getState().markMissed(item);
          if (item.promptId) {
            void qc.invalidateQueries({ queryKey: ['prompts', item.promptId] });
          }
        } else if (isGroupLockedError(err)) {
          await deleteQueuedFiles(item);
          useUploadQueue.getState().remove(item.id);
        } else if (isRetryable(err)) {
          useUploadQueue.getState().bumpAttempt(item.id, describeError(err));
        } else {
          // Non-retryable server rejection — drop it rather than loop forever.
          await deleteQueuedFiles(item);
          useUploadQueue.getState().remove(item.id);
        }
      }
    }
  } finally {
    isFlushing = false;
  }
}
