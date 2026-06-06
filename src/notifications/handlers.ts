import {
  getInitialNotification,
  getMessaging,
  onMessage,
  onNotificationOpenedApp,
  type FirebaseMessagingTypes,
} from '@react-native-firebase/messaging';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useRouter, type Router } from 'expo-router';
import { useEffect } from 'react';

import type { PromptView } from '@/api/prompts';
import { useForegroundPush } from './ForegroundPushContext';
import { parsePromptPushPayload, type PromptPushPayload } from './payload';

/**
 * Push handler wiring split across three FCM lifecycle moments:
 *   - foreground (onMessage)        : show our in-app banner; tap → route
 *   - background-tap (onNotificationOpenedApp) : route directly
 *   - cold-start (getInitialNotification)       : route directly, once
 *
 * Routing target for all three is /(app)/groups/{group_id}/prompts/{prompt_id}
 * derived from the FCM data payload (NOT title/body). The screen itself
 * fetches the latest PromptView and renders from server `state`, so the
 * push payload is just a routing key here — even a stale payload still
 * lands on a screen showing the correct lateness state.
 *
 * Before navigating we seed the React Query cache with a PromptView derived
 * entirely from the push payload. This lets the prompt screen render
 * immediately when offline (airplane mode) without waiting for a network
 * round-trip. The server just dispatched this prompt, so seeding state as
 * 'active' is correct. The screen's refetchOnMount revalidates in the
 * background whenever connectivity returns.
 */

function seedPromptCache(qc: QueryClient, payload: PromptPushPayload) {
  const dispatchedMs = new Date(payload.dispatched_at).getTime();
  const seed: PromptView = {
    id: payload.prompt_id,
    group_id: payload.group_id,
    media_type: payload.media_type,
    target_video_length_seconds: payload.target_video_length_seconds,
    dispatched_at: payload.dispatched_at,
    on_time_deadline: new Date(dispatchedMs + payload.response_window_seconds * 1000).toISOString(),
    late_deadline: new Date(dispatchedMs + payload.late_window_seconds * 1000).toISOString(),
    state: 'active',
  };
  qc.setQueryData(['prompts', payload.prompt_id], seed);
}

function routeToPrompt(router: Router, qc: QueryClient, payload: PromptPushPayload) {
  seedPromptCache(qc, payload);
  // replace, not push — tapping multiple pushes (or the same prompt twice)
  // must not stack duplicate prompt screens that the user has to back through
  // (#14). The prompt screen's onBack uses replace back to the feed, so
  // replace here keeps the history clean in all entry paths.
  router.replace({
    pathname: '/(app)/groups/[id]/prompts/[promptId]',
    params: { id: payload.group_id, promptId: payload.prompt_id },
  });
}

export function usePushHandlers(): void {
  const router = useRouter();
  const qc = useQueryClient();
  const { show } = useForegroundPush();

  useEffect(() => {
    const fcm = getMessaging();

    const onMessageUnsub = onMessage(fcm, async (msg: FirebaseMessagingTypes.RemoteMessage) => {
      const payload = parsePromptPushPayload(msg.data);
      if (payload) show(payload);
    });

    const onOpenedUnsub = onNotificationOpenedApp(
      fcm,
      (msg: FirebaseMessagingTypes.RemoteMessage | null) => {
        const payload = parsePromptPushPayload(msg?.data);
        if (payload) routeToPrompt(router, qc, payload);
      },
    );

    // Cold-start: was the app opened FROM a push? If so, route once.
    void getInitialNotification(fcm).then((msg) => {
      const payload = parsePromptPushPayload(msg?.data);
      if (payload) routeToPrompt(router, qc, payload);
    });

    return () => {
      onMessageUnsub();
      onOpenedUnsub();
    };
  }, [router, qc, show]);
}
