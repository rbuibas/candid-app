/**
 * Pure date helpers for the groups surface. No date library — we already use
 * Intl.DateTimeFormat elsewhere (see src/auth/useTimezoneSync.ts).
 */

function parseISODate(iso: string): Date {
  // start_date / end_date come from the backend as YYYY-MM-DD. Parsing them
  // with `new Date(iso)` would interpret as UTC midnight; we want a stable
  // local-date display, so split and construct.
  const [y, m, d] = iso.split('-').map((part) => Number.parseInt(part, 10));
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

const SHORT_DATE = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
});

const SHORT_DATE_WITH_YEAR = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

const JOINED_DATE = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
});

export function formatDateRange(startISO: string, endISO: string): string {
  const start = parseISODate(startISO);
  const end = parseISODate(endISO);
  if (start.getFullYear() === end.getFullYear()) {
    return `${SHORT_DATE.format(start)} – ${SHORT_DATE_WITH_YEAR.format(end)}`;
  }
  return `${SHORT_DATE_WITH_YEAR.format(start)} – ${SHORT_DATE_WITH_YEAR.format(end)}`;
}

export function formatJoinedDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `joined ${JOINED_DATE.format(d)}`;
}
