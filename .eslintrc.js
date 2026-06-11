module.exports = {
  root: true,
  extends: ['expo', 'plugin:prettier/recommended'],
  ignorePatterns: ['node_modules/', '.expo/', 'dist/', 'android/', 'ios/', 'expo-env.d.ts'],
  rules: {
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    'prettier/prettier': 'error',
  },
  overrides: [
    {
      // Jest globals (describe/it/expect/jest) for the test + setup files.
      files: ['**/*.test.ts', '**/*.test.tsx', 'jest.setup.js'],
      env: { jest: true },
    },
  ],
};
