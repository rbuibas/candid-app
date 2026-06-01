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
    void unregisterThisDevice();
    try {
      // scope:'local' avoids revoking other devices' sessions but still
      // hits the Supabase server to revoke this device's refresh token.
      // If that call fails with a non-404/401/403 error (network hiccup,
      // server error), the Supabase client returns early WITHOUT clearing
      // local storage or firing onAuthStateChange — so we call setState
      // explicitly below as a safety net.
      await getSupabase().auth.signOut({ scope: 'local' });
    } catch {
      // best-effort
    }
    // Belt-and-suspenders: onAuthStateChange fires in the success path, but
    // a server error leaves state stale. This setState is a no-op if
    // onAuthStateChange already fired; it's the real sign-out if it didn't.
    setState({ status: 'unauthenticated', session: null });
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
