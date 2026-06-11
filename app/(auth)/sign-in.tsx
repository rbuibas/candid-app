import * as Linking from 'expo-linking';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getSupabase } from '@/auth/supabase';

type SignInState =
  | { kind: 'idle' }
  | { kind: 'sending' }
  | { kind: 'sent'; email: string }
  | { kind: 'error'; message: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function SignIn() {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<SignInState>({ kind: 'idle' });

  const onSend = async () => {
    const trimmed = email.trim();
    if (!EMAIL_RE.test(trimmed)) {
      setState({ kind: 'error', message: 'Enter a valid email address.' });
      return;
    }

    setState({ kind: 'sending' });
    try {
      const { error } = await getSupabase().auth.signInWithOtp({
        email: trimmed,
        options: { emailRedirectTo: Linking.createURL('/') },
      });
      if (error) {
        setState({ kind: 'error', message: error.message });
        return;
      }
      setState({ kind: 'sent', email: trimmed });
    } catch (err) {
      setState({
        kind: 'error',
        message: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  };

  const reset = () => {
    setState({ kind: 'idle' });
    setEmail('');
  };

  return (
    <SafeAreaView style={styles.safe} testID="signin-screen">
      <View style={styles.container}>
        <Text style={styles.title}>Candid</Text>
        <Text style={styles.subtitle}>Sign in with a magic link</Text>

        {state.kind === 'sent' ? (
          <View style={styles.block}>
            <Text style={styles.sentMessage}>
              Link sent to <Text style={styles.bold}>{state.email}</Text>. Open the email on this
              device and tap the link to finish signing in.
            </Text>
            <Pressable
              onPress={reset}
              style={({ pressed }) => [styles.linkBtn, pressed && styles.pressed]}
            >
              <Text style={styles.linkBtnText}>Use a different email</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.block}>
            <TextInput
              testID="signin-email-input"
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              placeholderTextColor="#9aa3ab"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              editable={state.kind !== 'sending'}
              style={styles.input}
            />
            <Pressable
              testID="signin-send"
              onPress={onSend}
              disabled={state.kind === 'sending'}
              style={({ pressed }) => [
                styles.primaryBtn,
                pressed && styles.pressed,
                state.kind === 'sending' && styles.disabled,
              ]}
            >
              {state.kind === 'sending' ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryBtnText}>Send magic link</Text>
              )}
            </Pressable>
            {state.kind === 'error' ? <Text style={styles.error}>{state.message}</Text> : null}
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  container: {
    flex: 1,
    padding: 24,
    gap: 24,
    justifyContent: 'center',
  },
  title: { fontSize: 32, fontWeight: '700', textAlign: 'center' },
  subtitle: {
    fontSize: 14,
    color: '#656d76',
    textAlign: 'center',
    marginTop: -16,
  },
  block: { gap: 12 },
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
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryBtnText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  pressed: { opacity: 0.7 },
  disabled: { opacity: 0.5 },
  error: { color: '#cf222e', fontSize: 14 },
  sentMessage: { fontSize: 16, lineHeight: 22, color: '#1f2328' },
  bold: { fontWeight: '600' },
  linkBtn: { paddingVertical: 8, alignSelf: 'flex-start' },
  linkBtnText: { color: '#0969da', fontSize: 14, fontWeight: '500' },
});
