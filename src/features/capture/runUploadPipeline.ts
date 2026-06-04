import { confirmPost, createUploadUrl, type Post } from '@/api/posts';
import type { QueueItem } from '@/stores/uploadQueue';

import { contentTypeFor, uploadBytes } from './uploadBytes';

/**
 * The full direct-to-R2 upload pipeline for one capture: mint a presigned URL,
 * PUT the bytes, then confirm. Shared by the live capture screen and the
 * offline-queue flusher so both paths behave identically.
 *
 * A fresh URL is minted on every call (never reused/persisted — presigned PUTs
 * expire in ~10 min, the Phase-6 decision), which means a brand-new `post_id`
 * per attempt. That's safe: the server's `confirm` is idempotent on `post_id`
 * (/docs/02 §4), so even a mid-pipeline retry can't double-post.
 *
 * `capturedAt` is carried from the original capture moment (display-only); the
 * server still judges on-time/late/missed from its own receipt time.
 */
export async function runUploadPipeline(
  item: Pick<
    QueueItem,
    | 'groupId'
    | 'kind'
    | 'mediaType'
    | 'promptId'
    | 'localFilePath'
    | 'thumbnailLocalFilePath'
    | 'capturedAt'
    | 'durationSeconds'
    | 'latitude'
    | 'longitude'
    | 'accuracy'
  >,
): Promise<Post> {
  const extension = item.mediaType === 'video' ? 'mp4' : 'jpg';

  const mint = await createUploadUrl({
    group_id: item.groupId,
    kind: item.kind,
    media_type: item.mediaType,
    extension,
    prompt_id: item.promptId,
  });

  await uploadBytes(mint.upload_url, item.localFilePath, contentTypeFor(item.mediaType));

  // Poster frame (video only) — best-effort. confirm probes for it by its
  // canonical key, so a failed PUT just means the post lands without a poster.
  if (mint.thumbnail_upload_url && item.thumbnailLocalFilePath) {
    try {
      await uploadBytes(mint.thumbnail_upload_url, item.thumbnailLocalFilePath, 'image/jpeg');
    } catch {
      // Swallow — the video still posts; the feed shows its black tile instead.
    }
  }

  return confirmPost({
    post_id: mint.post_id,
    group_id: item.groupId,
    kind: item.kind,
    media_type: item.mediaType,
    storage_path: mint.storage_path,
    captured_at: item.capturedAt,
    duration_seconds: item.durationSeconds,
    latitude: item.latitude,
    longitude: item.longitude,
    accuracy: item.accuracy,
    prompt_id: item.promptId,
  });
}
