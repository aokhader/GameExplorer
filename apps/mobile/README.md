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

The dev-client APK holds only native code; the JS is served live by Metro. So the
loop is: **boot emulator → start Metro → point emulator at Metro → open the app.**

```bash
# First run only — build + install the dev client on the emulator/simulator
pnpm --filter @gameexplorer/mobile android    # or: ios
```

### Run on the Android emulator (day-to-day)

1. **Boot an emulator** (skip if one's already running). From Android Studio's Device
   Manager, or a terminal:
   ```bash
   emulator -list-avds              # list AVDs
   emulator -avd <name>             # e.g. Pixel_7_API_35
   adb devices                      # confirm: emulator-5554  device
   ```
2. **Start Metro** from this folder, and leave it running:
   ```bash
   cd apps/mobile
   npx expo start --dev-client --port 8081
   ```
3. **Point the emulator's localhost at Metro** (in a second terminal). Re-run this
   whenever adb or the emulator restarts — a dropped mapping shows as a network-error
   screen in the app:
   ```bash
   adb reverse tcp:8081 tcp:8081                       # Metro
   adb reverse tcp:4000 tcp:4000                       # only if using a local API on :4000
   ```
4. **Open the app** — tap the **GameExplorer** icon, or launch it via its dev-client URL:
   ```bash
   adb shell am start -a android.intent.action.VIEW \
     -d "exp+gameexplorer://expo-development-client/?url=http://localhost:8081"
   ```

### Reload after code changes (Windows cache gotcha)

Reload with the shake gesture, or `adb shell input keyevent 82` → **Reload**. If a
change won't show — **especially new files or new/renamed routes** — Metro's file
watch is flaky on Windows (no watchman). Restart Metro with a cleared cache, then
force-stop the app so it refetches a fresh bundle:

```bash
npx expo start --dev-client --port 8081 --clear     # rebuilds cache from current files
adb shell am force-stop com.gameexplorer.app        # then reopen (step 4)
```

If Metro won't start with `EADDRINUSE`/`8081 in use`, kill the stale instance first
(`npx kill-port 8081`, or find the PID via `netstat -ano | findstr :8081`).

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
