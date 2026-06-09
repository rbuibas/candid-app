import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ApiError } from '@/api/client';
import { queryErrorText } from '@/api/errors';
import { deleteGroup, getGroup, type GroupWithLifecycle } from '@/api/groups';
import { listMembers, type GroupMember } from '@/api/members';
import { triggerDevPrompt } from '@/api/prompts';
import { useSession } from '@/auth/SessionProvider';
import { BulkDownloadSheet } from '@/features/download/BulkDownloadSheet';
import { LifecycleBadge } from '@/features/groups/components/LifecycleBadge';
import { MemberAvatar } from '@/features/groups/components/MemberAvatar';
import { formatDateRange, formatJoinedDate } from '@/features/groups/lifecycle';

/**
 * Group info / settings sub-screen. Holds everything that used to live on the
 * group-detail screen before the feed took its place: name, dates, lifecycle,
 * the invite affordance, the member list, the creator's delete-group action,
 * and the Phase-3 test-capture stand-in. Reached via the "Info" button atop
 * the feed. Pure relocation — no behavior changes beyond returning to the
 * groups list (not the deleted feed) after a successful delete.
 */
export default function GroupInfo() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const { session } = useSession();
  const [bulkOpen, setBulkOpen] = useState(false);

  const groupQ = useQuery({
    queryKey: ['groups', id],
    queryFn: () => getGroup(id),
    refetchOnMount: 'always',
    enabled: !!id,
  });

  const membersQ = useQuery({
    queryKey: ['groups', id, 'members'],
    queryFn: () => listMembers(id),
    enabled: !!id,
  });

  const cachedInvite = qc.getQueryData<{ code: string }>(['groups', id, 'invite']);
  const inviteCode = cachedInvite?.code ?? null;

  const deleteM = useMutation({
    mutationFn: () => deleteGroup(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['groups'] });
      qc.removeQueries({ queryKey: ['groups', id] });
      qc.removeQueries({ queryKey: ['groups', id, 'members'] });
      qc.removeQueries({ queryKey: ['groups', id, 'invite'] });
      // Pop both info and the (now-deleted) feed, landing back on the list.
      router.dismissTo('/(app)/groups');
    },
  });

  const triggerM = useMutation({
    mutationFn: (mediaType: 'photo' | 'video') => triggerDevPrompt(id, mediaType),
    onSuccess: (prompt) => {
      router.push({
        pathname: '/(app)/groups/[id]/prompts/[promptId]',
        params: { id, promptId: prompt.id },
      });
    },
    onError: (err) => {
      Alert.alert(
        'Trigger failed',
        err instanceof ApiError
          ? `${err.status}: ${err.body || err.message}`
          : 'Make sure the backend has POST /dev/prompts/trigger enabled (DEV_MODE=true).',
      );
    },
  });

  // Same dev backdoor as triggerM, but jumps straight to the camera instead of
  // the prompt screen. Every photo/video post must be prompt-bound (PostKind is
  // only 'prompt' | 'photobooth'; the API 422s on kind=prompt without a
  // prompt_id), so a true promptless "test capture" can't produce a valid post
  // — we mint a throwaway dev prompt and capture against it.
  const testCaptureM = useMutation({
    mutationFn: (mediaType: 'photo' | 'video') => triggerDevPrompt(id, mediaType),
    onSuccess: (prompt) => {
      router.push({
        pathname: '/(app)/groups/[id]/capture',
        params: { id, promptId: prompt.id },
      });
    },
    onError: (err) => {
      Alert.alert(
        'Test capture failed',
        err instanceof ApiError
          ? `${err.status}: ${err.body || err.message}`
          : 'Make sure the backend has POST /dev/prompts/trigger enabled (DEV_MODE=true).',
      );
    },
  });

  const confirmDelete = () => {
    Alert.alert(
      'Delete this group?',
      'All members lose access and the group is gone for everyone. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => deleteM.mutate() },
      ],
    );
  };

  const onShareInvite = (code: string, name: string) => {
    void Share.share({
      message: `Join "${name}" on Candid: candid://join?code=${code}`,
    });
  };

  if (groupQ.isLoading) {
    return (
      <SafeAreaView style={styles.safe}>
        <Stack.Screen options={{ title: 'Info' }} />
        <View style={styles.center}>
          <ActivityIndicator />
        </View>
      </SafeAreaView>
    );
  }

  if (!groupQ.data) {
    return (
      <SafeAreaView style={styles.safe}>
        <Stack.Screen options={{ title: 'Info' }} />
        <View style={styles.errorBlock}>
          <Text style={styles.error}>{queryErrorText(groupQ.error)}</Text>
          <Pressable
            onPress={() => groupQ.refetch()}
            style={({ pressed }) => [styles.secondaryBtn, pressed && styles.pressed]}
            disabled={groupQ.isRefetching}
          >
            <Text style={styles.secondaryBtnText}>
              {groupQ.isRefetching ? 'Retrying…' : 'Retry'}
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const group: GroupWithLifecycle = groupQ.data;
  const isCreator = !!session && group.created_by === session.user.id;
  // A locked group is read-only (/docs/02 §6): suppress every capture entry
  // point. The test-capture stand-in and the photo-booth opener both go.
  const isLocked = group.lifecycle === 'locked';

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <Stack.Screen options={{ title: 'Info' }} />
      <FlatList<GroupMember>
        data={membersQ.data ?? []}
        keyExtractor={(m) => m.user_id}
        renderItem={({ item }) => <MemberRow member={item} />}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListHeaderComponent={
          <View style={styles.header}>
            <View style={styles.titleRow}>
              <Text style={styles.title} numberOfLines={2}>
                {group.name}
              </Text>
              <LifecycleBadge lifecycle={group.lifecycle} />
            </View>
            <Text style={styles.dates}>{formatDateRange(group.start_date, group.end_date)}</Text>

            <View style={styles.inviteBlock}>
              <Text style={styles.sectionLabel}>Invite</Text>
              {inviteCode ? (
                <>
                  <Text style={styles.inviteCode} selectable>
                    {inviteCode}
                  </Text>
                  <Text style={styles.inviteHint}>Long-press the code to copy.</Text>
                  <Pressable
                    onPress={() => onShareInvite(inviteCode, group.name)}
                    style={({ pressed }) => [styles.primaryBtn, pressed && styles.pressed]}
                  >
                    <Text style={styles.primaryBtnText}>Share invite</Text>
                  </Pressable>
                </>
              ) : (
                <Text style={styles.inviteMissing}>
                  Invite code not available in this session — ask the creator to share it.
                </Text>
              )}
            </View>

            <View style={styles.captureBlock}>
              <Text style={styles.sectionLabel}>Save the album</Text>
              {isLocked ? (
                <>
                  <Text style={styles.captureHint}>
                    Save every photo and video from this group to your camera roll, in the “Candid”
                    album.
                  </Text>
                  <Pressable
                    onPress={() => setBulkOpen(true)}
                    style={({ pressed }) => [styles.primaryBtn, pressed && styles.pressed]}
                  >
                    <Text style={styles.primaryBtnText}>Save all posts to camera roll</Text>
                  </Pressable>
                </>
              ) : (
                <>
                  <View style={[styles.primaryBtn, styles.disabled]}>
                    <Text style={styles.primaryBtnText}>Save all posts to camera roll</Text>
                  </View>
                  <Text style={styles.captureHint}>Available when the event ends.</Text>
                </>
              )}
            </View>

            {isLocked ? (
              <View style={styles.captureBlock}>
                <Text style={styles.sectionLabel}>Event ended</Text>
                <Text style={styles.captureHint}>
                  This group is read-only — captures and prompts are closed. The feed stays
                  viewable.
                </Text>
              </View>
            ) : (
              <View style={styles.captureBlock}>
                <Text style={styles.sectionLabel}>Test capture</Text>
                <Text style={styles.captureHint}>
                  Jumps straight to the camera (skips the prompt screen). Mints a throwaway dev
                  prompt under the hood, so it needs DEV_MODE on the API.
                </Text>
                <View style={styles.captureRow}>
                  <Pressable
                    onPress={() => testCaptureM.mutate('photo')}
                    disabled={testCaptureM.isPending}
                    style={({ pressed }) => [
                      styles.secondaryBtn,
                      styles.captureBtnFlex,
                      testCaptureM.isPending && styles.disabled,
                      pressed && styles.pressed,
                    ]}
                  >
                    {testCaptureM.isPending ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <Text style={styles.secondaryBtnText}>Test photo</Text>
                    )}
                  </Pressable>
                  <Pressable
                    onPress={() => testCaptureM.mutate('video')}
                    disabled={testCaptureM.isPending}
                    style={({ pressed }) => [
                      styles.secondaryBtn,
                      styles.captureBtnFlex,
                      testCaptureM.isPending && styles.disabled,
                      pressed && styles.pressed,
                    ]}
                  >
                    {testCaptureM.isPending ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <Text style={styles.secondaryBtnText}>Test video</Text>
                    )}
                  </Pressable>
                </View>

                <Text style={[styles.captureHint, styles.captureHintTop]}>
                  Full prompt flow — creates a real prompt with a live window, exercises the prompt
                  screen, countdown, and capture. Requires DEV_MODE on the API.
                </Text>
                <View style={styles.captureRow}>
                  <Pressable
                    onPress={() => triggerM.mutate('photo')}
                    disabled={triggerM.isPending}
                    style={({ pressed }) => [
                      styles.secondaryBtn,
                      styles.captureBtnFlex,
                      triggerM.isPending && styles.disabled,
                      pressed && styles.pressed,
                    ]}
                  >
                    {triggerM.isPending ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <Text style={styles.secondaryBtnText}>Trigger photo</Text>
                    )}
                  </Pressable>
                  <Pressable
                    onPress={() => triggerM.mutate('video')}
                    disabled={triggerM.isPending}
                    style={({ pressed }) => [
                      styles.secondaryBtn,
                      styles.captureBtnFlex,
                      triggerM.isPending && styles.disabled,
                      pressed && styles.pressed,
                    ]}
                  >
                    {triggerM.isPending ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <Text style={styles.secondaryBtnText}>Trigger video</Text>
                    )}
                  </Pressable>
                </View>

                <Pressable
                  onPress={() =>
                    router.push({
                      pathname: '/(app)/groups/[id]/photobooth',
                      params: { id },
                    })
                  }
                  style={({ pressed }) => [styles.primaryBtn, pressed && styles.pressed]}
                >
                  <Text style={styles.primaryBtnText}>Open photo booth</Text>
                </Pressable>
              </View>
            )}

            <Text style={styles.sectionLabel}>Members</Text>
            {membersQ.isLoading ? <ActivityIndicator style={styles.membersLoading} /> : null}
            {membersQ.isError ? (
              <Text style={styles.error}>{queryErrorText(membersQ.error)}</Text>
            ) : null}
          </View>
        }
        ListFooterComponent={
          isCreator ? (
            <View style={styles.footer}>
              <Pressable
                onPress={confirmDelete}
                disabled={deleteM.isPending}
                style={({ pressed }) => [
                  styles.dangerBtn,
                  deleteM.isPending && styles.disabled,
                  pressed && styles.pressed,
                ]}
              >
                {deleteM.isPending ? (
                  <ActivityIndicator color="#cf222e" />
                ) : (
                  <Text style={styles.dangerBtnText}>Delete group</Text>
                )}
              </Pressable>
              {deleteM.isError ? (
                <Text style={styles.error}>{queryErrorText(deleteM.error)}</Text>
              ) : null}
            </View>
          ) : null
        }
      />
      <BulkDownloadSheet visible={bulkOpen} groupId={id} onClose={() => setBulkOpen(false)} />
    </SafeAreaView>
  );
}

function MemberRow({ member }: { member: GroupMember }) {
  const name = member.display_name ?? 'Anonymous';
  return (
    <View style={styles.memberRow}>
      <MemberAvatar displayName={member.display_name} avatarUrl={member.avatar_url} />
      <View style={styles.memberText}>
        <Text style={styles.memberName} numberOfLines={1}>
          {name}
        </Text>
        <Text style={styles.memberJoined}>{formatJoinedDate(member.joined_at)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  errorBlock: { padding: 24, gap: 12 },
  error: { color: '#cf222e', fontSize: 14 },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: '#d0d7de', marginLeft: 72 },
  header: { padding: 20, gap: 16 },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  title: { flex: 1, fontSize: 24, fontWeight: '700', color: '#1f2328' },
  dates: { fontSize: 15, color: '#656d76', marginTop: -8 },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#656d76',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  inviteBlock: {
    gap: 8,
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#f6f8fa',
  },
  inviteCode: {
    fontSize: 32,
    fontWeight: '700',
    letterSpacing: 8,
    color: '#1f2328',
    textAlign: 'center',
    paddingVertical: 8,
    fontVariant: ['tabular-nums'],
  },
  inviteHint: { fontSize: 12, color: '#656d76', textAlign: 'center' },
  inviteMissing: { fontSize: 14, color: '#656d76' },
  captureBlock: {
    gap: 8,
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#f6f8fa',
  },
  captureHint: { fontSize: 12, color: '#656d76' },
  captureHintTop: { marginTop: 8 },
  captureRow: { flexDirection: 'row', gap: 12, marginTop: 4 },
  captureBtnFlex: { flex: 1, alignSelf: 'auto', alignItems: 'center' },
  primaryBtn: {
    backgroundColor: '#1f2328',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 4,
  },
  primaryBtnText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  secondaryBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#1f2328',
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  secondaryBtnText: { color: '#fff', fontWeight: '600' },
  membersLoading: { alignSelf: 'flex-start' },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 12,
  },
  memberText: { flex: 1 },
  memberName: { fontSize: 16, color: '#1f2328', fontWeight: '500' },
  memberJoined: { fontSize: 13, color: '#656d76' },
  footer: { padding: 20, gap: 12 },
  dangerBtn: {
    borderWidth: 1,
    borderColor: '#cf222e',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  dangerBtnText: { color: '#cf222e', fontWeight: '600', fontSize: 16 },
  disabled: { opacity: 0.4 },
  pressed: { opacity: 0.7 },
});
