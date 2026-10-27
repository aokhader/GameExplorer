# GameExplorer Mobile (Expo · iOS + Android)

The native GameExplorer app. It is the same product as the
[website](https://game-explorer-site.vercel.app/), not a cut-down version: all five games,
every mode, the same account, and online play against people on either platform.

Game logic, bots, stores, session hooks, design tokens and the Supabase client come from
the shared monorepo packages (`@gameexplorer/shared`, `@gameexplorer/client`,
`@gameexplorer/ui`, `@gameexplorer/db`). They are not re-implemented here — this folder
holds the native screens, boards, gestures and platform glue.

## Status

**Feature-complete and in private testing.** App version `2.0.0`. Production builds go to
Google Play's internal testing track and to TestFlight. There is no public store listing
yet, so the website is the public way to play for now.

| Area | State |
|---|---|
| Chess, Checkers, Reversi, Go, Liquidate | All five playable |
| Play the bot | All five games |
| Rated practice (training) | Chess, Checkers, Reversi, Go |
| Pass & Play | All five games |
| Online play | Chess, Checkers, Reversi — tested against the live server, including web ⇄ mobile games |
| Puzzles | Chess, Checkers, Reversi, Go — six difficulty bands each |
| Lessons and rules | Coached lessons for four games; rules pages for all five |
| Game review | All games; plus a chess position editor and a Go SGF viewer |
| Accounts | Email or username, Google, Facebook, Sign in with Apple (iOS) |
| Themes | Arcade Glow (dark) and Cozy Tabletop (light) |

Not on mobile (or web) yet: online Go, online Liquidate, push notifications, and
tournaments.

## What's in the app

**Home** is a launcher, not a landing page. It opens on what you can do next: continue
an unfinished game, play again with your last setup, or — on a first visit — pick a game
and choose *Play* (start a game against a mid-strength bot at once) or *I'm new* (open
the first lesson). Under that are your numbers per game, your recent games, a game worth
trying, and links to watch and learn.

The tab bar is **Home · Play · You**. The raised Play button opens the setup screen for
the game you played last, with the other four games one tap away across the top.

**Game modes**, chosen on each game's setup screen:

- **Play the bot.** Six strength tiers per game (Beginner → Master), plus an exact-Elo
  picker for chess. Chess bots from 1400 up run
  [Arasan](https://github.com/jdart1/arasan-chess) natively on the device (up to 2800).
  Weaker chess bots, and the Checkers, Reversi and Go bots, use the project's own
  engines. Liquidate bots have four personalities (cautious, steady, shrewd, ruthless).
- **Rated practice.** A bot matched to your Practice level, with hints that cost points.
  Chess hints always come from Arasan.
- **Pass & Play.** Two people, one phone. Chess and checkers can flip the board between
  turns.
- **Play online.** Rated or casual matchmaking at a chosen time control, or an invite
  link for a friend. Invite links open the app instead of the site when it's installed.
  Games include chat, emotes, draw offers, resign and abort, and block or report.
  Signed-in players can also watch live games.

**Learning:** puzzles (each solution is checked when the puzzle is written; a wrong move
is refused and the reason is shown), coached step-by-step lessons, and a rules page
per game.

**After a game:** review it move by move with an evaluation bar and per-move grades.
Chess also has a position editor, and Go has an SGF game viewer.

**Go** plays on 9×9 (rated), 13×13 or 19×19. **Liquidate** is a 2–6 player
property-trading game set across a ring of planets. On a phone it uses a board plus a
pinned sheet and full-screen views for auctions, trades, debt, holdings and standings.

**You** shows each game's Practice level (earned against bots), its online Rating
(earned in rated online games, and calculated on the server), and your game history.

**Settings:** theme, sound effects, haptics, reduce motion, piece animation, board
coordinates, legal-move dots, board flip in Pass & Play, confirm Go placements, confirm
resignation. Settings also has account deletion and the open-source notices.

**Offline:** bots, Pass & Play, puzzles and lessons all work without a connection, and
without an account. Rated practice, online play, watching live games and saving results
need you to be signed in and online.

## Tech stack

Expo SDK 57 · React Native 0.86 (New Architecture) · React 19.2 · expo-router (typed
routes) · Reanimated 4 · React Native Gesture Handler · react-native-svg · Zustand ·
socket.io-client · Supabase · EAS Build / Submit / Update.

Styling is plain inline style objects that read the shared tokens from
`@gameexplorer/ui` during render. There is no NativeWind or Tailwind here. Don't use a
module-level `StyleSheet.create`: it freezes the token values at import time, so a
theme switch never reaches that component. A test (`noFrozenTokens.test.ts`) enforces
this.

The chess engine is a local TurboModule, `modules/react-native-arasan` (Arasan + its NNUE
network + Fathom, all MIT). It is a singleton owned by the root layout because it can't
be restarted. If a binary lacks the module, the chess tiers from 1400 up are hidden and
chess hints are disabled, instead of the app crashing.

## Project layout

```
app/                        expo-router routes
  (tabs)/                   Home and You, plus the tab shell
  (auth)/                   sign-in, sign-up, choose-username (modal)
  play/[game].tsx           every game and every mode (bot, practice, pass & play, online)
  puzzles/[game].tsx        puzzles
  lesson/[game]/[id].tsx    coached lessons
  learn/[game].tsx          rules
  review/[id].tsx           post-game review
  analysis/{chess,go}.tsx   chess position editor, Go SGF viewer
  spectate/                 live-game list and the spectator view
  settings.tsx, welcome.tsx, licenses.tsx
  +native-intent.tsx        maps web invite/spectate links onto app routes
src/
  board/                    the five board renderers and shared touch handling
  game/                     game shells, result screen, game bar, pickers
  screens/                  the full game, puzzle and lesson screens
  multiplayer/              matchmaking, online boards, clocks, chat, emotes
  liquidate/                Liquidate's board, sheet and full-screen views
  home/                     the launcher
  engine/                   native engine host and the local game loop
  components/ui/            primitives (Button, Card, Sheet, Screen, Icon, …)
  __tests__/                Jest suite
modules/react-native-arasan/  the native chess engine
.maestro/                   Maestro smoke and Liquidate flows
```

## First-time setup

Requires the dev-client flow (custom native modules: the Arasan engine, Reanimated,
Gesture Handler, SVG, Secure Store). From the repo root:

```bash
pnpm install
```

Create `apps/mobile/.env.local` (git-ignored):

```
EXPO_PUBLIC_API_URL=https://<your-render-api>
EXPO_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
# Optional — both default to the deployed site:
# EXPO_PUBLIC_WEB_URL=https://<web-host>     (invite links, support/legal pages)
# EXPO_PUBLIC_SITE_URL=https://<web-host>    (where the puzzle corpus is fetched from)
```

## Run

The dev-client APK holds only native code; the JS is served live by Metro. So the
loop is: **boot emulator → start Metro → point emulator at Metro → open the app.**

```bash
# First run only — build + install the dev client on the emulator/simulator
pnpm --filter @gameexplorer/mobile android    # or: ios
```

Rebuild the dev client whenever native code changes (a new native dependency, a config
plugin, or the Arasan module). JS-only changes just need Metro.

### Run on the Android emulator (day-to-day)

1. **Boot an emulator** (skip if one's already running). From Android Studio's Device
   Manager, or a terminal:
   ```bash
   emulator -list-avds              # list AVDs
   emulator -avd <name>             # e.g. Pixel_8_API_35
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
   If `adb reverse` keeps dropping, skip it and point the dev client at the host
   directly — the emulator reaches your machine at `10.0.2.2`:
   `?url=http://10.0.2.2:8081`.

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

## Checks and tests

```bash
pnpm --filter @gameexplorer/shared build      # Jest doesn't build workspace deps — do this first
pnpm --filter @gameexplorer/mobile typecheck
pnpm --filter @gameexplorer/mobile lint
pnpm --filter @gameexplorer/mobile test
```

The Jest suite (`src/__tests__/`, jest-expo + React Native Testing Library) covers the
game shells, UI primitives, screens, hooks, deep-link handling and session storage.
Don't mock Reanimated globally — it hides real breakage; use the scoped helper in
`src/__tests__/helpers/` instead.

Board drags, drops and premoves have no automated coverage. Verify them on an emulator
or a device. The Maestro flows in `.maestro/` (`maestro test .maestro/smoke.yaml`) need a
dev or preview build installed and aren't wired into CI.

## Cloud builds (EAS), releases & environment

The EAS project lives under the `gameexplorermobile` organisation and is already linked —
`extra.eas.projectId` is set in `app.config.ts` (the CLI can't auto-write a TypeScript
config), so `eas init` is not needed. Log in, then build:

```bash
eas login                                             # interactive; credentials cached in ~/.expo
eas build --profile preview --platform android        # standalone APK, JS bundle embedded
eas build --profile development --platform android    # dev-client APK (needs Metro to load JS)
eas build:run -p android --latest                     # download + install the latest build
```

**Preview vs development:** a `development` build is a dev client that still fetches JS
from Metro over the network — the same `adb reverse` / localhost dance as a local build.
A `preview` build **embeds the JS bundle**, so it runs standalone with no Metro
connection — the reliable way to see the app as testers will.

**Releasing.** `production` builds auto-increment the build number. `eas submit` sends
Android to Play's internal track as a draft and iOS to App Store Connect (TestFlight):

```bash
eas build  --profile production --platform all
eas submit --profile production --platform android --latest
eas submit --profile production --platform ios --latest
```

**Over-the-air updates.** `runtimeVersion` follows the app version (`appVersion` policy),
so a JS-only fix can ship without a new binary:

```bash
eas update --channel production --environment production
```

Anything that changes native code — a new native module, a config plugin, permissions —
needs a new build. An update can reach a binary that lacks a native module the new JS
imports. Look such modules up with `requireOptionalNativeModule` and degrade, as the
engine and the sealed session storage do.

**Env by profile:** local dev reads `apps/mobile/.env.local` (Metro inlines
`EXPO_PUBLIC_*`); the `eas.json` `development` profile's `env` is mostly inert for
dev-client builds. **preview/production** builds need `EXPO_PUBLIC_API_URL` +
`EXPO_PUBLIC_SUPABASE_URL` + `EXPO_PUBLIC_SUPABASE_ANON_KEY` defined in the EAS
server-side environments (`eas env:list --environment production` to inspect) —
`.env.local` never reaches the EAS builders. Each build profile is pinned to its
environment via the `environment` field in `eas.json`, and OTA publishes must pass it
too. Without the vars, screens that talk to Supabase degrade to guest state and the API
URL falls back to the deployed server.

### iOS from a Windows machine

There is no local Xcode or simulator on Windows, so **iOS builds run in EAS cloud** and
go out through TestFlight. Day-to-day development happens on the Android emulator. To
put a development build on a physical iPhone:

```bash
eas device:create                                  # register the iPhone's UDID
eas build --profile development --platform ios     # cloud ad-hoc build → install via QR
```

## Why a dev client (not Expo Go)

Expo Go can't load the native Arasan engine module or the project's config plugins, so
the project uses `expo-dev-client` throughout.

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
  (`db`'s also selects the `.native.ts` session storage).
  **Rule:** any workspace package consumed by mobile whose `main` points at
  `dist/` MUST also carry the `react-native`→`src` field. Otherwise Metro's
  `main` fallback needs a built `dist/`, which exists locally but **not** on a
  clean EAS builder — the bundle then fails only in the cloud (`EAGER_BUNDLE`:
  "specifies a `main` module field that could not be resolved … dist/index.js").
  Reproduce clean-cloud bundling locally by hiding the `dist/` dirs and running
  `npx expo export --platform android`.
- Navigate into a game screen with `router.push`, never `router.replace` — a replace
  re-parents the view tree under the New Architecture and crashes intermittently.

## License

MIT, like the rest of the repo — see [LICENSE.md](LICENSE.md) for this app's third-party
notices (Arasan, Fathom, fonts, icons). The GameExplorer name and app icons are not
covered by the code license.
