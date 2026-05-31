import { authedRequest, authedRequestNoContent } from './client';

/**
 * Mirrors candid-api/src/app/models/device.py. A device is keyed by its FCM
 * token (unique); the backend's upsert transfers ownership across users when
 * a shared device re-logs in.
 */
export type DevicePlatform = 'ios' | 'android';

export type DeviceRegisterRequest = {
  fcm_token: string;
  platform: DevicePlatform;
};

export type Device = {
  id: string;
  user_id: string;
  fcm_token: string;
  platform: DevicePlatform;
  last_seen_at: string;
  created_at: string;
};

export function registerDevice(body: DeviceRegisterRequest): Promise<Device> {
  return authedRequest<Device>('/devices/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export function unregisterDevice(fcmToken: string): Promise<void> {
  return authedRequestNoContent(`/devices/${encodeURIComponent(fcmToken)}`, {
    method: 'DELETE',
  });
}
