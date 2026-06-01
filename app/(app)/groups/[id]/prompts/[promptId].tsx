import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ApiError } from '@/api/client';
import type { PromptView } from '@/api/prompts';
import { useActivePrompt } from '@/features/prompt/useActivePrompt';
import { usePromptCountdown } from '@/features/prompt/usePromptCountdown';

/**
 * The active-prompt screen. Pure display of the server-computed `state`:
 *   - 'active'  — countdown to on_time_deadline + CTA
 *   - 'late'    — yellow warning; CTA still present
 *   - 'missed'  — neutral acknowledgement; no CTA
 *
 * Lateness is NEVER computed on the client (CLAUDE.md non-negotiable #4):
 * the countdown is purely display, and crossing a deadline triggers a
 * refetch so the new `state` comes from the server.
 */
export default function ActivePromptScreen() {
  const params = useLocalSearchParams<{ id: string; promptId: string }>();
  const { id, promptId } = params;
  const router = useRouter();
  const promptQ = useActivePrompt(promptId);

  if (!id || !promptId) {
    return (
      <FullScreen title="Missing prompt id">
        <Text style={styles.errorText}>Open this screen from a push or the prompts list.</Text>
      </FullScreen>
    );
  }

  if (promptQ.isLoading) {
    return (
      <FullScreen title="Prompt">
        <ActivityIndicator />
      </FullScreen>
    );
  }

  if (promptQ.isError || !promptQ.data) {
    return (
      <FullScreen title="Prompt">
        <Text style={styles.errorText}>
          {promptQ.error instanceof ApiError
            ? `${promptQ.error.status}: ${promptQ.error.body || promptQ.error.message}`
            : 'Network error loading prompt'}
        </Text>
        <Pressable
          onPress={() => promptQ.refetch()}
          style={({ pressed }) => [styles.secondaryBtn, pressed && styles.pressed]}
          disabled={promptQ.isRefetching}
        >
          <Text style={styles.secondaryBtnText}>
            {promptQ.isRefetching ? 'Retrying…' : 'Retry'}
          </Text>
        </Pressable>
      </FullScreen>
    );
  }

  return (
    <PromptBody
      prompt={promptQ.data}
      onRefetch={() => promptQ.refetch()}
      onCapture={() =>
        router.push({
          pathname: '/(app)/groups/[id]/capture',
          params: { id, promptId },
        })
      }
      onBack={() => router.replace({ pathname: '/(app)/groups/[id]', params: { id } })}
    />
  );
}

function PromptBody({
  prompt,
  onRefetch,
  onCapture,
  onBack,
}: {
  prompt: PromptView;
  onRefetch: () => void;
  onCapture: () => void;
  onBack: () => void;
}) {
  // refetch when we cross a deadline so the server's recomputed state lands.
  const onBoundaryCross = useCallback(() => {
    onRefetch();
  }, [onRefetch]);

  const { secondsToOnTime, secondsToLate } = usePromptCountdown({
    onTimeDeadline: prompt.on_time_deadline,
    lateDeadline: prompt.late_deadline,
    onBoundaryCross,
  });

  if (prompt.state === 'responded') {
    return (
      <FullScreen title="Prompt">
        <View style={styles.missedBlock}>
          <Text style={styles.missedTitle}>Already captured!</Text>
          <Text style={styles.missedBody}>Your shot for this prompt is in.</Text>
        </View>
        <Pressable
          onPress={onBack}
          style={({ pressed }) => [styles.secondaryBtn, pressed && styles.pressed]}
        >
          <Text style={styles.secondaryBtnText}>Back to group</Text>
        </Pressable>
      </FullScreen>
    );
  }

  if (prompt.state === 'missed') {
    return (
      <FullScreen title="Prompt">
        <View style={styles.missedBlock}>
          <Text style={styles.missedTitle}>You missed this one</Text>
          <Text style={styles.missedBody}>
            The window closed before a capture landed. Next prompt is on its way.
          </Text>
        </View>
        <Pressable
          onPress={onBack}
          style={({ pressed }) => [styles.secondaryBtn, pressed && styles.pressed]}
        >
          <Text style={styles.secondaryBtnText}>Back to group</Text>
        </Pressable>
      </FullScreen>
    );
  }

  const isLate = prompt.state === 'late';

  return (
    <FullScreen title="Time to capture">
      {isLate ? (
        <View style={styles.lateBanner}>
          <Text style={styles.lateBannerTitle}>Late</Text>
          <Text style={styles.lateBannerBody}>
            You can still post — it&apos;ll be tagged late. {secondsToLate}s remaining.
          </Text>
        </View>
      ) : (
        <View style={styles.countdownBlock}>
          <Text style={styles.countdownLabel}>Capture in</Text>
          <Text style={styles.countdownNumber}>{secondsToOnTime}</Text>
          <Text style={styles.countdownUnit}>seconds</Text>
        </View>
      )}

      <View style={styles.metaBlock}>
        <MetaRow label="Type" value={prompt.media_type === 'video' ? 'Video' : 'Photo'} />
        {prompt.media_type === 'video' && prompt.target_video_length_seconds !== null ? (
          <MetaRow label="Length" value={`${prompt.target_video_length_seconds}s`} />
        ) : null}
      </View>

      <Pressable
        onPress={onCapture}
        style={({ pressed }) => [
          styles.primaryBtn,
          isLate && styles.primaryBtnLate,
          pressed && styles.pressed,
        ]}
      >
        <Text style={styles.primaryBtnText}>{isLate ? 'Capture anyway' : 'Capture'}</Text>
      </Pressable>
    </FullScreen>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metaRow}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={styles.metaValue}>{value}</Text>
    </View>
  );
}

function FullScreen({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <Stack.Screen options={{ title }} />
      <View style={styles.body}>{children}</View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  body: { flex: 1, padding: 24, gap: 24, justifyContent: 'center' },
  countdownBlock: { alignItems: 'center', gap: 4 },
  countdownLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#656d76',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  countdownNumber: {
    fontSize: 96,
    fontWeight: '800',
    color: '#1f2328',
    fontVariant: ['tabular-nums'],
    lineHeight: 110,
  },
  countdownUnit: { fontSize: 18, color: '#656d76', fontWeight: '500' },
  lateBanner: {
    backgroundColor: '#fff8c5',
    borderColor: '#d4a72c',
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    gap: 6,
  },
  lateBannerTitle: { color: '#633c01', fontWeight: '700', fontSize: 16 },
  lateBannerBody: { color: '#633c01', fontSize: 14, lineHeight: 20 },
  missedBlock: { alignItems: 'center', gap: 8 },
  missedTitle: { fontSize: 24, fontWeight: '700', color: '#1f2328' },
  missedBody: { fontSize: 15, color: '#656d76', textAlign: 'center', lineHeight: 22 },
  metaBlock: { gap: 8 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between' },
  metaLabel: { fontSize: 13, color: '#656d76', fontWeight: '500' },
  metaValue: { fontSize: 14, color: '#1f2328', fontWeight: '600' },
  primaryBtn: {
    backgroundColor: '#1f2328',
    paddingVertical: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  primaryBtnLate: { backgroundColor: '#9a6700' },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 17 },
  secondaryBtn: {
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#d0d7de',
  },
  secondaryBtnText: { color: '#1f2328', fontWeight: '600', fontSize: 15 },
  errorText: { color: '#cf222e', fontSize: 14 },
  pressed: { opacity: 0.7 },
});
