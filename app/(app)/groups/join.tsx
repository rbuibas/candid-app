import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ApiError } from '@/api/client';
import { joinGroup } from '@/api/groups';

const CODE_RE = /^[A-Z0-9]{6}$/;

export default function JoinGroup() {
  const router = useRouter();
  const qc = useQueryClient();
  const [code, setCode] = useState('');

  const mutation = useMutation({
    mutationFn: (c: string) => joinGroup(c),
    onSuccess: (group) => {
      qc.setQueryData(['groups', group.id], group);
      qc.invalidateQueries({ queryKey: ['groups'] });
      qc.invalidateQueries({ queryKey: ['groups', group.id, 'members'] });
      router.replace({ pathname: '/(app)/groups/[id]', params: { id: group.id } });
    },
  });

  const canSubmit = CODE_RE.test(code) && !mutation.isPending;

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <Stack.Screen options={{ title: 'Join group' }} />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.content}>
          <Text style={styles.help}>
            Enter the 6-character invite code your friend shared with you.
          </Text>

          <TextInput
            value={code}
            onChangeText={(v) => setCode(v.toUpperCase())}
            placeholder="ABC123"
            style={styles.input}
            autoCapitalize="characters"
            autoCorrect={false}
            autoComplete="off"
            maxLength={6}
            keyboardType="default"
          />

          {mutation.isError ? (
            <Text style={styles.error}>
              {mutation.error instanceof ApiError
                ? `${mutation.error.status}: ${mutation.error.body || mutation.error.message}`
                : 'Network error joining group'}
            </Text>
          ) : null}
        </View>

        <View style={styles.footer}>
          <Pressable
            onPress={() => mutation.mutate(code)}
            disabled={!canSubmit}
            style={({ pressed }) => [
              styles.primaryBtn,
              !canSubmit && styles.disabled,
              pressed && styles.pressed,
            ]}
          >
            {mutation.isPending ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryBtnText}>Join group</Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  flex: { flex: 1 },
  content: { padding: 20, gap: 16 },
  help: { fontSize: 14, color: '#656d76' },
  input: {
    borderWidth: 1,
    borderColor: '#d0d7de',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 24,
    color: '#1f2328',
    backgroundColor: '#fff',
    letterSpacing: 6,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  error: { color: '#cf222e', fontSize: 14 },
  footer: {
    padding: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#d0d7de',
  },
  primaryBtn: {
    backgroundColor: '#1f2328',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  primaryBtnText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  disabled: { opacity: 0.4 },
  pressed: { opacity: 0.7 },
});
