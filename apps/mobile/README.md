# GameExplorer Mobile (Expo · iOS + Android)

React Native app for GameExplorer. Consumes the shared monorepo packages
(`@gameexplorer/shared`, `@gameexplorer/client`, `@gameexplorer/ui`,
`@gameexplorer/db`) — game logic, bots, stores, session hooks, design tokens, and
the Supabase client are **not** re-implemented here.

## Status: M0 scaffold (upgrading SDK 52 → 57)

Done:
- Expo SDK 52 + expo-router + NativeWind v4, monorepo-aware Metro/Babel config.
- Shared-layer portability fixes landed (native Supabase client, injectable OAuth
  redirect, native shadow/gradient tokens).
- Root layout (gesture + safe-area providers, config bootstrap) and a home-hub
  placeholder screen proving the token system renders on device.

In progress: **upgrade to Expo SDK 57** (RN 0.86 / React 19.2) for store gates
(Play targetSdk 35 + 16 KB libs, Apple Xcode 26) and to unify React with web —
see `project-docs/mobile-app-plan.md` (Decisions from the July 2026 strategy review).

Pending (next milestones): auth + navigation (M1), native boards + local game loop
(M2–M3), native Stockfish spike then integration (M3), pass-and-play (M4), release
polish (M5). Store-compliance checklist lives in the mobile plan.

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

If the app talks to a locally-running API (`apps/api` on :4000), forward it to the
emulator too:

```bash
adb reverse tcp:8081 tcp:8081   # Metro
adb reverse tcp:4000 tcp:4000   # local API (EXPO_PUBLIC_API_URL=http://localhost:4000)
```

## Cloud builds (EAS) & environment

The EAS project is already linked — `extra.eas.projectId` is set in `app.config.ts`
(the CLI can't auto-write a TypeScript config), so `eas init` is not needed. Just log
in, then build:

```bash
eas login                                             # interactive; credentials cached in ~/.expo
eas build --profile preview --platform android        # standalone APK, JS bundle embedded
eas build --profile development --platform android    # dev-client APK (needs Metro to load JS)
eas build:run -p android --latest                     # download + install the latest build
```

The first Android build asks to generate a keystore — say yes (EAS stores it
remotely). With a logged-in session (or `EXPO_TOKEN` set) a `--non-interactive`
build generates it automatically, the standard CI flow.

**Preview vs development, and why preview is handy here:** a `development` build is a
dev client that still fetches JS from Metro over the network — the same
`adb reverse` / localhost dance as a local build, which is **flaky on the emulator**
(see the Metro note below). A `preview` build **embeds the JS bundle in the APK**, so
it runs standalone with no Metro connection — the reliable way to actually see the app
render on the emulator or a device.

Env by profile: **local dev** reads `apps/mobile/.env.local` (Metro inlines
`EXPO_PUBLIC_*`); the `eas.json` `development` profile's `env` is mostly inert for
dev-client builds. **preview/production** builds need `EXPO_PUBLIC_API_URL` +
`EXPO_PUBLIC_SUPABASE_URL` + `EXPO_PUBLIC_SUPABASE_ANON_KEY` set via `eas env`
(the home hub renders without them — `bootstrapConfig` falls back to
`http://localhost:4000` — but any screen that talks to Supabase/the API needs them).

### iOS (from a Windows machine — deferred to ~M5)

There is no local Xcode/simulator on Windows, so **iOS builds run in EAS cloud**.
Testing on a physical iPhone requires Apple Developer Program enrollment ($99/yr,
no Mac needed) and ad-hoc device provisioning:

```bash
eas device:create                                 # register the iPhone's UDID
eas build --profile development --platform ios     # cloud ad-hoc build → install via QR
eas submit --profile production --platform ios      # store submission, later
```

Until then, develop and test on the **Android emulator**.

## Why a dev client (not Expo Go)

Expo Go can't load the native Stockfish module (M3) or custom config plugins, so the
project standardizes on `expo-dev-client` from the start.

## Clean reinstall (Windows / pnpm hoisted)

The root `.npmrc` pins `node-linker=hoisted` (required so native C++ builds fit under
Windows MAX_PATH). After changing the dependency tree, do a **full** clean reinstall —
stale junctions otherwise shadow the hoisted copies:

```bash
# from the repo root, delete every node_modules, then:
pnpm install
pnpm --filter @gameexplorer/api exec prisma generate
```

`pnpm config get node-linker` must print `hoisted`. A `CMake`/MAX_PATH error during a
native build means hoisting isn't in effect.

## Monorepo notes

- `metro.config.js` watches the workspace root and points resolution at both the
  app's and the root's `node_modules` (pnpm hoists shared deps to the root).
- Shared packages are consumed from **source**. `@gameexplorer/client` and
  `@gameexplorer/ui` point `main` straight at `src/index.ts`; `@gameexplorer/db`
  and `@gameexplorer/shared` keep `main: dist/index.js` (for web/API) but add a
  `"react-native": "./src/index.ts"` field so Metro reads source on native
  (`db`'s also selects `client.native.ts` for the AsyncStorage session).
  **Rule:** any workspace package consumed by mobile whose `main` points at
  `dist/` MUST also carry the `react-native`→`src` field. Otherwise Metro's
  `main` fallback needs a built `dist/`, which exists locally but **not** on a
  clean EAS builder — the bundle then fails only in the cloud (`EAGER_BUNDLE`:
  "specifies a `main` module field that could not be resolved … dist/index.js").
  Reproduce clean-cloud bundling locally by hiding the `dist/` dirs and running
  `npx expo export --platform android`.
