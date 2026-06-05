import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { PostKind, PostMediaType } from '@/api/posts';

/**
 * Offline capture queue (Phase 6).
 *
 * When a capture can't upload — no signal, a flaky drop mid-pipeline — we stash
 * the raw bytes + metadata here and flush later (on reconnect / launch /
 * foreground). Per the Phase-6 decision the queue stores the **raw capture**,
 * never a pre-minted upload URL (those expire in ~10 min): each flush attempt
 * runs the full upload-url → PUT → confirm pipeline fresh with a new post_id.
 *
 * State persists across app kills via Zustand `persist` over AsyncStorage; the
 * media bytes live alongside in the document dir (see queueStorage.ts). Only the
 * `items` and `missed` arrays are persisted — `status` is reset to a flushable
 * state on rehydrate so an interrupted `'uploading'` item retries cleanly.
 */
export type QueueStatus = 'pending' | 'uploading' | 'failed';

export type QueueItem = {
  id: string;
  localFilePath: string;
  /** Video only: local poster frame to PUT alongside the media on flush. */
  thumbnailLocalFilePath?: string;
  groupId: string;
  kind: PostKind;
  mediaType: PostMediaType;
  promptId?: string;
  capturedAt: string;
  durationSeconds?: number;
  latitude?: number;
  longitude?: number;
  accuracy?: number;
  attempts: number;
  /** Epoch ms; a 'failed' item is skipped by flush until now passes this. */
  nextAttemptAt?: number;
  status: QueueStatus;
  lastError?: string;
};

/** A prompt whose window closed (server 410'd) while its capture sat offline. */
export type MissedItem = {
  id: string;
  groupId: string;
  promptId?: string;
  capturedAt: string;
};

/** Fields the caller supplies; the store fills in attempts/status. */
export type EnqueueInput = Omit<QueueItem, 'attempts' | 'status' | 'nextAttemptAt' | 'lastError'>;

const MAX_MISSED = 5;
const BASE_BACKOFF_MS = 5_000;
const MAX_BACKOFF_MS = 5 * 60_000;

/** Exponential backoff capped at 5 min, keyed on the new attempt count. */
function backoffFor(attempts: number): number {
  return Date.now() + Math.min(2 ** attempts * BASE_BACKOFF_MS, MAX_BACKOFF_MS);
}

export function makeQueueId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

type UploadQueueState = {
  items: QueueItem[];
  missed: MissedItem[];
  enqueue: (input: EnqueueInput) => void;
  setStatus: (id: string, status: QueueStatus) => void;
  bumpAttempt: (id: string, error: string) => void;
  remove: (id: string) => void;
  markMissed: (item: QueueItem) => void;
  dismissMissed: (id: string) => void;
};

export const useUploadQueue = create<UploadQueueState>()(
  persist(
    (set) => ({
      items: [],
      missed: [],

      enqueue: (input) =>
        set((state) => ({
          items: [...state.items, { ...input, attempts: 0, status: 'pending' }],
        })),

      setStatus: (id, status) =>
        set((state) => ({
          items: state.items.map((it) => (it.id === id ? { ...it, status } : it)),
        })),

      bumpAttempt: (id, error) =>
        set((state) => ({
          items: state.items.map((it) =>
            it.id === id
              ? {
                  ...it,
                  attempts: it.attempts + 1,
                  status: 'failed',
                  nextAttemptAt: backoffFor(it.attempts + 1),
                  lastError: error,
                }
              : it,
          ),
        })),

      remove: (id) => set((state) => ({ items: state.items.filter((it) => it.id !== id) })),

      markMissed: (item) =>
        set((state) => ({
          items: state.items.filter((it) => it.id !== item.id),
          missed: [
            {
              id: item.id,
              groupId: item.groupId,
              promptId: item.promptId,
              capturedAt: item.capturedAt,
            },
            ...state.missed,
          ].slice(0, MAX_MISSED),
        })),

      dismissMissed: (id) => set((state) => ({ missed: state.missed.filter((m) => m.id !== id) })),
    }),
    {
      name: 'candid-upload-queue',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ items: state.items, missed: state.missed }),
      // An item caught mid-'uploading' when the app died must become flushable
      // again on next launch — reset it to 'pending' so the flusher retries it.
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        state.items = state.items.map((it) =>
          it.status === 'uploading' ? { ...it, status: 'pending' } : it,
        );
      },
    },
  ),
);
