import { Image } from 'expo-image';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

/**
 * Feed video: tap-to-play (NOT autoplay), muted by default with an unmute
 * toggle. The poster is the first frame — a paused VideoView renders frame 0
 * natively once the player loads (this expo-video build has no posterSource
 * prop), and we overlay `thumbnailUrl` on top until first play when one exists.
 *
 * The player loops, so playback never auto-stops; local `playing` state stays
 * in sync with the controls without subscribing to player events.
 */
export function VideoPlayer({ uri, thumbnailUrl }: { uri: string; thumbnailUrl?: string | null }) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
    p.muted = true;
  });

  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);
  const [started, setStarted] = useState(false);

  const togglePlay = useCallback(() => {
    if (player.playing) {
      player.pause();
      setPlaying(false);
    } else {
      player.play();
      setPlaying(true);
      setStarted(true);
    }
  }, [player]);

  const toggleMute = useCallback(() => {
    const next = !player.muted;
    player.muted = next;
    setMuted(next);
  }, [player]);

  return (
    <View style={styles.wrap}>
      <VideoView
        style={StyleSheet.absoluteFill}
        player={player}
        nativeControls={false}
        contentFit="contain"
      />

      {/* Poster overlay: only while we have a thumbnail and haven't played yet.
          Without a thumbnail the paused VideoView already shows frame 0. */}
      {thumbnailUrl && !started ? (
        <Image
          source={{ uri: thumbnailUrl }}
          style={StyleSheet.absoluteFill}
          contentFit="contain"
        />
      ) : null}

      {/* Tap layer sits ABOVE the native VideoView — a parent Pressable never
          sees the tap because the native video surface consumes it. */}
      <Pressable style={StyleSheet.absoluteFill} onPress={togglePlay}>
        {!playing ? (
          <View style={styles.playOverlay} pointerEvents="none">
            <View style={styles.playButton}>
              <Text style={styles.playGlyph}>▶</Text>
            </View>
          </View>
        ) : null}
      </Pressable>

      <Pressable style={styles.muteButton} onPress={toggleMute} hitSlop={12}>
        <Text style={styles.muteGlyph}>{muted ? '🔇' : '🔊'}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
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
  playGlyph: {
    color: '#fff',
    fontSize: 26,
    marginLeft: 4,
  },
  muteButton: {
    position: 'absolute',
    right: 12,
    bottom: 12,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  muteGlyph: {
    fontSize: 16,
  },
});
