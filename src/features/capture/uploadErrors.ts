import { ApiError } from '@/api/client';

/**
 * Error classifiers for the capture/upload pipeline, shared by the live screen
 * and the offline-queue flusher so both react to the same server contract.
 *
 * The transport layer (src/api/client.ts) only throws `ApiError` on an HTTP
 * `!res.ok`; a true network failure (no signal, dropped connection) surfaces as
 * a plain `TypeError` from `fetch`. That distinction is exactly what tells a
 * "queue and retry later" case apart from a terminal server rejection.
 */

/**
 * 409 with the backend's specific `{ "error": "group_locked" }` body — a
 * capture raced past the group's `end_date` lock (contract addendum). Terminal:
 * the event is over, so drop the capture rather than retry.
 */
export function isGroupLockedError(err: unknown): boolean {
  return err instanceof ApiError && err.status === 409 && err.body.includes('group_locked');
}

/**
 * 410 Gone — the prompt's window closed (late_deadline passed) while the
 * capture sat offline. Terminal "you missed this one"; not retryable.
 */
export function isMissedError(err: unknown): boolean {
  return err instanceof ApiError && err.status === 410;
}

/**
 * Worth keeping queued for a later retry: any non-HTTP failure (transport/
 * network — not an `ApiError`), a 5xx server hiccup, or a 401 (an expired/
 * not-yet-ready session that token refresh will fix — never drop a capture
 * over it). Everything else (4xx other than the terminal cases above) won't
 * improve on retry.
 */
export function isRetryable(err: unknown): boolean {
  if (err instanceof ApiError) return err.status >= 500 || err.status === 401;
  return true;
}

/** Compact human-readable message for surfacing/logging a pipeline error. */
export function describeError(err: unknown): string {
  if (err instanceof ApiError) return `${err.status}: ${err.body || err.message}`;
  if (err instanceof Error) return err.message;
  return 'Unknown error';
}
