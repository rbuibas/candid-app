import { useQuery } from '@tanstack/react-query';
import { Stack, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { queryErrorText } from '@/api/errors';
import { listGroups, type GroupWithLifecycle } from '@/api/groups';
import { useSession } from '@/auth/SessionProvider';
import { GroupListItem } from '@/features/groups/components/GroupListItem';
import { PushDeniedBanner } from '@/notifications/PushDeniedBanner';

export default function GroupsList() {
  const router = useRouter();
  const { session, signOut } = useSession();
  const { data, isLoading, isError, error, refetch, isRefetching } = useQuery({
    queryKey: ['groups'],
    queryFn: listGroups,
  });

  useEffect(() => {
    if (session?.access_token) {
      console.log('[auth] JWT', session.access_token);
    }
  }, [session?.access_token]);

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <Stack.Screen options={{ title: 'Groups' }} />

      <PushDeniedBanner />

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator />
        </View>
      ) : isError && !data ? (
        // Keep any cached group list visible if a refetch fails offline.
        <View style={styles.errorBlock}>
          <Text style={styles.error}>{queryErrorText(error)}</Text>
          <Pressable
            onPress={() => refetch()}
            style={({ pressed }) => [styles.secondaryBtn, pressed && styles.pressed]}
            disabled={isRefetching}
          >
            <Text style={styles.secondaryBtnText}>{isRefetching ? 'Retrying…' : 'Retry'}</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList<GroupWithLifecycle>
          data={data ?? []}
          keyExtractor={(g) => g.id}
          renderItem={({ item }) => (
            <GroupListItem
              group={item}
              onPress={() =>
                router.push({ pathname: '/(app)/groups/[id]', params: { id: item.id } })
              }
            />
          )}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>No groups yet</Text>
              <Text style={styles.emptyBody}>
                Create one, or join with a code your friend shared.
              </Text>
            </View>
          }
          contentContainerStyle={(data?.length ?? 0) === 0 ? styles.flexGrow : undefined}
        />
      )}

      <View style={styles.ctas}>
        <Pressable
          onPress={() => router.push('/(app)/groups/create')}
          style={({ pressed }) => [styles.primaryBtn, pressed && styles.pressed]}
        >
          <Text style={styles.primaryBtnText}>Create group</Text>
        </Pressable>
        <Pressable
          onPress={() => router.push('/(app)/groups/join')}
          style={({ pressed }) => [styles.outlineBtn, pressed && styles.pressed]}
        >
          <Text style={styles.outlineBtnText}>Join with code</Text>
        </Pressable>
        <Pressable
          onPress={() => {
            void signOut();
          }}
          style={({ pressed }) => [styles.signOutBtn, pressed && styles.pressed]}
        >
          <Text style={styles.signOutBtnText}>Sign out</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: '#d0d7de' },
  flexGrow: { flexGrow: 1 },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 8,
  },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: '#1f2328' },
  emptyBody: { fontSize: 14, color: '#656d76', textAlign: 'center' },
  errorBlock: { padding: 24, gap: 12 },
  error: { color: '#cf222e', fontSize: 14 },
  ctas: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#d0d7de',
  },
  primaryBtn: {
    backgroundColor: '#1f2328',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  primaryBtnText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  outlineBtn: {
    borderWidth: 1,
    borderColor: '#d0d7de',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  outlineBtnText: { color: '#1f2328', fontWeight: '600', fontSize: 16 },
  secondaryBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#1f2328',
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  secondaryBtnText: { color: '#fff', fontWeight: '600' },
  signOutBtn: {
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  signOutBtnText: { color: '#cf222e', fontWeight: '600', fontSize: 15 },
  pressed: { opacity: 0.7 },
});
