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
