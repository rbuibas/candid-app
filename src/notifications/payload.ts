/**
 * Shape of the FCM data payload sent by the dispatcher (per the Phase-4
 * brief). Values arrive as strings — FCM data payloads are string-to-string
 * dictionaries, so numeric/datetime fields need coercion at the boundary.
 *
 * The client drives UI from this payload, NOT from title/body, because the
 * displayed copy ("Time to capture") is a fixed brand string while the
 * routing target and timing fields vary per prompt.
 */
export type RawPushData = Record<string, string | object | undefined>;

export type PromptPushPayload = {
  prompt_id: string;
  group_id: string;
  media_type: 'photo' | 'video';
  target_video_length_seconds: number | null;
  dispatched_at: string;
  response_window_seconds: number;
  late_window_seconds: number;
};

function asString(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null;
}

function asInt(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/**
 * Returns a typed payload if every required field is present and shaped
 * correctly; null otherwise (so callers can drop malformed pushes silently
 * without crashing the handler).
 */
export function parsePromptPushPayload(data: RawPushData | undefined): PromptPushPayload | null {
  if (!data) return null;
  const promptId = asString(data.prompt_id);
  const groupId = asString(data.group_id);
  const mediaTypeRaw = asString(data.media_type);
  const dispatchedAt = asString(data.dispatched_at);
  const responseWindow = asInt(data.response_window_seconds);
  const lateWindow = asInt(data.late_window_seconds);
  if (
    !promptId ||
    !groupId ||
    !dispatchedAt ||
    responseWindow === null ||
    lateWindow === null ||
    (mediaTypeRaw !== 'photo' && mediaTypeRaw !== 'video')
  ) {
    return null;
  }
  return {
    prompt_id: promptId,
    group_id: groupId,
    media_type: mediaTypeRaw,
    target_video_length_seconds: asInt(data.target_video_length_seconds),
    dispatched_at: dispatchedAt,
    response_window_seconds: responseWindow,
    late_window_seconds: lateWindow,
  };
}
