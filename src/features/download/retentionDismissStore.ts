import { create } from 'zustand';

/**
 * Session-only dismissal state for the retention nudge banner, keyed by group.
 *
 * Deliberately NOT persisted (no AsyncStorage): per the feature spec the nudge
 * should return on the next app launch — we want to keep reminding the user to
 * save their media before it's cleared. Dismissal only suppresses it for the
 * current session.
 */
type RetentionDismissState = {
  dismissed: Record<string, true>;
  isDismissed: (groupId: string) => boolean;
  dismiss: (groupId: string) => void;
};

export const useRetentionDismiss = create<RetentionDismissState>((set, get) => ({
  dismissed: {},
  isDismissed: (groupId) => !!get().dismissed[groupId],
  dismiss: (groupId) => set((state) => ({ dismissed: { ...state.dismissed, [groupId]: true } })),
}));
