/**
 * Liquidate bot opponents — a heuristic policy, not a search.
 *
 * A property game's branching factor (auctions, trades, build orders) makes
 * minimax a poor fit, and the dice make deep lookahead nearly worthless. So the
 * bot scores each decision against an *assessed tile value* plus a cash reserve,
 * and difficulty is expressed as personality (patience, aggression, mistake
 * rate) rather than search depth. This matches how the checkers/reversi weak
 * engines express skill through blunder rates — see `weakEngine.ts` there.
 *
 * **Purity contract.** `getBotAction` is a query: it never mutates state and
 * never advances the game's RNG cursor (which belongs to the dice). Its
 * "randomness" is derived deterministically from the current state, so the same
 * position and level always produce the same action, and a whole bot game
 * replays exactly from its seed.
 *
 * **Progress contract.** Every returned action is drawn from — or validated
 * against — `getLegalActions`, and the bot only ever spends cash in a management
 * window (it mortgages solely to clear a debt). That rules out the
 * mortgage/unmortgage and build/sell oscillations that would otherwise let a
 * caller's bot loop spin forever.
 */

import { next as rngNext } from '../../utils/rng';
import { LiquidateEngine } from './engine';
import { getBoard, systemMembers } from './board';
import { unmortgageCostFor } from './economy';
import {
  MAX_COLONY_LEVEL,
  isOwnable,
  type LiquidateAction,
  type LiquidateGameState,
  type PlanetTile,
} from './types';

/** Difficulty bands, weakest first — categorical, like the other games' bot cards. */
export type LiquidateBotLevel = 'cautious' | 'steady' | 'shrewd' | 'ruthless';

export const LIQUIDATE_BOT_LEVELS: readonly LiquidateBotLevel[] = [
  'cautious',
  'steady',
  'shrewd',
  'ruthless',
];

/** Display labels for setup screens. */
export const LIQUIDATE_BOT_LABELS: Record<LiquidateBotLevel, string> = {
  cautious: 'Cautious',
  steady: 'Steady',
  shrewd: 'Shrewd',
  ruthless: 'Ruthless',
};

interface BotProfile {
  /** Cash kept in reserve, as a multiple of the board's stipend. */
  reserveStipends: number;
  /** Ceiling on an auction bid as a fraction of the tile's assessed value. */
  bidCeiling: number;
  /** Buy when assessed value ≥ price × this. Below 1 means "pay over the odds". */
  buyRatio: number;
  /** Chance of substituting a random legal action for the considered one. */
  mistakeChance: number;
  /** Credits of edge required before accepting a trade. */
  tradeMargin: number;
  /** Whether it understands that sitting in impound is safe once rents are high. */
  stallsInImpound: boolean;
}

const PROFILES: Record<LiquidateBotLevel, BotProfile> = {
  cautious: {
    reserveStipends: 3,
    bidCeiling: 0.8,
    buyRatio: 1.15,
    mistakeChance: 0.3,
    tradeMargin: 150,
    stallsInImpound: false,
  },
  steady: {
    reserveStipends: 2,
    bidCeiling: 1.0,
    buyRatio: 1.0,
    mistakeChance: 0.15,
    tradeMargin: 80,
    stallsInImpound: false,
  },
  shrewd: {
    reserveStipends: 1,
    bidCeiling: 1.2,
    buyRatio: 0.9,
    mistakeChance: 0.05,
    tradeMargin: 30,
    stallsInImpound: true,
  },
  ruthless: {
    reserveStipends: 0.5,
    bidCeiling: 1.45,
    buyRatio: 0.8,
    mistakeChance: 0,
    tradeMargin: 0,
    stallsInImpound: true,
  },
};

/** Salts keep the derived values for different decisions independent. */
const SALT = { mistake: 0x9e37, choice: 0x85eb, bid: 0xc2b2 } as const;

/**
 * A deterministic value in [0, 1) derived from the position — *not* drawn from
 * the game's RNG, so calling this never disturbs the dice sequence.
 *
 * `log.length` is part of the mix on purpose. The dice cursor, round, and seat
 * all stay fixed while a player takes several management actions in a row, so
 * without a per-action counter this value would be constant across them — which
 * made the mistake branch "sticky" and let the bot lock into a two-action cycle.
 */
function derived(state: LiquidateGameState, salt: number): number {
  const seed = (state.rng.seed ^ salt) >>> 0;
  const cursor =
    state.rng.cursor + state.round + state.currentPlayerIndex + state.log.length;
  return rngNext({ seed, cursor }).value;
}

/** Cash this profile wants to keep on hand. */
function reserveFor(state: LiquidateGameState, profile: BotProfile): number {
  return Math.round(state.config.stipend * profile.reserveStipends);
}

/**
 * Credits-denominated estimate of what a tile is worth to `playerId`, blending
 * list price with set progress and the value of denying a rival their set.
 * `pretendOwned` treats the tile as already acquired, which is how a buy or bid
 * is evaluated.
 */
export function assessTile(
  state: LiquidateGameState,
  tileId: number,
  playerId: string,
): number {
  const tile = getBoard(state.config.mode)[tileId];
  if (!isOwnable(tile)) return 0;

  let value = tile.price;

  if (tile.kind === 'planet') {
    const members = systemMembers(state.config.mode, tile.system);
    const mine = members.filter((id) => state.tiles[id].ownerId === playerId).length;
    const rivals = members.filter(
      (id) => state.tiles[id].ownerId !== null && state.tiles[id].ownerId !== playerId,
    ).length;

    // Acquiring this one would complete the system: the big prize, since it
    // unlocks building and doubles bare rent.
    if (mine + 1 === members.length) value += tile.price * 0.9;
    else value += tile.price * 0.35 * mine;

    // Denying a rival their set is worth real money even if we never build.
    value += tile.price * 0.25 * rivals;
    // A rival already holding the rest makes it nearly worthless to us.
    if (rivals === members.length - 1) value -= tile.price * 0.15;
  }

  if (tile.kind === 'warp-gate') {
    const owned = getBoard(state.config.mode).filter(
      (t) => t.kind === 'warp-gate' && state.tiles[t.id].ownerId === playerId,
    ).length;
    // Gate rent quadruples across the set, so each extra gate compounds.
    value += tile.price * 0.35 * owned;
  }

  if (tile.kind === 'utility') {
    const owned = getBoard(state.config.mode).filter(
      (t) => t.kind === 'utility' && state.tiles[t.id].ownerId === playerId,
    ).length;
    value += tile.price * 0.4 * owned;
  }

  return Math.round(value);
}

/**
 * Action types a random "mistake" may choose from.
 *
 * Excluded deliberately:
 * - `declare-bankruptcy` — self-destruction is never a plausible slip.
 * - `mortgage` / `unmortgage` / `sell-building` — these are *reversible*. Picking
 *   one at random lets the bot undo its own previous action forever (mortgage →
 *   unmortgage → mortgage …), which is an infinite loop rather than a mistake.
 *   The smart path handles these under strict one-way conditions instead.
 *
 * Everything left either advances the turn or is one-way (`build` is capped and
 * costs cash), so a mistake always makes progress.
 */
const MISTAKE_SAFE_TYPES: ReadonlySet<LiquidateAction['type']> = new Set([
  'roll',
  'buy',
  'decline',
  'end-turn',
  'build',
  'bid',
  'pass-bid',
  'pay-fine',
  'use-clearance-pass',
  'respond-trade',
]);

/**
 * Pick a legal action pseudo-randomly from the progress-making pool, or `null`
 * when this position offers none (then the caller falls back to playing well).
 */
function randomLegal(actions: LiquidateAction[], roll: number): LiquidateAction | null {
  const pool = actions.filter((a) => MISTAKE_SAFE_TYPES.has(a.type));
  if (pool.length === 0) return null;
  return pool[Math.min(pool.length - 1, Math.floor(roll * pool.length))];
}

/**
 * Choose this bot's next action for whoever must act, or `null` when there is
 * nothing to do (game over). The result is always legal for `state`.
 */
export function getBotAction(
  state: LiquidateGameState,
  level: LiquidateBotLevel = 'steady',
): LiquidateAction | null {
  const actions = LiquidateEngine.getLegalActions(state);
  if (actions.length === 0) return null;

  const profile = PROFILES[level];
  const actorId = LiquidateEngine.actingPlayerId(state);
  if (actorId === null) return null;
  const actor = state.players.find((p) => p.id === actorId);
  if (!actor) return null;

  // Deliberate imperfection, which is what makes the lower bands beatable.
  if (profile.mistakeChance > 0 && derived(state, SALT.mistake) < profile.mistakeChance) {
    const slip = randomLegal(actions, derived(state, SALT.choice));
    if (slip !== null) return slip;
  }

  const considered = decide(state, actions, actor.id, profile);
  // Belt and braces: never hand the caller something illegal.
  if (considered && isAvailable(state, considered, actions)) return considered;
  return actions[0];
}

/**
 * Bids and trade offers carry computed payloads and are not enumerable in
 * `getLegalActions`, so they are validated by asking the engine directly rather
 * than matched against the legal list.
 */
function isAvailable(
  state: LiquidateGameState,
  action: LiquidateAction,
  actions: LiquidateAction[],
): boolean {
  if (action.type === 'bid' || action.type === 'propose-trade') {
    return LiquidateEngine.applyAction(state, action).valid;
  }
  return actions.some((a) => {
    if (a.type !== action.type) return false;
    if ('tile' in a && 'tile' in action) return a.tile === action.tile;
    if (a.type === 'respond-trade' && action.type === 'respond-trade') {
      return a.accept === action.accept;
    }
    return true;
  });
}

function decide(
  state: LiquidateGameState,
  actions: LiquidateAction[],
  actorId: string,
  profile: BotProfile,
): LiquidateAction | null {
  switch (state.phase) {
    case 'buy-decision':
      return decideBuy(state, actions, actorId, profile);
    case 'auction':
      return decideBid(state, actorId, profile);
    case 'settling-debt':
      return decideDebt(state, actions, actorId);
    case 'trade-review':
      return decideTrade(state, actorId, profile);
    case 'awaiting-roll':
      return decideTurnStart(state, actions, actorId, profile);
    case 'turn-end':
      return (
        decideManagement(state, actions, actorId, profile) ??
        decideTradeProposal(state, actorId, profile) ??
        { type: 'end-turn' }
      );
    default:
      return null;
  }
}

function decideBuy(
  state: LiquidateGameState,
  actions: LiquidateAction[],
  actorId: string,
  profile: BotProfile,
): LiquidateAction {
  const canBuy = actions.some((a) => a.type === 'buy');
  if (!canBuy || state.pendingPurchase === null) return { type: 'decline' };

  const tile = getBoard(state.config.mode)[state.pendingPurchase];
  if (!isOwnable(tile)) return { type: 'decline' };

  const actor = state.players.find((p) => p.id === actorId)!;
  const value = assessTile(state, tile.id, actorId);
  const reserve = reserveFor(state, profile);

  // The opening land-grab is worth dipping into reserves for: unowned tiles are
  // the only cheap ones, and an empty board earns nothing.
  const board = getBoard(state.config.mode);
  const ownables = board.filter(isOwnable);
  const unclaimed = ownables.filter((t) => state.tiles[t.id].ownerId === null).length;
  const landGrab = unclaimed > ownables.length * 0.6;

  const affordable = landGrab
    ? actor.credits >= tile.price
    : actor.credits - tile.price >= reserve;

  if (affordable && value >= tile.price * profile.buyRatio) return { type: 'buy' };
  return { type: 'decline' };
}

function decideBid(
  state: LiquidateGameState,
  actorId: string,
  profile: BotProfile,
): LiquidateAction {
  const auction = state.pendingAuction;
  if (!auction) return { type: 'pass-bid' };

  const actor = state.players.find((p) => p.id === actorId)!;
  const value = assessTile(state, auction.tileId, actorId);
  const reserve = reserveFor(state, profile);

  const ceiling = Math.min(
    Math.floor(value * profile.bidCeiling),
    Math.max(0, actor.credits - Math.floor(reserve / 2)),
  );

  // Step up by a chunk of the tile's worth rather than a single credit, so
  // auctions between bots converge instead of grinding.
  const tile = getBoard(state.config.mode)[auction.tileId];
  const step = Math.max(5, Math.round((isOwnable(tile) ? tile.price : 50) * 0.08));
  const jittered = 1 + Math.floor(derived(state, SALT.bid) * 2); // 1–2 steps
  const target = auction.highestBid + step * jittered;

  const amount = Math.min(target, ceiling);
  if (amount <= auction.highestBid || amount > actor.credits) return { type: 'pass-bid' };
  return { type: 'bid', amount };
}

function decideDebt(
  state: LiquidateGameState,
  actions: LiquidateAction[],
  actorId: string,
): LiquidateAction {
  const owed = state.pendingDebt?.amount ?? 0;
  // Nothing can save us — fold rather than stripping the estate for nothing.
  if (LiquidateEngine.liquidatableValue(state, actorId) < owed) {
    return { type: 'declare-bankruptcy' };
  }

  // Pledge the least valuable land first; keep the set-completing tiles.
  const mortgages = actions.filter(
    (a): a is Extract<LiquidateAction, { type: 'mortgage' }> => a.type === 'mortgage',
  );
  if (mortgages.length > 0) {
    return mortgages
      .slice()
      .sort(
        (a, b) =>
          assessTile(state, a.tile, actorId) - assessTile(state, b.tile, actorId) ||
          a.tile - b.tile, // stable tie-break keeps the choice deterministic
      )[0];
  }

  // Only then start dismantling colonies (they resell at half cost).
  const sales = actions.filter(
    (a): a is Extract<LiquidateAction, { type: 'sell-building' }> => a.type === 'sell-building',
  );
  if (sales.length > 0) return sales[0];

  return { type: 'declare-bankruptcy' };
}

function decideTrade(
  state: LiquidateGameState,
  actorId: string,
  profile: BotProfile,
): LiquidateAction {
  const trade = state.pendingTrade;
  if (!trade || trade.toId !== actorId) return { type: 'respond-trade', accept: false };

  const actor = state.players.find((p) => p.id === actorId)!;
  // The proposer's "offer" comes to us; their "request" leaves us.
  const gaining = trade.offerTiles.reduce((sum, id) => sum + assessTile(state, id, actorId), 0);
  const losing = trade.requestTiles.reduce((sum, id) => sum + assessTile(state, id, actorId), 0);

  const edge = gaining + trade.offerCredits - losing - trade.requestCredits;
  const cashAfter = actor.credits + trade.offerCredits - trade.requestCredits;

  const accept = edge >= profile.tradeMargin && cashAfter >= 0;
  return { type: 'respond-trade', accept };
}

function decideTurnStart(
  state: LiquidateGameState,
  actions: LiquidateAction[],
  actorId: string,
  profile: BotProfile,
): LiquidateAction {
  const actor = state.players.find((p) => p.id === actorId)!;

  if (actor.inImpound) {
    // A pass is free, so it is always the best exit.
    if (actions.some((a) => a.type === 'use-clearance-pass')) {
      return { type: 'use-clearance-pass' };
    }
    const canPay = actions.some((a) => a.type === 'pay-fine');
    if (canPay && !shouldStallInImpound(state, profile)) return { type: 'pay-fine' };
    return { type: 'roll' };
  }

  // Develop before rolling: rent collected this lap needs the colony standing.
  return (
    decideManagement(state, actions, actorId, profile) ??
    decideTradeProposal(state, actorId, profile) ??
    { type: 'roll' }
  );
}

/**
 * Offer cash for the one tile that would complete a star system.
 *
 * Without this the bots cannot consolidate, and the M6 simulation showed why it
 * matters: at 4–6 players the board fragments so completely that *no* system was
 * ever cornered, nothing was ever built, rents stayed at bare rates, and games
 * ran to the round cap instead of ending in bankruptcy. Buying the last tile of
 * a set is the one trade that reliably breaks that deadlock.
 *
 * Deliberately narrow — cash for a single tile, at most once per turn, only when
 * it completes a set. The engine also caps proposals per turn, so a
 * propose → decline → propose cycle is impossible either way.
 */
function decideTradeProposal(
  state: LiquidateGameState,
  actorId: string,
  profile: BotProfile,
): LiquidateAction | null {
  if (state.tradesProposedThisTurn > 0) return null;

  const actor = state.players.find((p) => p.id === actorId)!;
  const board = getBoard(state.config.mode);
  const reserve = reserveFor(state, profile);

  for (const tile of board) {
    if (tile.kind !== 'planet') continue;
    const owned = state.tiles[tile.id];
    const holder = owned.ownerId;
    if (!holder || holder === actorId) continue;
    // The engine refuses to trade a developed planet, and a mortgaged one is a
    // poor buy at full price.
    if (owned.level > 0 || owned.mortgaged) continue;

    const members = systemMembers(state.config.mode, tile.system);
    const mine = members.filter((id) => state.tiles[id].ownerId === actorId).length;
    if (mine !== members.length - 1) continue; // not one away from the set

    // Pay over the odds: the seller values it at their own assessment, and the
    // set it unlocks is worth far more to us than the premium.
    const theirValue = assessTile(state, tile.id, holder);
    const budget = Math.floor(actor.credits - reserve);
    const price = Math.min(Math.round(theirValue * 1.7) + 60, budget);
    if (price <= 0) continue;

    return {
      type: 'propose-trade',
      trade: {
        toId: holder,
        offerTiles: [],
        requestTiles: [tile.id],
        offerCredits: price,
        requestCredits: 0,
      },
    };
  }
  return null;
}

/**
 * Late in the game, with most tiles owned and developed, sitting in impound
 * avoids rent — only the stronger profiles understand this.
 */
function shouldStallInImpound(state: LiquidateGameState, profile: BotProfile): boolean {
  if (!profile.stallsInImpound) return false;
  const board = getBoard(state.config.mode);
  const ownables = board.filter(isOwnable);
  const claimed = ownables.filter((t) => state.tiles[t.id].ownerId !== null).length;
  const developed = board.filter(
    (t) => t.kind === 'planet' && state.tiles[t.id].level > 0,
  ).length;
  return claimed > ownables.length * 0.75 && developed > 0;
}

/**
 * Spend surplus cash: build where the next colony buys the most rent, and clear
 * mortgages only when comfortably flush. Returns `null` when nothing is worth
 * doing, which is what lets the caller move on to rolling or ending the turn.
 *
 * Deliberately never mortgages or sells — those belong to debt settlement — so a
 * bot cannot oscillate between opposite actions.
 */
function decideManagement(
  state: LiquidateGameState,
  actions: LiquidateAction[],
  actorId: string,
  profile: BotProfile,
): LiquidateAction | null {
  const actor = state.players.find((p) => p.id === actorId)!;
  const reserve = reserveFor(state, profile);
  const board = getBoard(state.config.mode);

  const builds = actions.filter(
    (a): a is Extract<LiquidateAction, { type: 'build' }> => a.type === 'build',
  );
  if (builds.length > 0) {
    const ranked = builds
      .map((action) => {
        const tile = board[action.tile] as PlanetTile;
        const level = state.tiles[action.tile].level;
        const gain = tile.rents[Math.min(level + 1, MAX_COLONY_LEVEL)] - tile.rents[level];
        return { action, cost: tile.colonyCost, ratio: gain / Math.max(1, tile.colonyCost) };
      })
      .filter((entry) => actor.credits - entry.cost >= reserve)
      .sort((a, b) => b.ratio - a.ratio);
    if (ranked.length > 0) return ranked[0].action;
  }

  const unmortgages = actions.filter(
    (a): a is Extract<LiquidateAction, { type: 'unmortgage' }> => a.type === 'unmortgage',
  );
  for (const action of unmortgages) {
    const tile = board[action.tile];
    if (!isOwnable(tile)) continue;
    // Only when clearing it still leaves a healthy buffer.
    if (actor.credits - unmortgageCostFor(tile.price) >= reserve * 2) return action;
  }

  return null;
}
