import { useQuery } from '@tanstack/react-query';

import { getMyPhotoboothPost } from '@/api/groups';

/**
 * Checks whether the caller already has a photo-booth strip post in this
 * group. Drives the "photo-booth-on-join" auto-navigation in the group
 * detail screen — if the user lands on a group and hasn't strip-posted
 * yet, they're sent straight to the photobooth regardless of the group's
 * lifecycle (per the Phase-4 brief).
 *
 * Backed by GET /groups/{id}/photobooth/me, which 404s when no strip
 * exists; the API client collapses the 404 to null so this hook surfaces
 * a clean { data, isLoading } pair.
 */
export function useHasPhotobooth(groupId: string | undefined) {
  return useQuery({
    queryKey: ['groups', groupId, 'photobooth-mine'],
    queryFn: () => getMyPhotoboothPost(groupId as string),
    enabled: !!groupId,
  });
}
