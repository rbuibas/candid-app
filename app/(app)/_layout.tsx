import { Redirect, Stack } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { useSession } from '@/auth/SessionProvider';
import { useTimezoneSync } from '@/auth/useTimezoneSync';

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

  return <Stack screenOptions={{ headerShown: false }} />;
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
});
