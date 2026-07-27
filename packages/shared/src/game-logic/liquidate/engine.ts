/**
 * The Liquidate engine — pure, static, immutable, N-player.
 *
 * Follows the same contract as the chess/checkers/reversi engines: static
 * methods only, no I/O, never mutates its input, and returns a
 * `{ valid, reason?, resultingState? }` result. Unlike those games a turn is a
 * *sequence of actions* rather than one move, so state carries a `phase` and
 * callers drive it with `applyAction`.
 *
 * Randomness always flows through the seeded RNG stored in state, so a game is
 * fully reproducible from `{ seed, cursor }` — see `utils/rng.ts`.
 *
 * Whoever must act is **not always the current player** (an auction rotates
 * bidders; a trade waits on its recipient), so callers should read
 * `actingPlayerId(state)` rather than assuming `currentPlayer`.
 */

import { createRng, randomSeed, rollDice, shuffle } from '../../utils/rng';
import {
  DOUBLES_LIMIT,
  FULL_SYSTEM_RENT_MULTIPLIER,
  LIQUIDATE_CONFIGS,
  LIQUIDATE_IMPOUND_FINE,
  LIQUIDATE_MAX_PLAYERS,
  LIQUIDATE_MIN_PLAYERS,
  LIQUIDATE_UTILITY_MULTIPLIER_BOTH,
  LIQUIDATE_UTILITY_MULTIPLIER_ONE,
  LIQUIDATE_WARP_GATE_RENTS,
  MAX_IMPOUND_TURNS,
  mortgageValueFor,
  planetRent,
  unmortgageCostFor,
} from './economy';
import { getBoard, impoundTileIndex, systemMembers } from './board';
import { cardById, deckCardIds } from './cards';
import {
  MAX_COLONY_LEVEL,
  isOwnable,
  type CardDeck,
  type CardEffect,
  type ColonyLevel,
  type DebtRule,
  type LiquidateAction,
  type LiquidateActionResult,
  type LiquidateGameState,
  type LiquidateLogEntry,
  type LiquidatePlayer,
  type LiquidateSeat,
  type LiquidateTile,
  type PlanetTile,
  type StarSystem,
  type TileOwnership,
  type TradeOffer,
} from './types';

export interface NewGameOptions {
  players: readonly LiquidateSeat[];
  mode?: 'full' | 'quick';
  /** Player-selectable house rule; falls back to the mode preset's default. */
  debtRule?: DebtRule;
  /** Omit for a random game; pass a seed for a reproducible one (tests, replays). */
  seed?: number;
}

/** Clone state so callers can mutate the copy freely before returning it. */
function cloneState(state: LiquidateGameState): LiquidateGameState {
  return {
    ...state,
    config: { ...state.config },
    players: state.players.map((p) => ({ ...p })),
    tiles: state.tiles.map((t) => ({ ...t })),
    decks: {
      anomaly: { draw: state.decks.anomaly.draw.slice(), discard: state.decks.anomaly.discard.slice() },
      federation: {
        draw: state.decks.federation.draw.slice(),
        discard: state.decks.federation.discard.slice(),
      },
    },
    pendingAuction: state.pendingAuction ? { ...state.pendingAuction, bidders: state.pendingAuction.bidders.slice() } : null,
    pendingTrade: state.pendingTrade
      ? {
          ...state.pendingTrade,
          offerTiles: state.pendingTrade.offerTiles.slice(),
          requestTiles: state.pendingTrade.requestTiles.slice(),
        }
      : null,
    pendingDebt: state.pendingDebt ? { ...state.pendingDebt } : null,
    log: state.log.slice(),
  };
}

function log(state: LiquidateGameState, playerId: string | null, message: string): void {
  const entry: LiquidateLogEntry = { round: state.round, playerId, message };
  state.log.push(entry);
}

function fail(reason: string): LiquidateActionResult {
  return { valid: false, reason };
}

export class LiquidateEngine {
  // =========================================================================
  // Setup
  // =========================================================================

  static newGame(options: NewGameOptions): LiquidateGameState {
    const { players: seats, mode = 'full', debtRule, seed } = options;
    if (seats.length < LIQUIDATE_MIN_PLAYERS || seats.length > LIQUIDATE_MAX_PLAYERS) {
      throw new Error(
        `Liquidate needs ${LIQUIDATE_MIN_PLAYERS}–${LIQUIDATE_MAX_PLAYERS} players, got ${seats.length}`,
      );
    }

    const config = { ...LIQUIDATE_CONFIGS[mode] };
    if (debtRule) config.debtRule = debtRule;
    const board = getBoard(mode);

    const players: LiquidatePlayer[] = seats.map((seat, i) => ({
      id: `p${i + 1}`,
      name: seat.name,
      isBot: seat.isBot ?? false,
      credits: config.startingCredits,
      tile: 0,
      bankrupt: false,
      inImpound: false,
      impoundTurns: 0,
      clearancePasses: 0,
    }));

    const tiles: TileOwnership[] = board.map(() => ({
      ownerId: null,
      level: 0,
      mortgaged: false,
    }));

    // Shuffle both decks off the same seeded stream so deck order is reproducible.
    let rng = createRng(seed ?? randomSeed());
    const anomaly = shuffle(rng, deckCardIds('anomaly'));
    rng = anomaly.state;
    const federation = shuffle(rng, deckCardIds('federation'));
    rng = federation.state;

    return {
      config,
      players,
      currentPlayerIndex: 0,
      tiles,
      rng,
      dice: null,
      doublesCount: 0,
      phase: 'awaiting-roll',
      pendingPurchase: null,
      decks: {
        anomaly: { draw: anomaly.shuffled, discard: [] },
        federation: { draw: federation.shuffled, discard: [] },
      },
      pendingAuction: null,
      pendingTrade: null,
      pendingDebt: null,
      round: 1,
      log: [],
      isGameOver: false,
      winnerId: null,
    };
  }

  // =========================================================================
  // Queries
  // =========================================================================

  static board(state: LiquidateGameState): readonly LiquidateTile[] {
    return getBoard(state.config.mode);
  }

  static currentPlayer(state: LiquidateGameState): LiquidatePlayer {
    return state.players[state.currentPlayerIndex];
  }

  static activePlayers(state: LiquidateGameState): LiquidatePlayer[] {
    return state.players.filter((p) => !p.bankrupt);
  }

  /**
   * Who must act right now. Usually the current player, but an auction rotates
   * through bidders and a trade waits on its recipient.
   */
  static actingPlayerId(state: LiquidateGameState): string | null {
    if (state.isGameOver) return null;
    if (state.phase === 'auction' && state.pendingAuction) {
      return state.pendingAuction.bidders[state.pendingAuction.turnIndex] ?? null;
    }
    if (state.phase === 'trade-review' && state.pendingTrade) return state.pendingTrade.toId;
    if (state.phase === 'settling-debt' && state.pendingDebt) return state.pendingDebt.debtorId;
    return LiquidateEngine.currentPlayer(state).id;
  }

  static getNetWorth(state: LiquidateGameState, playerId: string): number {
    const board = LiquidateEngine.board(state);
    const player = state.players.find((p) => p.id === playerId);
    if (!player) return 0;

    let worth = player.credits;
    for (const tile of board) {
      const owned = state.tiles[tile.id];
      if (owned.ownerId !== playerId || !isOwnable(tile)) continue;
      worth += owned.mortgaged ? tile.price - mortgageValueFor(tile.price) : tile.price;
      if (tile.kind === 'planet') worth += owned.level * tile.colonyCost;
    }
    return worth;
  }

  /** Cash a player could raise right now by mortgaging and selling buildings. */
  static liquidatableValue(state: LiquidateGameState, playerId: string): number {
    let total = 0;
    for (const tile of LiquidateEngine.board(state)) {
      const owned = state.tiles[tile.id];
      if (owned.ownerId !== playerId || !isOwnable(tile)) continue;
      if (tile.kind === 'planet' && owned.level > 0) {
        total += owned.level * Math.floor(tile.colonyCost / 2);
      }
      if (!owned.mortgaged) total += mortgageValueFor(tile.price);
    }
    return total;
  }

  static ownsFullSystem(
    state: LiquidateGameState,
    playerId: string,
    system: StarSystem,
  ): boolean {
    const members = systemMembers(state.config.mode, system);
    return members.length > 0 && members.every((id) => state.tiles[id].ownerId === playerId);
  }

  static rentFor(state: LiquidateGameState, tileId: number, diceTotal: number): number {
    const tile = LiquidateEngine.board(state)[tileId];
    const owned = state.tiles[tileId];
    if (!isOwnable(tile) || owned.ownerId === null || owned.mortgaged) return 0;

    if (tile.kind === 'planet') {
      const base = planetRent(tile.rents, owned.level);
      const fullSystem = LiquidateEngine.ownsFullSystem(state, owned.ownerId, tile.system);
      return fullSystem && owned.level === 0 ? base * FULL_SYSTEM_RENT_MULTIPLIER : base;
    }

    if (tile.kind === 'warp-gate') {
      const count = LiquidateEngine.board(state).filter(
        (t) => t.kind === 'warp-gate' && state.tiles[t.id].ownerId === owned.ownerId,
      ).length;
      return LIQUIDATE_WARP_GATE_RENTS[Math.max(0, count - 1)] ?? 0;
    }

    const utilities = LiquidateEngine.board(state).filter(
      (t) => t.kind === 'utility' && state.tiles[t.id].ownerId === owned.ownerId,
    ).length;
    const multiplier =
      utilities > 1 ? LIQUIDATE_UTILITY_MULTIPLIER_BOTH : LIQUIDATE_UTILITY_MULTIPLIER_ONE;
    return diceTotal * multiplier;
  }

  /** True when `tile` may take another colony level under the even-build rule. */
  static canBuild(state: LiquidateGameState, tileId: number): boolean {
    const tile = LiquidateEngine.board(state)[tileId];
    if (tile.kind !== 'planet') return false;
    const owned = state.tiles[tileId];
    if (owned.ownerId === null || owned.mortgaged || owned.level >= MAX_COLONY_LEVEL) return false;
    if (!LiquidateEngine.ownsFullSystem(state, owned.ownerId, tile.system)) return false;

    const members = systemMembers(state.config.mode, tile.system);
    // No building while any planet in the system is mortgaged.
    if (members.some((id) => state.tiles[id].mortgaged)) return false;
    // Even build: only the least-developed planet(s) may grow.
    const lowest = Math.min(...members.map((id) => state.tiles[id].level));
    return owned.level === lowest;
  }

  /** True when a colony level may be sold off `tile` (reverse even-build). */
  static canSellBuilding(state: LiquidateGameState, tileId: number): boolean {
    const tile = LiquidateEngine.board(state)[tileId];
    if (tile.kind !== 'planet') return false;
    const owned = state.tiles[tileId];
    if (owned.ownerId === null || owned.level === 0) return false;

    const members = systemMembers(state.config.mode, tile.system);
    const highest = Math.max(...members.map((id) => state.tiles[id].level));
    return owned.level === highest;
  }

  static canMortgage(state: LiquidateGameState, tileId: number): boolean {
    const tile = LiquidateEngine.board(state)[tileId];
    if (!isOwnable(tile)) return false;
    const owned = state.tiles[tileId];
    if (owned.ownerId === null || owned.mortgaged) return false;
    // Buildings must be sold before the land can be pledged.
    if (tile.kind === 'planet' && owned.level > 0) return false;
    return true;
  }

  /** Actions the acting player may legally take right now. */
  static getLegalActions(state: LiquidateGameState): LiquidateAction[] {
    if (state.isGameOver) return [];
    const actorId = LiquidateEngine.actingPlayerId(state);
    if (actorId === null) return [];
    const actor = state.players.find((p) => p.id === actorId);
    if (!actor) return [];

    switch (state.phase) {
      case 'trade-review':
        return [
          { type: 'respond-trade', accept: true },
          { type: 'respond-trade', accept: false },
        ];

      case 'auction': {
        const auction = state.pendingAuction!;
        const actions: LiquidateAction[] = [{ type: 'pass-bid' }];
        if (actor.credits > auction.highestBid) {
          actions.unshift({ type: 'bid', amount: auction.highestBid + 1 });
        }
        return actions;
      }

      case 'settling-debt': {
        const actions: LiquidateAction[] = [{ type: 'declare-bankruptcy' }];
        for (const tile of LiquidateEngine.board(state)) {
          if (state.tiles[tile.id].ownerId !== actorId) continue;
          if (LiquidateEngine.canSellBuilding(state, tile.id)) {
            actions.push({ type: 'sell-building', tile: tile.id });
          }
          if (LiquidateEngine.canMortgage(state, tile.id)) {
            actions.push({ type: 'mortgage', tile: tile.id });
          }
        }
        return actions;
      }

      case 'buy-decision': {
        const tile = LiquidateEngine.board(state)[state.pendingPurchase!];
        const actions: LiquidateAction[] = [{ type: 'decline' }];
        if (isOwnable(tile) && actor.credits >= tile.price) actions.unshift({ type: 'buy' });
        return actions;
      }

      case 'awaiting-roll': {
        const actions: LiquidateAction[] = [];
        if (actor.inImpound) {
          if (actor.clearancePasses > 0) actions.push({ type: 'use-clearance-pass' });
          if (actor.credits >= LIQUIDATE_IMPOUND_FINE) actions.push({ type: 'pay-fine' });
        }
        actions.push({ type: 'roll' });
        return [...actions, ...LiquidateEngine.managementActions(state, actorId)];
      }

      case 'turn-end':
        return [
          { type: 'end-turn' },
          ...LiquidateEngine.managementActions(state, actorId),
        ];

      default:
        return [];
    }
  }

  /** Build/sell/mortgage options available in a normal management window. */
  private static managementActions(
    state: LiquidateGameState,
    playerId: string,
  ): LiquidateAction[] {
    const actions: LiquidateAction[] = [];
    const player = state.players.find((p) => p.id === playerId)!;
    for (const tile of LiquidateEngine.board(state)) {
      const owned = state.tiles[tile.id];
      if (owned.ownerId !== playerId || !isOwnable(tile)) continue;

      if (
        tile.kind === 'planet' &&
        LiquidateEngine.canBuild(state, tile.id) &&
        player.credits >= tile.colonyCost
      ) {
        actions.push({ type: 'build', tile: tile.id });
      }
      if (LiquidateEngine.canSellBuilding(state, tile.id)) {
        actions.push({ type: 'sell-building', tile: tile.id });
      }
      if (LiquidateEngine.canMortgage(state, tile.id)) {
        actions.push({ type: 'mortgage', tile: tile.id });
      }
      if (owned.mortgaged && player.credits >= unmortgageCostFor(tile.price)) {
        actions.push({ type: 'unmortgage', tile: tile.id });
      }
    }
    return actions;
  }

  // =========================================================================
  // Action dispatch
  // =========================================================================

  static applyAction(
    state: LiquidateGameState,
    action: LiquidateAction,
  ): LiquidateActionResult {
    if (state.isGameOver) return fail('Game is over');

    switch (action.type) {
      case 'roll':
        return LiquidateEngine.roll(state);
      case 'buy':
        return LiquidateEngine.buy(state);
      case 'decline':
        return LiquidateEngine.decline(state);
      case 'end-turn':
        return LiquidateEngine.endTurn(state);
      case 'build':
        return LiquidateEngine.build(state, action.tile);
      case 'sell-building':
        return LiquidateEngine.sellBuilding(state, action.tile);
      case 'mortgage':
        return LiquidateEngine.mortgage(state, action.tile);
      case 'unmortgage':
        return LiquidateEngine.unmortgage(state, action.tile);
      case 'bid':
        return LiquidateEngine.bid(state, action.amount);
      case 'pass-bid':
        return LiquidateEngine.passBid(state);
      case 'propose-trade':
        return LiquidateEngine.proposeTrade(state, action.trade);
      case 'respond-trade':
        return LiquidateEngine.respondTrade(state, action.accept);
      case 'pay-fine':
        return LiquidateEngine.payFine(state);
      case 'use-clearance-pass':
        return LiquidateEngine.useClearancePass(state);
      case 'declare-bankruptcy':
        return LiquidateEngine.declareBankruptcy(state);
      default:
        return fail('Unknown action');
    }
  }

  // =========================================================================
  // Rolling, movement, landing
  // =========================================================================

  private static roll(state: LiquidateGameState): LiquidateActionResult {
    if (state.phase !== 'awaiting-roll') return fail('Not waiting for a roll');

    const next = cloneState(state);
    const player = next.players[next.currentPlayerIndex];

    const { dice, state: rng } = rollDice(next.rng);
    next.rng = rng;
    next.dice = dice;
    const isDoubles = dice[0] === dice[1];
    const total = dice[0] + dice[1];
    log(next, player.id, `${player.name} rolls ${dice[0]}+${dice[1]} = ${total}`);

    // Impound: doubles buy freedom, otherwise the stay lengthens.
    if (player.inImpound) {
      if (isDoubles) {
        player.inImpound = false;
        player.impoundTurns = 0;
        log(next, player.id, `${player.name} rolls doubles and leaves impound`);
        LiquidateEngine.advance(next, player, total);
        LiquidateEngine.resolveLanding(next, player, total);
        // Leaving on doubles does not grant another roll.
        if (next.phase === 'awaiting-roll') next.phase = 'turn-end';
        return { valid: true, resultingState: next };
      }
      player.impoundTurns += 1;
      if (player.impoundTurns >= MAX_IMPOUND_TURNS) {
        log(next, player.id, `${player.name} must pay the ${LIQUIDATE_IMPOUND_FINE} release fee`);
        LiquidateEngine.charge(next, player, null, LIQUIDATE_IMPOUND_FINE);
        // A forced fee can bankrupt: only move on if the debt resolved.
        if (next.phase !== 'settling-debt' && !player.bankrupt) {
          player.inImpound = false;
          player.impoundTurns = 0;
          LiquidateEngine.advance(next, player, total);
          LiquidateEngine.resolveLanding(next, player, total);
          if (next.phase === 'awaiting-roll') next.phase = 'turn-end';
        }
        return { valid: true, resultingState: next };
      }
      log(next, player.id, `${player.name} stays in impound`);
      next.phase = 'turn-end';
      return { valid: true, resultingState: next };
    }

    next.doublesCount = isDoubles ? next.doublesCount + 1 : 0;

    // Three doubles running: straight to impound, no landing effect.
    if (isDoubles && next.doublesCount >= DOUBLES_LIMIT) {
      LiquidateEngine.sendToImpound(next, player);
      next.doublesCount = 0;
      next.phase = 'turn-end';
      log(next, player.id, `${player.name} rolled ${DOUBLES_LIMIT} doubles — sent to impound`);
      return { valid: true, resultingState: next };
    }

    LiquidateEngine.advance(next, player, total);
    LiquidateEngine.resolveLanding(next, player, total);
    return { valid: true, resultingState: next };
  }

  /** Move `player` forward `steps`, paying the stipend if Home Station is passed. */
  private static advance(
    state: LiquidateGameState,
    player: LiquidatePlayer,
    steps: number,
  ): void {
    const size = LiquidateEngine.board(state).length;
    const target = player.tile + steps;
    if (target >= size) {
      player.credits += state.config.stipend;
      log(
        state,
        player.id,
        `${player.name} passes Home Station and collects ${state.config.stipend}`,
      );
    }
    // Negative card moves can walk backwards past tile 0 without paying.
    player.tile = ((target % size) + size) % size;
  }

  private static sendToImpound(state: LiquidateGameState, player: LiquidatePlayer): void {
    player.tile = impoundTileIndex(state.config.mode);
    player.inImpound = true;
    player.impoundTurns = 0;
  }

  /** Apply the effect of the tile `player` just landed on and set the next phase. */
  private static resolveLanding(
    state: LiquidateGameState,
    player: LiquidatePlayer,
    diceTotal: number,
  ): void {
    const tile = LiquidateEngine.board(state)[player.tile];
    const owned = state.tiles[player.tile];

    if (isOwnable(tile)) {
      if (owned.ownerId === null) {
        state.pendingPurchase = tile.id;
        state.phase = 'buy-decision';
        return;
      }
      if (owned.ownerId !== player.id) {
        const rent = LiquidateEngine.rentFor(state, tile.id, diceTotal);
        if (rent > 0) {
          const owner = state.players.find((p) => p.id === owned.ownerId)!;
          log(state, player.id, `${player.name} owes ${rent} rent to ${owner.name} for ${tile.name}`);
          LiquidateEngine.charge(state, player, owned.ownerId, rent);
          if (state.phase === 'settling-debt') return;
        }
      }
      LiquidateEngine.finishLanding(state);
      return;
    }

    switch (tile.kind) {
      case 'tariff':
        log(state, player.id, `${player.name} owes ${tile.amount} — ${tile.name}`);
        LiquidateEngine.charge(state, player, null, tile.amount);
        if (state.phase === 'settling-debt') return;
        break;
      case 'contraband-scan':
        LiquidateEngine.sendToImpound(state, player);
        state.doublesCount = 0;
        state.phase = 'turn-end';
        log(state, player.id, `${player.name} is scanned and impounded`);
        return;
      case 'anomaly':
      case 'federation': {
        LiquidateEngine.drawCard(state, player, tile.kind, diceTotal);
        if (state.phase === 'settling-debt' || state.phase === 'buy-decision') return;
        if (state.phase === 'turn-end') return; // card sent the player to impound
        break;
      }
      case 'home-station':
      case 'impound':
      case 'drift':
        break;
    }
    LiquidateEngine.finishLanding(state);
  }

  /** After a landing resolves, either roll again (doubles) or end the turn. */
  private static finishLanding(state: LiquidateGameState): void {
    state.phase = state.doublesCount > 0 ? 'awaiting-roll' : 'turn-end';
  }

  // =========================================================================
  // Event cards
  // =========================================================================

  private static drawCard(
    state: LiquidateGameState,
    player: LiquidatePlayer,
    deck: CardDeck,
    diceTotal: number,
  ): void {
    const pile = state.decks[deck];
    if (pile.draw.length === 0) {
      // Recycle discards, preserving reproducibility via the seeded RNG.
      const reshuffled = shuffle(state.rng, pile.discard);
      state.rng = reshuffled.state;
      pile.draw = reshuffled.shuffled;
      pile.discard = [];
    }
    const cardId = pile.draw.shift();
    if (!cardId) return; // every card of this deck is held as a Clearance Pass

    const card = cardById(cardId);
    log(state, player.id, `${player.name} draws: ${card.text}`);

    // A Clearance Pass leaves circulation until it is spent.
    if (card.effect.kind === 'clearance-pass') {
      player.clearancePasses += 1;
      return;
    }
    pile.discard.push(cardId);
    LiquidateEngine.applyCardEffect(state, player, card.effect, diceTotal);
  }

  private static applyCardEffect(
    state: LiquidateGameState,
    player: LiquidatePlayer,
    effect: CardEffect,
    diceTotal: number,
  ): void {
    switch (effect.kind) {
      case 'collect':
        player.credits += effect.amount;
        return;
      case 'pay':
        LiquidateEngine.charge(state, player, null, effect.amount);
        return;
      case 'collect-from-each': {
        for (const other of state.players) {
          if (other.id === player.id || other.bankrupt) continue;
          LiquidateEngine.charge(state, other, player.id, effect.amount);
          // Only one debt can be settled at a time; stop so the outstanding one
          // is never overwritten by the next rival's.
          if (state.phase === 'settling-debt') return;
        }
        return;
      }
      case 'pay-each': {
        for (const other of state.players) {
          if (other.id === player.id || other.bankrupt) continue;
          LiquidateEngine.charge(state, player, other.id, effect.amount);
          if (state.phase === 'settling-debt') return;
        }
        return;
      }
      case 'go-to-impound':
        LiquidateEngine.sendToImpound(state, player);
        state.doublesCount = 0;
        state.phase = 'turn-end';
        return;
      case 'advance-to-home': {
        const size = LiquidateEngine.board(state).length;
        LiquidateEngine.advance(state, player, size - player.tile);
        LiquidateEngine.resolveLanding(state, player, diceTotal);
        return;
      }
      case 'move-by': {
        LiquidateEngine.advance(state, player, effect.steps);
        LiquidateEngine.resolveLanding(state, player, diceTotal);
        return;
      }
      case 'advance-to-nearest': {
        const board = LiquidateEngine.board(state);
        const size = board.length;
        for (let step = 1; step <= size; step++) {
          const candidate = (player.tile + step) % size;
          if (board[candidate].kind === effect.tileKind) {
            LiquidateEngine.advance(state, player, step);
            LiquidateEngine.resolveLanding(state, player, diceTotal);
            return;
          }
        }
        return;
      }
    }
  }

  // =========================================================================
  // Money
  // =========================================================================

  /**
   * Charge `payer` `amount`, paying `creditorId` (or the bank when `null`).
   *
   * Honours the selected `debtRule`:
   * - `allow-negative` — the full amount transfers, the balance may go below
   *   zero, and the phase becomes `settling-debt` until the debtor recovers.
   * - `never-negative` — the creditor takes only what the payer has and the
   *   payer is bankrupted immediately, so no balance ever shows below zero.
   */
  private static charge(
    state: LiquidateGameState,
    payer: LiquidatePlayer,
    creditorId: string | null,
    amount: number,
  ): void {
    const credit = (value: number) => {
      if (creditorId === null) return;
      const creditor = state.players.find((p) => p.id === creditorId);
      if (creditor) creditor.credits += value;
    };

    if (payer.credits >= amount) {
      payer.credits -= amount;
      credit(amount);
      return;
    }

    if (state.config.debtRule === 'never-negative') {
      const paid = Math.max(0, payer.credits);
      payer.credits = 0;
      credit(paid);
      log(
        state,
        payer.id,
        `${payer.name} cannot cover ${amount} and is wiped out (never-negative rule)`,
      );
      LiquidateEngine.bankrupt(state, payer, creditorId);
      return;
    }

    payer.credits -= amount;
    credit(amount);
    state.pendingDebt = {
      debtorId: payer.id,
      creditorId,
      amount: -payer.credits,
    };
    state.phase = 'settling-debt';
    log(
      state,
      payer.id,
      `${payer.name} is ${-payer.credits} in debt and must raise funds or fold`,
    );
  }

  /** Clear the debt flag once the debtor is solvent again. */
  private static checkDebtSettled(state: LiquidateGameState): void {
    if (state.phase !== 'settling-debt' || !state.pendingDebt) return;
    const debtor = state.players.find((p) => p.id === state.pendingDebt!.debtorId);
    if (!debtor) return;

    if (debtor.credits >= 0) {
      log(state, debtor.id, `${debtor.name} settles up`);
      state.pendingDebt = null;
      LiquidateEngine.finishLanding(state);
    } else {
      state.pendingDebt = { ...state.pendingDebt, amount: -debtor.credits };
    }
  }

  // =========================================================================
  // Buying, auctions
  // =========================================================================

  private static buy(state: LiquidateGameState): LiquidateActionResult {
    if (state.phase !== 'buy-decision' || state.pendingPurchase === null) {
      return fail('Nothing is for sale');
    }
    const tile = LiquidateEngine.board(state)[state.pendingPurchase];
    if (!isOwnable(tile)) return fail('Tile cannot be owned');

    const next = cloneState(state);
    const player = next.players[next.currentPlayerIndex];
    if (player.credits < tile.price) return fail('Not enough credits');

    player.credits -= tile.price;
    next.tiles[tile.id].ownerId = player.id;
    next.pendingPurchase = null;
    log(next, player.id, `${player.name} claims ${tile.name} for ${tile.price}`);
    LiquidateEngine.finishLanding(next);
    return { valid: true, resultingState: next };
  }

  /** Declining puts the tile up for auction among every solvent player. */
  private static decline(state: LiquidateGameState): LiquidateActionResult {
    if (state.phase !== 'buy-decision' || state.pendingPurchase === null) {
      return fail('Nothing is for sale');
    }
    const tileId = state.pendingPurchase;
    const next = cloneState(state);
    const player = next.players[next.currentPlayerIndex];
    const tile = LiquidateEngine.board(next)[tileId];
    next.pendingPurchase = null;
    log(next, player.id, `${player.name} passes on ${tile.name} — it goes to auction`);

    const bidders = LiquidateEngine.activePlayers(next).map((p) => p.id);
    if (bidders.length === 0) {
      LiquidateEngine.finishLanding(next);
      return { valid: true, resultingState: next };
    }

    next.pendingAuction = {
      tileId,
      highestBid: 0,
      highestBidderId: null,
      bidders,
      turnIndex: 0,
    };
    next.phase = 'auction';
    return { valid: true, resultingState: next };
  }

  private static bid(state: LiquidateGameState, amount: number): LiquidateActionResult {
    if (state.phase !== 'auction' || !state.pendingAuction) return fail('No auction running');
    const auction = state.pendingAuction;
    const bidderId = auction.bidders[auction.turnIndex];
    const bidder = state.players.find((p) => p.id === bidderId);
    if (!bidder) return fail('Unknown bidder');
    if (!Number.isInteger(amount)) return fail('Bid must be a whole number');
    if (amount <= auction.highestBid) return fail('Bid must beat the current bid');
    if (amount > bidder.credits) return fail('Bid exceeds available credits');

    const next = cloneState(state);
    const live = next.pendingAuction!;
    live.highestBid = amount;
    live.highestBidderId = bidderId;
    live.turnIndex = (live.turnIndex + 1) % live.bidders.length;
    log(next, bidderId, `${bidder.name} bids ${amount}`);
    return { valid: true, resultingState: next };
  }

  private static passBid(state: LiquidateGameState): LiquidateActionResult {
    if (state.phase !== 'auction' || !state.pendingAuction) return fail('No auction running');

    const next = cloneState(state);
    const auction = next.pendingAuction!;
    const bidderId = auction.bidders[auction.turnIndex];
    const bidder = next.players.find((p) => p.id === bidderId)!;
    log(next, bidderId, `${bidder.name} passes`);

    auction.bidders.splice(auction.turnIndex, 1);
    if (auction.turnIndex >= auction.bidders.length) auction.turnIndex = 0;

    // Settle when nobody is left to outbid the leader.
    if (auction.bidders.length === 0 || (auction.bidders.length === 1 && auction.highestBidderId === auction.bidders[0])) {
      LiquidateEngine.settleAuction(next);
    }
    return { valid: true, resultingState: next };
  }

  private static settleAuction(state: LiquidateGameState): void {
    const auction = state.pendingAuction!;
    const tile = LiquidateEngine.board(state)[auction.tileId];

    if (auction.highestBidderId !== null && auction.highestBid > 0) {
      const winner = state.players.find((p) => p.id === auction.highestBidderId)!;
      winner.credits -= auction.highestBid;
      state.tiles[auction.tileId].ownerId = winner.id;
      log(state, winner.id, `${winner.name} wins ${tile.name} at auction for ${auction.highestBid}`);
    } else {
      log(state, null, `${tile.name} draws no bids and stays unclaimed`);
    }
    state.pendingAuction = null;
    LiquidateEngine.finishLanding(state);
  }

  // =========================================================================
  // Holdings: build, sell, mortgage
  // =========================================================================

  private static build(state: LiquidateGameState, tileId: number): LiquidateActionResult {
    const tile = LiquidateEngine.board(state)[tileId] as PlanetTile | undefined;
    if (!tile || tile.kind !== 'planet') return fail('Not a planet');
    const actorId = LiquidateEngine.actingPlayerId(state);
    if (state.tiles[tileId].ownerId !== actorId) return fail('You do not own that planet');
    if (!LiquidateEngine.canBuild(state, tileId)) {
      return fail('Cannot build there — needs the full system, built evenly, unmortgaged');
    }
    const actor = state.players.find((p) => p.id === actorId)!;
    if (actor.credits < tile.colonyCost) return fail('Not enough credits');

    const next = cloneState(state);
    const player = next.players.find((p) => p.id === actorId)!;
    player.credits -= tile.colonyCost;
    const owned = next.tiles[tileId];
    owned.level = (owned.level + 1) as ColonyLevel;
    log(
      next,
      player.id,
      owned.level === MAX_COLONY_LEVEL
        ? `${player.name} raises a megastructure on ${tile.name}`
        : `${player.name} builds colony ${owned.level} on ${tile.name}`,
    );
    return { valid: true, resultingState: next };
  }

  private static sellBuilding(state: LiquidateGameState, tileId: number): LiquidateActionResult {
    const tile = LiquidateEngine.board(state)[tileId] as PlanetTile | undefined;
    if (!tile || tile.kind !== 'planet') return fail('Not a planet');
    const actorId = LiquidateEngine.actingPlayerId(state);
    if (state.tiles[tileId].ownerId !== actorId) return fail('You do not own that planet');
    if (!LiquidateEngine.canSellBuilding(state, tileId)) {
      return fail('Cannot sell there — sell down evenly from the most-developed planet');
    }

    const next = cloneState(state);
    const player = next.players.find((p) => p.id === actorId)!;
    const owned = next.tiles[tileId];
    owned.level = (owned.level - 1) as ColonyLevel;
    // Buildings resell at half cost.
    player.credits += Math.floor(tile.colonyCost / 2);
    log(next, player.id, `${player.name} dismantles a colony on ${tile.name}`);
    LiquidateEngine.checkDebtSettled(next);
    return { valid: true, resultingState: next };
  }

  private static mortgage(state: LiquidateGameState, tileId: number): LiquidateActionResult {
    const tile = LiquidateEngine.board(state)[tileId];
    if (!tile || !isOwnable(tile)) return fail('Tile cannot be mortgaged');
    const actorId = LiquidateEngine.actingPlayerId(state);
    if (state.tiles[tileId].ownerId !== actorId) return fail('You do not own that tile');
    if (!LiquidateEngine.canMortgage(state, tileId)) {
      return fail('Cannot mortgage — already mortgaged, or it still has colonies');
    }

    const next = cloneState(state);
    const player = next.players.find((p) => p.id === actorId)!;
    next.tiles[tileId].mortgaged = true;
    const raised = mortgageValueFor(tile.price);
    player.credits += raised;
    log(next, player.id, `${player.name} mortgages ${tile.name} for ${raised}`);
    LiquidateEngine.checkDebtSettled(next);
    return { valid: true, resultingState: next };
  }

  private static unmortgage(state: LiquidateGameState, tileId: number): LiquidateActionResult {
    const tile = LiquidateEngine.board(state)[tileId];
    if (!tile || !isOwnable(tile)) return fail('Tile cannot be mortgaged');
    const actorId = LiquidateEngine.actingPlayerId(state);
    const owned = state.tiles[tileId];
    if (owned.ownerId !== actorId) return fail('You do not own that tile');
    if (!owned.mortgaged) return fail('Tile is not mortgaged');

    const cost = unmortgageCostFor(tile.price);
    const actor = state.players.find((p) => p.id === actorId)!;
    if (actor.credits < cost) return fail('Not enough credits');

    const next = cloneState(state);
    const player = next.players.find((p) => p.id === actorId)!;
    player.credits -= cost;
    next.tiles[tileId].mortgaged = false;
    log(next, player.id, `${player.name} clears the mortgage on ${tile.name} for ${cost}`);
    return { valid: true, resultingState: next };
  }

  // =========================================================================
  // Impound
  // =========================================================================

  private static payFine(state: LiquidateGameState): LiquidateActionResult {
    if (state.phase !== 'awaiting-roll') return fail('Cannot pay the fine now');
    const player = LiquidateEngine.currentPlayer(state);
    if (!player.inImpound) return fail('Not in impound');
    if (player.credits < LIQUIDATE_IMPOUND_FINE) return fail('Not enough credits');

    const next = cloneState(state);
    const me = next.players[next.currentPlayerIndex];
    me.credits -= LIQUIDATE_IMPOUND_FINE;
    me.inImpound = false;
    me.impoundTurns = 0;
    log(next, me.id, `${me.name} pays the ${LIQUIDATE_IMPOUND_FINE} release fee`);
    return { valid: true, resultingState: next };
  }

  private static useClearancePass(state: LiquidateGameState): LiquidateActionResult {
    if (state.phase !== 'awaiting-roll') return fail('Cannot use a pass now');
    const player = LiquidateEngine.currentPlayer(state);
    if (!player.inImpound) return fail('Not in impound');
    if (player.clearancePasses <= 0) return fail('No Clearance Pass held');

    const next = cloneState(state);
    const me = next.players[next.currentPlayerIndex];
    me.clearancePasses -= 1;
    me.inImpound = false;
    me.impoundTurns = 0;
    // The spent pass returns to the bottom of its deck's discard pile.
    next.decks.anomaly.discard.push('an-clearance');
    log(next, me.id, `${me.name} spends a Clearance Pass and walks free`);
    return { valid: true, resultingState: next };
  }

  // =========================================================================
  // Trading
  // =========================================================================

  private static proposeTrade(
    state: LiquidateGameState,
    offer: TradeOffer,
  ): LiquidateActionResult {
    if (state.phase !== 'awaiting-roll' && state.phase !== 'turn-end') {
      return fail('Can only trade during your own turn');
    }
    const from = LiquidateEngine.currentPlayer(state);
    const to = state.players.find((p) => p.id === offer.toId);
    if (!to) return fail('Unknown trade partner');
    if (to.id === from.id) return fail('Cannot trade with yourself');
    if (to.bankrupt) return fail('That player is out of the game');
    if (offer.offerCredits < 0 || offer.requestCredits < 0) {
      return fail('Credit amounts cannot be negative');
    }
    if (offer.offerCredits > from.credits) return fail('You do not have those credits');
    if (offer.requestCredits > to.credits) return fail('They do not have those credits');

    const check = (tiles: number[], ownerId: string): string | null => {
      for (const id of tiles) {
        const tile = LiquidateEngine.board(state)[id];
        if (!tile || !isOwnable(tile)) return 'That tile cannot be traded';
        if (state.tiles[id].ownerId !== ownerId) return 'Tile is not owned by the right player';
        // Developed planets must be sold down before changing hands.
        if (tile.kind === 'planet' && state.tiles[id].level > 0) {
          return `${tile.name} still has colonies — sell them first`;
        }
      }
      return null;
    };
    const offerError = check(offer.offerTiles, from.id) ?? check(offer.requestTiles, to.id);
    if (offerError) return fail(offerError);
    if (
      offer.offerTiles.length === 0 &&
      offer.requestTiles.length === 0 &&
      offer.offerCredits === 0 &&
      offer.requestCredits === 0
    ) {
      return fail('Trade is empty');
    }

    const next = cloneState(state);
    next.pendingTrade = { ...offer, fromId: from.id, offerTiles: [...offer.offerTiles], requestTiles: [...offer.requestTiles] };
    next.phase = 'trade-review';
    log(next, from.id, `${from.name} offers ${to.name} a trade`);
    return { valid: true, resultingState: next };
  }

  private static respondTrade(
    state: LiquidateGameState,
    accept: boolean,
  ): LiquidateActionResult {
    if (state.phase !== 'trade-review' || !state.pendingTrade) return fail('No trade to review');

    const next = cloneState(state);
    const trade = next.pendingTrade!;
    const from = next.players.find((p) => p.id === trade.fromId)!;
    const to = next.players.find((p) => p.id === trade.toId)!;

    if (!accept) {
      log(next, to.id, `${to.name} declines the trade`);
      next.pendingTrade = null;
      next.phase = next.dice === null ? 'awaiting-roll' : 'turn-end';
      return { valid: true, resultingState: next };
    }

    for (const id of trade.offerTiles) next.tiles[id].ownerId = to.id;
    for (const id of trade.requestTiles) next.tiles[id].ownerId = from.id;
    from.credits += trade.requestCredits - trade.offerCredits;
    to.credits += trade.offerCredits - trade.requestCredits;

    log(next, to.id, `${to.name} accepts the trade with ${from.name}`);
    next.pendingTrade = null;
    next.phase = next.dice === null ? 'awaiting-roll' : 'turn-end';
    return { valid: true, resultingState: next };
  }

  // =========================================================================
  // Bankruptcy and victory
  // =========================================================================

  private static declareBankruptcy(state: LiquidateGameState): LiquidateActionResult {
    const actorId = LiquidateEngine.actingPlayerId(state);
    const player = state.players.find((p) => p.id === actorId);
    if (!player) return fail('Unknown player');
    if (state.phase !== 'settling-debt') return fail('Nothing forces you out yet');

    const next = cloneState(state);
    const debtor = next.players.find((p) => p.id === actorId)!;
    const creditorId = next.pendingDebt?.creditorId ?? null;
    LiquidateEngine.bankrupt(next, debtor, creditorId);
    return { valid: true, resultingState: next };
  }

  /**
   * Remove `player` from the game, handing their holdings to `creditorId` — or
   * back to the bank (unowned, undeveloped) when the debt was owed to the bank.
   */
  private static bankrupt(
    state: LiquidateGameState,
    player: LiquidatePlayer,
    creditorId: string | null,
  ): void {
    const creditor = creditorId ? state.players.find((p) => p.id === creditorId) : null;

    for (const tile of LiquidateEngine.board(state)) {
      const owned = state.tiles[tile.id];
      if (owned.ownerId !== player.id) continue;
      if (creditor) {
        owned.ownerId = creditor.id;
      } else {
        owned.ownerId = null;
        owned.mortgaged = false;
      }
      owned.level = 0;
    }

    if (creditor && player.credits > 0) creditor.credits += player.credits;
    if (creditor && player.clearancePasses > 0) {
      creditor.clearancePasses += player.clearancePasses;
    }

    player.credits = 0;
    player.clearancePasses = 0;
    player.bankrupt = true;
    player.inImpound = false;
    state.pendingDebt = null;
    log(
      state,
      player.id,
      creditor
        ? `${player.name} folds — everything passes to ${creditor.name}`
        : `${player.name} folds — holdings return to the bank`,
    );

    // Drop them from any live auction.
    if (state.pendingAuction) {
      const auction = state.pendingAuction;
      const at = auction.bidders.indexOf(player.id);
      if (at >= 0) {
        auction.bidders.splice(at, 1);
        if (auction.turnIndex >= auction.bidders.length) auction.turnIndex = 0;
      }
    }

    if (LiquidateEngine.checkVictory(state)) return;

    // If the bankrupt player was mid-turn, hand play to the next seat.
    if (state.players[state.currentPlayerIndex].id === player.id) {
      LiquidateEngine.advanceSeat(state);
    } else {
      state.phase = state.dice === null ? 'awaiting-roll' : 'turn-end';
    }
  }

  /** End the game if only one solvent player is left. Returns true if it did. */
  private static checkVictory(state: LiquidateGameState): boolean {
    const survivors = LiquidateEngine.activePlayers(state);
    if (survivors.length > 1) return false;

    state.isGameOver = true;
    state.phase = 'game-over';
    state.winnerId = survivors[0]?.id ?? null;
    state.pendingAuction = null;
    state.pendingTrade = null;
    if (survivors[0]) {
      log(state, survivors[0].id, `${survivors[0].name} is the last solvent baron and wins`);
    }
    return true;
  }

  // =========================================================================
  // Turn rotation
  // =========================================================================

  private static endTurn(state: LiquidateGameState): LiquidateActionResult {
    if (state.phase !== 'turn-end') return fail('Turn is not over');
    const next = cloneState(state);
    LiquidateEngine.advanceSeat(next);
    return { valid: true, resultingState: next };
  }

  /** Pass play to the next solvent seat, counting rounds and the quick-mode cap. */
  private static advanceSeat(state: LiquidateGameState): void {
    state.dice = null;
    state.doublesCount = 0;
    state.pendingPurchase = null;

    const size = state.players.length;
    let index = state.currentPlayerIndex;
    let wrapped = false;
    for (let step = 0; step < size; step++) {
      index = (index + 1) % size;
      if (index <= state.currentPlayerIndex) wrapped = true;
      if (!state.players[index].bankrupt) break;
    }
    state.currentPlayerIndex = index;
    if (wrapped) state.round += 1;

    const cap = state.config.maxRounds;
    if (cap !== null && state.round > cap) {
      LiquidateEngine.endOnNetWorth(state);
      return;
    }
    state.phase = 'awaiting-roll';
  }

  /** Terminate the game, awarding it to the highest net worth. */
  private static endOnNetWorth(state: LiquidateGameState): void {
    const ranked = LiquidateEngine.activePlayers(state)
      .map((p) => ({ id: p.id, name: p.name, worth: LiquidateEngine.getNetWorth(state, p.id) }))
      .sort((a, b) => b.worth - a.worth);

    state.isGameOver = true;
    state.phase = 'game-over';
    state.winnerId = ranked.length > 0 ? ranked[0].id : null;
    if (ranked.length > 0) {
      log(state, ranked[0].id, `${ranked[0].name} wins with a net worth of ${ranked[0].worth}`);
    }
  }
}
