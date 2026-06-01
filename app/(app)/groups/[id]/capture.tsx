import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Camera,
  useCameraDevice,
  type CameraCaptureError,
  type PhotoFile,
  type VideoFile,
} from 'react-native-vision-camera';

import { ApiError } from '@/api/client';
import { getGroup } from '@/api/groups';
import {
  confirmPost,
  createUploadUrl,
  type PostMediaType,
  type UploadUrlResponse,
} from '@/api/posts';
import type { PromptView } from '@/api/prompts';
import { FocusIndicator, type FocusPoint } from '@/features/capture/components/FocusIndicator';
import { bestStabilizationMode, useBestFormat } from '@/features/capture/useBestFormat';
import { geocodeOnce } from '@/features/capture/useGeocode';
import { contentTypeFor, uploadBytes } from '@/features/capture/uploadBytes';
import { useCameraPermissions } from '@/features/capture/useCameraPermissions';
import { useActivePrompt } from '@/features/prompt/useActivePrompt';

type Mode = 'photo' | 'video';

function isMode(value: unknown): value is Mode {
  return value === 'photo' || value === 'video';
}

export default function CaptureScreen() {
  const params = useLocalSearchParams<{ id: string; mode?: string; promptId?: string }>();
  const router = useRouter();
  const id = params.id;
  const promptId = params.promptId;

  const { status, request, openSettings } = useCameraPermissions();
  const groupQ = useQuery({
    queryKey: ['groups', id],
    queryFn: () => getGroup(id),
    enabled: !!id,
  });
  // Always re-fetch the prompt when we have one — gives us a fresh
  // media_type + target_video_length_seconds even if the user deep-linked
  // here cold or the route params are stale.
  const promptQ = useActivePrompt(promptId);

  // Mode comes from the prompt when present; falls back to the legacy
  // ?mode= route param used by the test-capture entry buttons.
  const mode: Mode = promptQ.data
    ? promptQ.data.media_type
    : isMode(params.mode)
      ? params.mode
      : 'photo';

  // On first mount, kick off the OS prompt. If status flips to denied/restricted,
  // the recovery panel below explains the next step.
  useEffect(() => {
    if (status === 'undetermined') {
      void request();
    }
  }, [status, request]);

  if (!id) {
    return <ErrorScreen title="Missing group id" />;
  }
  if (status === 'unknown' || groupQ.isLoading || (promptId && promptQ.isLoading)) {
    return <LoadingScreen />;
  }
  if (status === 'undetermined') {
    return (
      <RationaleScreen
        title="Camera access"
        body={
          mode === 'video'
            ? 'Candid needs camera + microphone access to record this test moment.'
            : 'Candid needs camera access to capture this test moment.'
        }
        onAllow={request}
      />
    );
  }
  if (status === 'denied' || status === 'restricted') {
    return <RecoveryScreen onOpenSettings={openSettings} onBack={() => router.back()} />;
  }
  if (groupQ.isError || !groupQ.data) {
    return (
      <ErrorScreen
        title="Couldn't load group"
        detail={
          groupQ.error instanceof ApiError
            ? `${groupQ.error.status}: ${groupQ.error.body || groupQ.error.message}`
            : 'Network error'
        }
      />
    );
  }

  // Video length cap: prefer the prompt-supplied per-shot cap when present
  // (prompts can specify shorter targets), otherwise the group's max.
  const maxVideoSeconds =
    promptQ.data?.target_video_length_seconds ?? groupQ.data.max_video_length_seconds;

  return (
    <CaptureLive
      groupId={id}
      mode={mode}
      maxVideoSeconds={maxVideoSeconds}
      promptId={promptId}
      onDone={(postId) =>
        router.replace({
          pathname: '/(app)/groups/[id]/posts/[postId]',
          params: { id, postId },
        })
      }
      onBack={() => router.back()}
    />
  );
}

function CaptureLive({
  groupId,
  mode,
  maxVideoSeconds,
  promptId,
  onDone,
  onBack,
}: {
  groupId: string;
  mode: Mode;
  maxVideoSeconds: number;
  promptId: string | undefined;
  onDone: (postId: string) => void;
  onBack: () => void;
}) {
  const device = useCameraDevice('back');
  // Explicitly choose the sharpest format for this prompt's media type instead
  // of letting vision-camera pick a balanced default (see useBestFormat).
  const format = useBestFormat(device, mode);
  const stabilizationMode = bestStabilizationMode(format);
  const qc = useQueryClient();
  const cameraRef = useRef<Camera>(null);
  // Holds the previously-minted upload URL across retries so confirm stays
  // idempotent on the same post_id (per /docs/02 §4 + CLAUDE.md non-neg #?).
  const mintRef = useRef<UploadUrlResponse | null>(null);
  // Holds the file URI between PUT failures so we don't re-record / re-snap
  // a frame the user already captured.
  const fileRef = useRef<{ uri: string; durationSeconds?: number } | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [stage, setStage] = useState<'idle' | 'capturing' | 'minting' | 'uploading' | 'confirming'>(
    'idle',
  );
  // Tap-to-focus reticle position; `id` bumps each tap so re-tapping restarts
  // the fade animation. Cleared automatically once the indicator fades.
  const [focusPoint, setFocusPoint] = useState<FocusPoint | null>(null);
  const focusSeq = useRef(0);

  const captureMutation = useMutation({
    mutationFn: async () => {
      const mediaType: PostMediaType = mode === 'video' ? 'video' : 'photo';
      const extension = mode === 'video' ? 'mp4' : 'jpg';

      // 1. Capture media (skip if we already have a file from a previous attempt).
      if (!fileRef.current) {
        setStage('capturing');
        if (mode === 'photo') {
          const cam = cameraRef.current;
          if (!cam) throw new Error('Camera not ready');
          const photo: PhotoFile = await cam.takePhoto({
            // Flash stays on 'auto' (no flash toggle in the UI, and the app
            // often shoots in low light). Shutter sound off — the prompt push
            // is the cue; the click is just noise. We intentionally do NOT pass
            // qualityPrioritization (that moved to the <Camera photoQualityBalance>
            // prop in vision-camera v4) nor enableAutoRedEyeReduction (adds
            // shutter latency, and spontaneity beats red-eye here).
            flash: 'auto',
            enableShutterSound: false,
          });
          fileRef.current = { uri: photo.path };
        } else {
          const video = await recordVideo(cameraRef, maxVideoSeconds, setIsRecording);
          fileRef.current = { uri: video.path, durationSeconds: Math.round(video.duration) };
        }
      }

      // 2. Mint upload URL (skip if a prior attempt already minted one).
      if (!mintRef.current) {
        setStage('minting');
        mintRef.current = await createUploadUrl({
          group_id: groupId,
          kind: 'prompt',
          media_type: mediaType,
          extension,
          prompt_id: promptId,
        });
      }
      const mint = mintRef.current;
      const file = fileRef.current;

      // 3. PUT bytes (safe to retry — R2 PUT is idempotent on the same key).
      setStage('uploading');
      await uploadBytes(mint.upload_url, file.uri, contentTypeFor(mediaType));

      // 4. Best-effort geocode. Never blocks (3s timeout, swallows everything).
      const location = await geocodeOnce(3000);

      // 5. Confirm. Server is idempotent on post_id — retry-safe.
      setStage('confirming');
      const post = await confirmPost({
        post_id: mint.post_id,
        group_id: groupId,
        kind: 'prompt',
        media_type: mediaType,
        storage_path: mint.storage_path,
        captured_at: new Date().toISOString(),
        duration_seconds: file.durationSeconds,
        latitude: location?.latitude,
        longitude: location?.longitude,
        accuracy: location?.accuracy ?? undefined,
        prompt_id: promptId,
      });

      // Clear retry state on success.
      mintRef.current = null;
      fileRef.current = null;
      return post;
    },
    onSuccess: (post) => {
      setStage('idle');
      // Warm the prompt cache with its real terminal state NOW so a re-entry
      // to the active-prompt screen (stale FCM push tap, foreground banner)
      // doesn't briefly re-present the capture CTA off the stale 'active'
      // value while refetchOnMount revalidates in the background. The server
      // maps both on-time and late captures to PromptUIState.RESPONDED, so
      // this is deterministic — we're not computing lateness on the client
      // (CLAUDE.md non-negotiable #4). Mirrors the photobooth setQueryData fix.
      if (promptId) {
        qc.setQueryData<PromptView>(['prompts', promptId], (old: PromptView | undefined) =>
          old ? { ...old, state: 'responded' } : old,
        );
      }
      onDone(post.id);
    },
    onError: () => {
      setStage('idle');
    },
  });

  const shutter = useCallback(() => {
    if (captureMutation.isPending) return;
    captureMutation.mutate();
  }, [captureMutation]);

  // Tap-to-focus: hand the tapped view coordinate to the camera and pop the
  // reticle. Guarded on device.supportsFocus (some front/budget sensors are
  // fixed-focus). focus() can reject if a capture is in flight — ignore it.
  const focusAt = useCallback(
    (x: number, y: number) => {
      const cam = cameraRef.current;
      if (!cam || !device?.supportsFocus) return;
      focusSeq.current += 1;
      setFocusPoint({ x, y, id: focusSeq.current });
      cam.focus({ x, y }).catch(() => {});
    },
    [device],
  );

  if (!device) {
    return <ErrorScreen title="No back camera available on this device" />;
  }

  const isPending = captureMutation.isPending;

  return (
    <View style={styles.cameraWrap}>
      <Stack.Screen options={{ headerShown: false }} />
      <Camera
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        device={device}
        format={format}
        // Camera mounts on screen entry (isActive is always true here), so AF/AE
        // have time to settle before the shutter tap — no lazy pre-warm needed.
        isActive
        photo={mode === 'photo'}
        video={mode === 'video'}
        audio={mode === 'video'}
        // 'quality' over the 'balanced' default trades a little capture speed
        // for higher-accuracy edge detection + AF/AE. If this feels sluggish on
        // the test Android device, fall back to 'balanced'.
        photoQualityBalance="quality"
        photoHdr={mode === 'photo' && (format?.supportsPhotoHdr ?? false)}
        lowLightBoost={device.supportsLowLightBoost}
        videoStabilizationMode={stabilizationMode}
      />

      {/* Tap-to-focus layer: sits beneath the box-none overlay so the shutter
          and cancel controls keep their own taps, while taps on the bare
          preview fall through to here. */}
      {device.supportsFocus ? (
        <View
          style={StyleSheet.absoluteFill}
          onStartShouldSetResponder={() => true}
          onResponderRelease={(e) => focusAt(e.nativeEvent.locationX, e.nativeEvent.locationY)}
        />
      ) : null}

      <SafeAreaView style={styles.overlay} pointerEvents="box-none">
        <View style={styles.topBar}>
          <Pressable onPress={onBack} style={styles.closeBtn} hitSlop={16}>
            <Text style={styles.closeBtnText}>Cancel</Text>
          </Pressable>
          <View style={styles.modeChip}>
            <Text style={styles.modeChipText}>
              {mode === 'video' ? `Video · up to ${maxVideoSeconds}s` : 'Photo'}
            </Text>
          </View>
        </View>

        <View style={styles.center} pointerEvents="none">
          {isPending ? <StageLabel stage={stage} isRecording={isRecording} /> : null}
        </View>

        <View style={styles.bottomBar}>
          <Pressable
            onPress={shutter}
            disabled={isPending}
            style={({ pressed }) => [
              styles.shutter,
              isRecording && styles.shutterRecording,
              isPending && !isRecording && styles.shutterBusy,
              pressed && styles.pressed,
            ]}
            hitSlop={20}
          >
            {isPending && !isRecording ? <ActivityIndicator color="#fff" /> : null}
          </Pressable>
        </View>

        {captureMutation.isError ? (
          <View style={styles.errorBlock} pointerEvents="auto">
            <Text style={styles.errorText}>
              {captureMutation.error instanceof ApiError
                ? `${captureMutation.error.status}: ${captureMutation.error.body || captureMutation.error.message}`
                : (captureMutation.error as Error).message}
            </Text>
            <Pressable
              onPress={shutter}
              style={({ pressed }) => [styles.retryBtn, pressed && styles.pressed]}
            >
              <Text style={styles.retryBtnText}>Retry</Text>
            </Pressable>
          </View>
        ) : null}
      </SafeAreaView>

      {/* Rendered last so the reticle paints above the controls. */}
      <FocusIndicator point={focusPoint} />
    </View>
  );
}

async function recordVideo(
  cameraRef: React.RefObject<Camera | null>,
  maxSeconds: number,
  setIsRecording: (v: boolean) => void,
): Promise<VideoFile> {
  const cam = cameraRef.current;
  if (!cam) throw new Error('Camera not ready');
  return await new Promise<VideoFile>((resolve, reject) => {
    let settled = false;
    cam.startRecording({
      fileType: 'mp4',
      onRecordingFinished: (video) => {
        if (settled) return;
        settled = true;
        setIsRecording(false);
        resolve(video);
      },
      onRecordingError: (err: CameraCaptureError) => {
        if (settled) return;
        settled = true;
        setIsRecording(false);
        reject(err);
      },
    });
    setIsRecording(true);
    setTimeout(() => {
      // Best-effort stop at the cap. onRecordingFinished resolves the promise.
      cam.stopRecording().catch(() => {});
    }, maxSeconds * 1000);
  });
}

function StageLabel({
  stage,
  isRecording,
}: {
  stage: 'idle' | 'capturing' | 'minting' | 'uploading' | 'confirming';
  isRecording: boolean;
}) {
  let text: string;
  if (isRecording) text = 'Recording…';
  else if (stage === 'capturing') text = 'Capturing…';
  else if (stage === 'minting') text = 'Preparing…';
  else if (stage === 'uploading') text = 'Uploading…';
  else if (stage === 'confirming') text = 'Finishing…';
  else return null;
  return (
    <View style={styles.stagePill}>
      <Text style={styles.stagePillText}>{text}</Text>
    </View>
  );
}

function LoadingScreen() {
  return (
    <SafeAreaView style={styles.fillSafe}>
      <Stack.Screen options={{ title: 'Test capture' }} />
      <View style={styles.fillCenter}>
        <ActivityIndicator />
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
      <Stack.Screen options={{ title: 'Test capture' }} />
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
      <Stack.Screen options={{ title: 'Test capture' }} />
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

function ErrorScreen({ title, detail }: { title: string; detail?: string }) {
  return (
    <SafeAreaView style={styles.fillSafe}>
      <Stack.Screen options={{ title: 'Test capture' }} />
      <View style={styles.rationaleWrap}>
        <Text style={styles.rationaleTitle}>{title}</Text>
        {detail ? <Text style={styles.errorText}>{detail}</Text> : null}
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
  modeChip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderRadius: 12,
  },
  modeChipText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  stagePill: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 16,
  },
  stagePillText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  bottomBar: {
    paddingVertical: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutter: {
    width: 78,
    height: 78,
    borderRadius: 39,
    backgroundColor: '#fff',
    borderWidth: 4,
    borderColor: 'rgba(255,255,255,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterBusy: { backgroundColor: 'rgba(255,255,255,0.4)' },
  shutterRecording: { backgroundColor: '#cf222e' },
  errorBlock: {
    margin: 16,
    padding: 12,
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderRadius: 8,
    gap: 8,
  },
  errorText: { color: '#fff', fontSize: 13 },
  retryBtn: {
    backgroundColor: '#fff',
    paddingVertical: 8,
    borderRadius: 6,
    alignItems: 'center',
  },
  retryBtnText: { color: '#1f2328', fontWeight: '700' },
  rationaleWrap: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
    gap: 16,
  },
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
