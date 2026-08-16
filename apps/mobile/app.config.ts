import type { ExpoConfig } from 'expo/config';

/**
 * Expo app config. `scheme` powers deep links used for the OAuth callback
 * (`gameexplorer://auth/callback`) and multiplayer invite links.
 * New Architecture is always-on in SDK 57 / RN 0.86 — reanimated (v4 +
 * worklets) + gesture-handler + svg all support it.
 */

/**
 * The deployed web app. Invite links are built by the **server** against this
 * host (`/{game}/play?invite=…`), so claiming it here is what makes a link a
 * friend sent open the app rather than the site.
 *
 * Both platforms also need a verification file served from that host — see
 * `apps/web/src/app/.well-known/`. Until those are configured the links still
 * work, they just land on the web app.
 */
const WEB_HOST = (process.env.EXPO_PUBLIC_WEB_URL ?? 'https://game-explorer-site.vercel.app')
  .replace(/^https?:\/\//, '')
  .replace(/\/$/, '');
const config: ExpoConfig = {
  name: 'GameExplorer',
  slug: 'gameexplorer',
  // The EAS project lives under the `gameexplorermobile` account (an org),
  // not the personal login — pin it so builds resolve the right owner.
  owner: 'gameexplorermobile',
  scheme: 'gameexplorer',
  version: '1.1.0',
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
    // Universal Links for invite + spectate links (see WEB_HOST above).
    associatedDomains: [`applinks:${WEB_HOST}`],
    infoPlist: {
      // The app uses only standard HTTPS/TLS, which is exempt from US export
      // encryption documentation — declaring this stops App Store Connect from
      // asking on every submission.
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    package: 'com.gameexplorer.app',
    // App Links for invite + spectate links. `autoVerify` is what lets Android
    // open them without a chooser dialog; it needs `/.well-known/assetlinks.json`
    // on WEB_HOST. Until that is served, verification simply fails and the link
    // opens the web app — a chooser on every tap would be the worse default.
    intentFilters: [
      {
        action: 'VIEW',
        autoVerify: true,
        data: [
          { scheme: 'https', host: WEB_HOST, pathPrefix: '/chess/play' },
          { scheme: 'https', host: WEB_HOST, pathPrefix: '/checkers/play' },
          { scheme: 'https', host: WEB_HOST, pathPrefix: '/reversi/play' },
          { scheme: 'https', host: WEB_HOST, pathPrefix: '/spectate' },
        ],
        category: ['BROWSABLE', 'DEFAULT'],
      },
    ],
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
