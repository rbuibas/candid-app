import {
  AuthorizationStatus,
  getMessaging,
  hasPermission,
  requestPermission as requestMessagingPermission,
  type FirebaseMessagingTypes,
} from '@react-native-firebase/messaging';
import { useCallback, useEffect, useState } from 'react';
import { AppState, Linking, Platform } from 'react-native';

/**
 * Coarse push-permission status — mirrors the camera-perms helper
 * (src/features/capture/useCameraPermissions.ts) so call sites can switch on
 * the same vocabulary regardless of the underlying native API.
 *
 *   'unknown'       — initial render before the first read
 *   'undetermined'  — never asked; calling request() will show the OS prompt
 *   'granted'       — pushes will arrive
 *   'denied'        — asked and rejected; OS prompt won't reappear, send the
 *                      user to system settings via openNotificationSettings()
 */
export type PushPermissionStatus = 'unknown' | 'undetermined' | 'granted' | 'denied';

function fromAuthStatus(status: FirebaseMessagingTypes.AuthorizationStatus): PushPermissionStatus {
  if (
    status === AuthorizationStatus.AUTHORIZED ||
    status === AuthorizationStatus.PROVISIONAL ||
    status === AuthorizationStatus.EPHEMERAL
  ) {
    return 'granted';
  }
  if (status === AuthorizationStatus.NOT_DETERMINED) return 'undetermined';
  return 'denied';
}

export async function getPermissionStatus(): Promise<PushPermissionStatus> {
  if (Platform.OS !== 'android' && Platform.OS !== 'ios') return 'unknown';
  try {
    return fromAuthStatus(await hasPermission(getMessaging()));
  } catch {
    return 'unknown';
  }
}

/**
 * Triggers the OS prompt (Android 13+ POST_NOTIFICATIONS, iOS standard
 * notification ask). Resolves to the resulting status — caller should also
 * call refresh() / re-read via getPermissionStatus on the next AppState
 * 'active' transition to catch the user toggling settings outside the app.
 */
export async function requestPermission(): Promise<PushPermissionStatus> {
  try {
    return fromAuthStatus(await requestMessagingPermission(getMessaging()));
  } catch {
    return 'denied';
  }
}

export function openNotificationSettings(): Promise<void> {
  return Linking.openSettings();
}

/**
 * Subscribes to the current OS push-permission state. Re-reads on mount AND
 * on every AppState 'active' transition so the denial banner clears as soon
 * as the user flips notifications on in system settings and tabs back.
 */
export function usePushPermission(): {
  status: PushPermissionStatus;
  refresh: () => Promise<void>;
  request: () => Promise<PushPermissionStatus>;
  openSettings: () => Promise<void>;
} {
  const [status, setStatus] = useState<PushPermissionStatus>('unknown');

  const refresh = useCallback(async () => {
    setStatus(await getPermissionStatus());
  }, []);

  useEffect(() => {
    void refresh();
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') void refresh();
    });
    return () => sub.remove();
  }, [refresh]);

  const request = useCallback(async () => {
    const next = await requestPermission();
    setStatus(next);
    return next;
  }, []);

  return { status, refresh, request, openSettings: openNotificationSettings };
}
