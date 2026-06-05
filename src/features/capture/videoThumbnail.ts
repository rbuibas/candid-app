import * as VideoThumbnails from 'expo-video-thumbnails';

/**
 * Generate a poster frame (JPEG) from a locally-recorded video and return its
 * `file://` URI, or null on any failure.
 *
 * The poster is a feed-only nicety — a video with no thumbnail simply shows its
 * black preview tile until tapped — so this is deliberately best-effort and
 * never throws: every caller treats null as "no poster" and carries on with the
 * upload. We grab a frame a touch into the clip (not t=0) because the very first
 * frame is often black while the sensor settles.
 */
const POSTER_TIME_MS = 200;

export async function generateVideoThumbnail(videoUri: string): Promise<string | null> {
  try {
    const normalized = videoUri.startsWith('file://') ? videoUri : `file://${videoUri}`;
    const { uri } = await VideoThumbnails.getThumbnailAsync(normalized, {
      time: POSTER_TIME_MS,
      quality: 0.7,
    });
    return uri;
  } catch {
    return null;
  }
}
