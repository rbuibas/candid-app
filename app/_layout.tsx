import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { SessionProvider } from '@/auth/SessionProvider';
import { useDeepLinkAuth } from '@/auth/useDeepLinkAuth';
import { QueryProvider } from '@/providers/QueryProvider';

export default function RootLayout() {
  useDeepLinkAuth();
  return (
    <SafeAreaProvider>
      <SessionProvider>
        <QueryProvider>
          <StatusBar style="auto" />
          <Stack screenOptions={{ headerShown: false }} />
        </QueryProvider>
      </SessionProvider>
    </SafeAreaProvider>
  );
}
