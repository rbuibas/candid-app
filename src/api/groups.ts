import { authedRequest, authedRequestNoContent } from './client';

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
