import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Camera,
  useCameraDevice,
  type CameraRuntimeError,
  type PhotoFile,
} from 'react-native-vision-camera';

import { ApiError } from '@/api/client';
import { getGroup } from '@/api/groups';
import { confirmPost, createUploadUrl, type Post, type UploadUrlResponse } from '@/api/posts';
import { createAvatarUploadUrl, patchAvatar, type AvatarUploadUrlResponse } from '@/api/profile';
import { Countdown } from '@/features/capture/components/Countdown';
import { StripComposer, type StripComposerRef } from '@/features/capture/StripComposer';
import { formatDateRange } from '@/features/groups/lifecycle';
import { useBestFormat } from '@/features/capture/useBestFormat';
import { contentTypeFor, uploadBytes } from '@/features/capture/uploadBytes';
import { useCameraPermissions } from '@/features/capture/useCameraPermissions';

const COUNTDOWN_SECONDS = 3;
const FRAME_COUNT = 3;

type Phase =
  | { kind: 'countdown'; frame: number }
  | { kind: 'capturing'; frame: number }
  | { kind: 'composing' }
  | { kind: 'uploading-strip' }
  | { kind: 'uploading-avatar' }
  | { kind: 'done' }
  | { kind: 'error'; message: string };

export default function PhotoBoothScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { status, request, openSettings } = useCameraPermissions();

  useEffect(() => {
    if (status === 'undetermined') void request();
  }, [status, request]);

  if (!id) return <FullScreenError title="Missing group id" />;
  if (status === 'unknown') return <FullScreenLoading />;
  if (status === 'undetermined') {
    return (
      <RationaleScreen
        title="Camera + microphone"
        body="The photo booth captures 3 quick selfies and uses them for your group avatar. Candid needs camera and microphone access to keep the camera roll out of the picture entirely — every shot is live."
        onAllow={request}
      />
    );
  }
  if (status === 'denied' || status === 'restricted') {
    return <RecoveryScreen onOpenSettings={openSettings} onBack={() => router.back()} />;
  }

  return <PhotoBoothLive groupId={id} onBack={() => router.back()} />;
}

function PhotoBoothLive({ groupId, onBack }: { groupId: string; onBack: () => void }) {
  const device = useCameraDevice('front');
  // Same sharpest-still format selection as prompt capture — the strip becomes
  // the avatar + first feed post, so its quality matters just as much. The
  // booth is always photo mode (front camera, no tap-to-focus: it auto-fires on
  // a countdown and the subject is at a fixed arm's length).
  const preferredFormat = useBestFormat(device, 'photo');
  // Some devices can't configure a session with our forced max-resolution format
  // alongside the preview stream: vision-camera throws
  // `session/invalid-output-configuration` (or `session/hardware-cost-too-high`)
  // and the booth never starts. On that error we fall back to `undefined` so
  // vision-camera auto-picks a valid combination (see `onCameraError`).
  const [formatFailed, setFormatFailed] = useState(false);
  const format = formatFailed ? undefined : preferredFormat;
  // HDR and low-light boost are CameraX vendor extensions and cannot bind
  // together — passing both throws LowLightBoostNotSupportedWithHdr at session
  // configure time, so the booth camera never starts. Prefer HDR; fall back to
  // low-light boost only when HDR isn't available. (The booth is flash-off and
  // has no tap-to-focus, so the extension's flash/focus limits don't matter
  // here — only the simultaneous-bind crash does.) On a format fallback we drop
  // both extensions too: they add their own stream-config constraints and may be
  // what the hardware couldn't satisfy in the first place.
  const photoHdrActive = !formatFailed && (preferredFormat?.supportsPhotoHdr ?? false);
  const lowLightActive =
    !formatFailed && !photoHdrActive && (device?.supportsLowLightBoost ?? false);
  const onCameraError = useCallback(
    (err: CameraRuntimeError) => {
      const isConfigError =
        err.code === 'session/invalid-output-configuration' ||
        err.code === 'session/hardware-cost-too-high';
      if (isConfigError && !formatFailed) {
        // eslint-disable-next-line no-console
        console.warn(
          `[photobooth] ${device?.name ?? 'device'} can't configure booth session ` +
            `with forced format (${err.code}); falling back to auto-picked format`,
        );
        setFormatFailed(true);
        return;
      }
      // eslint-disable-next-line no-console
      console.error(`[photobooth] camera runtime error: ${err.code}`, err.message);
    },
    [device, formatFailed],
  );
  const cameraRef = useRef<Camera>(null);
  const composerRef = useRef<StripComposerRef>(null);
  const qc = useQueryClient();
  const router = useRouter();

  // Group name + event dates are printed at the foot of the film strip. The
  // feed already caches this query under the same key, so it's typically warm
  // by the time the three frames finish (~9s of countdowns).
  const groupQ = useQuery({
    queryKey: ['groups', groupId],
    queryFn: () => getGroup(groupId),
    enabled: !!groupId,
  });
  const groupName = groupQ.data?.name ?? '';
  const dateLabel = groupQ.data
    ? formatDateRange(groupQ.data.start_date, groupQ.data.end_date)
    : '';

  // Retry state — everything that survives a failed-and-retried run.
  const framesRef = useRef<string[]>([]);
  const composedRef = useRef<string | null>(null);
  const stripMintRef = useRef<UploadUrlResponse | null>(null);
  const stripPostRef = useRef<Post | null>(null);
  const avatarMintRef = useRef<AvatarUploadUrlResponse | null>(null);
  const [frames, setFrames] = useState<string[]>([]); // mirror for StripComposer prop

  const [phase, setPhase] = useState<Phase>({ kind: 'countdown', frame: 0 });
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  const captureFrame = useCallback(async (frameIndex: number) => {
    setPhase({ kind: 'capturing', frame: frameIndex });
    const cam = cameraRef.current;
    if (!cam) throw new Error('Camera not ready');
    const photo: PhotoFile = await cam.takePhoto({ flash: 'off', enableShutterSound: false });
    framesRef.current = [...framesRef.current, photo.path];
    setFrames(framesRef.current);
    if (frameIndex + 1 < FRAME_COUNT) {
      setPhase({ kind: 'countdown', frame: frameIndex + 1 });
    } else {
      setPhase({ kind: 'composing' });
    }
  }, []);

  const onCountdownComplete = useCallback(() => {
    if (phaseRef.current.kind !== 'countdown') return;
    const frameIndex = phaseRef.current.frame;
    void captureFrame(frameIndex).catch((err: unknown) => {
      setPhase({ kind: 'error', message: errMessage(err, 'Capture failed') });
    });
  }, [captureFrame]);

  const composeAndUpload = useCallback(async () => {
    // 1. Compose the strip if we haven't already.
    if (!composedRef.current) {
      const composer = composerRef.current;
      if (!composer) throw new Error('Composer not mounted');
      composedRef.current = await composer.compose();
    }
    const composed = composedRef.current;

    // 2. Upload the strip post (mint cached for idempotent retry).
    setPhase({ kind: 'uploading-strip' });
    if (!stripPostRef.current) {
      if (!stripMintRef.current) {
        stripMintRef.current = await createUploadUrl({
          group_id: groupId,
          kind: 'photobooth',
          media_type: 'strip',
          extension: 'jpg',
        });
      }
      const stripMint = stripMintRef.current;
      await uploadBytes(stripMint.upload_url, composed, contentTypeFor('strip'));
      stripPostRef.current = await confirmPost({
        post_id: stripMint.post_id,
        group_id: groupId,
        kind: 'photobooth',
        media_type: 'strip',
        storage_path: stripMint.storage_path,
        captured_at: new Date().toISOString(),
      });
    }

    // 3. Upload the avatar (frame 1 auto-pick).
    setPhase({ kind: 'uploading-avatar' });
    if (!avatarMintRef.current) {
      avatarMintRef.current = await createAvatarUploadUrl('jpg');
    }
    const avatarMint = avatarMintRef.current;
    const frame0 = framesRef.current[0];
    if (!frame0) throw new Error('Missing first frame for avatar');
    await uploadBytes(avatarMint.upload_url, frame0, 'image/jpeg');
    await patchAvatar(avatarMint.storage_path);

    // 4. Refresh profile + members so the new avatar shows up immediately.
    //    Seed the photobooth-mine cache with the real post object NOW so
    //    the group detail guard sees non-null data on its very first render —
    //    invalidating alone leaves stale null in the cache which can trigger
    //    a re-route before the background refetch finishes.
    qc.setQueryData(['groups', groupId, 'photobooth-mine'], stripPostRef.current);
    await Promise.all([
      qc.invalidateQueries({ queryKey: ['profile', 'me'] }),
      qc.invalidateQueries({ queryKey: ['groups', groupId, 'members'] }),
      qc.invalidateQueries({ queryKey: ['groups', groupId, 'photobooth-mine'] }),
    ]);

    setPhase({ kind: 'done' });
  }, [groupId, qc]);

  // Drive the composing/upload sequence whenever we enter `composing`.
  useEffect(() => {
    if (phase.kind !== 'composing') return;
    composeAndUpload().catch((err: unknown) => {
      setPhase({ kind: 'error', message: errMessage(err, 'Upload failed') });
    });
  }, [phase, composeAndUpload]);

  // When `done`, land on the group feed — the strip is already seeded into the
  // photobooth-mine cache above, so the feed's join-guard won't bounce back.
  useEffect(() => {
    if (phase.kind !== 'done') return;
    router.replace({ pathname: '/(app)/groups/[id]', params: { id: groupId } });
  }, [phase, router, groupId]);

  const retry = useCallback(() => {
    setPhase({ kind: 'composing' });
  }, []);

  if (!device) {
    return <FullScreenError title="No front camera available on this device" />;
  }

  return (
    <View style={styles.cameraWrap}>
      <Stack.Screen options={{ headerShown: false }} />
      <Camera
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        device={device}
        format={format}
        isActive={phase.kind === 'countdown' || phase.kind === 'capturing'}
        onError={onCameraError}
        photo
        audio={false}
        // 'quality' for the sharpest avatar/strip. The ~3s countdown between
        // frames absorbs the slightly slower shutter, so the booth still feels
        // instant. HDR + low-light boost where the front sensor supports them.
        photoQualityBalance="quality"
        photoHdr={photoHdrActive}
        lowLightBoost={lowLightActive}
      />

      {/* Off-screen strip composer — only mounted once we have all 3 frames. */}
      {frames.length === FRAME_COUNT ? (
        <StripComposer
          ref={composerRef}
          frames={frames}
          groupName={groupName}
          dateLabel={dateLabel}
        />
      ) : null}

      <SafeAreaView style={styles.overlay} pointerEvents="box-none">
        <View style={styles.topBar}>
          <Pressable onPress={onBack} style={styles.closeBtn} hitSlop={16}>
            <Text style={styles.closeBtnText}>Cancel</Text>
          </Pressable>
          <View style={styles.frameChip}>
            <Text style={styles.frameChipText}>
              Frame {Math.min(framesRef.current.length + 1, FRAME_COUNT)}/{FRAME_COUNT}
            </Text>
          </View>
        </View>

        <View style={styles.center} pointerEvents="none">
          {phase.kind === 'countdown' ? (
            <Countdown
              key={`countdown-${phase.frame}`}
              seconds={COUNTDOWN_SECONDS}
              onComplete={onCountdownComplete}
            />
          ) : null}
          {phase.kind === 'capturing' ? <View style={styles.flash} /> : null}
          {phase.kind === 'composing' ? <Spinner label="Composing strip…" /> : null}
          {phase.kind === 'uploading-strip' ? <Spinner label="Uploading…" /> : null}
          {phase.kind === 'uploading-avatar' ? <Spinner label="Setting avatar…" /> : null}
        </View>

        <View style={styles.bottomBar}>
          {phase.kind === 'error' ? (
            <View style={styles.errorBlock}>
              <Text style={styles.errorText}>{phase.message}</Text>
              <Pressable
                onPress={retry}
                style={({ pressed }) => [styles.retryBtn, pressed && styles.pressed]}
              >
                <Text style={styles.retryBtnText}>Retry</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      </SafeAreaView>
    </View>
  );
}

function errMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) return `${err.status}: ${err.body || err.message}`;
  if (err instanceof Error) return err.message;
  return fallback;
}

function Spinner({ label }: { label: string }) {
  return (
    <View style={styles.spinnerWrap}>
      <ActivityIndicator color="#fff" size="large" />
      <Text style={styles.spinnerLabel}>{label}</Text>
    </View>
  );
}

function FullScreenLoading() {
  return (
    <SafeAreaView style={styles.fillSafe}>
      <Stack.Screen options={{ title: 'Photo booth' }} />
      <View style={styles.fillCenter}>
        <ActivityIndicator />
      </View>
    </SafeAreaView>
  );
}

function FullScreenError({ title }: { title: string }) {
  return (
    <SafeAreaView style={styles.fillSafe}>
      <Stack.Screen options={{ title: 'Photo booth' }} />
      <View style={styles.rationaleWrap}>
        <Text style={styles.rationaleTitle}>{title}</Text>
      </View>
    </SafeAreaView>
  );
}

function RationaleScreen({
  title,
  body,
  onAllow,
}: {
  title: string;
  body: string;
  onAllow: () => void;
}) {
  return (
    <SafeAreaView style={styles.fillSafe}>
      <Stack.Screen options={{ title: 'Photo booth' }} />
      <View style={styles.rationaleWrap}>
        <Text style={styles.rationaleTitle}>{title}</Text>
        <Text style={styles.rationaleBody}>{body}</Text>
        <Pressable
          onPress={onAllow}
          style={({ pressed }) => [styles.primaryBtn, pressed && styles.pressed]}
        >
          <Text style={styles.primaryBtnText}>Allow</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

function RecoveryScreen({
  onOpenSettings,
  onBack,
}: {
  onOpenSettings: () => void;
  onBack: () => void;
}) {
  return (
    <SafeAreaView style={styles.fillSafe}>
      <Stack.Screen options={{ title: 'Photo booth' }} />
      <View style={styles.rationaleWrap}>
        <Text style={styles.rationaleTitle}>Camera access blocked</Text>
        <Text style={styles.rationaleBody}>
          Candid can't open the camera until you grant access in Settings.
        </Text>
        <Pressable
          onPress={onOpenSettings}
          style={({ pressed }) => [styles.primaryBtn, pressed && styles.pressed]}
        >
          <Text style={styles.primaryBtnText}>Open Settings</Text>
        </Pressable>
        <Pressable
          onPress={onBack}
          style={({ pressed }) => [styles.secondaryBtn, pressed && styles.pressed]}
        >
          <Text style={styles.secondaryBtnText}>Back to group</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fillSafe: { flex: 1, backgroundColor: '#fff' },
  fillCenter: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  cameraWrap: { flex: 1, backgroundColor: '#000' },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'space-between',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  closeBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderRadius: 16,
  },
  closeBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  frameChip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderRadius: 12,
  },
  frameChipText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  flash: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.9)',
  },
  spinnerWrap: { alignItems: 'center', gap: 12 },
  spinnerLabel: { color: '#fff', fontSize: 16, fontWeight: '600' },
  bottomBar: { padding: 16, minHeight: 60 },
  errorBlock: {
    padding: 12,
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderRadius: 8,
    gap: 8,
  },
  errorText: { color: '#fff', fontSize: 13 },
  retryBtn: {
    backgroundColor: '#fff',
    paddingVertical: 10,
    borderRadius: 6,
    alignItems: 'center',
  },
  retryBtnText: { color: '#1f2328', fontWeight: '700' },
  rationaleWrap: { flex: 1, padding: 24, justifyContent: 'center', gap: 16 },
  rationaleTitle: { fontSize: 24, fontWeight: '700', color: '#1f2328' },
  rationaleBody: { fontSize: 15, color: '#656d76', lineHeight: 22 },
  primaryBtn: {
    backgroundColor: '#1f2328',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  primaryBtnText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  secondaryBtn: {
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#d0d7de',
  },
  secondaryBtnText: { color: '#1f2328', fontWeight: '600', fontSize: 15 },
  pressed: { opacity: 0.7 },
});
