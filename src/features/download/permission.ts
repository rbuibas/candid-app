import * as MediaLibrary from 'expo-media-library';
import { useCallback, useEffect, useState } from 'react';
import { AppState, Linking } from 'react-native';

/**
 * Write-only media-library permission, modelled on the push/camera helpers
 * (src/notifications/permissions.ts, src/features/capture/useCameraPermissions.ts)
 * so call sites switch on the same vocabulary.
 *
 *   'unknown'       — initial render before the first read
 *   'undetermined'  — never asked; request() will show the OS prompt
 *   'granted'       — we can save to the camera roll
 *   'denied'        — asked and rejected; OS prompt won't reappear, send the
 *                      user to system settings via openSettings()
 *
 * CRITICAL (CLAUDE.md non-negotiable #2): we request **write-only** access
 * (`writeOnly: true` → iOS "Add Only" / Android no read perms). We never
 * enumerate or read back the user's library. Do not flip this to full access.
 */
export type MediaPermissionStatus = 'unknown' | 'undetermined' | 'granted' | 'denied';

const WRITE_ONLY = true;

function fromResponse(res: MediaLibrary.PermissionResponse): MediaPermissionStatus {
  if (res.granted) return 'granted';
  if (res.status === MediaLibrary.PermissionStatus.UNDETERMINED && res.canAskAgain) {
    return 'undetermined';
  }
  // Some platforms report `undetermined` with canAskAgain=false once the user
  // has hard-denied; treat anything non-granted-and-non-askable as denied so
  // we route to settings instead of silently re-prompting.
  if (res.status === MediaLibrary.PermissionStatus.UNDETERMINED) return 'undetermined';
  return 'denied';
}

export async function getMediaPermissionStatus(): Promise<MediaPermissionStatus> {
  try {
    return fromResponse(await MediaLibrary.getPermissionsAsync(WRITE_ONLY));
  } catch {
    return 'unknown';
  }
}

/**
 * Triggers the OS prompt (iOS "Add Only" sheet / Android storage grant on
 * API ≤ 28). Resolves to the resulting status. Per the feature spec we prime
 * this at the moment of the first download attempt, never up front.
 */
export async function requestMediaPermission(): Promise<MediaPermissionStatus> {
  try {
    return fromResponse(await MediaLibrary.requestPermissionsAsync(WRITE_ONLY));
  } catch {
    return 'denied';
  }
}

export function openMediaSettings(): Promise<void> {
  return Linking.openSettings();
}

/**
 * Subscribes to the current OS media-library state. Re-reads on mount and on
 * every AppState 'active' transition so a denial explainer clears the moment
 * the user flips access on in system settings and tabs back.
 */
export function useMediaPermission(): {
  status: MediaPermissionStatus;
  refresh: () => Promise<void>;
  request: () => Promise<MediaPermissionStatus>;
  openSettings: () => Promise<void>;
} {
  const [status, setStatus] = useState<MediaPermissionStatus>('unknown');

  const refresh = useCallback(async () => {
    setStatus(await getMediaPermissionStatus());
  }, []);

  useEffect(() => {
    void refresh();
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') void refresh();
    });
    return () => sub.remove();
  }, [refresh]);

  const request = useCallback(async () => {
    const next = await requestMediaPermission();
    setStatus(next);
    return next;
  }, []);

  return { status, refresh, request, openSettings: openMediaSettings };
}
