import { ApiError } from './client';

/**
 * UI-facing error helpers shared by every data screen so offline handling is
 * consistent (and we stop reinventing a slightly-different "Network error"
 * block per screen).
 *
 * The transport layer (src/api/client.ts) only throws `ApiError` on an HTTP
 * `!res.ok` response. A true network failure — airplane mode, dropped
 * connection, unreachable host — surfaces as a plain `TypeError` from `fetch`,
 * never as an `ApiError`. So "not an ApiError" is a reliable "we never reached
 * the server" signal. (Same distinction `isRetryable` relies on in
 * features/capture/uploadErrors.ts.)
 */

/** True when the request never reached the server (offline / transport failure). */
export function isOfflineError(err: unknown): boolean {
  return !(err instanceof ApiError);
}

/**
 * One-line, human-facing message for a failed query or mutation. Offline
 * failures get a calm, actionable line instead of a raw stack/`TypeError`;
 * a real server response keeps its status + body so a genuine 4xx/5xx stays
 * diagnosable (and isn't mislabeled a "network error").
 */
export function queryErrorText(err: unknown): string {
  if (err instanceof ApiError) {
    return `${err.status}: ${err.body || err.message}`;
  }
  return "You're offline. Check your connection and try again.";
}
