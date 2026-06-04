import { Stack, useRouter } from 'expo-router';
import { useEffect } from 'react';

import { PostViewer } from '@/features/feed/PostViewer';
import { useViewerStore } from '@/features/feed/viewerStore';

/**
 * Full-size post viewer, presented as a transparent native modal over the feed.
 *
 * Deliberately a native-stack screen, NOT a React Native `<Modal>`:
 * expo-video's `<VideoView>` is a windowed native surface that renders black
 * inside an RN `<Modal>`, so inline video playback only works on a real screen.
 * `presentation: 'transparentModal'` keeps the feed visible behind the viewer's
 * own backdrop; `animation: 'fade'` matches the previous modal feel.
 *
 * The tapped post arrives via `useViewerStore` (router params are string-only
 * and we don't want to re-mint the post's signed URLs). If the store is empty
 * — e.g. the route is reached without a selection — we just pop back.
 */
export default function ViewerScreen() {
  const router = useRouter();
  const post = useViewerStore((s) => s.post);
  const setPost = useViewerStore((s) => s.setPost);

  // Clear the hand-off whenever the viewer leaves the tree, however it closed
  // (close button, pan-to-dismiss, or hardware back). Closing only navigates —
  // we never null the post while mounted, so the back-on-empty effect below
  // can't fire a second pop on the way out.
  useEffect(() => () => setPost(null), [setPost]);

  // Reached without a selection (stale nav / direct deep link): nothing to show.
  useEffect(() => {
    if (!post) router.back();
  }, [post, router]);

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: false,
          presentation: 'transparentModal',
          animation: 'fade',
        }}
      />
      {post ? <PostViewer post={post} onClose={() => router.back()} /> : null}
    </>
  );
}
