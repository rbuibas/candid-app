import { getSupabase } from '@/auth/supabase';
import { API_URL } from '@/config';

export class ApiError extends Error {
  readonly status: number;
  readonly body: string;

  constructor(status: number, statusText: string, body: string) {
    super(`${status} ${statusText}`);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  if (!path.startsWith('/')) {
    throw new Error(`API path must start with "/": got "${path}"`);
  }

  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...init?.headers,
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new ApiError(res.status, res.statusText, body);
  }

  return (await res.json()) as T;
}

/**
 * Same as `request`, but attaches `Authorization: Bearer <jwt>` from the current
 * Supabase session. Throws ApiError(401, ...) if no session is available — caller
 * should let it propagate so React Query surfaces it like any other auth failure.
 */
export async function authedRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const { data } = await getSupabase().auth.getSession();
  const token = data.session?.access_token;
  if (!token) {
    throw new ApiError(401, 'Unauthorized', 'No active session');
  }
  // TEMP DIAGNOSTIC: log the JWT header so we can see the `alg` (HS256 vs RS256).
  // Remove after Phase 1 debug.
  try {
    const headerB64 = token.split('.')[0];
    const padded = headerB64.replace(/-/g, '+').replace(/_/g, '/');
    const json =
      typeof atob === 'function'
        ? atob(padded + '='.repeat((4 - (padded.length % 4)) % 4))
        : Buffer.from(padded, 'base64').toString('utf8');
    // eslint-disable-next-line no-console
    console.log('[authedRequest] JWT header:', json, '| path:', path);
  } catch {
    // ignore
  }
  return request<T>(path, {
    ...init,
    headers: {
      ...init?.headers,
      Authorization: `Bearer ${token}`,
    },
  });
}
