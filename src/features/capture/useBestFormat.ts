import { useMemo } from 'react';
import type {
  CameraDevice,
  CameraDeviceFormat,
  VideoStabilizationMode,
} from 'react-native-vision-camera';

/**
 * Explicit camera-format selection for the capture feature.
 *
 * By default `useCameraDevice` lets vision-camera pick a format, which biases
 * toward a balanced preview rather than the sharpest still. We instead choose a
 * format off `device.formats` ourselves so prompt captures use the sensor's
 * full photo resolution (and HDR where the device supports it). This is the
 * configuration-only lever for the "blurry / low-detail" complaints — no native
 * work, no new deps.
 *
 * The chosen format is logged in dev so we can record "which format did each
 * device pick" in the PR notes.
 */

export type CaptureMode = 'photo' | 'video';

// Candid video prompts are short, candid clips (≤ max_video_length_seconds).
// We deliberately target 1080p30 rather than 4K: 1080p is universally
// supported, lets AF/AE settle faster, and keeps the direct-to-R2 upload small
// (the video compression pipeline is Phase 6 — until then we must not emit 4K
// files). Picking a format up-front that already handles this resolution+fps
// means vision-camera doesn't reconfigure (and re-run focus/exposure) the
// instant recording starts.
const TARGET_VIDEO_FPS = 30;
const TARGET_VIDEO_AREA = 1920 * 1080;

/**
 * Capture-time video bitrate cap, in Mbps — the Phase-6 client compression
 * lever (/docs/03 §6: "video is the cost driver"; R2 storage accrues per byte).
 *
 * We constrain at capture rather than transcoding afterwards (no compressor
 * library — the Phase-6 decision): vision-camera's `<Camera videoBitRate>` prop
 * caps the hardware encoder directly. Paired with the 1080p30 format cap above,
 * 4 Mbps yields ~5 MB for a 10s clip — typically a 3–4× cut versus a device's
 * default 1080p bitrate (~12–17 Mbps) while staying clearly watchable for short
 * candid moments. Lower (e.g. 2–3) saves more but starts to smear motion; the
 * preset strings ('low' ≈ 20% under the hardware default) are the gentler knob.
 *
 * Codec stays the vision-camera default (h264) for universal playback across
 * the shared APK; h265 would roughly halve size again but isn't guaranteed to
 * decode on every guest device — a future lever, not an MVP one.
 */
export const VIDEO_BITRATE_MBPS = 4;

function photoArea(f: CameraDeviceFormat): number {
  return f.photoWidth * f.photoHeight;
}

function videoArea(f: CameraDeviceFormat): number {
  return f.videoWidth * f.videoHeight;
}

/**
 * Highest-resolution photo format wins. This is inherently capped at the
 * sensor-native maximum — `device.formats` never reports anything larger than
 * what the sensor can actually produce, so "pick the highest" cannot run away
 * into an absurd, slow-to-capture resolution. HDR support and a phase-detection
 * autofocus break ties between equal-resolution formats; both improve
 * real-world sharpness and exposure (phase-detection locks focus faster and
 * more reliably than contrast detection — directly relevant to the
 * "misfocused" reports).
 */
function pickPhotoFormat(formats: readonly CameraDeviceFormat[]): CameraDeviceFormat {
  return [...formats].sort((a, b) => {
    const areaDiff = photoArea(b) - photoArea(a);
    if (areaDiff !== 0) return areaDiff;
    if (a.supportsPhotoHdr !== b.supportsPhotoHdr) return a.supportsPhotoHdr ? -1 : 1;
    const aPhase = a.autoFocusSystem === 'phase-detection';
    const bPhase = b.autoFocusSystem === 'phase-detection';
    if (aPhase !== bPhase) return aPhase ? -1 : 1;
    return 0;
  })[0];
}

/**
 * For video prompts pick the format whose video resolution is closest to
 * 1080p — naturally preferring 1080p, then 720p, and avoiding 4K — among
 * formats whose fps range actually includes 30. Falls back to all formats if
 * none advertise 30fps. Ties break toward the better still resolution (harmless
 * for video) then video HDR.
 */
function pickVideoFormat(formats: readonly CameraDeviceFormat[]): CameraDeviceFormat {
  const supports30 = formats.filter(
    (f) => f.minFps <= TARGET_VIDEO_FPS && f.maxFps >= TARGET_VIDEO_FPS,
  );
  const pool = supports30.length > 0 ? supports30 : formats;
  return [...pool].sort((a, b) => {
    const distDiff =
      Math.abs(videoArea(a) - TARGET_VIDEO_AREA) - Math.abs(videoArea(b) - TARGET_VIDEO_AREA);
    if (distDiff !== 0) return distDiff;
    const areaDiff = photoArea(b) - photoArea(a);
    if (areaDiff !== 0) return areaDiff;
    if (a.supportsVideoHdr !== b.supportsVideoHdr) return a.supportsVideoHdr ? -1 : 1;
    return 0;
  })[0];
}

export function useBestFormat(
  device: CameraDevice | undefined,
  mode: CaptureMode,
): CameraDeviceFormat | undefined {
  return useMemo(() => {
    if (!device || device.formats.length === 0) return undefined;
    const format =
      mode === 'video' ? pickVideoFormat(device.formats) : pickPhotoFormat(device.formats);
    if (__DEV__ && format) {
      // eslint-disable-next-line no-console
      console.log(
        `[capture] ${device.position} ${mode} format → ` +
          `photo ${format.photoWidth}×${format.photoHeight}, ` +
          `video ${format.videoWidth}×${format.videoHeight} @ ${format.minFps}-${format.maxFps}fps, ` +
          `photoHdr=${format.supportsPhotoHdr}, AF=${format.autoFocusSystem}`,
      );
    }
    return format;
  }, [device, mode]);
}

/**
 * Picks the best-supported video stabilization mode for a format, preferring
 * the platform's own "auto" choice.
 *
 * Note: vision-camera v2 exposed an `enableAutoStabilization` boolean; v4
 * replaced it with the `videoStabilizationMode` prop plus a per-format
 * `videoStabilizationModes` list, so "enable auto-stabilization where
 * supported" maps to selecting a supported mode here. Returns `'off'` when the
 * format advertises no stabilization support.
 */
export function bestStabilizationMode(
  format: CameraDeviceFormat | undefined,
): VideoStabilizationMode {
  const modes = format?.videoStabilizationModes ?? [];
  if (modes.includes('auto')) return 'auto';
  if (modes.includes('cinematic')) return 'cinematic';
  if (modes.includes('standard')) return 'standard';
  return 'off';
}
