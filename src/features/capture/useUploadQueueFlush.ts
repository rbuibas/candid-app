import { useQueryClient } from '@tanstack/react-query';
import { useNetworkState } from 'expo-network';
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { flushUploadQueue } from './flushUploadQueue';

/**
 * Drives the offline-queue flush from a single mount point (the authed layout).
 * Three triggers, all per the Phase-6 decision:
 *   - app launch (this hook's first mount),
 *   - foreground (AppState → 'active'), mirroring useActivePromptHydration,
 *   - reconnect (expo-network offline→online edge).
 *
 * flushUploadQueue's own module-level guard absorbs overlapping triggers, so
 * we can fire freely without debouncing here.
 */
export function useUploadQueueFlush(): void {
  const qc = useQueryClient();
  const net = useNetworkState();
  const wasConnected = useRef<boolean | undefined>(undefined);

  // Launch + foreground.
  useEffect(() => {
    void flushUploadQueue(qc);
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') void flushUploadQueue(qc);
    });
    return () => sub.remove();
  }, [qc]);

  // Reconnect edge: only flush when we cross from not-connected to connected,
  // not on every network-state object change.
  useEffect(() => {
    const connected = net.isConnected;
    if (connected && wasConnected.current === false) {
      void flushUploadQueue(qc);
    }
    if (connected !== undefined) wasConnected.current = connected;
  }, [net.isConnected, qc]);
}
