# GameExplorer Mobile (Expo · iOS + Android)

React Native app for GameExplorer. Consumes the shared monorepo packages
(`@gameexplorer/shared`, `@gameexplorer/client`, `@gameexplorer/ui`,
`@gameexplorer/db`) — game logic, bots, stores, session hooks, design tokens, and
the Supabase client are **not** re-implemented here.

## Status: M0 scaffold

Done:
- Expo SDK 52 + expo-router + NativeWind v4, monorepo-aware Metro/Babel config.
- Shared-layer portability fixes landed (native Supabase client, injectable OAuth
  redirect, native shadow/gradient tokens).
- Root layout (gesture + safe-area providers, config bootstrap) and a home-hub
  placeholder screen proving the token system renders on device.

Pending (next milestones): auth + navigation (M1), native boards + local game loop
(M2–M3), native Stockfish (M3), pass-and-play (M4), release polish (M5).

## First-time setup

Requires the dev-client flow (custom native modules: reanimated, gesture-handler,
svg, async-storage). From the repo root:

```bash
pnpm install
```

Create `apps/mobile/.env.local` (git-ignored):

```
EXPO_PUBLIC_API_URL=https://<your-render-api>
EXPO_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
```

## Run

```bash
# Build + install the dev client on a simulator/emulator (first run only)
pnpm --filter @gameexplorer/mobile ios       # or: android

# Start Metro against the dev client
pnpm --filter @gameexplorer/mobile start
```

Cloud builds / store submission use EAS:

```bash
eas build --profile development --platform ios     # or android
eas build --profile production --platform all
```

## Why a dev client (not Expo Go)

Expo Go can't load the native Stockfish module (M3) or custom config plugins, so the
project standardizes on `expo-dev-client` from the start.

## Monorepo notes

- `metro.config.js` watches the workspace root and points resolution at both the
  app's and the root's `node_modules` (pnpm hoists shared deps to the root).
- Shared packages are consumed from **source**; `@gameexplorer/db` exposes a
  `react-native` entry so Metro picks up `client.native.ts` (AsyncStorage session)
  instead of the web `dist` build.
