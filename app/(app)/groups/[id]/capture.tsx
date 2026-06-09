import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Camera,
  useCameraDevice,
  type CameraCaptureError,
  type CameraRuntimeError,
  type PhotoFile,
  type VideoFile,
} from 'react-native-vision-camera';

import { getGroup } from '@/api/groups';
import {
  confirmPost,
  createUploadUrl,
  type PostMediaType,
  type UploadUrlResponse,
} from '@/api/posts';
import type { PromptView } from '@/api/prompts';
import { FocusIndicator, type FocusPoint } from '@/features/capture/components/FocusIndicator';
import { persistCaptureFile } from '@/features/capture/queueStorage';
import {
  bestStabilizationMode,
  useBestFormat,
  VIDEO_BITRATE_MBPS,
} from '@/features/capture/useBestFormat';
import { geocodeOnce } from '@/features/capture/useGeocode';
import { contentTypeFor, uploadBytes } from '@/features/capture/uploadBytes';
import { useCameraPermissions } from '@/features/capture/useCameraPermissions';
import { generateVideoThumbnail } from '@/features/capture/videoThumbnail';
import {
  describeError,
  isGroupLockedError,
  isMissedError,
  isRetryable,
} from '@/features/capture/uploadErrors';
import { useActivePrompt } from '@/features/prompt/useActivePrompt';
import { makeQueueId, useUploadQueue } from '@/stores/uploadQueue';

type Terminal = 'saved-offline' | 'locked' | 'missed';

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
  if (status === 'unknown' || (promptId && promptQ.isLoading)) {
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

  // Video length cap: prefer the prompt-supplied per-shot cap when present
  // (prompts can specify shorter targets), otherwise the group's max.
  // Fall back to 60s when offline and group data isn't cached — the capture
  // and confirm flow doesn't require group data (locked state comes via 409).
  const maxVideoSeconds =
    promptQ.data?.target_video_length_seconds ?? groupQ.data?.max_video_length_seconds ?? 60;

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
      onLeave={() => router.replace({ pathname: '/(app)/groups/[id]', params: { id } })}
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
  onLeave,
}: {
  groupId: string;
  mode: Mode;
  maxVideoSeconds: number;
  promptId: string | undefined;
  onDone: (postId: string) => void;
  onBack: () => void;
  onLeave: () => void;
}) {
  const device = useCameraDevice('back');
  // Explicitly choose the sharpest format for this prompt's media type instead
  // of letting vision-camera pick a balanced default (see useBestFormat).
  const preferredFormat = useBestFormat(device, mode);
  // Some devices can't configure a camera session with our forced max-resolution
  // format: the photo (e.g. a 50MP sensor) + preview stream combination exceeds
  // what the hardware guarantees, and vision-camera throws
  // `session/invalid-output-configuration` (or `session/hardware-cost-too-high`).
  // When that happens we fall back to `undefined`, letting vision-camera auto-pick
  // a valid combination, so capture never hard-fails on a guest's device. Reset
  // on mode change since photo and video select different formats.
  const [formatFailed, setFormatFailed] = useState(false);
  useEffect(() => {
    setFormatFailed(false);
  }, [mode]);
  const format = formatFailed ? undefined : preferredFormat;
  const stabilizationMode = bestStabilizationMode(format);
  const qc = useQueryClient();
  const cameraRef = useRef<Camera>(null);
  // Holds the previously-minted upload URL across retries so confirm stays
  // idempotent on the same post_id (per /docs/02 §4 + CLAUDE.md non-neg #?).
  const mintRef = useRef<UploadUrlResponse | null>(null);
  // Holds the file URI between PUT failures so we don't re-record / re-snap
  // a frame the user already captured.
  const fileRef = useRef<{ uri: string; durationSeconds?: number } | null>(null);
  // Video only: the generated poster frame, held across retries so we don't
  // regenerate it each attempt. Stays null for photos and when generation fails.
  const thumbRef = useRef<string | null>(null);
  // The original capture moment, set once when the media is taken. Used for
  // confirm's `captured_at` AND for the offline queue item — so a post that
  // flushes minutes later still carries when it was actually shot (display
  // only; the server still owns on-time/late from its own receipt time).
  const capturedAtRef = useRef<string | null>(null);
  const enqueue = useUploadQueue((s) => s.enqueue);
  // Terminal outcomes that replace the live camera with a full-screen message:
  // queued-while-offline, group locked mid-capture (409), or window-closed (410).
  const [terminal, setTerminal] = useState<Terminal | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  // User flash setting for photo capture. We deliberately do NOT bind any
  // CameraX vendor extension (HDR / low-light) on this screen: those disable the
  // flash unit and tap-to-focus on the bound camera (#9, #10), and tap-to-focus
  // is a hard requirement here. So flash is always available and user-driven.
  const [flash, setFlash] = useState<'auto' | 'on' | 'off'>('auto');
  const [stage, setStage] = useState<'idle' | 'capturing' | 'minting' | 'uploading' | 'confirming'>(
    'idle',
  );
  // Tap-to-focus reticle position; `id` bumps each tap so re-tapping restarts
  // the fade animation. Cleared automatically once the indicator fades.
  const [focusPoint, setFocusPoint] = useState<FocusPoint | null>(null);
  const focusSeq = useRef(0);

  // Tap-to-focus is available whenever the sensor supports focus-metering. With
  // no vendor extension bound (see the `flash` note above) this is true on any
  // AF-capable device, so focus works on every shot regardless of flash setting.
  const focusEnabled = device?.supportsFocus ?? false;

  // The camera session can fail to configure on devices whose hardware can't
  // satisfy our forced max-resolution format alongside the preview stream. We
  // catch that one class of error and retry with an auto-picked format (see
  // `formatFailed`); any other runtime error is logged for diagnosis.
  const onCameraError = useCallback(
    (err: CameraRuntimeError) => {
      const isConfigError =
        err.code === 'session/invalid-output-configuration' ||
        err.code === 'session/hardware-cost-too-high';
      if (isConfigError && !formatFailed) {
        // eslint-disable-next-line no-console
        console.warn(
          `[capture] ${device?.name ?? 'device'} can't configure ${mode} session ` +
            `with forced format (${err.code}); falling back to auto-picked format`,
        );
        setFormatFailed(true);
        return;
      }
      // eslint-disable-next-line no-console
      console.error(`[capture] camera runtime error: ${err.code}`, err.message);
    },
    [device, mode, formatFailed],
  );

  // Move the already-captured file into the durable queue and record its
  // metadata so it can flush on reconnect. Returns false if we couldn't even
  // persist the bytes (then we fall back to the inline error+retry).
  const enqueueCurrentCapture = useCallback(async (): Promise<boolean> => {
    const file = fileRef.current;
    if (!file) return false;
    const mediaType: PostMediaType = mode === 'video' ? 'video' : 'photo';
    const extension = mode === 'video' ? 'mp4' : 'jpg';
    const id = makeQueueId();
    let localFilePath: string;
    try {
      localFilePath = await persistCaptureFile(file.uri, id, extension);
    } catch {
      return false;
    }
    // Persist the poster frame too (video only), so the flusher can upload it
    // alongside the media. Best-effort: a missing poster never blocks the queue.
    let thumbnailLocalFilePath: string | undefined;
    if (mediaType === 'video' && thumbRef.current) {
      try {
        thumbnailLocalFilePath = await persistCaptureFile(thumbRef.current, id, 'thumb.jpg');
      } catch {
        thumbnailLocalFilePath = undefined;
      }
    }
    // Geocode is best-effort and works offline via GPS; never blocks (3s cap).
    const location = await geocodeOnce(3000);
    enqueue({
      id,
      localFilePath,
      thumbnailLocalFilePath,
      groupId,
      kind: 'prompt',
      mediaType,
      promptId,
      capturedAt: capturedAtRef.current ?? new Date().toISOString(),
      durationSeconds: file.durationSeconds,
      latitude: location?.latitude,
      longitude: location?.longitude,
      accuracy: location?.accuracy ?? undefined,
    });
    // A fresh capture should start clean — the queue owns these bytes now.
    fileRef.current = null;
    thumbRef.current = null;
    mintRef.current = null;
    capturedAtRef.current = null;
    return true;
  }, [mode, groupId, promptId, enqueue]);

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
          // Honour the user's flash setting; force 'off' if the sensor has no
          // flash unit (passing a non-'off' flash there throws). No vendor
          // extension is bound, so the flash unit is always available (#9).
          const flashMode = device?.hasFlash ? flash : 'off';
          const photo: PhotoFile = await cam.takePhoto({
            // Shutter sound off — the prompt push is the cue; the click is just
            // noise. We intentionally do NOT pass qualityPrioritization (that
            // moved to the <Camera photoQualityBalance> prop in vision-camera v4)
            // nor enableAutoRedEyeReduction (adds shutter latency, and
            // spontaneity beats red-eye here).
            flash: flashMode,
            enableShutterSound: false,
          });
          fileRef.current = { uri: photo.path };
        } else {
          const video = await recordVideo(cameraRef, maxVideoSeconds, setIsRecording);
          fileRef.current = { uri: video.path, durationSeconds: Math.round(video.duration) };
          // Poster frame for the feed — best-effort, never blocks the capture.
          thumbRef.current = await generateVideoThumbnail(video.path);
        }
        capturedAtRef.current = new Date().toISOString();
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

      // 3b. Poster frame (video only) — best-effort. confirm probes for it by
      //     its canonical key, so a failed PUT just drops the poster, not the post.
      if (mint.thumbnail_upload_url && thumbRef.current) {
        try {
          await uploadBytes(mint.thumbnail_upload_url, thumbRef.current, 'image/jpeg');
        } catch {
          // Swallow — the video still posts; the feed shows its black tile.
        }
      }

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
        captured_at: capturedAtRef.current ?? new Date().toISOString(),
        duration_seconds: file.durationSeconds,
        latitude: location?.latitude,
        longitude: location?.longitude,
        accuracy: location?.accuracy ?? undefined,
        prompt_id: promptId,
      });

      // Clear retry state on success.
      mintRef.current = null;
      fileRef.current = null;
      thumbRef.current = null;
      capturedAtRef.current = null;
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
    onError: (err) => {
      setStage('idle');
      // Capture raced past the group's end_date lock — the event is over.
      if (isGroupLockedError(err)) {
        setTerminal('locked');
        return;
      }
      // The prompt window closed before this confirm landed (online but slow).
      if (isMissedError(err)) {
        setTerminal('missed');
        return;
      }
      // Offline or a transient drop → queue the raw capture and flush later.
      // Set the terminal state optimistically (persist is effectively instant)
      // and roll back to the inline error only if we couldn't store the bytes.
      if (isRetryable(err)) {
        setTerminal('saved-offline');
        void enqueueCurrentCapture().then((ok) => {
          if (!ok) setTerminal(null);
        });
        return;
      }
      // Anything else (hard 4xx) → leave the inline error+Retry block visible.
    },
  });

  const shutter = useCallback(() => {
    if (captureMutation.isPending) return;
    captureMutation.mutate();
  }, [captureMutation]);

  // Tap-to-focus: hand the tapped view coordinate to the camera and pop the
  // reticle. Guarded on focusEnabled (false only on fixed-focus sensors).
  const focusAt = useCallback(
    (x: number, y: number) => {
      const cam = cameraRef.current;
      if (!cam || !focusEnabled) return;
      focusSeq.current += 1;
      setFocusPoint({ x, y, id: focusSeq.current });
      // focus() can legitimately reject if a capture is in flight — ignore it.
      cam.focus({ x, y }).catch(() => {});
    },
    [focusEnabled],
  );

  // A gesture-handler Tap (not the RN Responder system) is what actually
  // delivers taps over the native camera view on Android — the Responder
  // overlay silently never fired (#10). e.x/e.y are in the camera view's dp
  // coordinates, exactly what cam.focus({ x, y }) expects.
  const tapToFocus = useMemo(() => Gesture.Tap().onEnd((e) => focusAt(e.x, e.y)), [focusAt]);

  if (!device) {
    return <ErrorScreen title="No back camera available on this device" />;
  }

  const isPending = captureMutation.isPending;

  return (
    <View style={styles.cameraWrap}>
      <Stack.Screen options={{ headerShown: false }} />
      {/* GestureDetector wraps the camera so tap-to-focus is delivered reliably
          over the native preview. The overlay controls below are siblings on
          top and consume their own taps, so this only fires on the bare preview.
          No photoHdr / lowLightBoost: vendor extensions disable tap-to-focus and
          flash on this hardware, and focus is a hard requirement here (#9, #10). */}
      <GestureDetector gesture={tapToFocus}>
        <Camera
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          device={device}
          format={format}
          // Camera mounts on screen entry (isActive is always true here), so AF/AE
          // have time to settle before the shutter tap — no lazy pre-warm needed.
          isActive
          onError={onCameraError}
          photo={mode === 'photo'}
          video={mode === 'video'}
          audio={mode === 'video'}
          // 'quality' over the 'balanced' default trades a little capture speed
          // for higher-accuracy edge detection + AF/AE. If this feels sluggish on
          // the test Android device, fall back to 'balanced'.
          photoQualityBalance="quality"
          videoStabilizationMode={stabilizationMode}
          // Phase-6 compression: cap the encoder bitrate for video prompts so R2
          // objects stay small (see VIDEO_BITRATE_MBPS). No-op for photo mode.
          videoBitRate={mode === 'video' ? VIDEO_BITRATE_MBPS : undefined}
        />
      </GestureDetector>

      <SafeAreaView style={styles.overlay} pointerEvents="box-none">
        <View style={styles.topBar}>
          <Pressable onPress={onBack} style={styles.closeBtn} hitSlop={16}>
            <Text style={styles.closeBtnText}>Cancel</Text>
          </Pressable>
          <View style={styles.topRight}>
            {/* Flash control: photo mode only, and only if the sensor has a
                flash unit. Cycles Auto → On → Off. Locked mid-capture. */}
            {mode === 'photo' && device.hasFlash ? (
              <Pressable
                onPress={() => setFlash((f) => (f === 'auto' ? 'on' : f === 'on' ? 'off' : 'auto'))}
                disabled={isPending}
                hitSlop={12}
                style={[styles.flashChip, flash === 'off' && styles.flashChipOff]}
              >
                <Text style={[styles.flashChipText, flash === 'off' && styles.flashChipTextOff]}>
                  {flash === 'auto'
                    ? 'Flash · Auto'
                    : flash === 'on'
                      ? 'Flash · On'
                      : 'Flash · Off'}
                </Text>
              </Pressable>
            ) : null}
            <View style={styles.modeChip}>
              <Text style={styles.modeChipText}>
                {mode === 'video' ? `Video · up to ${maxVideoSeconds}s` : 'Photo'}
              </Text>
            </View>
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

        {captureMutation.isError && terminal === null ? (
          <View style={styles.errorBlock} pointerEvents="auto">
            <Text style={styles.errorText}>{describeError(captureMutation.error)}</Text>
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

      {terminal ? <TerminalOverlay kind={terminal} onLeave={onLeave} /> : null}
    </View>
  );
}

/**
 * Full-screen takeover shown after a capture reaches a terminal outcome:
 *   - saved-offline → queued; will upload on reconnect (Phase-6 §B),
 *   - locked        → group ended mid-capture (409 group_locked),
 *   - missed        → the prompt window closed (410) before confirm landed.
 * All three route back to the feed; none re-present the camera.
 */
function TerminalOverlay({ kind, onLeave }: { kind: Terminal; onLeave: () => void }) {
  const copy: Record<Terminal, { title: string; body: string }> = {
    'saved-offline': {
      title: 'Saved',
      body: "You're offline — we'll upload this automatically when you're back online.",
    },
    locked: {
      title: 'Event ended',
      body: 'This group is now read-only. Capture is closed, but the feed is still yours to browse.',
    },
    missed: {
      title: 'You missed this one',
      body: 'The window closed before your capture landed. The next prompt is on its way.',
    },
  };
  const { title, body } = copy[kind];
  return (
    <View style={styles.terminalOverlay}>
      <View style={styles.terminalCard}>
        <Text style={styles.terminalTitle}>{title}</Text>
        <Text style={styles.terminalBody}>{body}</Text>
        <Pressable
          onPress={onLeave}
          style={({ pressed }) => [styles.primaryBtn, pressed && styles.pressed]}
        >
          <Text style={styles.primaryBtnText}>Back to feed</Text>
        </Pressable>
      </View>
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
      // h264 (vision-camera's default, stated for clarity) — universally
      // decodable on the shared APK. The bitrate cap (Camera videoBitRate) is
      // the size lever; h265 would shrink further but isn't a safe MVP default.
      videoCodec: 'h264',
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
  topRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  modeChip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderRadius: 12,
  },
  modeChipText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  flashChip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: '#f5c518',
    borderRadius: 12,
  },
  flashChipOff: { backgroundColor: 'rgba(0,0,0,0.4)' },
  flashChipText: { color: '#1f2328', fontWeight: '700', fontSize: 13 },
  flashChipTextOff: { color: '#fff', fontWeight: '600' },
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
  terminalOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  terminalCard: {
    width: '100%',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    gap: 12,
  },
  terminalTitle: { fontSize: 22, fontWeight: '700', color: '#1f2328' },
  terminalBody: { fontSize: 15, color: '#656d76', lineHeight: 22 },
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
