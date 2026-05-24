module.exports = {
  root: true,
  extends: ['expo', 'plugin:prettier/recommended'],
  ignorePatterns: ['node_modules/', '.expo/', 'dist/', 'android/', 'ios/'],
  rules: {
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    'prettier/prettier': 'error',
  },
};
