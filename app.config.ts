import type { ExpoConfig } from 'expo/config';

// NOTE: `ios.bundleIdentifier` and `android.package` below are placeholders
// pending the final product name. Renaming them creates a new app identity
// on the stores, so settle the name before the first TestFlight submission.

const config: ExpoConfig = {
  name: 'Candid',
  slug: 'candid',
  scheme: 'candid',
  version: '0.1.0',
  orientation: 'portrait',
  userInterfaceStyle: 'automatic',
  newArchEnabled: true,
  platforms: ['ios', 'android'],
  ios: {
    bundleIdentifier: 'app.candid.mobile',
    supportsTablet: false,
  },
  android: {
    package: 'app.candid',
    // POST_NOTIFICATIONS is the Android 13+ runtime permission gating FCM
    // foreground display. RN Firebase Messaging's requestPermission triggers
    // the OS prompt for it on first ask.
    //
    // WRITE_EXTERNAL_STORAGE (API ≤ 28 only) lets expo-media-library save a
    // post into the camera roll on older devices; on API 29+ saving to the
    // shared MediaStore needs no runtime permission. We deliberately do NOT
    // declare any READ_* media permission — Candid is write-only and never
    // enumerates the user's library (CLAUDE.md non-negotiable #2). The block
    // list below strips the read permissions the media-library plugin would
    // otherwise add by default.
    permissions: ['POST_NOTIFICATIONS', 'WRITE_EXTERNAL_STORAGE'],
    blockedPermissions: [
      'android.permission.READ_EXTERNAL_STORAGE',
      'android.permission.READ_MEDIA_IMAGES',
      'android.permission.READ_MEDIA_VIDEO',
      'android.permission.ACCESS_MEDIA_LOCATION',
    ],
    googleServicesFile: './google-services.json',
  },
  plugins: [
    'expo-router',
    'expo-secure-store',
    'expo-asset',
    'expo-video',
    '@react-native-community/datetimepicker',
    // RN Firebase config plugin — wires native init for FCM. iOS push is
    // deferred (no GoogleService-Info.plist in repo), so this currently only
    // takes effect on Android via google-services.json above.
    '@react-native-firebase/app',
    [
      'react-native-vision-camera',
      {
        cameraPermissionText:
          'Candid uses the camera to capture the group moments you and your friends are prompted for.',
        enableMicrophonePermission: true,
        microphonePermissionText:
          'Candid records short videos with sound when a video prompt fires.',
      },
    ],
    [
      'expo-location',
      {
        locationWhenInUsePermission:
          'Candid can optionally attach where a moment was captured so you can revisit it later.',
      },
    ],
    [
      'expo-media-library',
      {
        // Write-only ("Add Only" on iOS): we only ever ADD to the camera roll.
        // Setting photosPermission to false omits NSPhotoLibraryUsageDescription
        // (full read access) from Info.plist entirely; savePhotosPermission maps
        // to NSPhotoLibraryAddUsageDescription, the add-only string the OS shows.
        photosPermission: false,
        savePhotosPermission:
          "Candid saves your group's photos and videos to your camera roll, in the Candid album.",
        isAccessMediaLocationEnabled: false,
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
  },
  updates: {
    url: 'https://u.expo.dev/27c824e8-3b7e-4e3b-81d9-bcae98e38a04',
  },
  runtimeVersion: {
    policy: 'appVersion',
  },
  extra: {
    eas: {
      projectId: '27c824e8-3b7e-4e3b-81d9-bcae98e38a04',
    },
  },
};

export default config;
