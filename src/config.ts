const apiUrl = process.env.EXPO_PUBLIC_API_URL;

if (!apiUrl) {
  throw new Error(
    'EXPO_PUBLIC_API_URL is not set. Copy .env.example to .env and fill it in before starting the app.',
  );
}

export const API_URL: string = apiUrl;

export const SUPABASE_URL: string | undefined = process.env.EXPO_PUBLIC_SUPABASE_URL;
export const SUPABASE_ANON_KEY: string | undefined = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
