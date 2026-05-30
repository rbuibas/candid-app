import { useQuery } from '@tanstack/react-query';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ApiError } from '@/api/client';
import { getPost, type PostWithMediaUrl } from '@/api/posts';

/**
 * Phase 3 verification surface: a barebones screen that reads the post via
 * `GET /posts/{id}` (returns a signed `media_url`) and renders the captured
 * media plus the post metadata. There is no feed UI yet — that lands in
 * Phase 5. Pulling a screen onto each post still lets us validate the full
 * round trip (capture → R2 PUT → confirm → signed GET) on a real device.
 */
export default function PostPreviewScreen() {
  const { id, postId } = useLocalSearchParams<{ id: string; postId: string }>();
  const router = useRouter();

  const postQ = useQuery({
    queryKey: ['posts', postId],
    queryFn: () => getPost(postId),
    enabled: !!postId,
  });

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <Stack.Screen options={{ title: 'Post' }} />
      {postQ.isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator />
        </View>
      ) : postQ.isError || !postQ.data ? (
        <View style={styles.errorBlock}>
          <Text style={styles.errorText}>
            {postQ.error instanceof ApiError
              ? `${postQ.error.status}: ${postQ.error.body || postQ.error.message}`
              : 'Network error loading post'}
          </Text>
          <Pressable
            onPress={() => postQ.refetch()}
            style={({ pressed }) => [styles.secondaryBtn, pressed && styles.pressed]}
          >
            <Text style={styles.secondaryBtnText}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <PostBody post={postQ.data} />
      )}
      <View style={styles.footer}>
        <Pressable
          onPress={() => router.replace({ pathname: '/(app)/groups/[id]', params: { id } })}
          style={({ pressed }) => [styles.primaryBtn, pressed && styles.pressed]}
        >
          <Text style={styles.primaryBtnText}>Done</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

function PostBody({ post }: { post: PostWithMediaUrl }) {
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <MediaBlock post={post} />
      <View style={styles.metaBlock}>
        <Meta label="Kind" value={post.kind} />
        <Meta label="Media type" value={post.media_type} />
        <Meta label="Captured at" value={new Date(post.captured_at).toLocaleString()} />
        <Meta label="Late" value={post.is_late ? 'yes' : 'no'} />
        {post.duration_seconds !== null ? (
          <Meta label="Duration" value={`${post.duration_seconds}s`} />
        ) : null}
        {post.latitude !== null && post.longitude !== null ? (
          <Meta
            label="Location"
            value={`${post.latitude.toFixed(5)}, ${post.longitude.toFixed(5)}${
              post.location_accuracy_meters !== null ? ` (±${post.location_accuracy_meters}m)` : ''
            }`}
          />
        ) : (
          <Meta label="Location" value="none" />
        )}
        <Meta label="Storage path" value={post.storage_path} mono />
      </View>
    </ScrollView>
  );
}

function MediaBlock({ post }: { post: PostWithMediaUrl }) {
  if (post.media_type === 'video') {
    return <PostVideo uri={post.media_url} />;
  }
  // photo + strip both render as JPEG via <Image>. Strip is 1:3 aspect; photo
  // is the device-native ratio. resizeMode='contain' covers both.
  return (
    <Image
      source={{ uri: post.media_url }}
      style={[styles.media, post.media_type === 'strip' && styles.mediaStrip]}
      resizeMode="contain"
    />
  );
}

function PostVideo({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
    p.play();
  });
  return <VideoView style={styles.media} player={player} contentFit="contain" />;
}

function Meta({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <View style={styles.metaRow}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={[styles.metaValue, mono && styles.metaValueMono]} numberOfLines={3}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  errorBlock: { flex: 1, padding: 24, gap: 12, justifyContent: 'center' },
  errorText: { color: '#cf222e', fontSize: 14 },
  content: { padding: 20, gap: 20 },
  media: {
    width: '100%',
    aspectRatio: 3 / 4,
    backgroundColor: '#000',
    borderRadius: 8,
  },
  mediaStrip: { aspectRatio: 1 / 3 },
  metaBlock: { gap: 8 },
  metaRow: { flexDirection: 'row', gap: 12 },
  metaLabel: {
    width: 110,
    fontSize: 12,
    fontWeight: '700',
    color: '#656d76',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  metaValue: { flex: 1, fontSize: 14, color: '#1f2328' },
  metaValueMono: { fontSize: 12, fontFamily: 'Menlo' },
  footer: {
    padding: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#d0d7de',
  },
  primaryBtn: {
    backgroundColor: '#1f2328',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  primaryBtnText: { color: '#fff', fontWeight: '600', fontSize: 16 },
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
