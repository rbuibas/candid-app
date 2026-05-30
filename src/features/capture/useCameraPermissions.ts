import { useCallback, useEffect, useState } from 'react';
import { Linking } from 'react-native';
import { Camera, type CameraPermissionStatus } from 'react-native-vision-camera';

/**
 * Wraps vision-camera's static permission API into a single hook that tracks
 * both camera and microphone status. Microphone is required for video posts
 * (CLAUDE.md §3 video has audio) so both must be granted before a capture
 * screen mounts the camera.
 *
 * The hook surfaces a coarse `status`:
 *   - 'unknown'        — initial render before the first read
 *   - 'undetermined'   — never asked; calling `request()` will show the OS prompt
 *   - 'granted'        — both granted; safe to mount the Camera
 *   - 'denied'         — asked and rejected at least once; OS prompt won't reappear,
 *                         caller should show a "Open settings" recovery panel
 *   - 'restricted'     — parental/MDM lock; same UX as denied but unrecoverable
 *
 * vision-camera v4 reports per-permission status; this hook collapses the two
 * into the worst-case to keep the call site simple.
 */
export type CameraPermissionsStatus =
  | 'unknown'
  | 'undetermined'
  | 'granted'
  | 'denied'
  | 'restricted';

function combine(a: CameraPermissionStatus, b: CameraPermissionStatus): CameraPermissionsStatus {
  // Worst-case merge: any restriction/denial dominates.
  if (a === 'restricted' || b === 'restricted') return 'restricted';
  if (a === 'denied' || b === 'denied') return 'denied';
  if (a === 'not-determined' || b === 'not-determined') return 'undetermined';
  return 'granted';
}

export function useCameraPermissions(): {
  status: CameraPermissionsStatus;
  request: () => Promise<void>;
  openSettings: () => Promise<void>;
} {
  const [status, setStatus] = useState<CameraPermissionsStatus>('unknown');

  const refresh = useCallback(() => {
    const cam = Camera.getCameraPermissionStatus();
    const mic = Camera.getMicrophonePermissionStatus();
    setStatus(combine(cam, mic));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const request = useCallback(async () => {
    // Request both in sequence — order is cosmetic, prompt UX is the same.
    if (Camera.getCameraPermissionStatus() === 'not-determined') {
      await Camera.requestCameraPermission();
    }
    if (Camera.getMicrophonePermissionStatus() === 'not-determined') {
      await Camera.requestMicrophonePermission();
    }
    refresh();
  }, [refresh]);

  const openSettings = useCallback(async () => {
    await Linking.openSettings();
  }, []);

  return { status, request, openSettings };
}
