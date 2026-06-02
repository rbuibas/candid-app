import { Redirect, Stack } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { useSession } from '@/auth/SessionProvider';
import { useTimezoneSync } from '@/auth/useTimezoneSync';
import { useUploadQueueFlush } from '@/features/capture/useUploadQueueFlush';
import { ForegroundBanner } from '@/notifications/ForegroundBanner';
import { ForegroundPushProvider } from '@/notifications/ForegroundPushContext';
import { NotificationsGate } from '@/notifications/NotificationsGate';

/**
 * Side effects that must run only while authenticated. Rendered inside the
 * authed branch below so the offline-queue flush never fires pre-session (a
 * pre-auth flush would 401 the pipeline). Renders nothing.
 */
function AuthedEffects() {
  useUploadQueueFlush();
  return null;
}

/**
 * Authed route group. Bounces unauthenticated callers to /(auth)/sign-in.
 * Hosts the timezone-sync side effect so it only fires while the user is in
 * the authed half of the app.
 */
export default function AppLayout() {
  const { status } = useSession();
  useTimezoneSync();

  if (status === 'loading') {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  if (status !== 'authenticated') {
    return <Redirect href="/(auth)/sign-in" />;
  }

  // ForegroundPushProvider wraps the gate (which contains the push handlers
  // that publish into the context) AND the banner (which subscribes). The
  // gate itself drives the priming rationale modal + AppState foreground
  // checks; the banner floats above the Stack.
  return (
    <ForegroundPushProvider>
      <NotificationsGate>
        <AuthedEffects />
        <Stack screenOptions={{ headerShown: false }} />
        <ForegroundBanner />
      </NotificationsGate>
    </ForegroundPushProvider>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
});
