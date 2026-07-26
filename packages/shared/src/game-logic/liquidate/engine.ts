/**
 * The Liquidate engine — pure, static, immutable, N-player.
 *
 * Follows the same contract as the chess/checkers/reversi engines: static
 * methods only, no I/O, never mutates its input, and returns a
 * `{ valid, reason?, resultingState? }` result. Unlike those games a turn is a
 * *sequence of actions* rather than one move, so the state carries a `phase` and
 * callers drive it with `applyAction`.
 *
 * Randomness always flows through the seeded RNG stored in state, so a game is
 * fully reproducible from `{ seed, cursor }` — see `utils/rng.ts`.
 *
 * **M1 scope:** dice/doubles movement, the Home Station stipend, buying,
 * rent (incl. the full-system bare-rent bonus), tariffs, and quick-mode
 * termination. Building, mortgaging, event decks, impound escape, auctions,
 * trading, and bankruptcy resolution arrive in M2 — the places they hook in are
 * marked `TODO(M2)`.
 */

import { randomSeed, rollDice, createRng } from '../../utils/rng';
import {
  DOUBLES_LIMIT,
  FULL_SYSTEM_RENT_MULTIPLIER,
  LIQUIDATE_CONFIGS,
  LIQUIDATE_MAX_PLAYERS,
  LIQUIDATE_MIN_PLAYERS,
  LIQUIDATE_UTILITY_MULTIPLIER_BOTH,
  LIQUIDATE_UTILITY_MULTIPLIER_ONE,
  LIQUIDATE_WARP_GATE_RENTS,
  mortgageValueFor,
  planetRent,
} from './economy';
import { getBoard, impoundTileIndex, systemMembers } from './board';
import {
  isOwnable,
  type LiquidateAction,
  type LiquidateActionResult,
  type LiquidateGameState,
  type LiquidateLogEntry,
  type LiquidatePlayer,
  type LiquidateSeat,
  type LiquidateTile,
  type StarSystem,
  type TileOwnership,
} from './types';

export interface NewGameOptions {
  players: readonly LiquidateSeat[];
  mode?: 'full' | 'quick';
  /** Omit for a random game; pass a seed for a reproducible one (tests, replays). */
  seed?: number;
}

/** Shallow-clone state so callers can mutate the copy freely before returning it. */
function cloneState(state: LiquidateGameState): LiquidateGameState {
  return {
    ...state,
    players: state.players.map((p) => ({ ...p })),
    tiles: state.tiles.map((t) => ({ ...t })),
    log: state.log.slice(),
  };
}

function log(
  state: LiquidateGameState,
  playerId: string | null,
  message: string,
): void {
  const entry: LiquidateLogEntry = { round: state.round, playerId, message };
  state.log.push(entry);
}

export class LiquidateEngine {
  // -------------------------------------------------------------------------
  // Setup
  // -------------------------------------------------------------------------

  /**
   * Create a game. Throws only for an invalid seat count — every other
   * malformed input is impossible given the types.
   */
  static newGame(options: NewGameOptions): LiquidateGameState {
    const { players: seats, mode = 'full', seed } = options;
    if (seats.length < LIQUIDATE_MIN_PLAYERS || seats.length > LIQUIDATE_MAX_PLAYERS) {
      throw new Error(
        `Liquidate needs ${LIQUIDATE_MIN_PLAYERS}–${LIQUIDATE_MAX_PLAYERS} players, got ${seats.length}`,
      );
    }

    const config = { ...LIQUIDATE_CONFIGS[mode] };
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

    return {
      config,
      players,
      currentPlayerIndex: 0,
      tiles,
      rng: createRng(seed ?? randomSeed()),
      dice: null,
      doublesCount: 0,
      phase: 'awaiting-roll',
      pendingPurchase: null,
      round: 1,
      log: [],
      isGameOver: false,
      winnerId: null,
    };
  }

  // -------------------------------------------------------------------------
  // Queries
  // -------------------------------------------------------------------------

  /** The static board for this game's mode. */
  static board(state: LiquidateGameState): readonly LiquidateTile[] {
    return getBoard(state.config.mode);
  }

  static currentPlayer(state: LiquidateGameState): LiquidatePlayer {
    return state.players[state.currentPlayerIndex];
  }

  /** Players still in the game. */
  static activePlayers(state: LiquidateGameState): LiquidatePlayer[] {
    return state.players.filter((p) => !p.bankrupt);
  }

  /**
   * Total worth: cash + list price of unmortgaged holdings + colony investment,
   * with mortgaged tiles counted at their post-mortgage equity (zero) since the
   * loan has already been taken against them.
   */
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

  /** True when `playerId` owns every planet in `system`. */
  static ownsFullSystem(
    state: LiquidateGameState,
    playerId: string,
    system: StarSystem,
  ): boolean {
    const members = systemMembers(state.config.mode, system);
    return members.length > 0 && members.every((id) => state.tiles[id].ownerId === playerId);
  }

  /**
   * Rent owed for landing on `tileId`, given the roll that got there.
   * Returns 0 for unowned, self-owned, or mortgaged tiles.
   */
  static rentFor(state: LiquidateGameState, tileId: number, diceTotal: number): number {
    const tile = LiquidateEngine.board(state)[tileId];
    const owned = state.tiles[tileId];
    if (!isOwnable(tile) || owned.ownerId === null || owned.mortgaged) return 0;

    if (tile.kind === 'planet') {
      const base = planetRent(tile.rents, owned.level);
      const fullSystem = LiquidateEngine.ownsFullSystem(state, owned.ownerId, tile.system);
      // The set bonus rewards holding a system you haven't developed yet; once
      // colonies are up the level rents already price that in.
      return fullSystem && owned.level === 0 ? base * FULL_SYSTEM_RENT_MULTIPLIER : base;
    }

    if (tile.kind === 'warp-gate') {
      const count = LiquidateEngine.board(state).filter(
        (t) => t.kind === 'warp-gate' && state.tiles[t.id].ownerId === owned.ownerId,
      ).length;
      return LIQUIDATE_WARP_GATE_RENTS[Math.max(0, count - 1)] ?? 0;
    }

    // utility
    const utilities = LiquidateEngine.board(state).filter(
      (t) => t.kind === 'utility' && state.tiles[t.id].ownerId === owned.ownerId,
    ).length;
    const multiplier =
      utilities > 1 ? LIQUIDATE_UTILITY_MULTIPLIER_BOTH : LIQUIDATE_UTILITY_MULTIPLIER_ONE;
    return diceTotal * multiplier;
  }

  /** Actions the current player may legally take right now. */
  static getLegalActions(state: LiquidateGameState): LiquidateAction[] {
    if (state.isGameOver) return [];
    switch (state.phase) {
      case 'awaiting-roll':
        return [{ type: 'roll' }];
      case 'buy-decision': {
        const tile = LiquidateEngine.board(state)[state.pendingPurchase!];
        const player = LiquidateEngine.currentPlayer(state);
        const actions: LiquidateAction[] = [{ type: 'decline' }];
        if (isOwnable(tile) && player.credits >= tile.price) actions.unshift({ type: 'buy' });
        return actions;
      }
      case 'turn-end':
        return [{ type: 'end-turn' }];
      default:
        return [];
    }
  }

  // -------------------------------------------------------------------------
  // Actions
  // -------------------------------------------------------------------------

  /** Apply an action. Pure: returns a new state, never mutates `state`. */
  static applyAction(
    state: LiquidateGameState,
    action: LiquidateAction,
  ): LiquidateActionResult {
    if (state.isGameOver) return { valid: false, reason: 'Game is over' };

    switch (action.type) {
      case 'roll':
        return LiquidateEngine.roll(state);
      case 'buy':
        return LiquidateEngine.buy(state);
      case 'decline':
        return LiquidateEngine.decline(state);
      case 'end-turn':
        return LiquidateEngine.endTurn(state);
      default:
        return { valid: false, reason: 'Unknown action' };
    }
  }

  private static roll(state: LiquidateGameState): LiquidateActionResult {
    if (state.phase !== 'awaiting-roll') {
      return { valid: false, reason: 'Not waiting for a roll' };
    }

    const next = cloneState(state);
    const player = next.players[next.currentPlayerIndex];

    // TODO(M2): real impound escape (pay the fine, roll doubles, or spend a
    // Clearance Pass). M1 releases automatically so play can continue.
    if (player.inImpound) {
      player.inImpound = false;
      player.impoundTurns = 0;
      log(next, player.id, `${player.name} is released from impound`);
    }

    const { dice, state: rng } = rollDice(next.rng);
    next.rng = rng;
    next.dice = dice;

    const isDoubles = dice[0] === dice[1];
    next.doublesCount = isDoubles ? next.doublesCount + 1 : 0;
    const total = dice[0] + dice[1];
    log(next, player.id, `${player.name} rolls ${dice[0]}+${dice[1]} = ${total}`);

    // Three doubles in a row: straight to impound, turn over, no landing effect.
    if (isDoubles && next.doublesCount >= DOUBLES_LIMIT) {
      player.tile = impoundTileIndex(next.config.mode);
      player.inImpound = true;
      player.impoundTurns = 0;
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
    player.tile = target % size;
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
          LiquidateEngine.transfer(state, player, owned.ownerId, rent);
          const owner = state.players.find((p) => p.id === owned.ownerId)!;
          log(state, player.id, `${player.name} pays ${rent} rent to ${owner.name} for ${tile.name}`);
        }
      }
      LiquidateEngine.finishLanding(state);
      return;
    }

    switch (tile.kind) {
      case 'tariff':
        player.credits -= tile.amount;
        log(state, player.id, `${player.name} pays ${tile.amount} — ${tile.name}`);
        break;
      case 'contraband-scan':
        player.tile = impoundTileIndex(state.config.mode);
        player.inImpound = true;
        player.impoundTurns = 0;
        state.doublesCount = 0;
        state.phase = 'turn-end';
        log(state, player.id, `${player.name} is scanned and impounded`);
        return;
      case 'home-station':
        // Landing exactly on Home Station already paid via `advance`.
        break;
      case 'anomaly':
      case 'federation':
        // TODO(M2): draw from the matching deck and apply the card.
        log(state, player.id, `${player.name} lands on ${tile.name}`);
        break;
      case 'impound':
      case 'drift':
        // Inert: merely passing through / resting.
        break;
    }
    LiquidateEngine.finishLanding(state);
  }

  /** After a landing resolves, either roll again (doubles) or end the turn. */
  private static finishLanding(state: LiquidateGameState): void {
    state.phase = state.doublesCount > 0 ? 'awaiting-roll' : 'turn-end';
  }

  /**
   * Move `amount` from `payer` to `recipientId`. Credits may go negative — the
   * debt is real and M2 resolves it through forced liquidation or bankruptcy.
   */
  private static transfer(
    state: LiquidateGameState,
    payer: LiquidatePlayer,
    recipientId: string,
    amount: number,
  ): void {
    payer.credits -= amount;
    const recipient = state.players.find((p) => p.id === recipientId);
    if (recipient) recipient.credits += amount;
  }

  private static buy(state: LiquidateGameState): LiquidateActionResult {
    if (state.phase !== 'buy-decision' || state.pendingPurchase === null) {
      return { valid: false, reason: 'Nothing is for sale' };
    }
    const tile = LiquidateEngine.board(state)[state.pendingPurchase];
    if (!isOwnable(tile)) return { valid: false, reason: 'Tile cannot be owned' };

    const next = cloneState(state);
    const player = next.players[next.currentPlayerIndex];
    if (player.credits < tile.price) {
      return { valid: false, reason: 'Not enough credits' };
    }

    player.credits -= tile.price;
    next.tiles[tile.id].ownerId = player.id;
    next.pendingPurchase = null;
    log(next, player.id, `${player.name} claims ${tile.name} for ${tile.price}`);
    LiquidateEngine.finishLanding(next);
    return { valid: true, resultingState: next };
  }

  private static decline(state: LiquidateGameState): LiquidateActionResult {
    if (state.phase !== 'buy-decision' || state.pendingPurchase === null) {
      return { valid: false, reason: 'Nothing is for sale' };
    }
    // Capture before cloning: narrowing applies to `state`, not the copy.
    const tileId = state.pendingPurchase;
    const next = cloneState(state);
    const player = next.players[next.currentPlayerIndex];
    const tile = LiquidateEngine.board(next)[tileId];
    next.pendingPurchase = null;
    // TODO(M2): declining sends the tile to auction among all players.
    log(next, player.id, `${player.name} passes on ${tile.name}`);
    LiquidateEngine.finishLanding(next);
    return { valid: true, resultingState: next };
  }

  private static endTurn(state: LiquidateGameState): LiquidateActionResult {
    if (state.phase !== 'turn-end') {
      return { valid: false, reason: 'Turn is not over' };
    }

    const next = cloneState(state);
    next.dice = null;
    next.doublesCount = 0;
    next.pendingPurchase = null;

    // Advance to the next solvent player, counting a completed round when the
    // seat order wraps.
    const size = next.players.length;
    let index = next.currentPlayerIndex;
    let wrapped = false;
    for (let step = 0; step < size; step++) {
      index = (index + 1) % size;
      if (index <= next.currentPlayerIndex) wrapped = true;
      if (!next.players[index].bankrupt) break;
    }
    next.currentPlayerIndex = index;
    if (wrapped) next.round += 1;

    // Quick mode ends on the round cap: richest player wins.
    const cap = next.config.maxRounds;
    if (cap !== null && next.round > cap) {
      LiquidateEngine.endOnNetWorth(next);
      return { valid: true, resultingState: next };
    }

    // TODO(M2): last-solvent-player victory once bankruptcy is implemented.
    next.phase = 'awaiting-roll';
    return { valid: true, resultingState: next };
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
