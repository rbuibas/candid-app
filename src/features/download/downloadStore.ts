import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

/**
 * Local-only record of which posts the user has saved to their camera roll,
 * keyed by `post_id`. Persisted across app restarts via AsyncStorage.
 *
 * Per the feature spec (non-negotiable #8): this is a **purely local UI hint**
 * — it drives the "Saved ✓" affordance on a post you've already pulled down.
 * There is deliberately no backend column and no analytics: saving media is a
 * private archival action, not a tracked event. The set is best-effort and may
 * reset on reinstall — we don't promise it survives that, only that the camera
 * roll items do.
 *
 * A JSON store can't serialise a `Set`, so we persist a string[] and expose a
 * `has()` helper. `ids` is kept sorted-insensitive (append-only) — dedupe on
 * write keeps it small.
 */
type DownloadState = {
  ids: string[];
  has: (postId: string) => boolean;
  markDownloaded: (postId: string) => void;
  markManyDownloaded: (postIds: string[]) => void;
};

export const useDownloadStore = create<DownloadState>()(
  persist(
    (set, get) => ({
      ids: [],

      has: (postId) => get().ids.includes(postId),

      markDownloaded: (postId) =>
        set((state) => (state.ids.includes(postId) ? state : { ids: [...state.ids, postId] })),

      markManyDownloaded: (postIds) =>
        set((state) => {
          const next = new Set(state.ids);
          for (const id of postIds) next.add(id);
          return next.size === state.ids.length ? state : { ids: [...next] };
        }),
    }),
    {
      name: 'candid-downloaded-posts',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ ids: state.ids }),
    },
  ),
);

/**
 * Non-reactive read for use inside the bulk orchestrator (outside React).
 * Marks via the same store so the "Saved ✓" hint updates live.
 */
export function markDownloaded(postId: string): void {
  useDownloadStore.getState().markDownloaded(postId);
}
