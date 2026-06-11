import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';

import { recordClientEvent } from '@/api/events';

/**
 * Fires the `feed_opened` client event (candid-measurement-and-debrief L3)
 * each time the Feed tab gains focus, scoped to the active group.
 *
 * E1 always reports `source: "standalone"`; E2 adds the "in-flow" source when
 * the feed is reached from inside a capture flow.
 *
 * Best-effort and fire-and-forget: analytics must never block or break the
 * feed, so failures are swallowed. We don't fire without a group.
 */
export function useFeedOpened(groupId: string | undefined, source: 'standalone' = 'standalone') {
  useFocusEffect(
    useCallback(() => {
      if (!groupId) return;
      void recordClientEvent({ group_id: groupId, name: 'feed_opened', payload: { source } }).catch(
        () => {},
      );
    }, [groupId, source]),
  );
}
