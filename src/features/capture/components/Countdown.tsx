import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

/**
 * Big "3, 2, 1" countdown badge for the photo-booth flow. Renders the
 * current second large and centered; calls `onComplete` when the count
 * hits zero. The parent owns triggering — pass `seconds` to start, and a
 * `key` to restart between frames (mount/unmount resets the timer).
 */
type Props = {
  seconds: number;
  onComplete: () => void;
};

export function Countdown({ seconds, onComplete }: Props) {
  const [remaining, setRemaining] = useState(seconds);

  useEffect(() => {
    if (remaining <= 0) {
      onComplete();
      return;
    }
    const t = setTimeout(() => setRemaining((r) => r - 1), 1000);
    return () => clearTimeout(t);
  }, [remaining, onComplete]);

  return (
    <View style={styles.wrap} pointerEvents="none">
      <Text style={styles.digit}>{remaining}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  digit: {
    fontSize: 200,
    fontWeight: '900',
    color: '#fff',
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
    fontVariant: ['tabular-nums'],
  },
});
