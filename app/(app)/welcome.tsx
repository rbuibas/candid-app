import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useSession } from '@/auth/SessionProvider';

/**
 * Create-or-join landing (candid-requirements §3): a user must have an active
 * group, so when they belong to none the (tabs) guard routes here. Standalone
 * (no tab bar) so an empty feed is never reachable. Sign-out is offered too,
 * since this is otherwise a dead-end for a brand-new account.
 *
 * Create / join set the active group and land on the Feed tab (see those
 * screens), at which point the guard lets the tabs render.
 */
export default function Welcome() {
  const router = useRouter();
  const { signOut } = useSession();

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.body}>
        <View style={styles.intro}>
          <Text style={styles.title}>Welcome to Candid</Text>
          <Text style={styles.copy}>
            Candid is built around a group. Create one for your event, or join an existing group
            with an invite code.
          </Text>
        </View>

        <View style={styles.ctas}>
          <Pressable
            onPress={() => router.push('/(app)/groups/create')}
            style={({ pressed }) => [styles.primaryBtn, pressed && styles.pressed]}
          >
            <Text style={styles.primaryBtnText}>Create a group</Text>
          </Pressable>
          <Pressable
            onPress={() => router.push('/(app)/groups/join')}
            style={({ pressed }) => [styles.outlineBtn, pressed && styles.pressed]}
          >
            <Text style={styles.outlineBtnText}>Join with code</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.footer}>
        <Pressable
          onPress={() => {
            void signOut();
          }}
          style={({ pressed }) => [styles.signOutBtn, pressed && styles.pressed]}
        >
          <Text style={styles.signOutBtnText}>Sign out</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  body: { flex: 1, padding: 24, justifyContent: 'center', gap: 40 },
  intro: { gap: 12 },
  title: { fontSize: 28, fontWeight: '700', color: '#1f2328' },
  copy: { fontSize: 16, color: '#656d76', lineHeight: 24 },
  ctas: { gap: 12 },
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
  footer: { padding: 16, alignItems: 'center' },
  signOutBtn: { paddingVertical: 12 },
  signOutBtnText: { color: '#cf222e', fontWeight: '600', fontSize: 15 },
  pressed: { opacity: 0.7 },
});
