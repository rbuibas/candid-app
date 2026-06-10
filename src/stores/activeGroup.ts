import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

/**
 * The single active group (candid-requirements §3). Exactly one group is
 * active at a time; the Feed and Event tabs always reflect it. Selection is
 * persisted locally (AsyncStorage, same pattern as downloadStore) and restored
 * on launch.
 *
 * `recency` is a most-recent-first list of group ids the user has activated —
 * which, because create / join / switch all flow through setActiveGroup, is
 * the best on-device signal for "the most recently joined group". It backs the
 * fallback in useActiveGroup() when a persisted active group is gone. We cap it
 * so it can't grow unbounded.
 *
 * `hydrated` flips true once persist has loaded (or confirmed empty) storage.
 * The nav guard waits for it so a cold launch restores the saved group instead
 * of briefly deciding "no group → create-or-join" before storage has loaded.
 */
const RECENCY_CAP = 20;

type ActiveGroupState = {
  activeGroupId: string | null;
  recency: string[];
  hydrated: boolean;
  setActiveGroup: (id: string) => void;
  clearActiveGroup: () => void;
};

export const useActiveGroupStore = create<ActiveGroupState>()(
  persist(
    (set) => ({
      activeGroupId: null,
      recency: [],
      hydrated: false,

      setActiveGroup: (id) =>
        set((state) => ({
          activeGroupId: id,
          recency: [id, ...state.recency.filter((x) => x !== id)].slice(0, RECENCY_CAP),
        })),

      clearActiveGroup: () => set({ activeGroupId: null }),
    }),
    {
      name: 'candid-active-group',
      storage: createJSONStorage(() => AsyncStorage),
      // hydrated is runtime-only; never persist it.
      partialize: (state) => ({ activeGroupId: state.activeGroupId, recency: state.recency }),
      onRehydrateStorage: () => () => {
        useActiveGroupStore.setState({ hydrated: true });
      },
    },
  ),
);

/**
 * Non-reactive setter for navigation flows that run outside React render
 * (create / join / photobooth / prompt return paths). Sets the active group
 * before they navigate to the Feed tab, so the tab reflects the right group
 * immediately.
 */
export function setActiveGroup(id: string): void {
  useActiveGroupStore.getState().setActiveGroup(id);
}

export function clearActiveGroup(): void {
  useActiveGroupStore.getState().clearActiveGroup();
}
