module.exports = function (api) {
  api.cache(true);
  return {
    // No NativeWind. It was wired here (as the JSX import source and a preset)
    // with zero `className` usages, and its JSX wrapper silently dropped
    // function-form `style` on Pressable — the reason the home CTA, the game
    // cards and the tab bar's Play button had no press feedback. Styling is
    // inline token objects; see project-docs/spec-v7/06-ui-mobile.md.
    presets: ['babel-preset-expo'],
    // No manual reanimated/worklets plugin: babel-preset-expo@57 auto-injects
    // `react-native-worklets/plugin` (last) when react-native-worklets is
    // installed — reanimated 4's replacement for the old reanimated/plugin.
    // Listing it here too would load the plugin twice.
  };
};
