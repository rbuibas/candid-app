import * as MediaLibrary from 'expo-media-library';

import type { PostMediaType } from '@/api/posts';

/**
 * Album the group's media lands in, inside the device camera roll.
 *
 * TODO(product-name): the app display name isn't finalised — `app.config.ts`
 * currently uses 'Candid' as a placeholder. Keep this in sync with the final
 * product name when it's settled, since the album name is user-visible.
 */
export const ALBUM_NAME = 'Candid';

/**
 * The Candid album for the current app session, resolved once and reused.
 *
 * iOS prompts the user to confirm *every* library modification under write-only
 * ("Add Only") access. Creating the album counts as one such modification, so
 * creating it per-save (as we did before) fired one OS prompt per photo — and
 * quietly made a duplicate "Candid" album each time. We instead create the album
 * once on the first save and cache the reference, so every later save just adds
 * to it: a single album, and at most one prompt for the whole batch.
 *
 * We deliberately do NOT call the read-API `getAlbumAsync` (CLAUDE.md
 * non-negotiable #2: never enumerate the user's library). The trade-off is that
 * a fresh "Candid" album may be created once per app launch; within a session
 * — and so within any one bulk download — there is only ever one.
 */
let candidAlbum: MediaLibrary.Album | null = null;

async function fileIntoCandidAlbum(asset: MediaLibrary.Asset): Promise<void> {
  if (candidAlbum) {
    await MediaLibrary.addAssetsToAlbumAsync([asset], candidAlbum, false);
    return;
  }
  // First save of the session: create the album from this asset and cache it.
  // If creation fails, leave the cache null so the next save retries — the asset
  // is already safely in the roll regardless.
  candidAlbum = await MediaLibrary.createAlbumAsync(ALBUM_NAME, asset, false);
}

/**
 * Saves a single already-downloaded local file into the camera roll, filed
 * under the "Candid" album.
 *
 * CLAUDE.md non-negotiable #1: media always lands in the **camera roll**, never
 * an app-private directory. `createAssetAsync` writes to the shared photo
 * library; the album step only *organises* it. So even if the album add fails,
 * the asset is already safely in the roll — we swallow the album error rather
 * than failing the save.
 *
 * `mediaType` is accepted for clarity/symmetry; expo-media-library infers the
 * actual asset type from the file. A `strip` is a composite JPEG — treated as a
 * photo (non-negotiable #6: never extract the 3 frames).
 */
export async function saveAssetToCameraRoll(
  localUri: string,
  mediaType: PostMediaType,
): Promise<MediaLibrary.Asset> {
  void mediaType;
  // 1. Land it in the camera roll. This is the part that must succeed.
  const asset = await MediaLibrary.createAssetAsync(localUri);

  // 2. Best-effort: file it under the (session-cached) Candid album.
  try {
    await fileIntoCandidAlbum(asset);
  } catch {
    // Album organisation failed; the asset is still saved to the roll. Honest
    // outcome — we don't pretend the album exists, but we don't lose the media.
  }

  return asset;
}
