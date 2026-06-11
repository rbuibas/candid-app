import type { GroupWithLifecycle } from '@/api/groups';

import { resolveActiveGroup } from './resolveActiveGroup';

/** Minimal group fixture — resolveActiveGroup only reads `id` + `created_at`. */
function group(id: string, createdAt: string): GroupWithLifecycle {
  return { id, created_at: createdAt } as GroupWithLifecycle;
}

const A = group('a', '2026-06-01T00:00:00Z');
const B = group('b', '2026-06-02T00:00:00Z');
const C = group('c', '2026-06-03T00:00:00Z'); // newest

describe('resolveActiveGroup', () => {
  it('returns undefined when there are no groups', () => {
    expect(resolveActiveGroup([], 'a', ['a'])).toBeUndefined();
  });

  it('keeps the persisted active group when it is still a member group', () => {
    expect(resolveActiveGroup([A, B, C], 'b', [])?.id).toBe('b');
  });

  it('falls back to the most recently activated group when the persisted one is gone', () => {
    // 'x' was active but is no longer in the list; recency says b was used most
    // recently of the survivors, before a.
    expect(resolveActiveGroup([A, B], 'x', ['x', 'b', 'a'])?.id).toBe('b');
  });

  it('ignores recency entries that are no longer member groups', () => {
    // 'gone' is first in recency but not in the list; 'a' is the first survivor.
    expect(resolveActiveGroup([A, B], null, ['gone', 'a', 'b'])?.id).toBe('a');
  });

  it('falls back to the newest-created group when there is no usable recency', () => {
    // No active id, empty recency → newest created (C) wins regardless of order.
    expect(resolveActiveGroup([A, C, B], null, [])?.id).toBe('c');
  });

  it('prefers a valid persisted id over recency and recency over the newest proxy', () => {
    // Persisted 'a' is valid → wins even though C is newer and b is in recency.
    expect(resolveActiveGroup([A, B, C], 'a', ['b'])?.id).toBe('a');
    // Persisted invalid → recency 'b' wins over newest C.
    expect(resolveActiveGroup([A, B, C], 'zzz', ['b'])?.id).toBe('b');
  });
});
