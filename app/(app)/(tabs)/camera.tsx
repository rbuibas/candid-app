import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useActiveGroupStore } from '@/stores/activeGroup';

/**
 * Camera tab fallback. The tab bar press is intercepted in (tabs)/_layout to
 * open the capture screen directly, so this screen is normally never shown —
 * it only renders if the route is reached some other way (e.g. a deep link).
 * It just re-opens the camera for the active group.
 *
 * The contextual capture button (original vs. late vs. voluntary) is E2; this
 * opens the existing capture screen as-is.
 */
export default function CameraTab() {
  const router = useRouter();
  const groupId = useActiveGroupStore((s) => s.activeGroupId);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.body}>
        <Text style={styles.title}>Camera</Text>
        <Pressable
          onPress={() => {
            if (groupId) {
              router.push({ pathname: '/(app)/groups/[id]/capture', params: { id: groupId } });
            }
          }}
          style={({ pressed }) => [styles.primaryBtn, pressed && styles.pressed]}
        >
          <Text style={styles.primaryBtnText}>Open camera</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16 },
  title: { fontSize: 22, fontWeight: '700', color: '#1f2328' },
  primaryBtn: {
    backgroundColor: '#1f2328',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignItems: 'center',
  },
  primaryBtnText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  pressed: { opacity: 0.7 },
});
