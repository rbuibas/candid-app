import { useQuery } from '@tanstack/react-query';
import { Redirect, useRouter } from 'expo-router';
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
import { FeedEmptyState } from '@/features/feed/FeedEmptyState';
import { PostCard } from '@/features/feed/PostCard';
import { useFeedOpened } from '@/features/feed/useFeedOpened';
import { useGroupFeed } from '@/features/feed/useGroupFeed';
import { useViewerStore } from '@/features/feed/viewerStore';
import { LifecycleBadge } from '@/features/groups/components/LifecycleBadge';
import { useHasPhotobooth } from '@/features/prompt/useHasPhotobooth';
import { PushDeniedBanner } from '@/notifications/PushDeniedBanner';
import { useActiveGroupStore } from '@/stores/activeGroup';

/**
 * Feed tab — the active group's shared feed (candid-requirements §3, §5) and
 * the default landing tab. Reads the active group from the store (the nav
 * guard in (tabs)/_layout guarantees one is set); the Groups tab switches it,
 * and this screen swaps context immediately because it's store-driven.
 *
 * Ported from the old app/(app)/groups/[id]/index.tsx: same photo-booth-on-join
 * redirect, same feed list, viewer, info, and bulk-download surfaces — now with
 * an in-screen header (the tab has no native-stack header) and the
 * `feed_opened` event on focus.
 */
export default function FeedTab() {
  const groupId = useActiveGroupStore((s) => s.activeGroupId);

  // Guaranteed non-null by the (tabs) guard, but stay honest if it ever isn't.
  if (!groupId) {
    return <Redirect href="/(app)" />;
  }
  return <FeedForGroup groupId={groupId} />;
}

function FeedForGroup({ groupId }: { groupId: string }) {
  const router = useRouter();

  useFeedOpened(groupId);

  const groupQ = useQuery({
    queryKey: ['groups', groupId],
    queryFn: () => getGroup(groupId),
    refetchOnMount: 'always',
    enabled: !!groupId,
  });

  // Photo-booth-on-join: if the caller has no strip in this group yet, bounce
  // them to the photo booth before they reach the feed. Replace (not push) so
  // back-nav doesn't loop them straight back here. A LOCKED group never fires
  // the booth — the event is over, so we land on the read-only feed.
  const photoboothQ = useHasPhotobooth(groupId);
  const isLocked = groupQ.data?.lifecycle === 'locked';
  useEffect(() => {
    if (!groupId) return;
    if (groupQ.isLoading || !groupQ.data) return;
    if (groupQ.data.lifecycle === 'locked') return;
    if (photoboothQ.isLoading || photoboothQ.isFetching) return;
    if (photoboothQ.data !== null) return;
    router.replace({ pathname: '/(app)/groups/[id]/photobooth', params: { id: groupId } });
  }, [
    groupId,
    groupQ.isLoading,
    groupQ.data,
    photoboothQ.isLoading,
    photoboothQ.isFetching,
    photoboothQ.data,
    router,
  ]);

  const feedQ = useGroupFeed(groupId);
  const [bulkOpen, setBulkOpen] = useState(false);

  const openInfo = useCallback(() => {
    router.push({ pathname: '/(app)/groups/[id]/info', params: { id: groupId } });
  }, [router, groupId]);

  const openViewer = useCallback(
    (post: FeedItem) => {
      useViewerStore.getState().setPost(post);
      router.push({ pathname: '/(app)/groups/[id]/viewer', params: { id: groupId } });
    },
    [router, groupId],
  );

  const items: FeedItem[] = feedQ.data?.pages.flatMap((page) => page.items) ?? [];

  const onEndReached = useCallback(() => {
    if (feedQ.hasNextPage && !feedQ.isFetchingNextPage) {
      void feedQ.fetchNextPage();
    }
  }, [feedQ]);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']} testID="feed-screen">
      <FeedHeader group={groupQ.data} onInfo={openInfo} />

      {feedQ.isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator />
        </View>
      ) : feedQ.isError && items.length === 0 ? (
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
          renderItem={({ item }) => <PostCard post={item} groupId={groupId} onPress={openViewer} />}
          ListHeaderComponent={
            <>
              {isLocked ? <LockedFeedNote /> : null}
              <RetentionBanner group={groupQ.data} onSaveAll={() => setBulkOpen(true)} />
              <MissedWhileOfflineBanner groupId={groupId} />
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
      <BulkDownloadSheet visible={bulkOpen} groupId={groupId} onClose={() => setBulkOpen(false)} />
    </SafeAreaView>
  );
}

function FeedHeader({
  group,
  onInfo,
}: {
  group: GroupWithLifecycle | undefined;
  onInfo: () => void;
}) {
  return (
    <View style={styles.header}>
      <View style={styles.headerTitle}>
        <Text style={styles.headerTitleText} numberOfLines={1} testID="feed-group-name">
          {group?.name ?? 'Feed'}
        </Text>
        {group ? <LifecycleBadge lifecycle={group.lifecycle} /> : null}
      </View>
      <Pressable
        testID="feed-info"
        onPress={onInfo}
        hitSlop={12}
        style={({ pressed }) => pressed && styles.pressed}
      >
        <Text style={styles.infoBtn}>Info</Text>
      </Pressable>
    </View>
  );
}

/** Shown atop a locked group's feed — honest read-only state. */
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

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  errorBlock: { flex: 1, padding: 24, gap: 12, justifyContent: 'center' },
  error: { color: '#cf222e', fontSize: 14 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#d0d7de',
  },
  headerTitle: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  headerTitleText: { fontSize: 20, fontWeight: '700', color: '#1f2328', flexShrink: 1 },
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
