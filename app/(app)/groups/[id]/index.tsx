import { useQuery } from '@tanstack/react-query';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ApiError } from '@/api/client';
import { type FeedItem } from '@/api/feed';
import { getGroup, type GroupWithLifecycle } from '@/api/groups';
import { MissedWhileOfflineBanner } from '@/features/capture/MissedWhileOfflineBanner';
import { UploadQueueIndicator } from '@/features/capture/UploadQueueIndicator';
import { LifecycleBadge } from '@/features/groups/components/LifecycleBadge';
import { FeedEmptyState } from '@/features/feed/FeedEmptyState';
import { PostCard } from '@/features/feed/PostCard';
import { useGroupFeed } from '@/features/feed/useGroupFeed';
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
  const photoboothQ = useHasPhotobooth(id);
  useEffect(() => {
    if (!id) return;
    if (photoboothQ.isLoading || photoboothQ.isFetching) return;
    if (photoboothQ.data !== null) return;
    router.replace({ pathname: '/(app)/groups/[id]/photobooth', params: { id } });
  }, [id, photoboothQ.isLoading, photoboothQ.isFetching, photoboothQ.data, router]);

  const feedQ = useGroupFeed(id);

  const openInfo = useCallback(() => {
    router.push({ pathname: '/(app)/groups/[id]/info', params: { id } });
  }, [router, id]);

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
              onPress={openInfo}
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
      ) : feedQ.isError ? (
        <View style={styles.errorBlock}>
          <Text style={styles.error}>
            {feedQ.error instanceof ApiError
              ? `${feedQ.error.status}: ${feedQ.error.body || feedQ.error.message}`
              : 'Network error loading the feed'}
          </Text>
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
          renderItem={({ item }) => <PostCard post={item} groupId={id} />}
          ListHeaderComponent={
            <>
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
    </SafeAreaView>
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
