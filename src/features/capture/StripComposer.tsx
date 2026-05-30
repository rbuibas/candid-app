import { forwardRef, useImperativeHandle, useRef } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { captureRef } from 'react-native-view-shot';

/**
 * Off-screen JPEG composer for the photo-booth strip. Receives the three
 * frame URIs as a prop, mounts them stacked in a 1080×3240 hidden View, and
 * exposes an imperative `compose()` that waits for all three to load and
 * returns the captured strip's tmpfile URI.
 *
 * Why off-screen instead of `<Modal>` or a separate screen: the strip should
 * be invisible to the user (the photo-booth UX is "3 captures → upload",
 * with no compose step). Positioning at `left:-100000` keeps the view in
 * the window so `captureRef` can snapshot it but outside the visible
 * viewport so it never paints.
 *
 * Each frame is square (1080×1080) with `resizeMode='cover'` so portrait or
 * landscape photos crop to a consistent strip shape, matching a physical
 * photo-booth strip. The whole strip is 1:3 aspect — vertical orientation.
 */
const FRAME_SIZE = 1080;
const STRIP_WIDTH = FRAME_SIZE;
const STRIP_HEIGHT = FRAME_SIZE * 3;

export type StripComposerRef = {
  compose: () => Promise<string>;
};

type Props = {
  frames: string[]; // three local file URIs from vision-camera
};

export const StripComposer = forwardRef<StripComposerRef, Props>(function StripComposer(
  { frames },
  ref,
) {
  const viewRef = useRef<View>(null);
  const loadedCount = useRef(0);
  const loadResolver = useRef<(() => void) | null>(null);

  useImperativeHandle(
    ref,
    () => ({
      async compose() {
        if (frames.length !== 3) {
          throw new Error(`StripComposer.compose requires exactly 3 frames (got ${frames.length})`);
        }
        if (loadedCount.current < 3) {
          await new Promise<void>((resolve) => {
            loadResolver.current = resolve;
          });
        }
        const uri = await captureRef(viewRef, {
          format: 'jpg',
          quality: 0.9,
          result: 'tmpfile',
        });
        return uri;
      },
    }),
    [frames],
  );

  const onImageLoad = () => {
    loadedCount.current += 1;
    if (loadedCount.current >= 3 && loadResolver.current) {
      loadResolver.current();
      loadResolver.current = null;
    }
  };

  return (
    <View ref={viewRef} collapsable={false} style={styles.strip}>
      {frames.map((uri, i) => (
        <Image
          // The frame index is the stable identity here — there are exactly
          // three frames and each slot maps to one capture in order.
          // eslint-disable-next-line react/no-array-index-key
          key={i}
          source={{ uri: uri.startsWith('file://') ? uri : `file://${uri}` }}
          style={styles.frame}
          onLoad={onImageLoad}
          resizeMode="cover"
        />
      ))}
    </View>
  );
});

const styles = StyleSheet.create({
  strip: {
    width: STRIP_WIDTH,
    height: STRIP_HEIGHT,
    position: 'absolute',
    left: -100000,
    top: -100000,
    backgroundColor: '#000',
    flexDirection: 'column',
  },
  frame: {
    width: FRAME_SIZE,
    height: FRAME_SIZE,
  },
});
