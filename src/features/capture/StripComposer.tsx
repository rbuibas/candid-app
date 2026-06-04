import { forwardRef, useImperativeHandle, useRef } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { captureRef } from 'react-native-view-shot';

/**
 * Off-screen JPEG composer for the photo-booth strip. Receives the three
 * frame URIs plus the group name and event-date label as props, mounts them
 * in a hidden View styled as a classic 35mm film strip (black body, white
 * sprocket holes down both edges, three frames stacked vertically, and the
 * group name + dates printed at the foot), and exposes an imperative
 * `compose()` that waits for all three images to load then returns the
 * captured strip's tmpfile URI.
 *
 * Why off-screen instead of `<Modal>` or a separate screen: the strip should
 * be invisible to the user (the photo-booth UX is "3 captures → upload",
 * with no compose step). Positioning at `left:-100000` keeps the view in
 * the window so `captureRef` can snapshot it but outside the visible
 * viewport so it never paints.
 *
 * Layout (all values in px at 1× — captureRef snaps the logical pixel size):
 *   - Strip width: 1080
 *   - Sprocket column: 104 each side  → frame width: 872
 *   - Frame: square 872×872, resizeMode cover, 3 frames
 *   - Top border: 48 · gutter between frames: 18
 *   - Caption block: 44 gap + 150 tall (group name + dates)
 *   - Total height: 48 + 3·(872+18) + 44 + 150 = 2912
 */
const STRIP_WIDTH = 1080;
const SPROCKET_COL = 104;
const TOP_BORDER = 48;
const FRAME_GUTTER = 18;
const FRAME_W = STRIP_WIDTH - SPROCKET_COL * 2; // 872
const FRAME_H = FRAME_W; // square
const CAPTION_GAP = 44;
const CAPTION_BLOCK = 150;
const STRIP_HEIGHT = TOP_BORDER + (FRAME_H + FRAME_GUTTER) * 3 + CAPTION_GAP + CAPTION_BLOCK; // 2912

// Sprocket holes — a fixed run of rounded white rectangles down each edge,
// distributed with space-between so they fill the full strip height.
const HOLE_W = 44;
const HOLE_H = 64;
const HOLE_COUNT = 26;
const HOLES = Array.from({ length: HOLE_COUNT }, (_, i) => i);

export type StripComposerRef = {
  compose: () => Promise<string>;
};

type Props = {
  frames: string[]; // three local file URIs from vision-camera
  groupName: string;
  dateLabel: string;
};

export const StripComposer = forwardRef<StripComposerRef, Props>(function StripComposer(
  { frames, groupName, dateLabel },
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
      {/* Sprocket-hole columns — absolute so they span the full strip height,
          behind the frames which sit inside the horizontal padding. */}
      <View style={[styles.holeColumn, styles.holeColumnLeft]} pointerEvents="none">
        {HOLES.map((i) => (
          <View key={`l${i}`} style={styles.hole} />
        ))}
      </View>
      <View style={[styles.holeColumn, styles.holeColumnRight]} pointerEvents="none">
        {HOLES.map((i) => (
          <View key={`r${i}`} style={styles.hole} />
        ))}
      </View>

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

      <View style={styles.caption}>
        <Text style={styles.captionName} numberOfLines={1}>
          {groupName}
        </Text>
        {dateLabel ? (
          <Text style={styles.captionDate} numberOfLines={1}>
            {dateLabel}
          </Text>
        ) : null}
      </View>
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
    // Near-black film body.
    backgroundColor: '#0d0d0d',
    flexDirection: 'column',
    alignItems: 'center',
    paddingHorizontal: SPROCKET_COL,
    paddingTop: TOP_BORDER,
  },
  holeColumn: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: SPROCKET_COL,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 28,
  },
  holeColumnLeft: { left: 0 },
  holeColumnRight: { right: 0 },
  hole: {
    width: HOLE_W,
    height: HOLE_H,
    borderRadius: 10,
    backgroundColor: '#f5f0e8',
  },
  frame: {
    width: FRAME_W,
    height: FRAME_H,
    marginBottom: FRAME_GUTTER,
    borderRadius: 6,
  },
  caption: {
    marginTop: CAPTION_GAP - FRAME_GUTTER,
    height: CAPTION_BLOCK,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  captionName: {
    color: '#f5f0e8',
    fontSize: 48,
    fontWeight: '700',
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  captionDate: {
    marginTop: 16,
    color: '#cfc9bd',
    fontSize: 36,
    fontWeight: '600',
    letterSpacing: 1,
    textAlign: 'center',
  },
});
