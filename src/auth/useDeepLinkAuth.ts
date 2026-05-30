import * as Linking from 'expo-linking';
import { useEffect } from 'react';

import { getSupabase } from './supabase';

/**
 * Parses a magic-link callback URL's hash fragment for Supabase tokens.
 * Supabase returns its tokens as URL fragment params, not query params:
 *   candid:///#access_token=...&refresh_token=...&expires_in=...&token_type=bearer
 * Returns null for any URL that doesn't carry both tokens.
 */
export function parseHashTokens(
  url: string,
): { access_token: string; refresh_token: string } | null {
  const hash = url.split('#')[1];
  if (!hash) return null;
  const params = new URLSearchParams(hash);
  const access_token = params.get('access_token');
  const refresh_token = params.get('refresh_token');
  return access_token && refresh_token ? { access_token, refresh_token } : null;
}

/**
 * Hook: receive any incoming deep link, extract Supabase tokens from its hash,
 * and hand them to supabase.auth.setSession. The auth state listener in
 * SessionProvider does the rest.
 *
 * Handles both:
 * - cold start: the URL that launched the app (Linking.getInitialURL)
 * - warm: URLs received while the app is already running (addEventListener)
 *
 * Must be called once near the root of the tree, after SessionProvider is mounted.
 */
export function useDeepLinkAuth(): void {
  useEffect(() => {
    const handle = (url: string | null) => {
      if (!url) return;
      const tokens = parseHashTokens(url);
      if (!tokens) return;
      // Fire-and-forget — onAuthStateChange will flip the session for us.
      void getSupabase().auth.setSession(tokens);
    };

    Linking.getInitialURL().then(handle);
    const sub = Linking.addEventListener('url', ({ url }) => handle(url));
    return () => sub.remove();
  }, []);
}
