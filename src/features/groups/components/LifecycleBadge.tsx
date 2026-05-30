import { StyleSheet, Text, View } from 'react-native';

import type { Lifecycle } from '@/api/groups';

type Props = { lifecycle: Lifecycle };

const PALETTE: Record<Lifecycle, { bg: string; fg: string }> = {
  upcoming: { bg: '#e7e7ea', fg: '#4a4a52' },
  active: { bg: '#d4f4dd', fg: '#1a7f37' },
  locked: { bg: '#d0d7de', fg: '#1f2328' },
};

export function LifecycleBadge({ lifecycle }: Props) {
  const { bg, fg } = PALETTE[lifecycle];
  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      <Text style={[styles.text, { color: fg }]}>{lifecycle.toUpperCase()}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    alignSelf: 'flex-start',
  },
  text: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});
