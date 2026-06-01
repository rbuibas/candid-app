import { authedRequest } from './client';

/**
 * Mirrors candid-api/src/app/models/prompt.py PromptView — the read-shape
 * returned by /prompts/active and /prompts/{id}. The server pre-computes
 * `state` (UI enum, distinct from the DB status enum) from `dispatched_at`
 * and the group's response/late windows so the client never recomputes
 * lateness (CLAUDE.md non-negotiable #4).
 */
export type PromptMediaType = 'photo' | 'video';
export type PromptUIState = 'active' | 'late' | 'missed' | 'responded';

export type PromptView = {
  id: string;
  group_id: string;
  media_type: PromptMediaType;
  target_video_length_seconds: number | null;
  dispatched_at: string;
  on_time_deadline: string;
  late_deadline: string;
  state: PromptUIState;
};

export function getPrompt(promptId: string): Promise<PromptView> {
  return authedRequest<PromptView>(`/prompts/${promptId}`);
}

export function listActivePrompts(): Promise<PromptView[]> {
  return authedRequest<PromptView[]>('/prompts/active');
}
