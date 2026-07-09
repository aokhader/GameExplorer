module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      ['babel-preset-expo', { jsxImportSource: 'nativewind' }],
      'nativewind/babel',
    ],
    // No manual reanimated/worklets plugin: babel-preset-expo@57 auto-injects
    // `react-native-worklets/plugin` (last) when react-native-worklets is
    // installed — reanimated 4's replacement for the old reanimated/plugin.
    // Listing it here too would load the plugin twice.
  };
};
