import { Image } from 'expo-image';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Animated, PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { type FeedItem } from '@/api/feed';
import { downloadToTempFile, releaseTempFile } from '@/features/download/bulkDownload';
import { markDownloaded, useDownloadStore } from '@/features/download/downloadStore';
import { useMediaPermission } from '@/features/download/permission';
import { saveAssetToCameraRoll } from '@/features/download/save';

import { VideoPlayer } from './VideoPlayer';

/**
 * Full-size post viewer body. Rendered by the `groups/[id]/viewer` route, which
 * presents it as a transparent native modal — NOT a React Native `<Modal>`.
 * expo-video's `<VideoView>` is a windowed native surface that renders black
 * inside an RN `<Modal>`, so inline video playback only works when the viewer
 * lives on a real native-stack screen.
 *
 * Pan-to-dismiss + close button + a download button that saves the single post
 * to the camera roll. Works for photo, video (inline playback), and strip
 * (saved as the single composite image — non-negotiable #6).
 *
 * Permission is primed lazily at the first download attempt (never up front);
 * a denial surfaces a non-blocking explainer with a deep link to settings —
 * never a silent failure.
 */
const DISMISS_THRESHOLD = 120;

export function PostViewer({ post, onClose }: { post: FeedItem; onClose: () => void }) {
  const pan = useRef(new Animated.Value(0)).current;
  const { status, request, openSettings } = useMediaPermission();
  const alreadySaved = useDownloadStore((s) => s.has(post.id));
  const [saving, setSaving] = useState(false);
  const [snack, setSnack] = useState<string | null>(null);
  const [denied, setDenied] = useState(false);

  // Vertical pan-to-dismiss. PanResponder + Animated keeps us off a Reanimated
  // dependency. Only downward drags move the sheet; release past the threshold
  // (or a fast flick) closes, otherwise it springs back.
  const responder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dy) > 8 && g.dy > 0,
        onPanResponderMove: (_e, g) => {
          if (g.dy > 0) pan.setValue(g.dy);
        },
        onPanResponderRelease: (_e, g) => {
          if (g.dy > DISMISS_THRESHOLD || g.vy > 1.2) {
            Animated.timing(pan, {
              toValue: 800,
              duration: 180,
              useNativeDriver: true,
            }).start(onClose);
          } else {
            Animated.spring(pan, { toValue: 0, useNativeDriver: true }).start();
          }
        },
      }),
    [pan, onClose],
  );

  const backdropOpacity = pan.interpolate({
    inputRange: [0, 400],
    outputRange: [1, 0.2],
    extrapolate: 'clamp',
  });

  const onDownload = useCallback(async () => {
    let s = status;
    if (s === 'undetermined' || s === 'unknown') s = await request();
    if (s === 'denied') {
      setDenied(true);
      return;
    }
    if (s !== 'granted') return;

    setSaving(true);
    setSnack(null);
    let tempUri: string | null = null;
    try {
      tempUri = await downloadToTempFile(post.media_url, post.id, post.media_type);
      await saveAssetToCameraRoll(tempUri, post.media_type);
      markDownloaded(post.id);
      setSnack('Saved to your camera roll');
    } catch {
      setSnack("Couldn't save — try again");
    } finally {
      if (tempUri) await releaseTempFile(tempUri).catch(() => undefined);
      setSaving(false);
    }
  }, [status, request, post]);

  return (
    <View style={styles.root}>
      <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]} />
      <Animated.View
        style={[styles.sheet, { transform: [{ translateY: pan }] }]}
        {...responder.panHandlers}
      >
        <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
          <View style={styles.topBar}>
            <Pressable onPress={onClose} hitSlop={16} style={styles.closeBtn}>
              <Text style={styles.closeGlyph}>✕</Text>
            </Pressable>
          </View>

          <View style={styles.mediaWrap}>
            <PostViewerMedia post={post} />
          </View>

          <View style={styles.bottomBar}>
            {snack ? (
              <View style={styles.snack}>
                <Text style={styles.snackText}>{snack}</Text>
              </View>
            ) : null}
            <Pressable
              onPress={onDownload}
              disabled={saving}
              style={({ pressed }) => [
                styles.downloadBtn,
                saving && styles.disabled,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.downloadText}>
                {saving ? 'Saving…' : alreadySaved ? 'Save again' : 'Save to camera roll'}
              </Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </Animated.View>

      {denied ? (
        <PermissionDeniedExplainer
          onOpenSettings={openSettings}
          onDismiss={() => setDenied(false)}
        />
      ) : null}
    </View>
  );
}

function PostViewerMedia({ post }: { post: FeedItem }) {
  if (post.media_type === 'video') {
    return <VideoPlayer uri={post.media_url} thumbnailUrl={post.thumbnail_url} />;
  }
  return (
    <Image
      source={{ uri: post.media_url }}
      style={styles.image}
      contentFit="contain"
      transition={150}
    />
  );
}

/**
 * Non-blocking denial explainer with a deep link to settings. Shown only when
 * the OS prompt has been hard-denied — we never auto-re-trigger the prompt
 * (CLAUDE.md non-negotiable #5: permission denial must be surfaced, not silent).
 */
function PermissionDeniedExplainer({
  onOpenSettings,
  onDismiss,
}: {
  onOpenSettings: () => void;
  onDismiss: () => void;
}) {
  return (
    <View style={styles.explainerOverlay}>
      <View style={styles.explainerCard}>
        <Text style={styles.explainerTitle}>Allow saving to your photos</Text>
        <Text style={styles.explainerBody}>
          Candid needs permission to add photos and videos to your camera roll. Turn on photo access
          for Candid in Settings, then try again.
        </Text>
        <Pressable
          onPress={onOpenSettings}
          style={({ pressed }) => [styles.explainerPrimary, pressed && styles.pressed]}
        >
          <Text style={styles.explainerPrimaryText}>Open Settings</Text>
        </Pressable>
        <Pressable onPress={onDismiss} style={styles.explainerSecondary} hitSlop={8}>
          <Text style={styles.explainerSecondaryText}>Not now</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: '#000' },
  sheet: { flex: 1 },
  safe: { flex: 1, justifyContent: 'space-between' },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeGlyph: { color: '#fff', fontSize: 18, fontWeight: '700' },
  mediaWrap: { flex: 1, justifyContent: 'center' },
  image: { width: '100%', flex: 1 },
  bottomBar: { padding: 20, gap: 12 },
  snack: {
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    alignItems: 'center',
  },
  snackText: { color: '#1f2328', fontWeight: '600', fontSize: 14 },
  downloadBtn: {
    backgroundColor: '#fff',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  downloadText: { color: '#1f2328', fontWeight: '700', fontSize: 16 },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.7 },
  explainerOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  explainerCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    gap: 12,
    width: '100%',
    maxWidth: 360,
  },
  explainerTitle: { fontSize: 18, fontWeight: '700', color: '#1f2328' },
  explainerBody: { fontSize: 14, color: '#656d76', lineHeight: 20 },
  explainerPrimary: {
    backgroundColor: '#1f2328',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 4,
  },
  explainerPrimaryText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  explainerSecondary: { alignItems: 'center', paddingVertical: 8 },
  explainerSecondaryText: { color: '#656d76', fontWeight: '600', fontSize: 14 },
});
