import { useQuery } from '@tanstack/react-query';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ApiError, getProfileMe } from '@/api';
import { useSession } from '@/auth/SessionProvider';

/**
 * Phase 1 landing — "You're in". Renders the authed profile (smoke test of
 * the JWT-authed API path) and a Sign-out button. Phase 3 replaces this with
 * the real home screen (onboarding/feed/prompt entry points).
 */
export default function Landing() {
  const { session, signOut } = useSession();
  const { data, isLoading, isError, error, refetch, isRefetching } = useQuery({
    queryKey: ['profile', 'me'],
    queryFn: getProfileMe,
  });

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <Text style={styles.title}>You&apos;re in</Text>

        {isLoading ? (
          <ActivityIndicator />
        ) : isError ? (
          <View style={styles.block}>
            <Text style={styles.error}>
              {error instanceof ApiError
                ? `${error.status} ${error.message}`
                : 'Network error loading profile'}
            </Text>
            <Pressable
              onPress={() => refetch()}
              style={({ pressed }) => [styles.secondaryBtn, pressed && styles.pressed]}
              disabled={isRefetching}
            >
              <Text style={styles.secondaryBtnText}>{isRefetching ? 'Retrying…' : 'Retry'}</Text>
            </Pressable>
          </View>
        ) : data ? (
          <View style={styles.block}>
            <Row label="ID" value={data.id} mono />
            <Row label="Display name" value={data.display_name ?? '—'} />
            <Row label="Timezone" value={data.timezone} />
            <Row label="Email" value={session?.user.email ?? '—'} />
          </View>
        ) : null}

        <Pressable
          onPress={signOut}
          style={({ pressed }) => [styles.signOutBtn, pressed && styles.pressed]}
        >
          <Text style={styles.signOutText}>Sign out</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, mono && styles.mono]} numberOfLines={1} ellipsizeMode="middle">
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  container: {
    flex: 1,
    padding: 24,
    gap: 32,
    justifyContent: 'center',
  },
  title: { fontSize: 28, fontWeight: '700', textAlign: 'center' },
  block: { gap: 12 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#d0d7de',
    gap: 16,
  },
  rowLabel: { fontSize: 14, color: '#656d76', fontWeight: '500' },
  rowValue: { fontSize: 14, color: '#1f2328', flexShrink: 1, textAlign: 'right' },
  mono: { fontFamily: 'Menlo', fontSize: 12 },
  error: { color: '#cf222e', fontSize: 14 },
  secondaryBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#1f2328',
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  secondaryBtnText: { color: '#fff', fontWeight: '600' },
  signOutBtn: {
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#d0d7de',
    borderRadius: 8,
  },
  signOutText: { color: '#cf222e', fontWeight: '600', fontSize: 16 },
  pressed: { opacity: 0.7 },
});
