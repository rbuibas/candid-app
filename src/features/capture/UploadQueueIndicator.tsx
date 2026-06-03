import { useQueryClient } from '@tanstack/react-query';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useUploadQueue } from '@/stores/uploadQueue';

import { flushUploadQueue } from './flushUploadQueue';

/**
 * Unobtrusive floating pill reflecting the offline upload queue (Phase-6 §B).
 * Hidden when the queue is empty. Two moods:
 *   - any item is 'failed' → "N waiting to upload · tap to retry" (tap forces a
 *     flush rather than waiting for the next reconnect/foreground),
 *   - otherwise           → "N uploading…".
 *
 * Counts across all groups — the queue is global; a couple pending posts is the
 * whole signal the user needs while abroad.
 */
export function UploadQueueIndicator() {
  const qc = useQueryClient();
  const items = useUploadQueue((s) => s.items);

  if (items.length === 0) return null;

  const hasFailed = items.some((it) => it.status === 'failed');
  const label = hasFailed
    ? `${items.length} waiting to upload · tap to retry`
    : `${items.length} uploading…`;

  return (
    <View pointerEvents="box-none" style={styles.wrap}>
      <Pressable
        onPress={() => void flushUploadQueue(qc)}
        style={({ pressed }) => [
          styles.pill,
          hasFailed && styles.pillFailed,
          pressed && styles.pressed,
        ]}
      >
        <Text style={styles.text}>{label}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 24,
    alignItems: 'center',
  },
  pill: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(31,35,40,0.92)',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  pillFailed: { backgroundColor: 'rgba(154,103,0,0.95)' },
  text: { color: '#fff', fontSize: 14, fontWeight: '600' },
  pressed: { opacity: 0.8 },
});
