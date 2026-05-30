import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { GroupWithLifecycle } from '@/api/groups';

import { formatDateRange } from '../lifecycle';
import { LifecycleBadge } from './LifecycleBadge';

type Props = {
  group: GroupWithLifecycle;
  onPress: () => void;
};

export function GroupListItem({ group, onPress }: Props) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      <View style={styles.text}>
        <Text style={styles.name} numberOfLines={1}>
          {group.name}
        </Text>
        <Text style={styles.dates}>{formatDateRange(group.start_date, group.end_date)}</Text>
      </View>
      <LifecycleBadge lifecycle={group.lifecycle} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 12,
    backgroundColor: '#fff',
  },
  pressed: { backgroundColor: '#f6f8fa' },
  text: { flex: 1, gap: 4 },
  name: { fontSize: 17, fontWeight: '600', color: '#1f2328' },
  dates: { fontSize: 13, color: '#656d76' },
});
