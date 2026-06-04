import * as FileSystem from 'expo-file-system';
import { type Asset } from 'expo-media-library';

import { getGroupFeed, type FeedItem } from '@/api/feed';
import { getPost, type PostMediaType } from '@/api/posts';

import { markDownloaded } from './downloadStore';
import { fileAssetsIntoAlbum, saveAssetOnly } from './save';

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
 * Downloads one item and saves it to the camera roll, returning the new asset.
 * On an expired/missing signed URL (non-200), re-mints a fresh URL via
 * `GET /posts/{id}` and retries once before giving up.
 *
 * Note: this does NOT file the asset into the album — that's deferred to a
 * single batched `fileAssetsIntoAlbum` call after the whole run, so the OS
 * "modify" consent is paid once for the set rather than once per item (and so
 * no system dialog appears mid-loop to trip the background-pause logic).
 */
async function downloadAndSave(item: BulkItem): Promise<Asset> {
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
    const asset = await saveAssetOnly(tempUri, item.mediaType);
    markDownloaded(item.id);
    return asset;
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
  let aborted = false;
  const failedItems: BulkItem[] = [];
  const assets: Asset[] = [];

  for (const item of items) {
    if (isAborted?.()) {
      aborted = true;
      break;
    }
    try {
      assets.push(await downloadAndSave(item));
      saved += 1;
    } catch (err) {
      failedItems.push(item);
      // Skip + continue; the summary reports the count and offers a retry.
      console.warn(`[bulkDownload] post ${item.id} failed:`, err);
    }
    onProgress?.({ total, saved, failed: failedItems.length });
  }

  // Best-effort, single pass: file everything we saved into the Candid album in
  // one batched operation (one OS consent for the set, not one per item). The
  // assets are already in the camera roll, so a failure here only leaves them
  // unfiled — it never loses media.
  if (assets.length > 0) {
    await fileAssetsIntoAlbum(assets).catch((err) => {
      console.warn('[bulkDownload] album organize failed:', err);
    });
  }

  return { total, saved, failedItems, aborted };
}
