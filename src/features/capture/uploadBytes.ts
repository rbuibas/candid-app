/**
 * PUT a local file's bytes straight to R2 using a presigned URL.
 *
 * The presigned URL signs the **exact** content-type the server expects — see
 * candid-api/src/app/services/posts.py `_content_type_for`: `image/jpeg` for
 * photo + strip, `video/mp4` for video. The PUT signature will fail if the
 * `Content-Type` header doesn't match byte-for-byte, so the caller passes it
 * in rather than guessing.
 *
 * `fileUri` is the vision-camera output (e.g. `/private/var/.../IMG_xx.jpg`
 * on iOS, `/data/user/.../VID_xx.mp4` on Android). The `file://` prefix is
 * required by `fetch()` in React Native to read it as a Blob.
 */
export class UploadBytesError extends Error {
  readonly status: number;
  readonly body: string;

  constructor(status: number, statusText: string, body: string) {
    super(`R2 PUT failed: ${status} ${statusText}`);
    this.name = 'UploadBytesError';
    this.status = status;
    this.body = body;
  }
}

export async function uploadBytes(
  uploadUrl: string,
  fileUri: string,
  contentType: string,
): Promise<void> {
  const normalizedUri = fileUri.startsWith('file://') ? fileUri : `file://${fileUri}`;
  const fileRes = await fetch(normalizedUri);
  if (!fileRes.ok) {
    throw new UploadBytesError(fileRes.status, fileRes.statusText, await fileRes.text());
  }
  const blob = await fileRes.blob();

  const putRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body: blob,
  });
  if (!putRes.ok) {
    const body = await putRes.text().catch(() => '');
    throw new UploadBytesError(putRes.status, putRes.statusText, body);
  }
}

/**
 * Mirrors the server's content-type map (see candid-api posts.py).
 * Strips and photos are both JPEG; videos are mp4.
 */
export function contentTypeFor(mediaType: 'photo' | 'video' | 'strip'): string {
  return mediaType === 'video' ? 'video/mp4' : 'image/jpeg';
}
