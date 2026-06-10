import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Stack, useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Camera, useCameraDevice, type PhotoFile } from 'react-native-vision-camera';

import { ApiError } from '@/api/client';
import { useCameraPermissions } from '@/features/capture/useCameraPermissions';
import { uploadAvatarFromUri } from '@/features/profile/uploadAvatar';

/**
 * Minimal single-shot live selfie → avatar (candid-requirements §9). Reuses the
 * existing presigned-avatar pipeline (see uploadAvatarFromUri). Live-only,
 * front camera, no gallery picker, and it creates no feed post. The photo booth
 * still sets the initial avatar on join; this is the in-Profile "edit avatar".
 */
export default function AvatarCaptureScreen() {
  const router = useRouter();
  const { status, request, openSettings } = useCameraPermissions();

  useEffect(() => {
    if (status === 'undetermined') void request();
  }, [status, request]);

  if (status === 'unknown') return <FullScreenLoading />;
  if (status === 'undetermined') {
    return (
      <Rationale
        body="Candid needs camera access to take your profile photo. It's a live shot — there's no gallery picker."
        onAllow={request}
      />
    );
  }
  if (status === 'denied' || status === 'restricted') {
    return <Recovery onOpenSettings={openSettings} onBack={() => router.back()} />;
  }

  return <AvatarLive onDone={() => router.back()} onBack={() => router.back()} />;
}

function AvatarLive({ onDone, onBack }: { onDone: () => void; onBack: () => void }) {
  const device = useCameraDevice('front');
  const cameraRef = useRef<Camera>(null);
  const qc = useQueryClient();

  const captureM = useMutation({
    mutationFn: async () => {
      const cam = cameraRef.current;
      if (!cam) throw new Error('Camera not ready');
      const photo: PhotoFile = await cam.takePhoto({ flash: 'off', enableShutterSound: false });
      await uploadAvatarFromUri(photo.path);
    },
    onSuccess: async () => {
      // Refresh anything that embeds the avatar — own profile + member lists.
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['profile', 'me'] }),
        qc.invalidateQueries({ queryKey: ['groups'] }),
      ]);
      onDone();
    },
  });

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
        isActive={!captureM.isPending}
        photo
        audio={false}
        photoQualityBalance="quality"
      />
      <SafeAreaView style={styles.overlay} pointerEvents="box-none">
        <View style={styles.topBar}>
          <Pressable onPress={onBack} style={styles.closeBtn} hitSlop={16}>
            <Text style={styles.closeBtnText}>Cancel</Text>
          </Pressable>
        </View>

        <View style={styles.center} pointerEvents="none">
          {captureM.isPending ? (
            <View style={styles.pill}>
              <Text style={styles.pillText}>Saving…</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.bottomBar}>
          <Pressable
            onPress={() => captureM.mutate()}
            disabled={captureM.isPending}
            style={({ pressed }) => [
              styles.shutter,
              captureM.isPending && styles.shutterBusy,
              pressed && styles.pressed,
            ]}
            hitSlop={20}
          >
            {captureM.isPending ? <ActivityIndicator color="#fff" /> : null}
          </Pressable>
        </View>

        {captureM.isError ? (
          <View style={styles.errorBlock} pointerEvents="auto">
            <Text style={styles.errorText}>{errMessage(captureM.error)}</Text>
            <Pressable
              onPress={() => captureM.mutate()}
              style={({ pressed }) => [styles.retryBtn, pressed && styles.pressed]}
            >
              <Text style={styles.retryBtnText}>Retry</Text>
            </Pressable>
          </View>
        ) : null}
      </SafeAreaView>
    </View>
  );
}

function errMessage(err: unknown): string {
  if (err instanceof ApiError) return `${err.status}: ${err.body || err.message}`;
  if (err instanceof Error) return err.message;
  return 'Something went wrong';
}

function FullScreenLoading() {
  return (
    <SafeAreaView style={styles.fillSafe}>
      <Stack.Screen options={{ title: 'Profile photo' }} />
      <View style={styles.fillCenter}>
        <ActivityIndicator />
      </View>
    </SafeAreaView>
  );
}

function FullScreenError({ title }: { title: string }) {
  return (
    <SafeAreaView style={styles.fillSafe}>
      <Stack.Screen options={{ title: 'Profile photo' }} />
      <View style={styles.rationaleWrap}>
        <Text style={styles.rationaleTitle}>{title}</Text>
      </View>
    </SafeAreaView>
  );
}

function Rationale({ body, onAllow }: { body: string; onAllow: () => void }) {
  return (
    <SafeAreaView style={styles.fillSafe}>
      <Stack.Screen options={{ title: 'Profile photo' }} />
      <View style={styles.rationaleWrap}>
        <Text style={styles.rationaleTitle}>Camera access</Text>
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

function Recovery({ onOpenSettings, onBack }: { onOpenSettings: () => void; onBack: () => void }) {
  return (
    <SafeAreaView style={styles.fillSafe}>
      <Stack.Screen options={{ title: 'Profile photo' }} />
      <View style={styles.rationaleWrap}>
        <Text style={styles.rationaleTitle}>Camera access blocked</Text>
        <Text style={styles.rationaleBody}>
          Candid can&apos;t open the camera until you grant access in Settings.
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
          <Text style={styles.secondaryBtnText}>Back</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fillSafe: { flex: 1, backgroundColor: '#fff' },
  fillCenter: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  cameraWrap: { flex: 1, backgroundColor: '#000' },
  overlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'space-between' },
  topBar: { flexDirection: 'row', paddingHorizontal: 16, paddingTop: 12 },
  closeBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderRadius: 16,
  },
  closeBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  pill: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 16,
  },
  pillText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  bottomBar: { paddingVertical: 32, alignItems: 'center', justifyContent: 'center' },
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
  errorBlock: {
    margin: 16,
    padding: 12,
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderRadius: 8,
    gap: 8,
  },
  errorText: { color: '#fff', fontSize: 13 },
  retryBtn: { backgroundColor: '#fff', paddingVertical: 8, borderRadius: 6, alignItems: 'center' },
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
