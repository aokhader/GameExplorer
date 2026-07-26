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

/**
 * What happens when a player is charged more than they can pay — a **player-selectable
 * house rule**, not a fixed behaviour.
 *
 * - `allow-negative` — the full charge goes through and the balance may drop below
 *   zero. The debtor then *must* raise funds (mortgage or sell buildings) to climb
 *   back to zero, or declare bankruptcy. More forgiving: a player with assets can
 *   always trade their way out.
 * - `never-negative` — a balance never displays below zero. The creditor takes
 *   whatever cash the debtor has and the debtor is bankrupted on the spot. Harsher
 *   and faster, which suits quick sessions.
 */
export type DebtRule = 'allow-negative' | 'never-negative';

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

/** Draws from one of the two event decks. */
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
// Event cards
// ---------------------------------------------------------------------------

export type CardDeck = 'anomaly' | 'federation';

/**
 * Card effects are deliberately **layout-agnostic** (relative moves and tile-kind
 * searches, never absolute indices) so the same decks work on the 44-tile and
 * 28-tile boards.
 */
export type CardEffect =
  | { kind: 'collect'; amount: number }
  | { kind: 'pay'; amount: number }
  | { kind: 'move-by'; steps: number }
  | { kind: 'advance-to-home' }
  | { kind: 'advance-to-nearest'; tileKind: 'warp-gate' | 'utility' }
  | { kind: 'go-to-impound' }
  | { kind: 'clearance-pass' }
  | { kind: 'collect-from-each'; amount: number }
  | { kind: 'pay-each'; amount: number };

export interface LiquidateCard {
  id: string;
  deck: CardDeck;
  /** Original flavour text shown to the player. */
  text: string;
  effect: CardEffect;
}

/** Draw and discard piles hold card ids; definitions live in `cards.ts`. */
export interface DeckState {
  draw: string[];
  discard: string[];
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
  /** Under `allow-negative` this may be below zero while a debt is outstanding. */
  credits: number;
  /** Current tile index around the loop. */
  tile: number;
  bankrupt: boolean;
  /** Held in impound — must pay, roll doubles, or spend a Clearance Pass to leave. */
  inImpound: boolean;
  /** Turns spent in impound; the third forces payment. */
  impoundTurns: number;
  /** "Clearance Pass" cards held. */
  clearancePasses: number;
}

/**
 * What the game is waiting for.
 * - `awaiting-roll` — current player must roll (or manage holdings / trade first).
 * - `buy-decision` — current player landed on an unowned tile.
 * - `auction` — a declined tile is up for bid.
 * - `settling-debt` — the debtor must raise funds or go bankrupt.
 * - `trade-review` — the trade recipient must accept or decline.
 * - `turn-end` — landing resolved; current player must end the turn.
 * - `game-over` — terminal.
 */
export type LiquidatePhase =
  | 'awaiting-roll'
  | 'buy-decision'
  | 'auction'
  | 'settling-debt'
  | 'trade-review'
  | 'turn-end'
  | 'game-over';

/** Which board to play and the economic dials. */
export interface LiquidateConfig {
  mode: 'full' | 'quick';
  startingCredits: number;
  /** Paid on passing (or landing on) Home Station. */
  stipend: number;
  /** Quick mode: game ends after this many completed rounds. `null` = play to last solvent. */
  maxRounds: number | null;
  /** Player-selectable: whether a balance may drop below zero. */
  debtRule: DebtRule;
}

/** A live auction for a declined tile. */
export interface AuctionState {
  tileId: number;
  highestBid: number;
  highestBidderId: string | null;
  /** Player ids still bidding, in bid order. */
  bidders: string[];
  /** Index into `bidders` for whoever must act. */
  turnIndex: number;
}

/** A trade offer awaiting a response. Credits/tiles move only on accept. */
export interface TradeOffer {
  toId: string;
  offerTiles: number[];
  requestTiles: number[];
  offerCredits: number;
  requestCredits: number;
}

export interface TradeState extends TradeOffer {
  fromId: string;
}

/** An unpaid charge. `creditorId: null` means the debt is owed to the bank. */
export interface DebtState {
  debtorId: string;
  creditorId: string | null;
  /** How far below zero the debtor is — what they must raise to survive. */
  amount: number;
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
  decks: Record<CardDeck, DeckState>;
  pendingAuction: AuctionState | null;
  pendingTrade: TradeState | null;
  pendingDebt: DebtState | null;
  /** Completed rounds. Increments when turn order wraps to the first active player. */
  round: number;
  log: LiquidateLogEntry[];
  isGameOver: boolean;
  winnerId: string | null;
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export type LiquidateAction =
  | { type: 'roll' }
  | { type: 'buy' }
  | { type: 'decline' }
  | { type: 'end-turn' }
  | { type: 'build'; tile: number }
  | { type: 'sell-building'; tile: number }
  | { type: 'mortgage'; tile: number }
  | { type: 'unmortgage'; tile: number }
  | { type: 'bid'; amount: number }
  | { type: 'pass-bid' }
  | { type: 'propose-trade'; trade: TradeOffer }
  | { type: 'respond-trade'; accept: boolean }
  | { type: 'pay-fine' }
  | { type: 'use-clearance-pass' }
  | { type: 'declare-bankruptcy' };

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
