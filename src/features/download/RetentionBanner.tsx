import { Pressable, StyleSheet, Text, View } from 'react-native';

import { type GroupWithLifecycle } from '@/api/groups';

import { useRetentionDismiss } from './retentionDismissStore';

const DAY_MS = 24 * 60 * 60 * 1000;
const NUDGE_WINDOW_DAYS = 7;

/** Whole days from now until the ISO timestamp (>= 0, rounded up). */
export function daysUntil(iso: string): number {
  const target = new Date(iso).getTime();
  if (Number.isNaN(target)) return Number.POSITIVE_INFINITY;
  return Math.max(0, Math.ceil((target - Date.now()) / DAY_MS));
}

/**
 * Soft retention nudge — rendered above the feed when a locked group is within
 * 7 days of its `retention_purge_at`. Tells members to save the group's media
 * before it's cleared, and offers a one-tap "Save all" into the bulk flow.
 *
 * Conditions (all must hold):
 *   - group.lifecycle === 'locked'
 *   - daysUntil(retention_purge_at) <= 7
 *   - not dismissed this session (session-only; returns on next launch)
 *
 * The number is recomputed on every render. There is no purge job behind this
 * (non-negotiable #5) — it's a nudge based on the server-computed timestamp.
 */
export function RetentionBanner({
  group,
  onSaveAll,
}: {
  group: GroupWithLifecycle | undefined;
  onSaveAll: () => void;
}) {
  const isDismissed = useRetentionDismiss((s) => (group ? s.isDismissed(group.id) : false));
  const dismiss = useRetentionDismiss((s) => s.dismiss);

  if (!group) return null;
  if (group.lifecycle !== 'locked') return null;
  if (isDismissed) return null;

  const days = daysUntil(group.retention_purge_at);
  if (days > NUDGE_WINDOW_DAYS) return null;

  const dayLabel = days === 1 ? '1 day' : `${days} days`;

  return (
    <View style={styles.banner}>
      <View style={styles.row}>
        <Text style={styles.title}>Save your memories</Text>
        <Pressable onPress={() => dismiss(group.id)} hitSlop={12} style={styles.dismiss}>
          <Text style={styles.dismissGlyph}>✕</Text>
        </Pressable>
      </View>
      <Text style={styles.body}>
        This event ends soon. Save the group&apos;s photos and videos to your camera roll before
        they&apos;re cleared in {dayLabel}.
      </Text>
      <Pressable
        onPress={onSaveAll}
        style={({ pressed }) => [styles.cta, pressed && styles.pressed]}
      >
        <Text style={styles.ctaText}>Save all</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: '#fff8c5',
    borderColor: '#d4a72c',
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginHorizontal: 16,
    marginTop: 12,
    gap: 8,
  },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 15, fontWeight: '700', color: '#633c01' },
  dismiss: { padding: 2 },
  dismissGlyph: { fontSize: 15, fontWeight: '700', color: '#633c01' },
  body: { fontSize: 13, color: '#633c01', lineHeight: 19 },
  cta: {
    backgroundColor: '#1f2328',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 18,
  },
  ctaText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  pressed: { opacity: 0.7 },
});
