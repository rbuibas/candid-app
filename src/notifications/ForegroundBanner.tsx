import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useForegroundPush } from './ForegroundPushContext';

/**
 * Mounted once at the (app) layout. Renders a tappable top banner when a
 * push lands while the app is in the foreground (RN Firebase suppresses the
 * tray notification in that case). Tap routes to the active-prompt screen;
 * X dismisses.
 *
 * Absolutely positioned so it floats above route content without disturbing
 * any screen's layout.
 */
export function ForegroundBanner() {
  const { current, dismiss } = useForegroundPush();
  const router = useRouter();
  if (!current) return null;

  const onTap = () => {
    router.push({
      pathname: '/(app)/groups/[id]/prompts/[promptId]',
      params: { id: current.group_id, promptId: current.prompt_id },
    });
    dismiss();
  };

  return (
    <SafeAreaView style={styles.wrap} edges={['top']} pointerEvents="box-none">
      <Pressable
        onPress={onTap}
        style={({ pressed }) => [styles.banner, pressed && styles.pressed]}
      >
        <View style={styles.copy}>
          <Text style={styles.title}>Time to capture</Text>
          <Text style={styles.body}>Tap to open the prompt.</Text>
        </View>
        <Pressable onPress={dismiss} hitSlop={12} style={styles.dismiss}>
          <Text style={styles.dismissText}>✕</Text>
        </Pressable>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1000,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#1f2328',
    marginHorizontal: 12,
    marginTop: 8,
    padding: 12,
    borderRadius: 10,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  copy: { flex: 1 },
  title: { color: '#fff', fontWeight: '700', fontSize: 15 },
  body: { color: '#d0d7de', fontSize: 13, marginTop: 2 },
  dismiss: { paddingHorizontal: 6, paddingVertical: 4 },
  dismissText: { color: '#d0d7de', fontSize: 18, fontWeight: '600' },
  pressed: { opacity: 0.85 },
});
