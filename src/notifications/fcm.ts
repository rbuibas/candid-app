import messaging from '@react-native-firebase/messaging';
import { Platform } from 'react-native';

import { registerDevice, unregisterDevice, type DevicePlatform } from '@/api/devices';

/**
 * Thin wrapper around @react-native-firebase/messaging that turns FCM tokens
 * into rows in the backend `devices` table. Idempotent: the backend's
 * on_conflict upsert lets us re-register freely (on every authed mount, on
 * token-refresh, after a re-install) without duplicating rows.
 *
 * iOS is intentionally not handled yet — Phase 4 ships Android push only;
 * iOS support requires uploading an APNs key to Firebase and dropping a
 * GoogleService-Info.plist into the repo. Calls on iOS are no-ops so the
 * mobile codepaths can be shared once that lands.
 */

function platform(): DevicePlatform | null {
  if (Platform.OS === 'android') return 'android';
  if (Platform.OS === 'ios') return 'ios';
  return null;
}

export async function getFcmToken(): Promise<string | null> {
  if (platform() === null) return null;
  try {
    const token = await messaging().getToken();
    return token || null;
  } catch {
    return null;
  }
}

/**
 * Mints (or fetches the cached) FCM token and upserts it for the current
 * user. Returns the token on success so callers can stash it for a later
 * unregister; returns null if we couldn't get a token (Firebase not
 * configured, simulator without Play Services, iOS pre-APNs, etc.).
 */
export async function registerThisDevice(): Promise<string | null> {
  const plat = platform();
  if (plat === null) return null;
  // Skip iOS for now — see file header.
  if (plat === 'ios') return null;
  const token = await getFcmToken();
  if (!token) return null;
  await registerDevice({ fcm_token: token, platform: plat });
  return token;
}

/**
 * Wires onTokenRefresh → re-register. Returns the unsubscribe handle so the
 * caller (NotificationsGate) can tear it down on unmount.
 */
export function subscribeTokenRefresh(): () => void {
  if (platform() !== 'android') return () => {};
  return messaging().onTokenRefresh((token) => {
    void registerDevice({ fcm_token: token, platform: 'android' }).catch(() => {});
  });
}

/**
 * Best-effort device unregister. Called from sign-out — we swallow errors so
 * a network blip can't wedge the sign-out flow.
 */
export async function unregisterThisDevice(): Promise<void> {
  if (platform() !== 'android') return;
  try {
    const token = await getFcmToken();
    if (!token) return;
    await unregisterDevice(token);
  } catch {
    // best-effort
  }
}
