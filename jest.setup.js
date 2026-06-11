// Runs before each test file (see jest.config.js `setupFiles`).

// src/config.ts throws if EXPO_PUBLIC_API_URL is unset; give tests a value so
// importing the API layer never blows up on a missing env var.
process.env.EXPO_PUBLIC_API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8000';

// AsyncStorage has no JS implementation under Jest; use the package's official
// in-memory mock so the persisted Zustand stores work in tests.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
