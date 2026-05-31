import * as SecureStore from 'expo-secure-store';

/**
 * Persistent "we've shown the push-permission rationale and called
 * requestPermission at least once" flag.
 *
 * Why this exists: on Android, `messaging().hasPermission()` only returns
 * AUTHORIZED or DENIED — there is no NOT_DETERMINED. A fresh install with
 * notifications never asked shows up as DENIED from the very first read, so
 * we can't use status alone to decide whether to show the rationale modal.
 * iOS does have NOT_DETERMINED, but reusing this flag on both platforms
 * keeps the gate logic symmetric.
 *
 * Versioned key (`v1`) leaves room to reset the flag in a future build if
 * we ever want to re-prime everyone after a copy change.
 */
const KEY = 'candid.push.primed.v1';

export async function getPushPrimed(): Promise<boolean> {
  try {
    const v = await SecureStore.getItemAsync(KEY);
    return v === '1';
  } catch {
    return false;
  }
}

export async function setPushPrimed(): Promise<void> {
  try {
    await SecureStore.setItemAsync(KEY, '1');
  } catch {
    // best-effort; on next mount we'll just show the rationale again
  }
}
