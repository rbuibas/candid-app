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
  },
  plugins: ['expo-router', 'expo-secure-store'],
  experiments: {
    typedRoutes: true,
  },
};

export default config;
