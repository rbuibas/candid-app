import { Ionicons } from '@expo/vector-icons';
import { Redirect, Tabs, useRouter } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { useActiveGroup } from '@/features/groups/useActiveGroup';
import { useActiveGroupStore } from '@/stores/activeGroup';

/**
 * The five-item bottom bar (candid-requirements §3), left → right:
 *   Feed · Groups · Camera (centered) · Event · Profile.
 * Feed is the default landing tab. The detail routes (capture, photobooth,
 * info, viewer, post, prompt) live at app/(app)/groups/[id]/* and present
 * full-screen *over* these tabs.
 *
 * THE SINGLE TOP-LEVEL GUARD. Everything reaching the tabs passes through
 * useActiveGroup() here:
 *   - loading → splash (storage/first-fetch still settling)
 *   - empty   → create-or-join; an empty feed is never reachable
 *   - ready   → the tab bar, with a guaranteed-valid active group
 *
 * This is also the seam the E2 prompt gate hooks into: a live, unanswered
 * prompt will, right here, collapse the app to the capture screen + a reduced
 * settings surface before the Tabs ever render. We implement no gating now —
 * only the shape that lets one guard do it later.
 */
export default function TabsLayout() {
  const router = useRouter();
  const res = useActiveGroup();

  if (res.status === 'loading') {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  if (res.status === 'empty') {
    return <Redirect href="/(app)/welcome" />;
  }

  // E2 hook-in point: `if (livePrompt) return <Redirect href=…capture… />`.

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#1f2328',
        tabBarInactiveTintColor: '#8c959f',
        tabBarStyle: styles.tabBar,
      }}
    >
      <Tabs.Screen
        name="feed"
        options={{
          title: 'Feed',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="groups"
        options={{
          title: 'Groups',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="people-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="camera"
        options={{
          title: 'Camera',
          // Center, emphasised — the BeReal capture affordance.
          tabBarIcon: ({ size }) => <Ionicons name="camera" size={size + 6} color="#1f2328" />,
        }}
        listeners={() => ({
          // The camera isn't a browsable tab page: pressing it opens the
          // existing capture screen for the active group, full-screen over the
          // tabs. Its contextual behaviour (original vs. late vs. voluntary) is
          // E2 — here it just opens the camera as-is.
          tabPress: (e) => {
            e.preventDefault();
            const id = useActiveGroupStore.getState().activeGroupId;
            if (id) {
              router.push({ pathname: '/(app)/groups/[id]/capture', params: { id } });
            }
          },
        })}
      />
      <Tabs.Screen
        name="event"
        options={{
          title: 'Event',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="film-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person-outline" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  tabBar: { borderTopColor: '#d0d7de' },
});
