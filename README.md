# GameExplorer

One app for classic board games — five games and one account, on the web and on iOS and
Android.

**Play now: [game-explorer-site.vercel.app](https://game-explorer-site.vercel.app/)** —
free, no sign-up needed to start.

Every game can be played offline against a bot or with a friend on the same device.
Three of them can also be played online against a stranger or a friend. On top of the
games there are puzzles, lessons, game review and ratings. The whole thing is free.

Happy to take suggestions on more games to add!

## The games

| Game | Players | What it is |
|---|---|---|
| **Chess** | 2 | The classic, with castling, en passant, promotion, stalemate and the fifty-move rule. |
| **Checkers** | 2 | Mandatory captures and multi-jump chains, crowned kings. |
| **Reversi** | 2 | Outflank and flip discs; the board can swing in a single move. |
| **Go** | 2 | Surround territory on a 9×9, 13×13 or 19×19 board, with territory scoring and dead-stone review. |
| **Liquidate** | 2–6 | An original property-trading game set across a ring of planets. Roll dice, claim planets, build colonies, bid in auctions, trade with rivals, and bankrupt everyone else. Designed for GameExplorer. |

## Game modes

| | Chess | Checkers | Reversi | Go | Liquidate |
|---|:-:|:-:|:-:|:-:|:-:|
| Play the bot | ✓ | ✓ | ✓ | ✓ | ✓ |
| Rated practice | ✓ | ✓ | ✓ | ✓ | |
| Pass & Play | ✓ | ✓ | ✓ | ✓ | ✓ |
| Play online | ✓ | ✓ | ✓ | | |
| Puzzles | ✓ | ✓ | ✓ | ✓ | |
| Lessons & rules | ✓ | ✓ | ✓ | ✓ | rules |
| Game review | ✓ | ✓ | ✓ | ✓ | |

- **Play the bot** — you pick the strength. Each rated game has six tiers from Beginner to
  Master, and chess also lets you pick an exact Elo. Stronger chess bots are backed by a
  real engine (Stockfish on the web, Arasan in the mobile app). The checkers, reversi and
  Go bots run on the project's own engines. Liquidate bots have four personalities, from
  cautious to ruthless, and you can fill a table of up to six with any mix of bots and
  people.
- **Rated practice** — a bot matched to your current level instead of one you pick, with
  hints available for a cost in points. The mode for getting better rather than winning.
- **Pass & Play** — two people, one screen. Nothing is saved.
- **Play online** — join a rated or casual queue at a chosen time control, or send a
  friend an invite link. The server checks every move, runs both clocks and records the
  result. Games have chat, emotes, draw offers, resign and abort, and a way to block or
  report a player. Signed-in players can watch live games from the **Watch** page.

## Learn and improve

- **Puzzles** — set positions with one winning line, in six difficulty bands per game.
  Every solution is proved legal, unique and forced when the puzzle is written. A wrong
  move is refused, and the opponent's refutation is played out so you can see why. The
  website's front page has a daily chess puzzle.
- **Lessons** — coached, step-by-step sequences: read a short explanation, play the move
  it asks for, get feedback when you miss.
- **How to play** — a rules page for every game, for when you just need to look up how
  something works.
- **Game review** — walk through any finished game move by move, with an evaluation bar
  and a grade for each move. Chess also has a position editor for setting up and
  analysing any position, and Go has an SGF game viewer.

## Accounts, ratings and your profile

Guests can play the bots, Pass & Play, puzzles and lessons. An account adds rated
practice, online play, watching live games, and a saved history. Sign in with email or
username, Google or Facebook, or Sign in with Apple on iOS. One account works across the
website and the app.

Each rated game tracks two numbers:

- **Rating** — earned only in rated online games. The server calculates it and uses it
  for matchmaking.
- **Practice level** — earned against bots and in rated practice, so you can see
  yourself improve without playing strangers.

Your profile shows both numbers for each game, along with your record and recent game
history.

## Look and feel

Two themes — **Arcade Glow** (dark) and **Cozy Tabletop** (light) — plus settings for
sound effects, haptics, piece animation, reduced motion, board coordinates, legal-move
hints and a confirm-before-resigning step. A first-run tour and one-time tips (what check means, why a move was
refused, that a game can be reviewed) help new players without getting in the way.

## Platforms

- **Web** — live at [game-explorer-site.vercel.app](https://game-explorer-site.vercel.app/).
- **iOS and Android** — a native app with the same games and modes as the website (not a
  cut-down version). It is in private testing through TestFlight and Google Play's
  testing track, and isn't listed publicly on either store yet. See
  [apps/mobile/README.md](apps/mobile/README.md).

## Coming next

New games are the main thing on the list: Shogi, Backgammon, Chinese Chess and Snakes &
Ladders are all candidates. Also wanted: online Go and online Liquidate, push
notifications for invites, and tournaments.

## How it's built

A TypeScript monorepo (pnpm workspaces + Turborepo). Game rules, bots and most app logic
are written once and shared by the website and the mobile app.

| Path | What it is |
|---|---|
| `apps/web` | The website — Next.js 16, React 19, Tailwind CSS 4, Framer Motion. Hosted on Vercel. |
| `apps/mobile` | The iOS/Android app — Expo SDK 57, React Native 0.86, expo-router, Reanimated. Built with EAS. |
| `apps/api` | The online-play server — Express + Socket.IO with Redis for live game state. Hosted on Render. |
| `packages/shared` | Game engines, bots, puzzles, lessons, game catalog, shared types |
| `packages/client` | Platform-neutral stores and hooks (auth, game sessions, sockets, launcher rules) |
| `packages/ui` | Design tokens, themes, piece art and icons used by both apps |
| `packages/db` | Supabase client and data helpers (accounts, saved games, ratings) |
| `data/` | Puzzle source data |

Accounts and saved games live in Supabase (Postgres + Auth). Single-player modes — bots,
practice, Pass & Play, puzzles and lessons — run entirely on the device; only online play
talks to the API server.

### Running it locally

Requires Node 22 and pnpm 9.

```bash
pnpm install
pnpm turbo run build --filter="./packages/*"   # first run only: build the shared packages
pnpm dev          # runs the web app and the API in watch mode
```

- **Web** needs `apps/web/.env.local` with `NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `NEXT_PUBLIC_API_URL` (the API, e.g.
  `http://localhost:4000`) — see [apps/web/README.md](apps/web/README.md).
- **API** needs `apps/api/.env` — copy [apps/api/.env.example](apps/api/.env.example)
  and fill in the Supabase values. Start its local Postgres and Redis with
  `docker compose up -d postgres redis`.
- **Mobile** has its own setup — see [apps/mobile/README.md](apps/mobile/README.md).

Checks: `pnpm typecheck`, `pnpm lint`, `pnpm test` (Vitest for the shared packages, the
website and the API; Jest for the mobile app), and `pnpm test:e2e` for the website's
Playwright suite.

## Security

Please report vulnerabilities privately — see [SECURITY.md](SECURITY.md).

## Licensing

All first-party code is **MIT-licensed** — see [LICENSE.md](LICENSE.md). "GameExplorer"
and its branding are not covered by any code license — forks must use their own name and
identity. Third-party engines, fonts, icons and data are credited in
[LICENSE.md](LICENSE.md), with full license texts in [LICENSES/](LICENSES/).
