import { Image } from 'expo-image';
import { StyleSheet } from 'react-native';

/**
 * Renders a photo-booth strip. The strip is a composed JPEG (see
 * src/features/capture/StripComposer.tsx) at 1080×2912 — a 35mm film-strip
 * layout: black body, sprocket holes down both edges, three frames, and the
 * group name + dates printed at the foot. We present it at the same aspect
 * ratio so it fills the card width cleanly.
 */
export function StripImage({ uri }: { uri: string }) {
  return <Image source={{ uri }} style={styles.strip} contentFit="contain" transition={150} />;
}

const styles = StyleSheet.create({
  strip: {
    width: '100%',
    // 1080 × 2912 — matches StripComposer output dimensions.
    aspectRatio: 1080 / 2912,
    backgroundColor: '#0d0d0d',
  },
});
