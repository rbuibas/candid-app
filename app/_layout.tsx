import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { SessionProvider } from '@/auth/SessionProvider';
import { useDeepLinkAuth } from '@/auth/useDeepLinkAuth';
import { useDeepLinkJoin } from '@/features/invites/useDeepLinkJoin';
import { QueryProvider } from '@/providers/QueryProvider';

/**
 * Side-effect hooks that need to live inside both <SessionProvider> and
 * <QueryProvider>. useDeepLinkAuth is provider-agnostic but is co-located here
 * so the two deep-link handlers sit together.
 */
function RootEffects() {
  useDeepLinkAuth();
  useDeepLinkJoin();
  return null;
}

export default function RootLayout() {
  return (
    // Outermost wrapper required by react-native-gesture-handler so gestures
    // (e.g. tap-to-focus on the capture camera) are delivered on Android.
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <SessionProvider>
          <QueryProvider>
            <RootEffects />
            <StatusBar style="auto" />
            <Stack screenOptions={{ headerShown: false }} />
          </QueryProvider>
        </SessionProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
