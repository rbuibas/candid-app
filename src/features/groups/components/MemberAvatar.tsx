import { Image, StyleSheet, Text, View } from 'react-native';

type Props = {
  displayName: string | null;
  avatarUrl: string | null;
  size?: number;
};

const PALETTE = ['#1f6feb', '#bf3989', '#1a7f37', '#9a6700', '#8250df', '#0a3069', '#cf222e'];

function initialsFor(name: string | null): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0 || parts[0].length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function colorFor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  return PALETTE[Math.abs(hash) % PALETTE.length];
}

export function MemberAvatar({ displayName, avatarUrl, size = 40 }: Props) {
  const dim = { width: size, height: size, borderRadius: size / 2 };

  if (avatarUrl) {
    return <Image source={{ uri: avatarUrl }} style={[styles.image, dim]} />;
  }

  const bg = colorFor(displayName ?? 'unknown');
  return (
    <View style={[styles.fallback, dim, { backgroundColor: bg }]}>
      <Text style={[styles.initials, { fontSize: size * 0.4 }]}>{initialsFor(displayName)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  image: {
    backgroundColor: '#e7e7ea',
  },
  fallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: {
    color: '#fff',
    fontWeight: '700',
  },
});
