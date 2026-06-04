import { ApiError, authedRequest, authedRequestNoContent } from './client';
import type { PostWithMediaUrl } from './posts';

export type Lifecycle = 'upcoming' | 'active' | 'locked';

export type GroupWithLifecycle = {
  id: string;
  name: string;
  created_by: string;
  start_date: string;
  end_date: string;
  prompts_per_day: number;
  daily_window_start: string;
  daily_window_end: string;
  min_prompt_gap_minutes: number;
  response_window_seconds: number;
  late_window_seconds: number;
  max_video_length_seconds: number;
  view_delay_seconds: number;
  created_at: string;
  updated_at: string;
  lifecycle: Lifecycle;
  /**
   * ISO-8601 timestamp — when this group's media becomes eligible for purge
   * (`end_date` + RETENTION_DAYS, computed server-side; see candid-api
   * config.py). Drives the pre-expiry "save your media" nudge only; no purge
   * job exists yet.
   */
  retention_purge_at: string;
};

export type GroupSettingsInput = Partial<
  Pick<
    GroupWithLifecycle,
    | 'prompts_per_day'
    | 'daily_window_start'
    | 'daily_window_end'
    | 'min_prompt_gap_minutes'
    | 'response_window_seconds'
    | 'late_window_seconds'
    | 'max_video_length_seconds'
    | 'view_delay_seconds'
  >
>;

export type CreateGroupInput = {
  name: string;
  start_date: string;
  end_date: string;
  settings?: GroupSettingsInput;
};

export type CreateGroupResponse = {
  group: GroupWithLifecycle;
  invite_code: string;
};

export function listGroups(): Promise<GroupWithLifecycle[]> {
  return authedRequest<GroupWithLifecycle[]>('/groups');
}

export function getGroup(id: string): Promise<GroupWithLifecycle> {
  return authedRequest<GroupWithLifecycle>(`/groups/${id}`);
}

export function createGroup(body: CreateGroupInput): Promise<CreateGroupResponse> {
  return authedRequest<CreateGroupResponse>('/groups', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export function joinGroup(code: string): Promise<GroupWithLifecycle> {
  return authedRequest<GroupWithLifecycle>('/groups/join', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  });
}

export function deleteGroup(id: string): Promise<void> {
  return authedRequestNoContent(`/groups/${id}`, { method: 'DELETE' });
}

/**
 * Returns the caller's photo-booth strip post for this group, or `null` if
 * they don't have one yet. Backed by `GET /groups/{id}/photobooth/me`, which
 * 404s when no strip exists — the 404 is the expected shape, not an error,
 * so we collapse it to `null` for a clean `useQuery` site.
 */
export async function getMyPhotoboothPost(groupId: string): Promise<PostWithMediaUrl | null> {
  try {
    return await authedRequest<PostWithMediaUrl>(`/groups/${groupId}/photobooth/me`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}
