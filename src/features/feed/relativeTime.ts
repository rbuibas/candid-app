/**
 * Compact relative timestamp for feed posts: "now", "5m ago", "2h ago",
 * "3d ago", falling back to a short calendar date beyond a week. Pure, no date
 * library — same Intl approach as src/features/groups/lifecycle.ts.
 */

const SHORT_DATE = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
});

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

export function relativeTime(iso: string, now: number = Date.now()): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';

  const diff = now - then;
  // Clamp small negatives (minor client/server clock skew) to "now".
  if (diff < MINUTE) return 'now';
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)}m ago`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)}h ago`;
  if (diff < WEEK) return `${Math.floor(diff / DAY)}d ago`;
  return SHORT_DATE.format(then);
}
