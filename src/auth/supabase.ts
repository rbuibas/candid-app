import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';

import { SUPABASE_ANON_KEY, SUPABASE_URL } from '@/config';

// Created in Phase 0 but unused. Phase 1 wires up magic-link auth via
// `getSupabase().auth.signInWithOtp(...)`.

const SecureStoreAdapter = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

let _client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (_client) return _client;

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error(
      'Supabase env vars missing. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in .env.',
    );
  }

  _client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      storage: SecureStoreAdapter,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  });

  return _client;
}
