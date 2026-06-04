import { useQuery } from '@tanstack/react-query';

import { getProfileMe } from '@/api/profile';

import { useSession } from './SessionProvider';

/**
 * The authenticated user's own profile (GET /profile/me). Only fetched while
 * authenticated. Shares the ['profile', 'me'] key with useTimezoneSync's
 * post-PATCH invalidation, so a timezone or display-name update refreshes it.
 */
export function useProfileMe() {
  const { status } = useSession();
  return useQuery({
    queryKey: ['profile', 'me'],
    queryFn: getProfileMe,
    enabled: status === 'authenticated',
  });
}
