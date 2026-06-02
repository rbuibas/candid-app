import * as FileSystem from 'expo-file-system';

/**
 * Filesystem persistence for queued captures.
 *
 * Queued media must survive an app kill, so it lives in the **document**
 * directory (not cache, which the OS can evict under memory pressure) — see the
 * Phase-6 offline-queue decision. The Zustand store (uploadQueue.ts) persists
 * only the lightweight metadata + a pointer (`localFilePath`) into this dir.
 *
 * vision-camera writes its captures to a temporary directory; we copy (not
 * move) the bytes here on enqueue so the original temp file is left untouched
 * for the in-screen online attempt that may have just failed.
 */
const QUEUE_DIR = `${FileSystem.documentDirectory}upload-queue/`;

async function ensureQueueDir(): Promise<void> {
  const info = await FileSystem.getInfoAsync(QUEUE_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(QUEUE_DIR, { intermediates: true });
  }
}

/**
 * Copy a freshly-captured file into the durable queue directory and return its
 * new `file://` URI. `id` keys the file to its queue item; `extension` matches
 * the media (`jpg` for photo/strip, `mp4` for video).
 */
export async function persistCaptureFile(
  srcUri: string,
  id: string,
  extension: string,
): Promise<string> {
  await ensureQueueDir();
  const from = srcUri.startsWith('file://') ? srcUri : `file://${srcUri}`;
  const dest = `${QUEUE_DIR}${id}.${extension}`;
  await FileSystem.copyAsync({ from, to: dest });
  return dest;
}

/**
 * Delete a queued media file once it's uploaded or abandoned. Idempotent and
 * never throws — a missing file is already the desired end state.
 */
export async function deleteQueuedFile(uri: string): Promise<void> {
  try {
    await FileSystem.deleteAsync(uri, { idempotent: true });
  } catch {
    // Best-effort cleanup; a leftover file is harmless and will be retried.
  }
}
