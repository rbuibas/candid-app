import { Redirect } from 'expo-router';

/**
 * Phase 2: the authed landing is the groups list. This file exists only so
 * the /(app) href in app/index.tsx and app/(auth)/_layout.tsx still resolves.
 */
export default function AppIndex() {
  return <Redirect href="/(app)/groups" />;
}
