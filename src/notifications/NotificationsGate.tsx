import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useActivePromptHydration } from '@/features/prompt/useActivePromptHydration';

import { registerThisDevice, subscribeTokenRefresh } from './fcm';
import { usePushHandlers } from './handlers';
import { usePushPermission } from './permissions';
import { getPushPrimed, setPushPrimed } from './primedFlag';

/**
 * Sits inside (app)/_layout.tsx — only ever mounts behind the auth gate, so
 * the priming prompt never fires on the sign-in screen (keep auth flow
 * clean, per the Phase-4 brief).
 *
 * Responsibilities:
 *   1. Show the locked rationale modal on the first authed open we've ever
 *      had (tracked via a SecureStore flag — see primedFlag.ts for why we
 *      can't rely on OS status alone on Android).
 *   2. On grant (now or in the past), register the device's FCM token with
 *      the backend and subscribe to onTokenRefresh.
 *   3. Denial is intentionally not surfaced here — the persistent banner
 *      (PushDeniedBanner) owns that, mounted on the groups screens.
 */
export function NotificationsGate({ children }: { children: ReactNode }) {
  const { status, request } = usePushPermission();
  // 'checking' = haven't read the SecureStore flag yet; 'show' = first-ever
  // open, render the rationale; 'done' = already primed at least once.
  const [primedState, setPrimedState] = useState<'checking' | 'show' | 'done'>('checking');
  const registeredRef = useRef(false);

  // Wire FCM lifecycle handlers (foreground / background-tap / cold-start).
  // Safe to mount unconditionally — they're no-ops on a non-Firebase target
  // and harmless when permission is denied (no pushes will arrive).
  usePushHandlers();

  // Belt-and-braces for the push-killed-the-app case: on every authed mount
  // and foreground, check /prompts/active and route if anything actionable.
  useActivePromptHydration();

  // Resolve whether to show the rationale. Re-runs when status changes so we
  // can short-circuit if the OS already reports granted (e.g. user enabled
  // via system settings before we ever primed). The 'unknown' status is the
  // initial pre-read state — wait for the real read before deciding.
  useEffect(() => {
    if (status === 'unknown') return;
    let cancelled = false;
    void getPushPrimed().then((primed) => {
      if (cancelled) return;
      if (primed) {
        setPrimedState('done');
        return;
      }
      // No flag yet, but the OS already says granted — silently record and
      // skip the modal so we don't ask the user to enable a thing that's on.
      if (status === 'granted') {
        void setPushPrimed();
        setPrimedState('done');
        return;
      }
      setPrimedState('show');
    });
    return () => {
      cancelled = true;
    };
  }, [status]);

  // Once granted, register exactly once per app process and wire token-refresh.
  useEffect(() => {
    if (status !== 'granted' || registeredRef.current) return;
    registeredRef.current = true;
    void registerThisDevice().catch(() => {
      // Best-effort. If registration fails (network, etc.), foreground
      // recheck via AppState will re-trigger on next active transition
      // through the same effect since registeredRef stays true; we rely on
      // future token-refresh / next install for retry. Surfacing as a
      // user-visible error here would be more noise than signal.
    });
    const unsub = subscribeTokenRefresh();
    return unsub;
  }, [status]);

  const onAllow = async () => {
    // Persist BEFORE awaiting so a backgrounded OS prompt + re-mount doesn't
    // re-show the rationale.
    await setPushPrimed();
    setPrimedState('done');
    await request();
  };

  const showRationale = primedState === 'show';

  return (
    <>
      {children}
      <Modal visible={showRationale} animationType="fade" transparent={false} statusBarTranslucent>
        <SafeAreaView style={styles.safe}>
          <View style={styles.body}>
            <Text style={styles.title}>Turn on notifications</Text>
            <Text style={styles.copy}>
              Candid only works if we can buzz you when it&apos;s time to capture. One quick tap on
              the next screen.
            </Text>
            <Pressable
              onPress={onAllow}
              style={({ pressed }) => [styles.primaryBtn, pressed && styles.pressed]}
            >
              <Text style={styles.primaryBtnText}>OK</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  body: { flex: 1, justifyContent: 'center', padding: 24, gap: 16 },
  title: { fontSize: 28, fontWeight: '700', color: '#1f2328' },
  copy: { fontSize: 16, color: '#656d76', lineHeight: 24 },
  primaryBtn: {
    backgroundColor: '#1f2328',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  primaryBtnText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  pressed: { opacity: 0.7 },
});
