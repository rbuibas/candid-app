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
  return request<T>(path, {
    ...init,
    headers: {
      ...init?.headers,
      Authorization: `Bearer ${token}`,
    },
  });
}

/**
 * Authed request for endpoints that return 204 No Content (or otherwise have no
 * JSON body). Skips the `res.json()` parse that `request` performs unconditionally.
 */
export async function authedRequestNoContent(path: string, init?: RequestInit): Promise<void> {
  if (!path.startsWith('/')) {
    throw new Error(`API path must start with "/": got "${path}"`);
  }
  const { data } = await getSupabase().auth.getSession();
  const token = data.session?.access_token;
  if (!token) {
    throw new ApiError(401, 'Unauthorized', 'No active session');
  }
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...init?.headers,
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new ApiError(res.status, res.statusText, body);
  }
}
