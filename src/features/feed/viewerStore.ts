import { create } from 'zustand';

import { type FeedItem } from '@/api/feed';

/**
 * Ephemeral hand-off for the full-size post viewer. The viewer is a native
 * route (`groups/[id]/viewer`, presented as a transparent modal) rather than a
 * React Native `<Modal>` — expo-video's `<VideoView>` is a windowed native
 * surface that renders black inside an RN `<Modal>`, so video playback only
 * works on a real native-stack screen.
 *
 * Router params are string-only and a `FeedItem` already carries short-lived
 * signed URLs we don't want to re-fetch, so the tapped post rides through this
 * in-memory store instead of the URL. Not persisted — it's pure navigation
 * state, cleared when the viewer closes.
 */
type ViewerState = {
  post: FeedItem | null;
  setPost: (post: FeedItem | null) => void;
};

export const useViewerStore = create<ViewerState>((set) => ({
  post: null,
  setPost: (post) => set({ post }),
}));
