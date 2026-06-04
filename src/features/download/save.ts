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
 * Saves a downloaded local file to the camera roll and returns the new asset.
 *
 * This is the part that must succeed (CLAUDE.md non-negotiable #1: media always
 * lands in the **camera roll**, never an app-private dir). `createAssetAsync`
 * inserts a brand-new, app-owned item — it does NOT trigger the per-item
 * "modify" consent dialog (that comes from *moving* an asset into an album,
 * which we do separately and in a single batch via `fileAssetsIntoAlbum`).
 *
 * `mediaType` is accepted for clarity/symmetry; expo-media-library infers the
 * actual asset type from the file. A `strip` is a composite JPEG — treated as a
 * photo (non-negotiable #6: never extract the 3 frames).
 */
export async function saveAssetOnly(
  localUri: string,
  mediaType: PostMediaType,
): Promise<MediaLibrary.Asset> {
  void mediaType;
  return MediaLibrary.createAssetAsync(localUri);
}

/** The Candid album for the current app session, resolved once and reused. */
let candidAlbum: MediaLibrary.Album | null = null;

/**
 * Files already-saved assets into the "Candid" album in **as few operations as
 * possible** — ideally one. Moving assets into an album is a library
 * modification, which on Android prompts a per-operation "Allow … to modify"
 * consent (and similar on iOS). Doing it once for the whole batch means one
 * consent for the set instead of one per photo.
 *
 * With full access we look up the existing album (no duplicate "Candid" albums)
 * and cache it for the session. First-ever run with no album: we create it from
 * the first asset and add the remainder — at most two consents, once. Every run
 * after that is a single batched add.
 *
 * Best-effort: the assets are already in the camera roll, so an album failure
 * (or a denied consent) never loses media — it just leaves them unfiled.
 */
export async function fileAssetsIntoAlbum(assets: MediaLibrary.Asset[]): Promise<void> {
  if (assets.length === 0) return;

  if (candidAlbum) {
    await MediaLibrary.addAssetsToAlbumAsync(assets, candidAlbum, false);
    return;
  }

  const existing = await MediaLibrary.getAlbumAsync(ALBUM_NAME).catch(() => null);
  if (existing) {
    candidAlbum = existing;
    await MediaLibrary.addAssetsToAlbumAsync(assets, existing, false);
    return;
  }

  // No album yet — create it from the first asset, then add any remainder.
  candidAlbum = await MediaLibrary.createAlbumAsync(ALBUM_NAME, assets[0], false);
  if (assets.length > 1) {
    await MediaLibrary.addAssetsToAlbumAsync(assets.slice(1), candidAlbum, false);
  }
}

/**
 * Convenience for the single-photo path: save one file to the roll and file it
 * into the Candid album. Bulk download uses `saveAssetOnly` +
 * `fileAssetsIntoAlbum` directly so it can batch the album step across the whole
 * set rather than paying the consent per item.
 */
export async function saveAssetToCameraRoll(
  localUri: string,
  mediaType: PostMediaType,
): Promise<MediaLibrary.Asset> {
  const asset = await saveAssetOnly(localUri, mediaType);
  try {
    await fileAssetsIntoAlbum([asset]);
  } catch {
    // Album organisation failed; the asset is still saved to the roll.
  }
  return asset;
}
