import type { ExpoConfig } from 'expo/config';

/**
 * Expo app config. `scheme` powers deep links used for OAuth callback
 * (`gameexplorer://auth/callback`) and multiplayer invite links in v1.1.
 * New Architecture is always-on in SDK 57 / RN 0.86 — reanimated (v4 +
 * worklets) + gesture-handler + svg all support it.
 */
const config: ExpoConfig = {
  name: 'GameExplorer',
  slug: 'gameexplorer',
  // The EAS project lives under the `gameexplorermobile` account (an org),
  // not the personal login — pin it so builds resolve the right owner.
  owner: 'gameexplorermobile',
  scheme: 'gameexplorer',
  version: '0.1.0',
  orientation: 'portrait',
  userInterfaceStyle: 'dark',
  // New Architecture is always-on in SDK 57 / RN 0.86 — the `newArchEnabled`
  // flag was removed from ExpoConfig.
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
    // SDK 57 ships config plugins for these; `expo install --fix` flags them.
    'expo-audio',
    'expo-image',
    'expo-status-bar',
    // OAuth sign-in opens the provider consent page in an in-app browser tab and
    // catches the `gameexplorer://auth/callback` deep link on return (M1 auth).
    'expo-web-browser',
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
    // EAS project link. `eas init` can't auto-write this TypeScript config, so
    // it's set by hand (EAS dashboard → project settings).
    eas: {
      projectId: '455b736e-0a50-4a5d-90e2-448dc2e8ce83',
    },
  },
};

export default config;
