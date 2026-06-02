import { StyleSheet, Text, View } from 'react-native';

/**
 * Shown when a group's feed has no visible posts yet. Honest + low-pressure,
 * per /docs/02 §8 ("honest empty states").
 */
export function FeedEmptyState() {
  return (
    <View style={styles.wrap}>
      <Text style={styles.text}>Nothing here yet. Wait for a prompt — or check back.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    paddingVertical: 80,
  },
  text: {
    fontSize: 16,
    color: '#656d76',
    textAlign: 'center',
    lineHeight: 24,
  },
});
