// Babel config — matches Expo's implicit default (babel-preset-expo, which
// includes the Expo Router plugin). Added so Jest (jest-expo) has a babel
// config to read; it is a no-op for the Metro/Expo runtime, which already
// applies this preset by default.
module.exports = function babelConfig(api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
  };
};
