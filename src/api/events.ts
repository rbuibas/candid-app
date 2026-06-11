import { authedRequest } from './client';

/**
 * Mirrors candid-api/src/app/models/event.py — the small, group-scoped client
 * events from candid-measurement-and-debrief §3. `payload` shape is per-event:
 * `feed_opened` carries `{ source: 'standalone' | 'in-flow' }` (the "in-flow"
 * value is wired in E2).
 */
export type ClientEventName = 'feed_opened';

export type RecordClientEventInput = {
  group_id: string;
  name: ClientEventName;
  payload?: Record<string, unknown>;
};

export type ClientEvent = {
  id: string;
  group_id: string;
  user_id: string;
  name: string;
  payload: Record<string, unknown>;
  created_at: string;
};

/**
 * POST /events — record one client event. Group-scoped, EU-resident, no PII
 * beyond the group/user the product already holds; no third-party SDK.
 */
export function recordClientEvent(input: RecordClientEventInput): Promise<ClientEvent> {
  return authedRequest<ClientEvent>('/events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ payload: {}, ...input }),
  });
}
