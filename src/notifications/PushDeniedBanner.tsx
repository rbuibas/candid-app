import { Pressable, StyleSheet, Text, View } from 'react-native';

import { usePushPermission } from './permissions';

/**
 * Persistent denial banner — rendered inline on the groups list and the
 * group detail header. CLAUDE.md non-negotiable #5: a missing/denied push
 * permission MUST be surfaced; the prompt loop is load-bearing and silent
 * failure here is a defect.
 *
 * Returns null unless status === 'denied'. usePushPermission re-reads the
 * status on every AppState 'active' transition, so the banner disappears
 * the moment the user grants in system settings and tabs back.
 */
export function PushDeniedBanner() {
  const { status, openSettings } = usePushPermission();
  if (status !== 'denied') return null;
  return (
    <View style={styles.banner}>
      <View style={styles.copy}>
        <Text style={styles.title}>Notifications are off</Text>
        <Text style={styles.body}>You won&apos;t get prompts when it&apos;s time to capture.</Text>
      </View>
      <Pressable
        onPress={openSettings}
        style={({ pressed }) => [styles.cta, pressed && styles.pressed]}
      >
        <Text style={styles.ctaText}>Enable</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#fff8c5',
    borderColor: '#d4a72c',
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginHorizontal: 16,
    marginTop: 12,
  },
  copy: { flex: 1 },
  title: { fontSize: 14, fontWeight: '700', color: '#633c01' },
  body: { fontSize: 13, color: '#633c01', marginTop: 2 },
  cta: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: '#1f2328',
    borderRadius: 6,
  },
  ctaText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  pressed: { opacity: 0.7 },
});
