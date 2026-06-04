import { Image } from 'expo-image';
import { StyleSheet } from 'react-native';

/**
 * Renders a photo-booth strip. The strip is a composed JPEG (see
 * src/features/capture/StripComposer.tsx) at 1080×3192 — a classic strip
 * layout with cream background, side padding, and gutters between frames.
 * We present it at the same aspect ratio so it fills the card width cleanly.
 */
export function StripImage({ uri }: { uri: string }) {
  return <Image source={{ uri }} style={styles.strip} contentFit="contain" transition={150} />;
}

const styles = StyleSheet.create({
  strip: {
    width: '100%',
    // 1080 × 3192 — matches StripComposer output dimensions.
    aspectRatio: 1080 / 3192,
    backgroundColor: '#f5f0e8',
  },
});
