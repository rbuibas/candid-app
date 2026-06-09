import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { queryErrorText } from '@/api/errors';
import { patchProfileMe } from '@/api/profile';

import { useSession } from './SessionProvider';
import { useProfileMe } from './useProfileMe';

const MAX_LEN = 40;

/**
 * Onboarding "set a display name" step (docs/02 §onboarding step 4), the piece
 * that was missing — without it `profiles.display_name` stays null and every
 * post/member shows "Anonymous" (#13).
 *
 * Mounts behind the auth gate (inside (app)/_layout) and mirrors
 * NotificationsGate: renders {children} plus a full-screen, non-dismissable
 * modal while the user has no name. Fail-open — we only block once the profile
 * has actually loaded and reports an empty name, so a slow/offline profile
 * fetch never bricks the app.
 */
export function NameGate({ children }: { children: ReactNode }) {
  const profileQ = useProfileMe();
  const needsName = profileQ.data != null && (profileQ.data.display_name ?? '').trim() === '';

  return (
    <>
      {children}
      {needsName ? <NameModal /> : null}
    </>
  );
}

function NameModal() {
  const { session } = useSession();
  const qc = useQueryClient();
  // Prefill with the email's local-part as a friendly starting point; the user
  // still has to confirm with Save.
  const emailLocal = session?.user.email?.split('@')[0] ?? '';
  const [name, setName] = useState(emailLocal);

  const saveM = useMutation({
    mutationFn: (displayName: string) => patchProfileMe({ display_name: displayName }),
    onSuccess: () => {
      // Hides this modal (profile now has a name) and refreshes anything that
      // embeds the author/member name — feeds and member lists both live under
      // the ['groups', ...] prefix.
      qc.invalidateQueries({ queryKey: ['profile', 'me'] });
      qc.invalidateQueries({ queryKey: ['groups'] });
    },
  });

  const trimmed = name.trim();
  const canSave = trimmed.length > 0 && !saveM.isPending;

  return (
    <Modal visible animationType="fade" transparent={false} statusBarTranslucent>
      <SafeAreaView style={styles.safe}>
        <View style={styles.body}>
          <Text style={styles.title}>What&apos;s your name?</Text>
          <Text style={styles.copy}>
            This is how you&apos;ll show up on your photos in the group.
          </Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Your name"
            placeholderTextColor="#9aa3ab"
            autoFocus
            autoCapitalize="words"
            autoCorrect={false}
            maxLength={MAX_LEN}
            editable={!saveM.isPending}
            returnKeyType="done"
            onSubmitEditing={() => {
              if (canSave) saveM.mutate(trimmed);
            }}
            style={styles.input}
          />
          <Pressable
            onPress={() => saveM.mutate(trimmed)}
            disabled={!canSave}
            style={({ pressed }) => [
              styles.primaryBtn,
              pressed && styles.pressed,
              !canSave && styles.disabled,
            ]}
          >
            {saveM.isPending ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryBtnText}>Save</Text>
            )}
          </Pressable>
          {saveM.isError ? (
            <Text style={styles.error}>{queryErrorText(saveM.error)}</Text>
          ) : null}
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  body: { flex: 1, justifyContent: 'center', padding: 24, gap: 16 },
  title: { fontSize: 28, fontWeight: '700', color: '#1f2328' },
  copy: { fontSize: 16, color: '#656d76', lineHeight: 24 },
  input: {
    borderWidth: 1,
    borderColor: '#d0d7de',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    color: '#1f2328',
  },
  primaryBtn: {
    backgroundColor: '#1f2328',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  primaryBtnText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  pressed: { opacity: 0.7 },
  disabled: { opacity: 0.5 },
  error: { color: '#cf222e', fontSize: 14 },
});
