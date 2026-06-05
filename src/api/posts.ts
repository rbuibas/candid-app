import { authedRequest, authedRequestNoContent } from './client';

/**
 * Mirrors candid-api/src/app/models/post.py. Timestamps come over the wire as
 * ISO-8601 strings; convert to Date only at the UI layer if needed.
 */
export type PostKind = 'prompt' | 'photobooth';
export type PostMediaType = 'photo' | 'video' | 'strip';

export type UploadUrlRequest = {
  group_id: string;
  kind: PostKind;
  media_type: PostMediaType;
  extension: string;
  prompt_id?: string;
};

export type UploadUrlResponse = {
  post_id: string;
  upload_url: string;
  storage_path: string;
  expires_at: string;
  // Video only: a second presigned PUT slot for the client-generated poster
  // frame (JPEG). Null for photo/strip. confirm detects the uploaded poster by
  // its canonical key, so this upload is best-effort — a miss never blocks the
  // post.
  thumbnail_upload_url: string | null;
  thumbnail_storage_path: string | null;
};

export type ConfirmPostRequest = {
  post_id: string;
  group_id: string;
  kind: PostKind;
  media_type: PostMediaType;
  storage_path: string;
  captured_at: string;
  duration_seconds?: number;
  latitude?: number;
  longitude?: number;
  accuracy?: number;
  prompt_id?: string;
};

export type Post = {
  id: string;
  prompt_id: string | null;
  group_id: string;
  user_id: string;
  kind: PostKind;
  media_type: PostMediaType;
  storage_path: string;
  thumbnail_path: string | null;
  duration_seconds: number | null;
  captured_at: string;
  is_late: boolean;
  visible_at: string;
  latitude: number | null;
  longitude: number | null;
  location_accuracy_meters: number | null;
  created_at: string;
};

export type PostWithMediaUrl = Post & { media_url: string };

export function createUploadUrl(body: UploadUrlRequest): Promise<UploadUrlResponse> {
  return authedRequest<UploadUrlResponse>('/posts/upload-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export function confirmPost(body: ConfirmPostRequest): Promise<Post> {
  return authedRequest<Post>('/posts/confirm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export function getPost(postId: string): Promise<PostWithMediaUrl> {
  return authedRequest<PostWithMediaUrl>(`/posts/${postId}`);
}

/**
 * DELETE /posts/{id} — author-only; tombstones the post and purges its R2
 * media. Returns 204 No Content. Only the post's author succeeds (the server
 * 403s otherwise).
 */
export function deletePost(postId: string): Promise<void> {
  return authedRequestNoContent(`/posts/${postId}`, { method: 'DELETE' });
}
