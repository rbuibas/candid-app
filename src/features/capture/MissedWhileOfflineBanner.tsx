import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useUploadQueue } from '@/stores/uploadQueue';

/**
 * Honest, dismissible notice that a queued capture's prompt window closed (the
 * server 410'd on flush) while the user was offline — per /docs/02 §8 "honest
 * empty/late/missed states" and §7 (a long offline gap landing as missed is
 * acceptable and honest). Shown atop the feed; clears on dismiss.
 *
 * Only surfaces missed items for the current group so it stays contextual.
 */
export function MissedWhileOfflineBanner({ groupId }: { groupId: string }) {
  const missed = useUploadQueue((s) => s.missed);
  const dismissMissed = useUploadQueue((s) => s.dismissMissed);

  const forGroup = missed.filter((m) => m.groupId === groupId);
  if (forGroup.length === 0) return null;

  const count = forGroup.length;
  const body =
    count === 1
      ? 'You missed a prompt while you were offline — its window closed before it could upload.'
      : `You missed ${count} prompts while you were offline — their windows closed before they could upload.`;

  return (
    <View style={styles.wrap}>
      <View style={styles.textCol}>
        <Text style={styles.title}>Missed while offline</Text>
        <Text style={styles.body}>{body}</Text>
      </View>
      <Pressable
        onPress={() => forGroup.forEach((m) => dismissMissed(m.id))}
        hitSlop={12}
        style={({ pressed }) => [styles.dismiss, pressed && styles.pressed]}
      >
        <Text style={styles.dismissText}>Dismiss</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    margin: 16,
    padding: 14,
    borderRadius: 12,
    backgroundColor: '#fff8c5',
    borderWidth: 1,
    borderColor: '#d4a72c',
  },
  textCol: { flex: 1, gap: 4 },
  title: { color: '#633c01', fontWeight: '700', fontSize: 15 },
  body: { color: '#633c01', fontSize: 13, lineHeight: 19 },
  dismiss: { paddingVertical: 2, paddingHorizontal: 4 },
  dismissText: { color: '#633c01', fontWeight: '700', fontSize: 13 },
  pressed: { opacity: 0.6 },
});
