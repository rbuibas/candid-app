import { authedRequest } from './client';
import type { PostKind, PostMediaType } from './posts';

/**
 * Mirrors candid-api/src/app/models/post.py — FeedItem / FeedPage / PostAuthor.
 *
 * NOTE: FeedItem is deliberately NOT the same shape as PostWithMediaUrl. The
 * feed projection omits the internal R2 keys (`storage_path` / `thumbnail_path`)
 * — the client only ever sees short-lived signed URLs (`media_url`,
 * `thumbnail_url`) — and embeds a minimal `author`. Timestamps arrive as
 * ISO-8601 strings; convert to Date only at the UI layer.
 */
export type PostAuthor = {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
};

export type FeedItem = {
  id: string;
  group_id: string;
  prompt_id: string | null;
  user_id: string;
  kind: PostKind;
  media_type: PostMediaType;
  duration_seconds: number | null;
  captured_at: string;
  is_late: boolean;
  visible_at: string;
  media_url: string;
  thumbnail_url: string | null;
  latitude: number | null;
  longitude: number | null;
  location_accuracy_meters: number | null;
  created_at: string;
  author: PostAuthor;
};

export type FeedPage = {
  items: FeedItem[];
  next_cursor: string | null;
};

const PAGE_SIZE = 20;

/**
 * GET /groups/{id}/feed — chronological (newest-visible first), members-only,
 * cursor-paged with signed read URLs. `cursor` is the opaque `next_cursor`
 * from the previous page; omit it for the first page.
 */
export function getGroupFeed(groupId: string, cursor?: string): Promise<FeedPage> {
  const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
  if (cursor) params.set('cursor', cursor);
  return authedRequest<FeedPage>(`/groups/${groupId}/feed?${params.toString()}`);
}
