import { authedRequest } from '@/api/client';

import { recordClientEvent } from './events';

// Mock the auth/transport layer so the test asserts the request shape without
// touching Supabase/fetch. babel-jest hoists this above the imports above.
jest.mock('@/api/client', () => ({ authedRequest: jest.fn() }));

const mockAuthed = authedRequest as jest.Mock;

function lastBody(): Record<string, unknown> {
  const init = mockAuthed.mock.calls[0][1] as RequestInit;
  return JSON.parse(init.body as string);
}

describe('recordClientEvent', () => {
  it('POSTs to /events and defaults payload to {}', async () => {
    mockAuthed.mockResolvedValue({ id: 'evt-1' });

    await recordClientEvent({ group_id: 'g1', name: 'feed_opened' });

    expect(mockAuthed).toHaveBeenCalledTimes(1);
    expect(mockAuthed.mock.calls[0][0]).toBe('/events');
    const init = mockAuthed.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe('POST');
    expect(lastBody()).toEqual({ payload: {}, group_id: 'g1', name: 'feed_opened' });
  });

  it('passes an explicit payload through verbatim', async () => {
    mockAuthed.mockResolvedValue({ id: 'evt-2' });

    await recordClientEvent({
      group_id: 'g1',
      name: 'feed_opened',
      payload: { source: 'standalone' },
    });

    expect(lastBody().payload).toEqual({ source: 'standalone' });
  });
});
