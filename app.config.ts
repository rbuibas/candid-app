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
    permissions: ['POST_NOTIFICATIONS'],
    googleServicesFile: './google-services.json',
  },
  plugins: [
    'expo-router',
    'expo-secure-store',
    'expo-asset',
    'expo-video',
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
