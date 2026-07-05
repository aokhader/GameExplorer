import type { ExpoConfig } from 'expo/config';

/**
 * Expo app config. `scheme` powers deep links used for OAuth callback
 * (`gameexplorer://auth/callback`) and multiplayer invite links in v1.1.
 * New Architecture is on (RN 0.76 default) — reanimated + gesture-handler +
 * svg all support it.
 */
const config: ExpoConfig = {
  name: 'GameExplorer',
  slug: 'gameexplorer',
  scheme: 'gameexplorer',
  version: '0.1.0',
  orientation: 'portrait',
  userInterfaceStyle: 'dark',
  newArchEnabled: true,
  // App icon / splash image assets are added in M5 (release polish). Until then
  // Expo uses its defaults; the splash background still uses the brand base color.
  ios: {
    supportsTablet: true,
    bundleIdentifier: 'com.gameexplorer.app',
  },
  android: {
    package: 'com.gameexplorer.app',
  },
  plugins: [
    'expo-router',
    [
      'expo-splash-screen',
      {
        backgroundColor: '#0b0e17', // PALETTE.ink900 — Arcade Glow page background
        resizeMode: 'contain',
      },
    ],
    // Native Stockfish config plugin is added in M3 (chess >= 1400 ELO).
  ],
  experiments: {
    typedRoutes: true,
  },
  extra: {
    // Consumed via expo-constants if EXPO_PUBLIC_* inlining is ever insufficient.
    apiUrl: process.env.EXPO_PUBLIC_API_URL,
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
  },
};

export default config;
