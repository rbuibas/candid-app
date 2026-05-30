/**
 * Module-level singleton for a queued deep-link invite code.
 *
 * Survives the (auth) ↔ (app) <Redirect> flips (modules outlive component
 * unmounts) but dies with the JS context on cold start — which is correct:
 * stale codes from a previous launch should not auto-fire.
 *
 * Lives outside React state because the queue must be readable across the
 * sign-in transition without re-rendering anything.
 */

let pending: string | null = null;

export function setPendingInvite(code: string): void {
  pending = code.toUpperCase();
}

export function getPendingInvite(): string | null {
  return pending;
}

export function consumePendingInvite(): string | null {
  const code = pending;
  pending = null;
  return code;
}
