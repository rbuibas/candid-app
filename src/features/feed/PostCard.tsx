import { Image } from 'expo-image';
import { memo, useCallback } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { type FeedItem } from '@/api/feed';
import { useSession } from '@/auth/SessionProvider';
import { MemberAvatar } from '@/features/groups/components/MemberAvatar';

import { relativeTime } from './relativeTime';
import { StripImage } from './StripImage';
import { useDeletePost } from './useDeletePost';

type Props = {
  post: FeedItem;
  groupId: string;
  /** Tap opens the full-size viewer modal (single-post download lives there). */
  onPress?: (post: FeedItem) => void;
};

function PostCardComponent({ post, groupId, onPress }: Props) {
  const { session } = useSession();
  const deleteM = useDeletePost(groupId);
  const isAuthor = !!session && post.user_id === session.user.id;

  const confirmDelete = useCallback(() => {
    Alert.alert(
      'Delete this post?',
      'It will be removed from the feed for everyone. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => deleteM.mutate(post.id) },
      ],
    );
  }, [deleteM, post.id]);

  // Long-press surfaces an action sheet; "Delete" then routes to the confirm
  // dialog above. Non-authors get no delete affordance at all.
  const onLongPress = useCallback(() => {
    if (!isAuthor) return;
    Alert.alert('Post options', undefined, [
      { text: 'Delete post', style: 'destructive', onPress: confirmDelete },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }, [isAuthor, confirmDelete]);

  const name = post.author.display_name ?? 'Anonymous';

  return (
    <Pressable
      onPress={onPress ? () => onPress(post) : undefined}
      onLongPress={isAuthor ? onLongPress : undefined}
      delayLongPress={350}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={styles.header}>
        <MemberAvatar displayName={post.author.display_name} avatarUrl={post.author.avatar_url} />
        <View style={styles.headerText}>
          <Text style={styles.name} numberOfLines={1}>
            {name}
          </Text>
          <Text style={styles.time}>{relativeTime(post.created_at)}</Text>
        </View>
        {post.is_late ? (
          <View style={styles.lateBadge}>
            <Text style={styles.lateText}>LATE</Text>
          </View>
        ) : null}
      </View>

      <PostMedia post={post} />
    </Pressable>
  );
}

// In-feed media is a static, tappable preview — tapping the card opens the
// viewer modal (which has inline video playback + the download button). Keeping
// the feed posters static (no per-row video players) also keeps the list light.
function PostMedia({ post }: { post: FeedItem }) {
  if (post.media_type === 'video') {
    return (
      <View style={styles.videoPreview}>
        {post.thumbnail_url ? (
          <Image
            source={{ uri: post.thumbnail_url }}
            style={StyleSheet.absoluteFill}
            contentFit="contain"
            transition={150}
          />
        ) : null}
        <View style={styles.playOverlay} pointerEvents="none">
          <View style={styles.playButton}>
            <Text style={styles.playGlyph}>▶</Text>
          </View>
        </View>
      </View>
    );
  }
  if (post.media_type === 'strip') {
    return <StripImage uri={post.media_url} />;
  }
  return (
    <Image
      source={{ uri: post.media_url }}
      style={styles.photo}
      contentFit="contain"
      transition={150}
    />
  );
}

export const PostCard = memo(PostCardComponent);

const styles = StyleSheet.create({
  card: {
    paddingBottom: 20,
  },
  pressed: {
    opacity: 0.85,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  headerText: { flex: 1 },
  name: { fontSize: 16, fontWeight: '600', color: '#1f2328' },
  time: { fontSize: 13, color: '#656d76' },
  lateBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: '#fde7d3',
    alignSelf: 'center',
  },
  lateText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    color: '#9a6700',
  },
  photo: {
    width: '100%',
    aspectRatio: 3 / 4,
    backgroundColor: '#000',
  },
  videoPreview: {
    width: '100%',
    aspectRatio: 3 / 4,
    backgroundColor: '#000',
  },
  playOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playGlyph: { color: '#fff', fontSize: 26, marginLeft: 4 },
});
