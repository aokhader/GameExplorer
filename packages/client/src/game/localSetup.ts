/**
 * What a player chose on a setup screen, remembered per game and mode.
 *
 * Every visit used to re-ask strength, colour and rated: each screen seeded
 * `useState` with a literal, so the tenth game cost the same five clicks as the
 * first. lichess keeps the last valid choices of each setup form, and OGS keeps
 * every Quick Match field as a preference; this is the same idea
 * (`project-docs/ux-fix-ideas.md` §2.1).
 *
 * **Only the model lives here** — shapes, defaults, keys, and a parser that
 * never throws. Storage is per platform (web's synchronous store, native's
 * AsyncStorage) and reaches the hook in `hooks/useRememberedSetup.ts` through
 * `LocalStore`, the pattern `settings.ts` and `useSettingsStore` already use.
 *
 * **Why `client` and not beside `settings.ts` in `shared`.** The Go shape is
 * validated against the board sizes, komi presets and tiers in `goSetup.ts`,
 * which lives in this package; `shared` cannot import `client`. Restating those
 * lists in `shared` would be the hand-maintained copy the setup screens already
 * learned not to keep.
 *
 * **The parser is the safety.** A stored value can come from an older build, a
 * newer build, a binary without the strong chess engine, or a hand edit. It is
 * merged over the defaults, and every field is checked on its own, so one bad
 * field costs that field rather than the whole setup. What a *particular binary*
 * can play is still the screen's to clamp — native chess drops its ceiling when
 * the engine is absent — because that is a fact about the build, not the choice.
 */

import {
  BOT_ELO_BOUNDS,
  BOT_TIERS,
  LIQUIDATE_BOT_LEVELS,
  LIQUIDATE_MAX_PLAYERS,
  LIQUIDATE_MIN_PLAYERS,
  MODE_COPY,
  type DebtRule,
  type GoScoring,
  type LiquidateBotLevel,
} from '@gameexplorer/shared';
import {
  GO_BOARD_SIZES,
  GO_KOMI_PRESETS,
  GO_RATED_KOMI,
  GO_RATED_SIZE,
  GO_SCORING_OPTIONS,
} from './goSetup';

export type SetupGame = 'chess' | 'checkers' | 'reversi' | 'go' | 'liquidate';

/**
 * The modes a setup is remembered for. Online and puzzles are absent: online is
 * configured on its own panel against a server, and a puzzle has no setup.
 *
 * Pass-and-play is `'pass-and-play'` here even though web's route calls it
 * `local` — this is the loop's vocabulary (`LocalGameMode`), and the key has to
 * mean the same thing whichever platform wrote it.
 */
export type SetupMode = 'bot' | 'training' | 'pass-and-play';

/**
 * The option a native setup screen opens on. Online is included — it is a
 * choice the player made on this screen — but puzzles are not: they leave for
 * their own route, and reopening a game's setup on "Start Puzzles" would make
 * the screen's one button do something other than start a game.
 */
export type LastSetupMode = SetupMode | 'online';

export type SideColor = 'white' | 'black';

/** Chess, checkers, reversi: a bot's strength, your side, and whether it counts. */
export interface BotGameSetup {
  elo: number;
  color: SideColor;
  rated: boolean;
}

export interface ChessSetup extends BotGameSetup {
  /**
   * The exact-rating picker was used rather than a preset tile. Native draws the
   * two differently; web's slider ignores it. Without it a remembered 1350
   * would reopen with no tile selected and no picker showing.
   */
  custom: boolean;
}

/** Go adds the rules a game is played under. */
export interface GoSetup extends BotGameSetup {
  size: number;
  komi: number;
  scoring: GoScoring;
}

export interface LiquidateSetup {
  players: number;
  board: 'quick' | 'full';
  debtRule: DebtRule;
  botLevel: LiquidateBotLevel;
}

/** Records keyed by the game union, so a sixth game fails to compile until it has one. */
export interface SetupFor {
  chess: ChessSetup;
  checkers: BotGameSetup;
  reversi: BotGameSetup;
  go: GoSetup;
  liquidate: LiquidateSetup;
}

/**
 * Web lets a chess bot go to 3000 on its slider (Stockfish); native stops at
 * 2800, and lower still on a binary without Arasan. The model keeps the widest
 * value either platform offers so a web choice is not silently lowered by being
 * remembered; each screen then clamps to what it can play.
 */
const CHESS_MODEL_MAX_ELO = 3000;
/** Web's slider steps in 25s; a stored value off that grid is snapped onto it. */
const CHESS_ELO_STEP = 25;

/** The values the setup screens seeded `useState` with before this existed. */
export function setupDefaults<G extends SetupGame>(game: G, mode: SetupMode): SetupFor[G] {
  const defaults: { [K in SetupGame]: () => SetupFor[K] } = {
    chess: () => ({ elo: 1200, color: 'white', rated: true, custom: false }),
    checkers: () => ({ elo: 1100, color: 'white', rated: true }),
    // Black moves first in reversi and Go, so the default seat is the one that
    // gets to play straight away.
    reversi: () => ({ elo: 1100, color: 'black', rated: true }),
    go: () => ({
      elo: 1100,
      color: 'black',
      rated: true,
      size: GO_RATED_SIZE,
      komi: GO_RATED_KOMI,
      scoring: 'area',
    }),
    liquidate: () => ({
      // Web's pass-and-play form opened on two seats — two people at one screen
      // is the common case — and its bot form on three.
      players: mode === 'pass-and-play' ? 2 : 3,
      board: 'quick',
      debtRule: 'allow-negative',
      botLevel: 'steady',
    }),
  };
  return defaults[game]() as SetupFor[G];
}

/** `gx:` like every other key both apps write for this layer (`gx:settings`). */
export function setupStorageKey(game: SetupGame, mode: SetupMode): string {
  return `gx:setup:${game}:${mode}`;
}

export function lastModeStorageKey(game: SetupGame): string {
  return `gx:setup:${game}:mode`;
}

const nearest = (values: readonly number[], target: number): number =>
  values.reduce((a, b) => (Math.abs(b - target) < Math.abs(a - target) ? b : a));

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function color(v: unknown, fallback: SideColor): SideColor {
  return v === 'white' || v === 'black' ? v : fallback;
}

function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback;
}

/** A tier game's strength must be one of its tiles, or no tile would be selected. */
function tierElo(game: 'checkers' | 'reversi' | 'go', v: unknown, fallback: number): number {
  if (!isFiniteNumber(v)) return fallback;
  return nearest(
    BOT_TIERS[game].map((t) => t.elo),
    v,
  );
}

function parseChess(stored: Record<string, unknown>, d: ChessSetup): ChessSetup {
  const custom = bool(stored.custom, d.custom);
  let elo = d.elo;
  if (isFiniteNumber(stored.elo)) {
    elo = custom
      ? Math.round(stored.elo / CHESS_ELO_STEP) * CHESS_ELO_STEP
      : nearest(
          BOT_TIERS.chess.map((t) => t.elo),
          stored.elo,
        );
    elo = Math.max(BOT_ELO_BOUNDS.chess.min, Math.min(CHESS_MODEL_MAX_ELO, elo));
  }
  return { elo, custom, color: color(stored.color, d.color), rated: bool(stored.rated, d.rated) };
}

function parseGo(stored: Record<string, unknown>, d: GoSetup): GoSetup {
  const sizes = GO_BOARD_SIZES.map((s) => s.value as number);
  const komis = GO_KOMI_PRESETS.map((k) => k.value as number);
  const scorings = GO_SCORING_OPTIONS.map((s) => s.value);
  return {
    elo: tierElo('go', stored.elo, d.elo),
    color: color(stored.color, d.color),
    rated: bool(stored.rated, d.rated),
    size: isFiniteNumber(stored.size) && sizes.includes(stored.size) ? stored.size : d.size,
    komi: isFiniteNumber(stored.komi) && komis.includes(stored.komi) ? stored.komi : d.komi,
    scoring: scorings.includes(stored.scoring as GoScoring) ? (stored.scoring as GoScoring) : d.scoring,
  };
}

function parseLiquidate(stored: Record<string, unknown>, d: LiquidateSetup): LiquidateSetup {
  const players = isFiniteNumber(stored.players)
    ? Math.max(LIQUIDATE_MIN_PLAYERS, Math.min(LIQUIDATE_MAX_PLAYERS, Math.round(stored.players)))
    : d.players;
  return {
    players,
    board: stored.board === 'full' || stored.board === 'quick' ? stored.board : d.board,
    debtRule:
      stored.debtRule === 'allow-negative' || stored.debtRule === 'never-negative'
        ? stored.debtRule
        : d.debtRule,
    botLevel: (LIQUIDATE_BOT_LEVELS as readonly string[]).includes(stored.botLevel as string)
      ? (stored.botLevel as LiquidateBotLevel)
      : d.botLevel,
  };
}

/**
 * Turn whatever is in storage into a usable setup. Never throws.
 *
 * Absent, unparseable or non-object input returns the defaults; otherwise each
 * field is kept only if it is still a choice the screen offers.
 */
export function parseSetup<G extends SetupGame>(
  game: G,
  mode: SetupMode,
  raw: string | null | undefined,
): SetupFor[G] {
  const d = setupDefaults(game, mode);
  if (!raw) return d;
  let stored: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return d;
    stored = parsed as Record<string, unknown>;
  } catch {
    return d;
  }

  switch (game) {
    case 'chess':
      return parseChess(stored, d as ChessSetup) as SetupFor[G];
    case 'checkers':
    case 'reversi': {
      const base = d as BotGameSetup;
      return {
        elo: tierElo(game, stored.elo, base.elo),
        color: color(stored.color, base.color),
        rated: bool(stored.rated, base.rated),
      } as SetupFor[G];
    }
    case 'go':
      return parseGo(stored, d as GoSetup) as SetupFor[G];
    case 'liquidate':
      return parseLiquidate(stored, d as LiquidateSetup) as SetupFor[G];
    default: {
      const unreachable: never = game;
      return unreachable;
    }
  }
}

export function serializeSetup(setup: SetupFor[SetupGame]): string {
  return JSON.stringify(setup);
}

/**
 * One line naming a remembered setup, for a launcher's "Play again":
 * "vs Bot 1200 · White · Rated". The same order as a Continue card's line, so
 * the two read as the same kind of thing.
 */
export function setupSummary<G extends SetupGame>(game: G, mode: SetupMode, setup: SetupFor[G]): string {
  if (game === 'liquidate') {
    const s = setup as LiquidateSetup;
    return [
      mode === 'pass-and-play' ? MODE_COPY.local.label : `vs ${s.players - 1} ${s.players === 2 ? 'bot' : 'bots'}`,
      `${s.players} players`,
      s.board === 'quick' ? 'Quick board' : 'Full board',
    ].join(' · ');
  }
  const s = setup as BotGameSetup;
  const parts: string[] = [];
  if (mode === 'pass-and-play') parts.push(MODE_COPY.local.label);
  else if (mode === 'training') parts.push(MODE_COPY.training.label);
  else parts.push(`vs Bot ${s.elo}`);
  if (game === 'go') {
    const size = (setup as GoSetup).size;
    if (size !== 9) parts.push(`${size}×${size}`);
  }
  if (mode !== 'pass-and-play') {
    parts.push(s.color === 'white' ? 'White' : 'Black');
    // Training is always rated, so saying so there adds nothing.
    if (mode === 'bot' && s.rated) parts.push('Rated');
  }
  return parts.join(' · ');
}

export function parseLastMode(raw: string | null | undefined): LastSetupMode | null {
  return raw === 'bot' || raw === 'training' || raw === 'pass-and-play' || raw === 'online'
    ? raw
    : null;
}
