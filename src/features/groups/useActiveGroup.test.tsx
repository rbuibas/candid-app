import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import React from 'react';

import { listGroups, type GroupWithLifecycle } from '@/api/groups';
import { useActiveGroupStore } from '@/stores/activeGroup';

import { useActiveGroup } from './useActiveGroup';

// Mock only the network call; the store + resolver + react-query run for real.
// babel-jest hoists this above the imports above.
jest.mock('@/api/groups', () => ({ listGroups: jest.fn() }));

const mockList = listGroups as jest.Mock;

function group(id: string, createdAt: string): GroupWithLifecycle {
  return { id, created_at: createdAt } as GroupWithLifecycle;
}

const A = group('a', '2026-06-01T00:00:00Z');
const B = group('b', '2026-06-02T00:00:00Z');

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  };
}

beforeEach(() => {
  // Force a hydrated store so we exercise resolution, not the hydration wait.
  useActiveGroupStore.setState({ activeGroupId: null, recency: [], hydrated: true });
});

describe('useActiveGroup', () => {
  it('resolves to the persisted active group when it is still a member group', async () => {
    useActiveGroupStore.setState({ activeGroupId: 'b' });
    mockList.mockResolvedValue([A, B]);

    const { result } = renderHook(() => useActiveGroup(), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current).toMatchObject({ status: 'ready', groupId: 'b' });
  });

  it('reports "empty" when the user belongs to no groups', async () => {
    mockList.mockResolvedValue([]);

    const { result } = renderHook(() => useActiveGroup(), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.status).toBe('empty'));
  });

  it('falls back to a recency group when the persisted id is gone, and persists it', async () => {
    useActiveGroupStore.setState({ activeGroupId: 'gone', recency: ['b'] });
    mockList.mockResolvedValue([A, B]);

    const { result } = renderHook(() => useActiveGroup(), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current).toMatchObject({ status: 'ready', groupId: 'b' });
    // The resolved fallback is written back so relaunch restores it.
    await waitFor(() => expect(useActiveGroupStore.getState().activeGroupId).toBe('b'));
  });
});
