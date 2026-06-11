// Jest config for candid-app. Uses the jest-expo preset (RN/Expo module
// mocking, the right transform + transformIgnorePatterns). We add the `@/ ->
// src/` path alias and our setup file. Tests are colocated as *.test.ts(x).
module.exports = {
  preset: 'jest-expo',
  setupFiles: ['<rootDir>/jest.setup.js'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  testPathIgnorePatterns: ['/node_modules/', '/.expo/', '/android/', '/ios/'],
  clearMocks: true,
};
