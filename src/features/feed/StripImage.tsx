import { Image } from 'expo-image';
import { StyleSheet } from 'react-native';

/**
 * Renders a photo-booth strip. The strip is already a composed 1:3 image
 * (see src/features/capture/StripComposer.tsx), so we just present it at that
 * aspect with expo-image's caching + contain fit.
 */
export function StripImage({ uri }: { uri: string }) {
  return <Image source={{ uri }} style={styles.strip} contentFit="contain" transition={150} />;
}

const styles = StyleSheet.create({
  strip: {
    width: '100%',
    aspectRatio: 1 / 3,
    backgroundColor: '#000',
  },
});
