import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { queryErrorText } from '@/api/errors';
import { type FeedItem } from '@/api/feed';
import { patchProfileMe } from '@/api/profile';
import { useSession } from '@/auth/SessionProvider';
import { useProfileMe } from '@/auth/useProfileMe';
import { PostCard } from '@/features/feed/PostCard';
import { useGroupFeed } from '@/features/feed/useGroupFeed';
import { useViewerStore } from '@/features/feed/viewerStore';
import { MemberAvatar } from '@/features/groups/components/MemberAvatar';
import { usePushPermission, type PushPermissionStatus } from '@/notifications/permissions';
import { useActiveGroupStore } from '@/stores/activeGroup';

const MAX_NAME_LEN = 40;

/**
 * Profile tab (candid-requirements §9) — identity (display name + avatar),
 * settings (notification status/recovery + sign-out), and the user's own
 * contributions in the active group. A richer profile (cross-event history,
 * stats) is post-MVP.
 *
 * NOTE: the full Profile tab contains posts, so E2's prompt gate keeps it
 * behind the gate — only the reduced settings surface (notification recovery,
 * sign-out) stays reachable while a prompt is live. That split is E2's; here we
 * just assemble the surface.
 */
export default function ProfileTab() {
  const groupId = useActiveGroupStore((s) => s.activeGroupId);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']} testID="profile-screen">
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Profile</Text>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <IdentitySection />
        <SettingsSection />
        <ContributionsSection groupId={groupId} />
      </ScrollView>
    </SafeAreaView>
  );
}

function IdentitySection() {
  const router = useRouter();
  const qc = useQueryClient();
  const profileQ = useProfileMe();
  const profile = profileQ.data;

  const [draft, setDraft] = useState<string | null>(null);
  const name = draft ?? profile?.display_name ?? '';

  const saveM = useMutation({
    mutationFn: (displayName: string) => patchProfileMe({ display_name: displayName }),
    onSuccess: () => {
      // Refresh own profile + anything embedding the author/member name.
      qc.invalidateQueries({ queryKey: ['profile', 'me'] });
      qc.invalidateQueries({ queryKey: ['groups'] });
      setDraft(null);
    },
  });

  const trimmed = name.trim();
  const dirty = trimmed !== (profile?.display_name ?? '').trim();
  const canSave = trimmed.length > 0 && dirty && !saveM.isPending;

  return (
    <View style={styles.section}>
      <Text style={styles.sectionLabel}>Identity</Text>
      <View style={styles.identityRow}>
        <MemberAvatar
          displayName={profile?.display_name ?? null}
          avatarUrl={profile?.avatar_url ?? null}
          size={64}
        />
        <Pressable
          testID="profile-edit-photo"
          onPress={() => router.push('/(app)/profile/avatar')}
          style={({ pressed }) => [styles.outlineBtn, pressed && styles.pressed]}
        >
          <Text style={styles.outlineBtnText}>Edit photo</Text>
        </Pressable>
      </View>

      <Text style={styles.fieldLabel}>Display name</Text>
      <TextInput
        testID="profile-display-name-input"
        value={name}
        onChangeText={setDraft}
        placeholder="Your name"
        placeholderTextColor="#9aa3ab"
        autoCapitalize="words"
        autoCorrect={false}
        maxLength={MAX_NAME_LEN}
        editable={!saveM.isPending}
        style={styles.input}
      />
      <Pressable
        testID="profile-save-name"
        onPress={() => saveM.mutate(trimmed)}
        disabled={!canSave}
        style={({ pressed }) => [
          styles.primaryBtn,
          pressed && styles.pressed,
          !canSave && styles.disabled,
        ]}
      >
        {saveM.isPending ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.primaryBtnText}>Save name</Text>
        )}
      </Pressable>
      {saveM.isError ? <Text style={styles.error}>{queryErrorText(saveM.error)}</Text> : null}
    </View>
  );
}

function SettingsSection() {
  const { signOut } = useSession();
  const push = usePushPermission();

  return (
    <View style={styles.section}>
      <Text style={styles.sectionLabel}>Settings</Text>

      <View style={styles.settingRow}>
        <View style={styles.settingText}>
          <Text style={styles.settingTitle}>Notifications</Text>
          <Text style={styles.settingValue}>{pushStatusLabel(push.status)}</Text>
        </View>
        <NotificationAction
          status={push.status}
          onEnable={push.request}
          onOpenSettings={push.openSettings}
        />
      </View>

      <Pressable
        testID="profile-signout"
        onPress={() => {
          void signOut();
        }}
        style={({ pressed }) => [styles.signOutBtn, pressed && styles.pressed]}
      >
        <Text style={styles.signOutBtnText}>Sign out</Text>
      </Pressable>
    </View>
  );
}

function NotificationAction({
  status,
  onEnable,
  onOpenSettings,
}: {
  status: PushPermissionStatus;
  onEnable: () => void;
  onOpenSettings: () => void;
}) {
  if (status === 'granted' || status === 'unknown') return null;
  const isUndetermined = status === 'undetermined';
  return (
    <Pressable
      onPress={() => (isUndetermined ? onEnable() : onOpenSettings())}
      style={({ pressed }) => [styles.smallBtn, pressed && styles.pressed]}
    >
      <Text style={styles.smallBtnText}>{isUndetermined ? 'Enable' : 'Open settings'}</Text>
    </Pressable>
  );
}

function pushStatusLabel(status: PushPermissionStatus): string {
  switch (status) {
    case 'granted':
      return 'On — prompts will arrive';
    case 'denied':
      return 'Off — you won’t get prompts';
    case 'undetermined':
      return 'Not set up yet';
    default:
      return 'Checking…';
  }
}

/**
 * The user's own posts in the active group. Per the brief we reuse the feed
 * query and filter client-side by the current user — groups are ~10 people, so
 * no dedicated endpoint. Shows the posts already loaded into the feed pages.
 */
function ContributionsSection({ groupId }: { groupId: string | null }) {
  const router = useRouter();
  const { session } = useSession();
  const feedQ = useGroupFeed(groupId ?? undefined);

  const myId = session?.user.id;
  const mine: FeedItem[] = (feedQ.data?.pages.flatMap((p) => p.items) ?? []).filter(
    (post) => post.user_id === myId,
  );

  const openViewer = (post: FeedItem) => {
    if (!groupId) return;
    useViewerStore.getState().setPost(post);
    router.push({ pathname: '/(app)/groups/[id]/viewer', params: { id: groupId } });
  };

  return (
    <View style={styles.section}>
      <Text style={styles.sectionLabel}>Your posts</Text>
      {feedQ.isLoading ? (
        <ActivityIndicator style={styles.contributionsLoading} />
      ) : mine.length === 0 ? (
        <Text style={styles.settingValue}>
          Nothing yet — your posts in this group will show up here.
        </Text>
      ) : (
        mine.map((post) => (
          <PostCard key={post.id} post={post} groupId={groupId as string} onPress={openViewer} />
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#d0d7de',
  },
  headerTitle: { fontSize: 20, fontWeight: '700', color: '#1f2328' },
  content: { padding: 20, gap: 28 },
  section: { gap: 12 },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#656d76',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  identityRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: '#656d76' },
  input: {
    borderWidth: 1,
    borderColor: '#d0d7de',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    color: '#1f2328',
  },
  primaryBtn: {
    backgroundColor: '#1f2328',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  primaryBtnText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  outlineBtn: {
    borderWidth: 1,
    borderColor: '#d0d7de',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  outlineBtnText: { color: '#1f2328', fontWeight: '600', fontSize: 15 },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  settingText: { flex: 1, gap: 2 },
  settingTitle: { fontSize: 16, color: '#1f2328', fontWeight: '500' },
  settingValue: { fontSize: 13, color: '#656d76' },
  smallBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: '#1f2328',
    borderRadius: 6,
  },
  smallBtnText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  signOutBtn: { paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
  signOutBtnText: { color: '#cf222e', fontWeight: '600', fontSize: 15 },
  contributionsLoading: { alignSelf: 'flex-start' },
  error: { color: '#cf222e', fontSize: 14 },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.7 },
});
