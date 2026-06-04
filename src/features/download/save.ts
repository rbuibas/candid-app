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
 * Saves a single already-downloaded local file into the camera roll, filed
 * under the "Candid" album. Created on first save.
 *
 * CLAUDE.md non-negotiable #1: media always lands in the **camera roll**, never
 * an app-private directory. `createAssetAsync` writes to the shared photo
 * library; the album step only *organises* it. So even if the album add fails
 * (e.g. iOS "Add Only" forbids reading existing albums), the asset is already
 * safely in the roll — we swallow the album error rather than failing the save.
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

  // 2. Best-effort: file it under the Candid album.
  //
  // Under write-only ("Add Only") access on iOS we cannot enumerate albums, so
  // `getAlbumAsync` may throw or return null. We try to find the album; if we
  // can't, we create it. Either way, a failure here does NOT fail the save —
  // the asset is already in the roll.
  try {
    let album: MediaLibrary.Album | null = null;
    try {
      album = await MediaLibrary.getAlbumAsync(ALBUM_NAME);
    } catch {
      album = null; // read not permitted (Add Only) — fall through to create.
    }

    if (album) {
      await MediaLibrary.addAssetsToAlbumAsync([asset], album, false);
    } else {
      await MediaLibrary.createAlbumAsync(ALBUM_NAME, asset, false);
    }
  } catch {
    // Album organisation failed; the asset is still saved to the roll. Honest
    // outcome — we don't pretend the album exists, but we don't lose the media.
  }

  return asset;
}
