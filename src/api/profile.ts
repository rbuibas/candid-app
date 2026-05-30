import { authedRequest } from './client';

/**
 * Mirrors the backend `Profile` model in candid-api/src/app/models/profile.py.
 * Timestamps come over the wire as ISO-8601 strings; convert to Date only at
 * the UI layer if needed.
 */
export type Profile = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  timezone: string;
  created_at: string;
  updated_at: string;
};

export type ProfileUpdate = {
  display_name?: string | null;
  timezone?: string;
  avatar_url?: string | null;
};

export const getProfileMe = (): Promise<Profile> => authedRequest<Profile>('/profile/me');

export const patchProfileMe = (patch: ProfileUpdate): Promise<Profile> =>
  authedRequest<Profile>('/profile/me', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
