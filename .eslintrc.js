module.exports = {
  root: true,
  extends: ['expo', 'plugin:prettier/recommended'],
  ignorePatterns: ['node_modules/', '.expo/', 'dist/', 'android/', 'ios/', 'expo-env.d.ts'],
  rules: {
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    'prettier/prettier': 'error',
  },
};
