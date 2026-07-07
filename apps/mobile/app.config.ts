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
  // Final app icon / splash artwork lands in M5 (release polish). For now a
  // placeholder brand mark (assets/splash-icon.png) satisfies the native
  // splash drawable so the Android build links; the background stays brand base.
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
        image: './assets/splash-icon.png',
        backgroundColor: '#0b0e17', // PALETTE.ink900 — Arcade Glow page background
        imageWidth: 180,
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
