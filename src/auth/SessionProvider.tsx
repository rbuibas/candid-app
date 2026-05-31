import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

import { unregisterThisDevice } from '@/notifications/fcm';

import { getSupabase } from './supabase';

type SessionState =
  | { status: 'loading'; session: null }
  | { status: 'authenticated'; session: Session }
  | { status: 'unauthenticated'; session: null };

type SessionContextValue = SessionState & {
  signOut: () => Promise<void>;
};

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>({ status: 'loading', session: null });

  useEffect(() => {
    const sb = getSupabase();
    let cancelled = false;

    // Initial load — restores any session that's been persisted to SecureStore.
    sb.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setState(
        data.session
          ? { status: 'authenticated', session: data.session }
          : { status: 'unauthenticated', session: null },
      );
    });

    // Live updates: sign-in via deep link, sign-out, token refresh, etc.
    const { data: sub } = sb.auth.onAuthStateChange((_event, session) => {
      setState(
        session
          ? { status: 'authenticated', session }
          : { status: 'unauthenticated', session: null },
      );
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  const signOut = useCallback(async () => {
    console.log('[auth] signOut tapped');
    // Fire-and-forget: tell the backend to forget this device's FCM token.
    // We must NOT await it — messaging().getToken() can hang on devices
    // where FCM never registered successfully (e.g. push denied), and the
    // sign-out button would silently do nothing. Best-effort cleanup is
    // fine; a stale device row gets reclaimed on the next sign-in.
    void unregisterThisDevice();
    try {
      // scope:'local' clears the cached session WITHOUT trying to hit the
      // server to revoke it. The server hop can hang on flaky networks or a
      // sleeping/unreachable API, leaving the button visually inert; local
      // clearing always succeeds and the auth-state listener flips on the
      // next tick.
      const { error } = await getSupabase().auth.signOut({ scope: 'local' });
      if (error) console.warn('[auth] signOut error', error);
      else console.log('[auth] signOut done');
    } catch (err) {
      console.warn('[auth] signOut threw', err);
    }
  }, []);

  return (
    <SessionContext.Provider value={{ ...state, signOut }}>{children}</SessionContext.Provider>
  );
}

export function useSession(): SessionContextValue {
  const value = useContext(SessionContext);
  if (!value) {
    throw new Error('useSession() must be called inside a <SessionProvider>');
  }
  return value;
}
