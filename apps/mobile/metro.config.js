// Metro config for the Expo app inside the pnpm workspace.
//
// The monorepo wiring used to live here by hand (watchFolders, nodeModulesPaths,
// disableHierarchicalLookup). As of SDK 57, `expo/metro-config` detects the
// workspace itself: it watches every workspace package, resolves against both
// apps/mobile/node_modules and the hoisted root node_modules, and already turns
// on unstable_enablePackageExports (which @supabase/supabase-js needs on native).
// Overriding those is what `expo doctor` flags, so we take the defaults.
//
// withNativeWind wires the Tailwind transformer against ./global.css.
const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);

module.exports = withNativeWind(config, { input: './global.css' });
