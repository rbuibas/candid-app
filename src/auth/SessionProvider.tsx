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
    // Best-effort: tell the backend to forget this device's FCM token before
    // we lose the JWT. Swallowed inside unregisterThisDevice so a network
    // blip can't wedge the sign-out flow.
    await unregisterThisDevice();
    await getSupabase().auth.signOut();
    // Auth-state listener above will flip status to 'unauthenticated'.
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
