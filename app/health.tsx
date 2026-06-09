import { useQuery } from '@tanstack/react-query';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getHealth } from '@/api';
import { queryErrorText } from '@/api/errors';
import { API_URL } from '@/config';

/**
 * Public health screen — hits GET /health on the deployed API and renders the
 * status. Kept reachable signed-out for debugging the API path; auth lives
 * under the (auth)/(app) route groups.
 */
export default function HealthScreen() {
  const { data, isLoading, isError, error, refetch, isRefetching } = useQuery({
    queryKey: ['health'],
    queryFn: getHealth,
  });

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <Text style={styles.title}>Health</Text>

        <View style={styles.statusBox as ViewStyle}>
          {isLoading ? (
            <ActivityIndicator />
          ) : isError ? (
            <>
              <Text style={styles.error}>{queryErrorText(error)}</Text>
              <Pressable
                onPress={() => refetch()}
                style={({ pressed }) => [styles.retry, pressed && styles.retryPressed]}
                disabled={isRefetching}
              >
                <Text style={styles.retryText}>{isRefetching ? 'Retrying…' : 'Retry'}</Text>
              </Pressable>
            </>
          ) : (
            <Text style={styles.ok}>status: {data?.status}</Text>
          )}
        </View>

        <Text style={styles.meta}>API: {API_URL}</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#fff',
  },
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 24,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
  },
  statusBox: {
    minHeight: 80,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  ok: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1a7f37',
  },
  error: {
    fontSize: 16,
    color: '#cf222e',
    textAlign: 'center',
  },
  retry: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#1f2328',
    borderRadius: 6,
  },
  retryPressed: {
    opacity: 0.7,
  },
  retryText: {
    color: '#fff',
    fontWeight: '600',
  },
  meta: {
    fontSize: 12,
    color: '#656d76',
  },
});
