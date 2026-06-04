import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  collectFeedItems,
  runBulkDownload,
  type BulkItem,
  type BulkProgress,
  type BulkSummary,
} from './bulkDownload';
import { useMediaPermission } from './permission';
import { ALBUM_NAME } from './save';

const KEEP_AWAKE_TAG = 'candid-bulk-download';

type Phase =
  | { kind: 'preparing' }
  | { kind: 'error'; message: string }
  | { kind: 'no-posts' }
  | { kind: 'denied' }
  | { kind: 'ready'; items: BulkItem[] }
  | { kind: 'running'; progress: BulkProgress }
  | {
      kind: 'summary';
      summary: BulkSummary;
      /** Items still to do if the run was interrupted (cancel/background). */
      remaining: BulkItem[];
      reason: 'finished' | 'cancelled' | 'backgrounded';
    };

/**
 * Bulk download UI. Opened from two entry points (the retention banner CTA and
 * the permanent Info-screen row). Pages the whole feed, saves every post to the
 * camera roll sequentially, with a progress bar, a cancel button, and an honest
 * summary on completion or interruption.
 *
 * Keeps the screen awake while running and refuses to dismiss mid-run (the user
 * must keep the app foregrounded — backgrounding pauses the run, surfaced
 * honestly rather than pretending it continued).
 */
export function BulkDownloadSheet({
  visible,
  groupId,
  onClose,
}: {
  visible: boolean;
  groupId: string;
  onClose: () => void;
}) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="formSheet"
      onRequestClose={onClose}
    >
      {visible ? <SheetBody groupId={groupId} onClose={onClose} /> : null}
    </Modal>
  );
}

function SheetBody({ groupId, onClose }: { groupId: string; onClose: () => void }) {
  const { status, request, openSettings } = useMediaPermission();
  const [phase, setPhase] = useState<Phase>({ kind: 'preparing' });
  const abortRef = useRef(false);
  const abortReasonRef = useRef<'cancelled' | 'backgrounded' | null>(null);
  const processedRef = useRef(0);

  const running = phase.kind === 'running';

  // Collect the full feed once on open so we can show a real total.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const items = await collectFeedItems(groupId);
        if (cancelled) return;
        setPhase(items.length === 0 ? { kind: 'no-posts' } : { kind: 'ready', items });
      } catch (err) {
        if (!cancelled) {
          setPhase({
            kind: 'error',
            message: err instanceof Error ? err.message : 'Could not load the feed',
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [groupId]);

  // Keep the screen awake only while actively saving.
  useEffect(() => {
    if (running) {
      void activateKeepAwakeAsync(KEEP_AWAKE_TAG);
      return () => {
        void deactivateKeepAwake(KEEP_AWAKE_TAG);
      };
    }
    return undefined;
  }, [running]);

  // Backgrounding mid-run pauses at the next item boundary (OS may suspend us
  // anyway). We surface it honestly rather than pretending it kept running.
  useEffect(() => {
    if (!running) return undefined;
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'background') {
        abortReasonRef.current = 'backgrounded';
        abortRef.current = true;
      }
    });
    return () => sub.remove();
  }, [running]);

  const startRun = useCallback(
    async (items: BulkItem[]) => {
      // Prime permission at the moment of the first save attempt, not on open.
      let s = status;
      if (s === 'undetermined' || s === 'unknown') s = await request();
      if (s === 'denied') {
        setPhase({ kind: 'denied' });
        return;
      }
      if (s !== 'granted') return;

      abortRef.current = false;
      abortReasonRef.current = null;
      processedRef.current = 0;
      setPhase({ kind: 'running', progress: { total: items.length, saved: 0, failed: 0 } });

      const summary = await runBulkDownload(items, {
        onProgress: (progress) => {
          processedRef.current = progress.saved + progress.failed;
          setPhase({ kind: 'running', progress });
        },
        isAborted: () => abortRef.current,
      });

      const reason = summary.aborted ? (abortReasonRef.current ?? 'cancelled') : 'finished';
      const remaining = summary.aborted ? items.slice(processedRef.current) : [];
      setPhase({ kind: 'summary', summary, remaining, reason });
    },
    [status, request],
  );

  const onCancel = useCallback(() => {
    abortReasonRef.current = 'cancelled';
    abortRef.current = true;
  }, []);

  // --- render per phase ---

  if (phase.kind === 'preparing') {
    return (
      <Centered title="Preparing…">
        <ActivityIndicator />
      </Centered>
    );
  }

  if (phase.kind === 'error') {
    return (
      <Centered title="Something went wrong">
        <Text style={styles.body}>{phase.message}</Text>
        <PrimaryButton label="Close" onPress={onClose} />
      </Centered>
    );
  }

  if (phase.kind === 'no-posts') {
    return (
      <Centered title="No posts to save">
        <Text style={styles.body}>This group doesn&apos;t have any posts yet.</Text>
        <PrimaryButton label="Close" onPress={onClose} />
      </Centered>
    );
  }

  if (phase.kind === 'denied') {
    return (
      <Centered title="Allow saving to your photos">
        <Text style={styles.body}>
          Candid needs permission to add photos and videos to your camera roll. Turn on photo access
          for Candid in Settings, then try again.
        </Text>
        <PrimaryButton label="Open Settings" onPress={() => void openSettings()} />
        <SecondaryButton label="Close" onPress={onClose} />
      </Centered>
    );
  }

  if (phase.kind === 'ready') {
    const n = phase.items.length;
    return (
      <Centered title="Save all to camera roll">
        <Text style={styles.body}>
          {n} {n === 1 ? 'post' : 'posts'} will be saved to your camera roll, in the “{ALBUM_NAME}”
          album. Keep Candid open while it runs.
        </Text>
        <PrimaryButton
          label={`Save ${n} ${n === 1 ? 'post' : 'posts'}`}
          onPress={() => void startRun(phase.items)}
        />
        <SecondaryButton label="Not now" onPress={onClose} />
      </Centered>
    );
  }

  if (phase.kind === 'running') {
    const { total, saved, failed } = phase.progress;
    const done = saved + failed;
    return (
      <Centered title="Saving to camera roll">
        <ProgressBar value={done} total={total} />
        <Text style={styles.counter}>
          Saved {saved} of {total}
          {failed > 0 ? ` · ${failed} failed` : ''}
        </Text>
        <Text style={styles.bodyMuted}>Keep Candid open — leaving the app will pause it.</Text>
        <SecondaryButton label="Cancel" onPress={onCancel} />
      </Centered>
    );
  }

  // summary
  const { summary, remaining, reason } = phase;
  const allOk =
    summary.failedItems.length === 0 && summary.saved === summary.total && !summary.aborted;

  return (
    <Centered title={allOk ? 'All saved' : reason === 'backgrounded' ? 'Paused' : 'Saved some'}>
      <SummaryText summary={summary} reason={reason} />
      {remaining.length > 0 ? (
        <PrimaryButton
          label={`Continue (${remaining.length} left)`}
          onPress={() => void startRun(remaining)}
        />
      ) : null}
      {summary.failedItems.length > 0 ? (
        <PrimaryButton
          label={`Try again (${summary.failedItems.length})`}
          onPress={() => void startRun(summary.failedItems)}
        />
      ) : null}
      <SecondaryButton label="Done" onPress={onClose} />
    </Centered>
  );
}

function SummaryText({
  summary,
  reason,
}: {
  summary: BulkSummary;
  reason: 'finished' | 'cancelled' | 'backgrounded';
}) {
  if (reason === 'backgrounded') {
    return (
      <Text style={styles.body}>
        You left the app, so saving paused. Saved {summary.saved} of {summary.total} so far —
        continue to finish the rest.
      </Text>
    );
  }
  if (reason === 'cancelled') {
    return (
      <Text style={styles.body}>
        Cancelled. Saved {summary.saved} of {summary.total} to your camera roll.
      </Text>
    );
  }
  if (summary.failedItems.length > 0) {
    return (
      <Text style={styles.body}>
        Saved {summary.saved} of {summary.total}. {summary.failedItems.length} couldn&apos;t be
        saved — try again for the rest?
      </Text>
    );
  }
  return (
    <Text style={styles.body}>
      Saved {summary.saved} of {summary.total} to your camera roll, in the “{ALBUM_NAME}” album.
    </Text>
  );
}

function ProgressBar({ value, total }: { value: number; total: number }) {
  const pct = total > 0 ? Math.min(100, Math.round((value / total) * 100)) : 0;
  return (
    <View style={styles.progressTrack}>
      <View style={[styles.progressFill, { width: `${pct}%` }]} />
    </View>
  );
}

function Centered({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.center}>
        <Text style={styles.title}>{title}</Text>
        {children}
      </View>
    </SafeAreaView>
  );
}

function PrimaryButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.primaryBtn, pressed && styles.pressed]}
    >
      <Text style={styles.primaryBtnText}>{label}</Text>
    </Pressable>
  );
}

function SecondaryButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.secondaryBtn, pressed && styles.pressed]}
    >
      <Text style={styles.secondaryBtnText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  center: { flex: 1, justifyContent: 'center', padding: 28, gap: 16 },
  title: { fontSize: 24, fontWeight: '700', color: '#1f2328' },
  body: { fontSize: 15, color: '#1f2328', lineHeight: 22 },
  bodyMuted: { fontSize: 13, color: '#656d76', lineHeight: 19 },
  counter: { fontSize: 16, fontWeight: '600', color: '#1f2328' },
  progressTrack: {
    height: 10,
    borderRadius: 5,
    backgroundColor: '#eaeef2',
    overflow: 'hidden',
  },
  progressFill: { height: '100%', borderRadius: 5, backgroundColor: '#1f2328' },
  primaryBtn: {
    backgroundColor: '#1f2328',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 4,
  },
  primaryBtnText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  secondaryBtn: { paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
  secondaryBtnText: { color: '#656d76', fontWeight: '600', fontSize: 15 },
  pressed: { opacity: 0.7 },
});
