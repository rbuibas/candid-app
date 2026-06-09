import { useQuery } from '@tanstack/react-query';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { queryErrorText } from '@/api/errors';
import { type FeedItem } from '@/api/feed';
import { getGroup, type GroupWithLifecycle } from '@/api/groups';
import { MissedWhileOfflineBanner } from '@/features/capture/MissedWhileOfflineBanner';
import { UploadQueueIndicator } from '@/features/capture/UploadQueueIndicator';
import { BulkDownloadSheet } from '@/features/download/BulkDownloadSheet';
import { RetentionBanner } from '@/features/download/RetentionBanner';
import { LifecycleBadge } from '@/features/groups/components/LifecycleBadge';
import { FeedEmptyState } from '@/features/feed/FeedEmptyState';
import { PostCard } from '@/features/feed/PostCard';
import { useGroupFeed } from '@/features/feed/useGroupFeed';
import { useViewerStore } from '@/features/feed/viewerStore';
import { useHasPhotobooth } from '@/features/prompt/useHasPhotobooth';
import { PushDeniedBanner } from '@/notifications/PushDeniedBanner';

/**
 * Group feed — the primary content of a group (per /docs/02 §8, "the feed is
 * the reward"). Phase-2/3 metadata (invite, members, delete, test-capture)
 * moved to the Info sub-screen, reached via the header button.
 */
export default function GroupFeed() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const groupQ = useQuery({
    queryKey: ['groups', id],
    queryFn: () => getGroup(id),
    refetchOnMount: 'always',
    enabled: !!id,
  });

  // Photo-booth-on-join: if the caller has no strip in this group yet, bounce
  // them to the photo booth before they reach the feed. Replace (not push) so
  // back-nav doesn't loop them straight back here.
  //
  // A LOCKED group never fires the booth (/docs/02 §6): the event is over, so
  // we land on the read-only feed. We wait for the group to load before
  // deciding so we don't briefly route a locked group to capture.
  const photoboothQ = useHasPhotobooth(id);
  const isLocked = groupQ.data?.lifecycle === 'locked';
  useEffect(() => {
    if (!id) return;
    if (groupQ.isLoading || !groupQ.data) return;
    if (groupQ.data.lifecycle === 'locked') return;
    if (photoboothQ.isLoading || photoboothQ.isFetching) return;
    if (photoboothQ.data !== null) return;
    router.replace({ pathname: '/(app)/groups/[id]/photobooth', params: { id } });
  }, [
    id,
    groupQ.isLoading,
    groupQ.data,
    photoboothQ.isLoading,
    photoboothQ.isFetching,
    photoboothQ.data,
    router,
  ]);

  const feedQ = useGroupFeed(id);

  // Single-post viewer (tap a post) and the bulk-download sheet (banner CTA).
  // Both are post-event download surfaces; see src/features/download. The viewer
  // is a native route (not an RN <Modal>) so expo-video can render — the tapped
  // post is handed off via useViewerStore.
  const [bulkOpen, setBulkOpen] = useState(false);

  const openInfo = useCallback(() => {
    router.push({ pathname: '/(app)/groups/[id]/info', params: { id } });
  }, [router, id]);

  const openViewer = useCallback(
    (post: FeedItem) => {
      useViewerStore.getState().setPost(post);
      router.push({ pathname: '/(app)/groups/[id]/viewer', params: { id } });
    },
    [router, id],
  );

  const items: FeedItem[] = feedQ.data?.pages.flatMap((page) => page.items) ?? [];

  const onEndReached = useCallback(() => {
    if (feedQ.hasNextPage && !feedQ.isFetchingNextPage) {
      void feedQ.fetchNextPage();
    }
  }, [feedQ]);

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <Stack.Screen
        options={{
          headerTitle: () => <FeedHeaderTitle group={groupQ.data} fallback="Group" />,
          headerRight: () => (
            <Pressable
              // onPressIn, not onPress: custom native-stack header buttons don't
              // fire onPress on Android under Expo SDK 52 / react-native-screens
              // v4 — the button shows press feedback but the handler never runs
              // (expo/expo#33093, react-navigation#12274). onPressIn does fire.
              onPressIn={openInfo}
              hitSlop={12}
              style={({ pressed }) => pressed && styles.pressed}
            >
              <Text style={styles.infoBtn}>Info</Text>
            </Pressable>
          ),
        }}
      />

      {feedQ.isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator />
        </View>
      ) : feedQ.isError && items.length === 0 ? (
        // Only block on error when we have nothing cached to show. A failed
        // background refetch (e.g. offline) keeps the cached feed visible.
        <View style={styles.errorBlock}>
          <Text style={styles.error}>{queryErrorText(feedQ.error)}</Text>
          <Pressable
            onPress={() => feedQ.refetch()}
            style={({ pressed }) => [styles.secondaryBtn, pressed && styles.pressed]}
            disabled={feedQ.isRefetching}
          >
            <Text style={styles.secondaryBtnText}>
              {feedQ.isRefetching ? 'Retrying…' : 'Retry'}
            </Text>
          </Pressable>
        </View>
      ) : (
        <FlatList<FeedItem>
          data={items}
          keyExtractor={(post) => post.id}
          renderItem={({ item }) => <PostCard post={item} groupId={id} onPress={openViewer} />}
          ListHeaderComponent={
            <>
              {isLocked ? <LockedFeedNote /> : null}
              <RetentionBanner group={groupQ.data} onSaveAll={() => setBulkOpen(true)} />
              <MissedWhileOfflineBanner groupId={id} />
              <PushDeniedBanner />
            </>
          }
          ListEmptyComponent={!feedQ.isFetching ? <FeedEmptyState /> : null}
          contentContainerStyle={items.length === 0 ? styles.emptyContent : undefined}
          refreshing={feedQ.isRefetching}
          onRefresh={() => feedQ.refetch()}
          onEndReached={onEndReached}
          onEndReachedThreshold={0.5}
          ListFooterComponent={
            feedQ.isFetchingNextPage ? <ActivityIndicator style={styles.footerSpinner} /> : null
          }
        />
      )}

      <UploadQueueIndicator />
      <BulkDownloadSheet visible={bulkOpen} groupId={id} onClose={() => setBulkOpen(false)} />
    </SafeAreaView>
  );
}

/** Shown atop a locked group's feed — honest read-only state (/docs/02 §6). */
function LockedFeedNote() {
  return (
    <View style={styles.lockedNote}>
      <Text style={styles.lockedNoteTitle}>Event ended</Text>
      <Text style={styles.lockedNoteBody}>
        This group is read-only now — no new prompts or captures. The feed is all yours to look back
        on.
      </Text>
    </View>
  );
}

function FeedHeaderTitle({
  group,
  fallback,
}: {
  group: GroupWithLifecycle | undefined;
  fallback: string;
}) {
  return (
    <View style={styles.headerTitle}>
      <Text style={styles.headerTitleText} numberOfLines={1}>
        {group?.name ?? fallback}
      </Text>
      {group ? <LifecycleBadge lifecycle={group.lifecycle} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  errorBlock: { flex: 1, padding: 24, gap: 12, justifyContent: 'center' },
  error: { color: '#cf222e', fontSize: 14 },
  headerTitle: { flexDirection: 'row', alignItems: 'center', gap: 8, maxWidth: 240 },
  headerTitleText: { fontSize: 17, fontWeight: '700', color: '#1f2328', flexShrink: 1 },
  infoBtn: { fontSize: 16, fontWeight: '600', color: '#1f6feb' },
  emptyContent: { flexGrow: 1 },
  footerSpinner: { paddingVertical: 24 },
  lockedNote: {
    margin: 16,
    padding: 14,
    borderRadius: 12,
    backgroundColor: '#f6f8fa',
    borderWidth: 1,
    borderColor: '#d0d7de',
    gap: 4,
  },
  lockedNoteTitle: { fontSize: 15, fontWeight: '700', color: '#1f2328' },
  lockedNoteBody: { fontSize: 13, color: '#656d76', lineHeight: 19 },
  secondaryBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#1f2328',
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  secondaryBtnText: { color: '#fff', fontWeight: '600' },
  pressed: { opacity: 0.7 },
});
