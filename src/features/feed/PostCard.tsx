import { Image } from 'expo-image';
import { memo, useCallback } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { type FeedItem } from '@/api/feed';
import { useSession } from '@/auth/SessionProvider';
import { MemberAvatar } from '@/features/groups/components/MemberAvatar';

import { relativeTime } from './relativeTime';
import { StripImage } from './StripImage';
import { useDeletePost } from './useDeletePost';
import { VideoPlayer } from './VideoPlayer';

type Props = {
  post: FeedItem;
  groupId: string;
};

function PostCardComponent({ post, groupId }: Props) {
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
      onLongPress={isAuthor ? onLongPress : undefined}
      delayLongPress={350}
      style={({ pressed }) => [styles.card, pressed && isAuthor && styles.pressed]}
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

function PostMedia({ post }: { post: FeedItem }) {
  if (post.media_type === 'video') {
    return <VideoPlayer uri={post.media_url} thumbnailUrl={post.thumbnail_url} />;
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
});
