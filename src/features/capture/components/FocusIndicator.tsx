import { useEffect, useRef } from 'react';
import { Animated, StyleSheet } from 'react-native';

/**
 * Brief tap-to-focus reticle. The capture screen passes the tapped point (in
 * camera-view coordinates) whenever the user taps the preview to focus; the
 * little square pops in at that point and fades after ~1s, then stays hidden.
 *
 * `point` carries an `id` that changes on every tap so re-tapping the same spot
 * restarts the animation. Rendering is purely cosmetic — `pointerEvents` is
 * never set here because the parent positions this above the controls with its
 * own `pointerEvents="none"` wrapper.
 */
const SIZE = 76;

export type FocusPoint = { x: number; y: number; id: number };

export function FocusIndicator({ point }: { point: FocusPoint | null }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!point) return;
    opacity.setValue(1);
    scale.setValue(1.35);
    const anim = Animated.parallel([
      Animated.timing(scale, { toValue: 1, duration: 150, useNativeDriver: true }),
      Animated.sequence([
        Animated.delay(650),
        Animated.timing(opacity, { toValue: 0, duration: 300, useNativeDriver: true }),
      ]),
    ]);
    anim.start();
    return () => anim.stop();
  }, [point, opacity, scale]);

  if (!point) return null;

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.box,
        { left: point.x - SIZE / 2, top: point.y - SIZE / 2, opacity, transform: [{ scale }] },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  box: {
    position: 'absolute',
    width: SIZE,
    height: SIZE,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: '#fff',
    backgroundColor: 'transparent',
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
  },
});
