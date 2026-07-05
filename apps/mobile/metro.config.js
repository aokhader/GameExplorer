// Monorepo-aware Metro config for the Expo app inside a pnpm workspace.
//
// Two things make pnpm + Metro work:
//   1. watchFolders must include the workspace root so Metro sees the source of
//      @gameexplorer/* packages (they are consumed from `src`, not a build step).
//   2. nodeModulesPaths + disableHierarchicalLookup point resolution at both the
//      app's and the root's node_modules (pnpm hoists shared deps to the root).
//
// withNativeWind wires the Tailwind transformer against ./global.css.
const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];

config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];
config.resolver.disableHierarchicalLookup = true;

// Supabase v2 ships ESM via package "exports"; enable modern resolution so
// @supabase/supabase-js resolves cleanly on native.
config.resolver.unstable_enablePackageExports = true;

module.exports = withNativeWind(config, { input: './global.css' });
