/**
 * "Liquidate" — a cosmic property-trading game (2–6 players).
 *
 * All types are plain JSON-serializable data so a whole game snapshots to
 * `localStorage` (games are long) and could later be validated server-side.
 *
 * Original IP: the mechanics here are the uncopyrightable roll/buy/rent/build
 * system, but every name, price, rent value, and board layout is authored for
 * this project. See `project-docs/liquidate-plan.md`.
 */

import type { RngState } from '../../utils/rng';

/** The eight star systems — the "sets" a player completes to raise rent. */
export type StarSystem =
  | 'ember'
  | 'rust'
  | 'amber'
  | 'verdant'
  | 'azure'
  | 'violet'
  | 'crimson'
  | 'aurum';

/** Development level of a claimed planet: 0 = bare, 1–4 = colonies, 5 = megastructure. */
export type ColonyLevel = 0 | 1 | 2 | 3 | 4 | 5;

/** The highest `ColonyLevel` — a megastructure. */
export const MAX_COLONY_LEVEL = 5;

// ---------------------------------------------------------------------------
// Board tiles (static definitions — never mutated during play)
// ---------------------------------------------------------------------------

/** A claimable planet belonging to a star system. */
export interface PlanetTile {
  kind: 'planet';
  /** Index around the loop. */
  id: number;
  name: string;
  system: StarSystem;
  price: number;
  /** Cost to add one colony level (flat per system). */
  colonyCost: number;
  /** Rent by level: `[bare, colony1, colony2, colony3, colony4, megastructure]`. */
  rents: readonly [number, number, number, number, number, number];
}

/** A warp gate — rent scales with how many gates the owner holds. */
export interface WarpGateTile {
  kind: 'warp-gate';
  id: number;
  name: string;
  price: number;
}

/** A utility — rent is a multiple of the dice roll that landed on it. */
export interface UtilityTile {
  kind: 'utility';
  id: number;
  name: string;
  price: number;
}

/** A fixed fee paid to the bank. */
export interface TariffTile {
  kind: 'tariff';
  id: number;
  name: string;
  amount: number;
}

/** Draws from one of the two event decks (deck effects land in M2). */
export interface EventTile {
  kind: 'anomaly' | 'federation';
  id: number;
  name: string;
}

/**
 * The four corners.
 * - `home-station` — start; passing it pays the stipend.
 * - `impound` — holding tile; also "passing through" when merely landed on.
 * - `drift` — inert rest tile.
 * - `contraband-scan` — sends the player to `impound`.
 */
export interface CornerTile {
  kind: 'home-station' | 'impound' | 'drift' | 'contraband-scan';
  id: number;
  name: string;
}

export type LiquidateTile =
  | PlanetTile
  | WarpGateTile
  | UtilityTile
  | TariffTile
  | EventTile
  | CornerTile;

/** Tiles a player can own. */
export type OwnableTile = PlanetTile | WarpGateTile | UtilityTile;

/** Narrowing helper — true for tiles that can be bought. */
export function isOwnable(tile: LiquidateTile): tile is OwnableTile {
  return tile.kind === 'planet' || tile.kind === 'warp-gate' || tile.kind === 'utility';
}

// ---------------------------------------------------------------------------
// Mutable game state
// ---------------------------------------------------------------------------

/** Per-tile ownership. Indexed in parallel with the board layout. */
export interface TileOwnership {
  ownerId: string | null;
  level: ColonyLevel;
  mortgaged: boolean;
}

export interface LiquidatePlayer {
  id: string;
  name: string;
  isBot: boolean;
  /** May go negative while a debt is outstanding; M2 resolves via liquidation. */
  credits: number;
  /** Current tile index around the loop. */
  tile: number;
  bankrupt: boolean;
  /** Held in impound (escape mechanics land in M2). */
  inImpound: boolean;
  /** Turns spent in impound. */
  impoundTurns: number;
  /** "Clearance Pass" cards held — spend to leave impound (M2). */
  clearancePasses: number;
}

/**
 * What the game is waiting for.
 * - `awaiting-roll` — current player must roll.
 * - `buy-decision` — current player landed on an unowned tile.
 * - `turn-end` — landing resolved; current player must end the turn.
 * - `game-over` — terminal.
 *
 * M2 adds `auction`, `resolving-card`, and `settling-debt`.
 */
export type LiquidatePhase = 'awaiting-roll' | 'buy-decision' | 'turn-end' | 'game-over';

/** Which board to play and the economic dials. */
export interface LiquidateConfig {
  mode: 'full' | 'quick';
  startingCredits: number;
  /** Paid on passing (or landing on) Home Station. */
  stipend: number;
  /** Quick mode: game ends after this many completed rounds. `null` = play to last solvent. */
  maxRounds: number | null;
}

export interface LiquidateLogEntry {
  round: number;
  playerId: string | null;
  message: string;
}

export interface LiquidateGameState {
  config: LiquidateConfig;
  players: LiquidatePlayer[];
  currentPlayerIndex: number;
  /** Parallel to the board layout for this config's mode. */
  tiles: TileOwnership[];
  rng: RngState;
  /** The roll that produced the current position; `null` before the first roll. */
  dice: [number, number] | null;
  /** Consecutive doubles this turn — 3 sends the player to impound. */
  doublesCount: number;
  phase: LiquidatePhase;
  /** Tile awaiting a buy/decline decision. */
  pendingPurchase: number | null;
  /** Completed rounds. Increments when turn order wraps to the first active player. */
  round: number;
  log: LiquidateLogEntry[];
  isGameOver: boolean;
  winnerId: string | null;
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

/** M1 action set. M2 adds build/mortgage/bid/trade/bankruptcy actions. */
export type LiquidateAction =
  | { type: 'roll' }
  | { type: 'buy' }
  | { type: 'decline' }
  | { type: 'end-turn' };

/**
 * Result of applying an action. Mirrors the `validateMove` contract used by the
 * chess/checkers/reversi engines: never throws, never mutates the input.
 */
export interface LiquidateActionResult {
  valid: boolean;
  reason?: string;
  resultingState?: LiquidateGameState;
}

/** Seat description passed to `newGame`. */
export interface LiquidateSeat {
  name: string;
  isBot?: boolean;
}
