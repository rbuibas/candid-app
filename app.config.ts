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
    // post into the camera roll on older devices. READ_MEDIA_IMAGES/VIDEO
    // (added by the media-library plugin) let us look up the existing "Candid"
    // album and batch the album-filing into a single MediaStore write request
    // — without read access Android prompts "Allow … to modify" once per item.
    // We still block ACCESS_MEDIA_LOCATION: we never need photo geolocation.
    permissions: ['POST_NOTIFICATIONS', 'WRITE_EXTERNAL_STORAGE'],
    blockedPermissions: ['android.permission.ACCESS_MEDIA_LOCATION'],
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
        // Full (read + write) access. Read lets us find and reuse the existing
        // "Candid" album rather than duplicating it, and file saved posts into
        // it with a single OS consent instead of one "modify" prompt per item.
        // (Capture stays live-only — there is no image picker in the app, so
        // read access can't be used to select from the library.)
        photosPermission:
          "Candid saves your group's photos and videos to your camera roll and keeps them in a Candid album.",
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
