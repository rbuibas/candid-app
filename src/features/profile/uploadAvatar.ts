import { createAvatarUploadUrl, patchAvatar, type Profile } from '@/api/profile';
import { uploadBytes } from '@/features/capture/uploadBytes';

/**
 * Set the caller's avatar from a freshly-captured local image, reusing the
 * existing presigned-upload pipeline (mint → PUT to R2 → confirm). Same path
 * the photo booth uses for the auto-avatar, so the object lands under the
 * user's avatar prefix in the EU bucket and the server validates it on
 * `patchAvatar`. No gallery picker, no post is created — capture stays
 * live-only and this is profile media, not a feed post.
 */
export async function uploadAvatarFromUri(uri: string): Promise<Profile> {
  const mint = await createAvatarUploadUrl('jpg');
  await uploadBytes(mint.upload_url, uri, 'image/jpeg');
  return patchAvatar(mint.storage_path);
}
