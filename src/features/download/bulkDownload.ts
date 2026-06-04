import * as FileSystem from 'expo-file-system';

import { getGroupFeed, type FeedItem } from '@/api/feed';
import { getPost, type PostMediaType } from '@/api/posts';

import { markDownloaded } from './downloadStore';
import { saveAssetToCameraRoll } from './save';

/**
 * Bulk download orchestrator — pages through a group's entire feed and saves
 * every post to the camera roll, sequentially.
 *
 * Design notes (per the feature spec):
 * - **Sequential, one asset at a time.** No parallelism — keeps the UX honest
 *   and avoids hammering the device / R2.
 * - **Whole group feed**, not just the user's own posts (non-negotiable #4).
 * - **No new endpoint.** We page the existing signed-URL feed; if a signed URL
 *   has expired by the time we reach it, we re-mint via `GET /posts/{id}`
 *   (which returns a fresh `media_url`) and retry that one item once.
 * - **Resilient to single-item failure**: skip + record + continue, then
 *   surface a summary. The failed set can be retried on its own.
 * - **Abortable** at the next item boundary.
 *
 * The orchestrator is plain async (not a hook) so it can run uninterrupted by
 * React re-renders; the UI passes callbacks for progress and abort polling.
 */

const TEMP_DIR = `${FileSystem.cacheDirectory ?? ''}candid-download/`;

function extensionFor(mediaType: PostMediaType): string {
  return mediaType === 'video' ? 'mp4' : 'jpg';
}

async function ensureTempDir(): Promise<void> {
  const info = await FileSystem.getInfoAsync(TEMP_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(TEMP_DIR, { intermediates: true });
  }
}

/**
 * Downloads a remote URL to a fresh temp file and returns its local URI. The
 * caller owns the file and must delete it (see `releaseTempFile`). Shared with
 * the single-photo download path in PostViewerModal.
 */
export async function downloadToTempFile(
  url: string,
  postId: string,
  mediaType: PostMediaType,
): Promise<string> {
  await ensureTempDir();
  const target = `${TEMP_DIR}${postId}.${extensionFor(mediaType)}`;
  const result = await FileSystem.downloadAsync(url, target);
  if (result.status !== 200) {
    throw new DownloadHttpError(result.status);
  }
  return result.uri;
}

export async function releaseTempFile(uri: string): Promise<void> {
  await FileSystem.deleteAsync(uri, { idempotent: true });
}

/** Raised when the signed URL responds non-200 (e.g. 403 expired / 404 gone). */
export class DownloadHttpError extends Error {
  readonly status: number;
  constructor(status: number) {
    super(`download failed with HTTP ${status}`);
    this.name = 'DownloadHttpError';
    this.status = status;
  }
}

export type BulkItem = {
  id: string;
  mediaUrl: string;
  mediaType: PostMediaType;
};

export type BulkProgress = {
  total: number;
  saved: number;
  failed: number;
};

export type BulkSummary = {
  total: number;
  saved: number;
  /** Items that failed every attempt — feed these back in to retry just them. */
  failedItems: BulkItem[];
  /** True if the run stopped early because the caller aborted. */
  aborted: boolean;
};

function toBulkItem(item: FeedItem): BulkItem {
  return { id: item.id, mediaUrl: item.media_url, mediaType: item.media_type };
}

/**
 * Pages through the entire group feed and returns a flat list of items to
 * save. Deleted posts (`deleted_at != null`) are already excluded by the feed
 * endpoint, so the pager inherits that filter.
 */
export async function collectFeedItems(groupId: string): Promise<BulkItem[]> {
  const items: BulkItem[] = [];
  let cursor: string | undefined;
  do {
    const page = await getGroupFeed(groupId, cursor);
    items.push(...page.items.map(toBulkItem));
    cursor = page.next_cursor ?? undefined;
  } while (cursor);
  return items;
}

/**
 * Saves one item: download → save to camera roll → mark in store → release
 * temp file. On an expired/missing signed URL (non-200), re-mints a fresh URL
 * via `GET /posts/{id}` and retries once before giving up.
 */
async function saveOne(item: BulkItem): Promise<void> {
  let tempUri: string | null = null;
  try {
    try {
      tempUri = await downloadToTempFile(item.mediaUrl, item.id, item.mediaType);
    } catch (err) {
      if (!(err instanceof DownloadHttpError)) throw err;
      // Signed URL likely expired mid-bulk — re-mint and retry once.
      const fresh = await getPost(item.id);
      tempUri = await downloadToTempFile(fresh.media_url, item.id, item.mediaType);
    }
    await saveAssetToCameraRoll(tempUri, item.mediaType);
    markDownloaded(item.id);
  } finally {
    if (tempUri) await releaseTempFile(tempUri).catch(() => undefined);
  }
}

export type RunBulkOptions = {
  onProgress?: (progress: BulkProgress) => void;
  /** Polled at each item boundary; return true to stop after the current item. */
  isAborted?: () => boolean;
};

/**
 * Runs the bulk save over a known item list. The list is collected up front
 * (via `collectFeedItems`) so the UI can show a real "Saved X of Y" total.
 * Cancellation is honoured at the next item boundary.
 */
export async function runBulkDownload(
  items: BulkItem[],
  { onProgress, isAborted }: RunBulkOptions = {},
): Promise<BulkSummary> {
  const total = items.length;
  let saved = 0;
  const failedItems: BulkItem[] = [];

  for (const item of items) {
    if (isAborted?.()) {
      return { total, saved, failedItems, aborted: true };
    }
    try {
      await saveOne(item);
      saved += 1;
    } catch (err) {
      failedItems.push(item);
      // Skip + continue; the summary reports the count and offers a retry.
      console.warn(`[bulkDownload] post ${item.id} failed:`, err);
    }
    onProgress?.({ total, saved, failed: failedItems.length });
  }

  return { total, saved, failedItems, aborted: false };
}
