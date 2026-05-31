import messaging, { type FirebaseMessagingTypes } from '@react-native-firebase/messaging';
import { useRouter, type Router } from 'expo-router';
import { useEffect } from 'react';

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
 */

function routeToPrompt(router: Router, payload: PromptPushPayload) {
  router.push({
    pathname: '/(app)/groups/[id]/prompts/[promptId]',
    params: { id: payload.group_id, promptId: payload.prompt_id },
  });
}

export function usePushHandlers(): void {
  const router = useRouter();
  const { show } = useForegroundPush();

  useEffect(() => {
    const onMessageUnsub = messaging().onMessage(
      async (msg: FirebaseMessagingTypes.RemoteMessage) => {
        const payload = parsePromptPushPayload(msg.data);
        if (payload) show(payload);
      },
    );

    const onOpenedUnsub = messaging().onNotificationOpenedApp(
      (msg: FirebaseMessagingTypes.RemoteMessage | null) => {
        const payload = parsePromptPushPayload(msg?.data);
        if (payload) routeToPrompt(router, payload);
      },
    );

    // Cold-start: was the app opened FROM a push? If so, route once.
    void messaging()
      .getInitialNotification()
      .then((msg) => {
        const payload = parsePromptPushPayload(msg?.data);
        if (payload) routeToPrompt(router, payload);
      });

    return () => {
      onMessageUnsub();
      onOpenedUnsub();
    };
  }, [router, show]);
}
