import { Redirect } from 'expo-router';

/**
 * Authed landing → the Feed tab (the default tab). The (tabs) guard
 * (app/(app)/(tabs)/_layout.tsx) takes it from here: it restores the active
 * group, or routes a user with no group to create-or-join. This file exists so
 * the /(app) href in app/index.tsx and app/(auth)/_layout.tsx still resolves.
 */
export default function AppIndex() {
  return <Redirect href="/(app)/(tabs)/feed" />;
}
