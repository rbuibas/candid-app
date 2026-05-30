import { Stack } from 'expo-router';

/**
 * Inner stack for the groups route group. Overrides the outer
 * `headerShown: false` from app/(app)/_layout.tsx so each groups screen can
 * declare its own title / header actions.
 */
export default function GroupsLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerTitleStyle: { fontWeight: '700' },
      }}
    />
  );
}
