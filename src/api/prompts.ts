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

/**
 * Dev backdoor: creates and immediately dispatches a prompt for the calling
 * user in the given group, then returns it as a PromptView. Navigating to
 * the prompt screen with the returned id exercises the full real flow
 * (window countdown, lateness state, capture CTA) without waiting for the
 * scheduler.
 *
 * Requires the backend to expose POST /dev/prompts/trigger (candid-api):
 *   - Only enabled when DEV_MODE=true env var is set (never in production).
 *   - Body: { group_id: string, media_type: "photo" | "video" }
 *   - Response: PromptView (same shape as GET /prompts/{id})
 *   - Sets dispatched_at = now(), uses the group's on_time / late windows.
 */
export function triggerDevPrompt(
  groupId: string,
  mediaType: PromptMediaType,
): Promise<PromptView> {
  return authedRequest<PromptView>('/dev/prompts/trigger', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ group_id: groupId, media_type: mediaType }),
  });
}
