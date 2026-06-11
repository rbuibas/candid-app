import { useQuery } from '@tanstack/react-query';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getGroup } from '@/api/groups';
import { useActiveGroupStore } from '@/stores/activeGroup';

/**
 * Event tab (candid-requirements §3, §7) — the event's story arc: posting
 * activity timeline, reel progress during the event, and the finished reel
 * after it locks.
 *
 * E1 stub: the route and screen exist for real and reflect the active group;
 * the contents land in E4. We render a simple placeholder, not a fake UI.
 */
export default function EventTab() {
  const groupId = useActiveGroupStore((s) => s.activeGroupId);
  const groupQ = useQuery({
    queryKey: ['groups', groupId],
    queryFn: () => getGroup(groupId as string),
    enabled: !!groupId,
  });

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Event</Text>
      </View>
      <View style={styles.body}>
        <Text style={styles.title}>{groupQ.data?.name ?? 'This event'}</Text>
        <Text style={styles.copy}>
          The event&apos;s story arc lives here — the activity timeline, reel progress while the
          event runs, and the finished reel once it ends. Coming soon.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#d0d7de',
  },
  headerTitle: { fontSize: 20, fontWeight: '700', color: '#1f2328' },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  title: { fontSize: 22, fontWeight: '700', color: '#1f2328', textAlign: 'center' },
  copy: { fontSize: 15, color: '#656d76', lineHeight: 22, textAlign: 'center' },
});
