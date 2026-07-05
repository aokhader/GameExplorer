module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      ['babel-preset-expo', { jsxImportSource: 'nativewind' }],
      'nativewind/babel',
    ],
    plugins: [
      // MUST be last. Powers react-native-reanimated worklets (board drag/anim).
      'react-native-reanimated/plugin',
    ],
  };
};
