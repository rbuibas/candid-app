import { clearActiveGroup, setActiveGroup, useActiveGroupStore } from './activeGroup';

beforeEach(() => {
  // Reset the singleton store between tests (persist hydration is irrelevant
  // here — we drive the actions directly).
  useActiveGroupStore.setState({ activeGroupId: null, recency: [] });
});

describe('activeGroup store', () => {
  it('setActiveGroup sets the id and pushes it to the front of recency', () => {
    setActiveGroup('a');
    setActiveGroup('b');
    const s = useActiveGroupStore.getState();
    expect(s.activeGroupId).toBe('b');
    expect(s.recency).toEqual(['b', 'a']);
  });

  it('re-activating a known group moves it to the front without duplicating it', () => {
    setActiveGroup('a');
    setActiveGroup('b');
    setActiveGroup('a');
    const s = useActiveGroupStore.getState();
    expect(s.activeGroupId).toBe('a');
    expect(s.recency).toEqual(['a', 'b']);
  });

  it('caps recency at 20 entries, keeping the most recent', () => {
    for (let i = 0; i < 30; i += 1) setActiveGroup(`g${i}`);
    const s = useActiveGroupStore.getState();
    expect(s.recency).toHaveLength(20);
    expect(s.recency[0]).toBe('g29');
    expect(s.recency).not.toContain('g9'); // evicted
  });

  it('clearActiveGroup nulls the active id but keeps recency for the fallback', () => {
    setActiveGroup('a');
    clearActiveGroup();
    const s = useActiveGroupStore.getState();
    expect(s.activeGroupId).toBeNull();
    expect(s.recency).toEqual(['a']);
  });
});
