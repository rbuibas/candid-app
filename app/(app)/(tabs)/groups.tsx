import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { queryErrorText } from '@/api/errors';
import { listGroups, type GroupWithLifecycle } from '@/api/groups';
import { LifecycleBadge } from '@/features/groups/components/LifecycleBadge';
import { formatDateRange } from '@/features/groups/lifecycle';
import { PushDeniedBanner } from '@/notifications/PushDeniedBanner';
import { setActiveGroup, useActiveGroupStore } from '@/stores/activeGroup';

/**
 * Groups tab (candid-requirements §3) — the list of the user's groups and the
 * switcher that sets the active group. Tapping a group makes it active and
 * jumps to the Feed tab; because Feed/Event are store-driven, the context
 * swaps immediately. Sign-out lives on the Profile tab now, not here.
 */
export default function GroupsTab() {
  const router = useRouter();
  const activeGroupId = useActiveGroupStore((s) => s.activeGroupId);

  const { data, isLoading, isError, error, refetch, isRefetching } = useQuery({
    queryKey: ['groups'],
    queryFn: listGroups,
  });

  const onSelect = (id: string) => {
    setActiveGroup(id);
    router.navigate('/(app)/(tabs)/feed');
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Groups</Text>
      </View>

      <PushDeniedBanner />

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator />
        </View>
      ) : isError && !data ? (
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
            <GroupRow
              group={item}
              active={item.id === activeGroupId}
              onPress={() => onSelect(item.id)}
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
      </View>
    </SafeAreaView>
  );
}

/**
 * One group row in the switcher. The active group is marked so the list reads
 * as a switcher, not just a list.
 */
function GroupRow({
  group,
  active,
  onPress,
}: {
  group: GroupWithLifecycle;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      <View style={styles.rowText}>
        <View style={styles.rowTitleLine}>
          <Text style={styles.rowName} numberOfLines={1}>
            {group.name}
          </Text>
          {active ? (
            <View style={styles.activePill}>
              <Text style={styles.activePillText}>Active</Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.rowDates}>{formatDateRange(group.start_date, group.end_date)}</Text>
      </View>
      <LifecycleBadge lifecycle={group.lifecycle} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#d0d7de',
  },
  headerTitle: { fontSize: 20, fontWeight: '700', color: '#1f2328' },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: '#d0d7de' },
  flexGrow: { flexGrow: 1 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 8 },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: '#1f2328' },
  emptyBody: { fontSize: 14, color: '#656d76', textAlign: 'center' },
  errorBlock: { padding: 24, gap: 12 },
  error: { color: '#cf222e', fontSize: 14 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 12,
    backgroundColor: '#fff',
  },
  rowPressed: { backgroundColor: '#f6f8fa' },
  rowText: { flex: 1, gap: 4 },
  rowTitleLine: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowName: { fontSize: 17, fontWeight: '600', color: '#1f2328', flexShrink: 1 },
  rowDates: { fontSize: 13, color: '#656d76' },
  activePill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    backgroundColor: '#1f2328',
  },
  activePillText: { color: '#fff', fontSize: 11, fontWeight: '700' },
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
  pressed: { opacity: 0.7 },
});
