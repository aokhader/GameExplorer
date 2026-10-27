# GameExplorer Web

The GameExplorer website, live at
**[game-explorer-site.vercel.app](https://game-explorer-site.vercel.app/)**. It is the
same product as the mobile app: five games, every mode, one account. For the feature
overview, see the [root README](../../README.md).

Game rules, bots, stores, session hooks and design tokens come from the shared
packages (`@gameexplorer/shared`, `@gameexplorer/client`, `@gameexplorer/ui`,
`@gameexplorer/db`). This app holds the pages, the boards and the browser-specific glue.

## Tech stack

Next.js 16 (App Router) · React 19 · Tailwind CSS 4 · Framer Motion · Zustand ·
Supabase (`@supabase/ssr`) · socket.io-client · Stockfish.js (WASM) · Vitest ·
Playwright. Hosted on Vercel.

## Routes

Every game follows the same shape under `/{game}`, minus the modes it doesn't have:

| Game | Routes |
|---|---|
| `chess` | hub, `bot`, `training`, `local`, `play`, `puzzles`, `analysis`, `learn`, `learn/[lesson]`, `replays`, `replays/[id]` |
| `checkers` | hub, `bot`, `training`, `local`, `play`, `puzzles`, `learn`, `learn/[lesson]` |
| `reversi` | hub, `bot`, `training`, `local`, `play`, `puzzles`, `learn`, `learn/[lesson]` |
| `go` | hub, `bot`, `training`, `local`, `puzzles`, `analysis`, `learn`, `learn/[lesson]` |
| `liquidate` | hub, `bot`, `local`, `learn` |

`bot` is play the bot, `training` is rated practice, `local` is Pass & Play, and `play`
is online multiplayer. `/chess/replays/[id]` redirects into `/chess/analysis`.

Everything else:

| Group | Routes |
|---|---|
| Home | `/` — a landing page for new visitors, or the launcher (`/home`) for anyone who has played |
| Play | `/play` — pick a game and its setup |
| Learn | `/learn` — every game's rules and lessons |
| Review | `/review/[id]` — a saved checkers, reversi or Go game |
| Watch | `/spectate`, `/spectate/[gameId]` |
| Account | `/auth/signin`, `/auth/signup`, `/auth/choose-username`, `/profile`, `/settings`, `/delete-account` |
| Onboarding | `/welcome` |
| Legal | `/privacy`, `/terms`, `/licenses` |
| App links | `/.well-known/assetlinks.json`, `/.well-known/apple-app-site-association` |

`/` and `/home` share one address: once a browser has any play history, a cookie
(`gx_returning`) makes `next.config.ts` serve the launcher at `/`. Game screens are
*immersive* — they hide the global navigation (`src/lib/routes.ts` decides which).

## Getting started

From the repo root:

```bash
pnpm install
pnpm turbo run build --filter="@gameexplorer/web^..."   # first run only: build the shared packages
pnpm --filter @gameexplorer/web dev                   # http://localhost:3000
```

`pnpm dev` from the root also works. It runs the web app, the API and the shared
packages' watchers together.

Create `apps/web/.env.local` (git-ignored):

```
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
NEXT_PUBLIC_API_URL=http://localhost:4000      # the API server; this is also the default
# Optional:
# NEXT_PUBLIC_SITE_URL=https://<web-host>      # canonical URL for metadata and the sitemap
```

The Supabase values are required — the app creates its client at startup. The API
server ([apps/api](../api)) is only needed for online play, the live-game list, blocking
and reporting, signing in with a username, and deleting an account. Bots, Pass & Play,
puzzles, lessons and game review don't use it.

## Checks and tests

```bash
pnpm --filter @gameexplorer/web typecheck
pnpm --filter @gameexplorer/web lint
pnpm --filter @gameexplorer/web test        # Vitest
pnpm --filter @gameexplorer/web test:e2e    # Playwright
```

- **Vitest** (`src/__tests__/`) covers only what can't live in a package:
  `next.config.ts` (headers and the content security policy), the sign-in return path,
  and source scans such as the one that allows exactly one raw-HTML sink. Game logic
  is tested in `packages/shared`.
- **Playwright** (`e2e/`, Chromium) covers the smoke path, auth guards, onboarding,
  setup memory and resume, puzzles, lessons, review, analysis, Pass & Play, bot games,
  the legal pages and security headers. Locally it starts `next dev`, or reuses whatever is
  already on port 3000. In CI it runs against a production build.
- Run e2e against a production build (`pnpm build && pnpm start` in this folder, then
  `test:e2e`) before trusting a failure. Under `next dev`, Fast Refresh can reset a game
  mid-test and cause failures that rotate between runs. A stale server left on :3000
  also gets reused silently.
- In CI the Playwright job only runs when the repository has `NEXT_PUBLIC_SUPABASE_URL`
  and `NEXT_PUBLIC_SUPABASE_ANON_KEY` set as Actions *variables*. Otherwise it is
  skipped, so a green badge doesn't prove Playwright ran.

## Project layout

```
src/
  app/                 routes (App Router), globals.css, fonts/, .well-known/ handlers
  components/
    game/              shared game shells: hub, setup, result screen, player cards, review panel
    board/             the cross-game board layer
    chess/ checkers/ reversi/ go/ liquidate/   each game's board and screen
    home/ play/ learn/ lessons/ puzzles/       landing page, launcher, and those sections
    multiplayer/       emotes, opponent menu, blocked players, spectate link
    ui/                primitives (Button, Card, Modal, Toast, Toggle, …)
  hooks/               engine, socket, launcher, setup and resume hooks
  lib/                 routes, local storage, analysis, sound, Supabase helpers
  workers/             the in-house chess engine's Web Worker
public/
  stockfish/           vendored Stockfish.js builds (GPL — see its README)
  puzzles/             the generated puzzle corpus, fetched a page at a time
e2e/                   Playwright specs
```

## Conventions worth knowing

- **Tailwind 4, CSS-first.** There is no `tailwind.config`; the theme lives in
  `src/app/globals.css`, which maps utilities onto CSS variables. Each theme utility
  pairs with a token in `packages/ui`, so change both together. Themes switch through
  `[data-theme]` on the root element, set before hydration by the root layout.
- **Lint enforces the design rules.** It rejects arbitrary pixel sizes (`text-[13px]`,
  `rounded-[14px]`), `h-screen`/`min-h-screen`/`100vh` (use `svh`), emoji in interface
  text (outside Liquidate), and decorative glows, glass and gradients.
- **The chess board has the only component stylesheet.** The *routes* that render a
  chess board import it, not the component itself. A new route that forgets the import
  renders the board as one tall column.
- **Search work stays off the main thread.** Stockfish runs in Web Workers (the site sets
  cross-origin isolation headers so the multi-threaded build can be used). The in-house
  chess engine has its own worker. Checkers, reversi and Go searches run in slices that
  yield to the browser.
- **The content security policy is enforced** (`ENFORCE_FULL_CSP` in `next.config.ts`).
  Anything new the browser loads or talks to — another host, a worker, WebAssembly, an
  image origin — must be added there. Otherwise it fails with only a console message.
- **Engine binaries are version-stamped and cached as immutable.** Never overwrite one in
  `public/stockfish/`; add a new version.
- **Generated content — don't edit by hand:** `public/puzzles/` comes from
  `data/puzzles/` via `scripts/puzzles/publish.mjs`. Sound effects are synthesized
  in the browser from shared recipes (`src/lib/sound/synth.ts`), so there are no audio
  files.
- **Fonts are vendored** in `src/app/fonts/` and loaded with `next/font/local`, so a
  build never fetches from Google. Sources and hashes are in that folder's README.

## Deployment (Vercel)

- **Root Directory must be `apps/web`**, framework preset Next.js. `vercel.json` builds
  through Turbo (`turbo run build --filter=@gameexplorer/web`) so the shared packages
  build first. With the repo root as the root directory, Vercel tries to build the API
  too.
- Set `ENABLE_EXPERIMENTAL_COREPACK=1` so Vercel uses the pnpm version pinned in the
  root `package.json`.
- Environment: the Supabase pair and `NEXT_PUBLIC_API_URL` (the deployed API). They are
  inlined at build time and also feed the content security policy, so a change needs a
  redeploy. For the mobile app's verified invite links, also set
  `ANDROID_SHA256_FINGERPRINTS` and `APPLE_TEAM_ID`. Without them the
  `.well-known` routes return 404, and invite links open the website instead of the app.

## License

MIT, like the rest of the repo — see [LICENSE.md](../../LICENSE.md). The Stockfish.js
builds in `public/stockfish/` are GPL-3.0-or-later and run as separate Web Worker
programs. Their notice and source offer are in
[public/stockfish/README.md](public/stockfish/README.md).
