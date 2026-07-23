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
  version: '1.0.0',
  orientation: 'portrait',
  userInterfaceStyle: 'dark',
  // EAS Update (expo-updates). `eas update:configure` can't write this dynamic
  // TS config, so the URL + runtimeVersion are set by hand. The URL is the EAS
  // project's update endpoint (projectId below). `appVersion` policy ties each
  // OTA payload to `version` (1.0.0) so JS-only fixes ship to TestFlight without
  // a rebuild, while a native/version bump forces a fresh binary.
  runtimeVersion: { policy: 'appVersion' },
  updates: {
    url: 'https://u.expo.dev/455b736e-0a50-4a5d-90e2-448dc2e8ce83',
  },
  // New Architecture is always-on in SDK 57 / RN 0.86 — the `newArchEnabled`
  // flag was removed from ExpoConfig.
  // Brand icon set (M5): the gold Play mark + three game dots on ink-900,
  // generated from packages/ui token colors. icon.png is fully opaque (Apple
  // rejects alpha in the marketing icon).
  icon: './assets/icon.png',
  ios: {
    supportsTablet: true,
    bundleIdentifier: 'com.gameexplorer.app',
    // Sign in with Apple (App Store Guideline 4.8 — required alongside the
    // Google/Facebook logins). The expo-apple-authentication plugin adds the
    // matching entitlement.
    usesAppleSignIn: true,
    infoPlist: {
      // The app uses only standard HTTPS/TLS, which is exempt from US export
      // encryption documentation — declaring this stops App Store Connect from
      // asking on every submission.
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    package: 'com.gameexplorer.app',
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      monochromeImage: './assets/adaptive-icon-mono.png',
      backgroundColor: '#0b0e17', // PALETTE.ink900
    },
  },
  web: {
    favicon: './assets/favicon.png',
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
    // Sign in with Apple (iOS) — adds the entitlement + native module.
    'expo-apple-authentication',
    [
      'expo-splash-screen',
      {
        image: './assets/splash-icon.png',
        backgroundColor: '#0b0e17', // PALETTE.ink900 — Arcade Glow page background
        imageWidth: 180,
        resizeMode: 'contain',
      },
    ],
    // The native chess engine ships as a local module (modules/react-native-arasan),
    // not a config plugin — nothing to add here.
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
