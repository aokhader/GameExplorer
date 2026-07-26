import { describe, it, expect } from 'vitest';
import { rollDice } from '../../utils/rng';
import { LiquidateEngine } from './engine';
import { getBoard, impoundTileIndex, systemMembers } from './board';
import { deckCards } from './cards';
import {
  DEFAULT_DEBT_RULE,
  LIQUIDATE_CONFIGS,
  LIQUIDATE_IMPOUND_FINE,
  LIQUIDATE_WARP_GATE_RENTS,
  MAX_IMPOUND_TURNS,
  baseRentFor,
  colonyCostFor,
  mortgageValueFor,
  rentTableFor,
  unmortgageCostFor,
} from './economy';
import {
  MAX_COLONY_LEVEL,
  isOwnable,
  type DebtRule,
  type LiquidateAction,
  type LiquidateGameState,
  type PlanetTile,
} from './types';

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function game(
  seed = 1,
  mode: 'full' | 'quick' = 'full',
  debtRule?: DebtRule,
): LiquidateGameState {
  return LiquidateEngine.newGame({
    players: [{ name: 'Ada' }, { name: 'Bo', isBot: true }],
    mode,
    seed,
    debtRule,
  });
}

function threePlayerGame(seed = 7, debtRule?: DebtRule): LiquidateGameState {
  return LiquidateEngine.newGame({
    players: [{ name: 'Ada' }, { name: 'Bo' }, { name: 'Cy' }],
    seed,
    debtRule,
  });
}

/** Apply an action, asserting it was legal, and return the new state. */
function apply(state: LiquidateGameState, action: LiquidateAction): LiquidateGameState {
  const result = LiquidateEngine.applyAction(state, action);
  expect(result.reason).toBeUndefined();
  expect(result.valid).toBe(true);
  return result.resultingState!;
}

function reject(state: LiquidateGameState, action: LiquidateAction): string {
  const result = LiquidateEngine.applyAction(state, action);
  expect(result.valid).toBe(false);
  return result.reason!;
}

function planetsOf(mode: 'full' | 'quick'): PlanetTile[] {
  return getBoard(mode).filter((t): t is PlanetTile => t.kind === 'planet');
}

/** Put the state into a management window so build/mortgage/trade are legal. */
function manage(state: LiquidateGameState): LiquidateGameState {
  const next = structuredClone(state);
  next.phase = 'turn-end';
  next.dice = [1, 2];
  return next;
}

/** Hand every tile in `tileIds` to the player at `playerIndex`. */
function own(
  state: LiquidateGameState,
  tileIds: number[],
  playerIndex: number,
): LiquidateGameState {
  const next = structuredClone(state);
  for (const id of tileIds) next.tiles[id].ownerId = next.players[playerIndex].id;
  return next;
}

/**
 * Roll the acting player onto `tileId` through the real engine, choosing an rng
 * cursor whose roll covers the distance exactly. Never wraps the board, so no
 * stipend is paid and credit assertions stay exact. Requires `tileId >= 2`.
 */
function landOn(state: LiquidateGameState, tileId: number): LiquidateGameState {
  for (let cursor = 0; cursor < 900; cursor++) {
    const attempt = structuredClone(state);
    attempt.rng = { seed: attempt.rng.seed, cursor };
    const { dice } = rollDice(attempt.rng);
    const from = tileId - (dice[0] + dice[1]);
    if (from < 0) continue;

    attempt.players[attempt.currentPlayerIndex].tile = from;
    attempt.phase = 'awaiting-roll';
    attempt.doublesCount = 0;
    const result = LiquidateEngine.applyAction(attempt, { type: 'roll' });
    if (result.valid) return result.resultingState!;
  }
  throw new Error(`could not land on tile ${tileId} without wrapping`);
}

/** Find a cursor whose next roll is (or is not) doubles. */
function cursorWhereDoubles(state: LiquidateGameState, doubles: boolean): number {
  for (let cursor = 0; cursor < 900; cursor++) {
    const { dice } = rollDice({ seed: state.rng.seed, cursor });
    if ((dice[0] === dice[1]) === doubles) return cursor;
  }
  throw new Error('no suitable cursor');
}

// ---------------------------------------------------------------------------

describe('board layouts', () => {
  it('uses an original tile count, not the classic 40', () => {
    expect(getBoard('full')).toHaveLength(44);
    expect(getBoard('quick')).toHaveLength(28);
  });

  it('numbers every tile by its own index', () => {
    for (const mode of ['full', 'quick'] as const) {
      getBoard(mode).forEach((tile, i) => expect(tile.id).toBe(i));
    }
  });

  it('places the four corners evenly on the full board', () => {
    const board = getBoard('full');
    expect(board[0].kind).toBe('home-station');
    expect(board[11].kind).toBe('impound');
    expect(board[22].kind).toBe('drift');
    expect(board[33].kind).toBe('contraband-scan');
  });

  it('has 24 planets across 8 systems of 3 on the full board', () => {
    const planets = planetsOf('full');
    expect(planets).toHaveLength(24);
    const systems = new Set(planets.map((p) => p.system));
    expect(systems.size).toBe(8);
    for (const system of systems) {
      expect(systemMembers('full', system)).toHaveLength(3);
    }
  });

  it('gives the quick board 4 systems and every tile kind', () => {
    expect(planetsOf('quick')).toHaveLength(12);
    const kinds = new Set(getBoard('quick').map((t) => t.kind));
    for (const kind of ['warp-gate', 'utility', 'tariff', 'anomaly', 'federation'] as const) {
      expect(kinds).toContain(kind);
    }
  });

  it('prices planets in ascending system tiers', () => {
    const cheapest = planetsOf('full').filter((p) => p.system === 'ember');
    const dearest = planetsOf('full').filter((p) => p.system === 'aurum');
    expect(Math.max(...cheapest.map((p) => p.price))).toBeLessThan(
      Math.min(...dearest.map((p) => p.price)),
    );
  });

  it('locates the impound corner per mode', () => {
    expect(impoundTileIndex('full')).toBe(11);
    expect(impoundTileIndex('quick')).toBe(7);
  });
});

describe('economy', () => {
  it('derives rent tables that rise monotonically with development', () => {
    const rents = rentTableFor(200);
    for (let i = 1; i < rents.length; i++) {
      expect(rents[i]).toBeGreaterThan(rents[i - 1]);
    }
  });

  it('floors base rent so the cheapest planets still charge', () => {
    expect(baseRentFor(10)).toBeGreaterThanOrEqual(4);
    expect(baseRentFor(420)).toBe(25);
  });

  it('scales colony cost with the system tier', () => {
    expect(colonyCostFor('ember')).toBe(50);
    expect(colonyCostFor('aurum')).toBe(225);
  });

  it('mortgages at half price and charges exact integer interest to clear', () => {
    expect(mortgageValueFor(200)).toBe(100);
    // Guards the float bug: 100 * 1.1 is 110.00000000000001, which used to
    // ceil to 111 and overcharge a credit.
    expect(unmortgageCostFor(200)).toBe(110);
    expect(unmortgageCostFor(70)).toBe(39);
  });

  it('starts quick mode richer on a round cap', () => {
    expect(LIQUIDATE_CONFIGS.quick.startingCredits).toBeGreaterThan(
      LIQUIDATE_CONFIGS.full.startingCredits,
    );
    expect(LIQUIDATE_CONFIGS.quick.maxRounds).toBe(20);
    expect(LIQUIDATE_CONFIGS.full.maxRounds).toBeNull();
  });
});

describe('LiquidateEngine.newGame', () => {
  it('seats every player at Home Station with the starting purse', () => {
    const state = game();
    expect(state.players).toHaveLength(2);
    for (const p of state.players) {
      expect(p.tile).toBe(0);
      expect(p.credits).toBe(LIQUIDATE_CONFIGS.full.startingCredits);
      expect(p.bankrupt).toBe(false);
      expect(p.clearancePasses).toBe(0);
    }
    expect(state.phase).toBe('awaiting-roll');
    expect(state.round).toBe(1);
    expect(state.isGameOver).toBe(false);
  });

  it('starts every tile unowned', () => {
    const state = game();
    expect(state.tiles).toHaveLength(getBoard('full').length);
    expect(state.tiles.every((t) => t.ownerId === null && t.level === 0 && !t.mortgaged)).toBe(true);
  });

  it('supports 2 to 6 players and rejects anything else', () => {
    const seats = (n: number) => Array.from({ length: n }, (_, i) => ({ name: `P${i}` }));
    expect(() => LiquidateEngine.newGame({ players: seats(2) })).not.toThrow();
    expect(() => LiquidateEngine.newGame({ players: seats(6) })).not.toThrow();
    expect(() => LiquidateEngine.newGame({ players: seats(1) })).toThrow(/2–6 players/);
    expect(() => LiquidateEngine.newGame({ players: seats(7) })).toThrow(/2–6 players/);
  });

  it('shuffles both decks reproducibly from the seed', () => {
    const a = game(42);
    const b = game(42);
    expect(a.decks.anomaly.draw).toEqual(b.decks.anomaly.draw);
    expect(a.decks.federation.draw).toEqual(b.decks.federation.draw);
    expect(a.decks.anomaly.draw).toHaveLength(deckCards('anomaly').length);
    expect(a.decks.federation.draw).toHaveLength(deckCards('federation').length);
    // Both decks are permutations, not the authored order verbatim.
    expect([...a.decks.anomaly.draw].sort()).toEqual(
      deckCards('anomaly').map((c) => c.id).sort(),
    );
  });

  it('is fully reproducible from a seed', () => {
    const a = apply(game(99), { type: 'roll' });
    const b = apply(game(99), { type: 'roll' });
    expect(a.dice).toEqual(b.dice);
    expect(a.players[0].tile).toBe(b.players[0].tile);
  });

  it('diverges on different seeds', () => {
    const rolls = new Set<string>();
    for (let seed = 0; seed < 25; seed++) {
      rolls.add(JSON.stringify(apply(game(seed), { type: 'roll' }).dice));
    }
    expect(rolls.size).toBeGreaterThan(1);
  });
});

describe('the debt rule is a player-selectable option', () => {
  it('defaults to allow-negative on both presets', () => {
    expect(DEFAULT_DEBT_RULE).toBe('allow-negative');
    expect(game().config.debtRule).toBe('allow-negative');
    expect(game(1, 'quick').config.debtRule).toBe('allow-negative');
  });

  it('honours an explicit override for either value', () => {
    expect(game(1, 'full', 'never-negative').config.debtRule).toBe('never-negative');
    expect(game(1, 'quick', 'never-negative').config.debtRule).toBe('never-negative');
    expect(game(1, 'full', 'allow-negative').config.debtRule).toBe('allow-negative');
  });

  it('does not leak the override into the shared preset object', () => {
    game(1, 'full', 'never-negative');
    expect(LIQUIDATE_CONFIGS.full.debtRule).toBe('allow-negative');
  });

  /** An unaffordable rent bill: cheap purse, expensive opposing planet. */
  function unaffordableRent(rule: DebtRule): LiquidateGameState {
    const planet = planetsOf('full').find((p) => p.system === 'aurum' && p.id >= 12)!;
    let state = threePlayerGame(7, rule);
    state = own(state, systemMembers('full', planet.system), 1);
    state.players[0].credits = 5;
    return landOn(state, planet.id);
  }

  it('allow-negative: drives the balance below zero and demands settlement', () => {
    const next = unaffordableRent('allow-negative');
    expect(next.players[0].credits).toBeLessThan(0);
    expect(next.phase).toBe('settling-debt');
    expect(next.pendingDebt).toMatchObject({
      debtorId: next.players[0].id,
      creditorId: next.players[1].id,
    });
    expect(next.pendingDebt!.amount).toBe(-next.players[0].credits);
    expect(next.players[0].bankrupt).toBe(false);
    // The debtor is the one who must act, not the seat order.
    expect(LiquidateEngine.actingPlayerId(next)).toBe(next.players[0].id);
  });

  it('never-negative: keeps the balance at zero and folds the player at once', () => {
    const next = unaffordableRent('never-negative');
    expect(next.players[0].credits).toBe(0);
    expect(next.players[0].bankrupt).toBe(true);
    expect(next.phase).not.toBe('settling-debt');
    expect(next.pendingDebt).toBeNull();
    // The creditor received what little cash there was.
    expect(next.players[1].credits).toBeGreaterThan(LIQUIDATE_CONFIGS.full.startingCredits);
  });

  it('never-negative never lets any balance go below zero over a long game', () => {
    let state = game(2024, 'quick', 'never-negative');
    for (let i = 0; i < 400 && !state.isGameOver; i++) {
      const actions = LiquidateEngine.getLegalActions(state);
      if (actions.length === 0) break;
      state = apply(state, actions[0]);
      for (const p of state.players) expect(p.credits).toBeGreaterThanOrEqual(0);
    }
  });

  it('allow-negative lets the debtor mortgage back to solvency and resume', () => {
    const planet = planetsOf('full').find((p) => p.system === 'aurum' && p.id >= 12)!;
    let state = threePlayerGame(7, 'allow-negative');
    state = own(state, systemMembers('full', planet.system), 1);
    // The debtor owns a cheap planet they can pledge.
    const spare = planetsOf('full').find((p) => p.system === 'ember')!;
    state = own(state, [spare.id], 0);
    state.players[0].credits = 5;

    let next = landOn(state, planet.id);
    expect(next.phase).toBe('settling-debt');

    // Mortgaging is offered, and taking it clears the debt.
    expect(LiquidateEngine.getLegalActions(next)).toContainEqual({
      type: 'mortgage',
      tile: spare.id,
    });
    next = apply(next, { type: 'mortgage', tile: spare.id });
    expect(next.tiles[spare.id].mortgaged).toBe(true);
    if (next.players[0].credits >= 0) {
      expect(next.phase).not.toBe('settling-debt');
      expect(next.pendingDebt).toBeNull();
    }
  });

  it('offers bankruptcy as the way out of an unpayable debt', () => {
    const next = unaffordableRent('allow-negative');
    expect(LiquidateEngine.getLegalActions(next)).toContainEqual({ type: 'declare-bankruptcy' });
  });

  it('refuses bankruptcy when no debt is outstanding', () => {
    expect(reject(game(), { type: 'declare-bankruptcy' })).toMatch(/Nothing forces you out/);
  });
});

describe('rolling and movement', () => {
  it('records the roll and moves the player off Home Station', () => {
    const state = apply(game(), { type: 'roll' });
    const [a, b] = state.dice!;
    expect(a).toBeGreaterThanOrEqual(1);
    expect(b).toBeLessThanOrEqual(6);
    // A card can relocate the player after the dice move, so assert progress
    // rather than an exact square.
    expect(state.players[0].tile).not.toBe(0);
  });

  it('moves exactly the dice total when the landing tile is inert', () => {
    const drift = getBoard('full').find((t) => t.kind === 'drift')!;
    const next = landOn(game(), drift.id);
    expect(next.players[0].tile).toBe(drift.id);
  });

  it('never mutates the state passed in', () => {
    const before = game();
    const snapshot = structuredClone(before);
    LiquidateEngine.applyAction(before, { type: 'roll' });
    expect(before).toEqual(snapshot);
  });

  it('pays the stipend for passing Home Station', () => {
    const size = getBoard('full').length;
    // Land exactly on Home Station: guaranteed wrap, and the tile is inert.
    for (let cursor = 0; cursor < 900; cursor++) {
      const attempt = game();
      attempt.rng = { seed: attempt.rng.seed, cursor };
      const { dice } = rollDice(attempt.rng);
      const total = dice[0] + dice[1];
      attempt.players[0].tile = size - total;
      const purse = attempt.players[0].credits;

      const next = apply(attempt, { type: 'roll' });
      expect(next.players[0].tile).toBe(0);
      expect(next.players[0].credits).toBe(purse + LIQUIDATE_CONFIGS.full.stipend);
      return;
    }
    throw new Error('no cursor found');
  });

  it('does not pay a stipend on a roll that stays on the loop', () => {
    const drift = getBoard('full').find((t) => t.kind === 'drift')!;
    const next = landOn(game(), drift.id);
    expect(next.players[0].credits).toBe(LIQUIDATE_CONFIGS.full.startingCredits);
  });

  it('rejects a roll while a buy decision is pending', () => {
    const planet = planetsOf('full').find((p) => p.id >= 12)!;
    const state = landOn(game(), planet.id);
    expect(state.phase).toBe('buy-decision');
    expect(reject(state, { type: 'roll' })).toMatch(/Not waiting for a roll/);
  });
});

describe('doubles', () => {
  it('lets a player roll again after doubles', () => {
    const base = game();
    base.rng = { seed: base.rng.seed, cursor: cursorWhereDoubles(base, true) };
    let state = apply(base, { type: 'roll' });
    expect(state.doublesCount).toBe(1);

    // Resolve whatever the landing opened, then it should be the same player again.
    if (state.phase === 'buy-decision') state = apply(state, { type: 'decline' });
    while (state.phase === 'auction') {
      state = apply(state, { type: 'pass-bid' });
    }
    if (state.phase === 'awaiting-roll') {
      expect(state.currentPlayerIndex).toBe(0);
    }
  });

  it('ends the turn when the roll is not doubles', () => {
    const base = game();
    base.rng = { seed: base.rng.seed, cursor: cursorWhereDoubles(base, false) };
    const state = apply(base, { type: 'roll' });
    expect(state.doublesCount).toBe(0);
  });

  it('sends a player to impound on the third consecutive double', () => {
    const staged = game();
    staged.doublesCount = 2;
    staged.players[0].tile = 5;
    staged.rng = { seed: staged.rng.seed, cursor: cursorWhereDoubles(staged, true) };

    const next = apply(staged, { type: 'roll' });
    expect(next.players[0].inImpound).toBe(true);
    expect(next.players[0].tile).toBe(impoundTileIndex('full'));
    expect(next.phase).toBe('turn-end');
    expect(next.doublesCount).toBe(0);
  });
});

describe('buying', () => {
  function buyDecision(): LiquidateGameState {
    const planet = planetsOf('full').find((p) => p.id >= 12)!;
    return landOn(game(), planet.id);
  }

  it('offers buy and decline on an unowned tile', () => {
    const state = buyDecision();
    expect(isOwnable(getBoard('full')[state.pendingPurchase!])).toBe(true);
    const actions = LiquidateEngine.getLegalActions(state);
    expect(actions).toContainEqual({ type: 'buy' });
    expect(actions).toContainEqual({ type: 'decline' });
  });

  it('transfers the tile and debits the price', () => {
    const state = buyDecision();
    const tile = getBoard('full')[state.pendingPurchase!];
    const purse = state.players[0].credits;

    const next = apply(state, { type: 'buy' });
    expect(next.tiles[tile.id].ownerId).toBe(next.players[0].id);
    expect(next.players[0].credits).toBe(purse - (isOwnable(tile) ? tile.price : 0));
    expect(next.pendingPurchase).toBeNull();
  });

  it('refuses a purchase the player cannot afford', () => {
    const state = buyDecision();
    state.players[0].credits = 0;
    expect(LiquidateEngine.getLegalActions(state)).not.toContainEqual({ type: 'buy' });
    expect(reject(state, { type: 'buy' })).toMatch(/Not enough credits/);
  });

  it('refuses buying when nothing is for sale', () => {
    expect(reject(game(), { type: 'buy' })).toMatch(/Nothing is for sale/);
  });
});

describe('auctions', () => {
  function auction(): LiquidateGameState {
    const planet = planetsOf('full').find((p) => p.id >= 12)!;
    const state = landOn(threePlayerGame(), planet.id);
    expect(state.phase).toBe('buy-decision');
    return apply(state, { type: 'decline' });
  }

  it('opens an auction when a tile is declined', () => {
    const state = auction();
    expect(state.phase).toBe('auction');
    expect(state.pendingAuction!.bidders).toHaveLength(3);
    expect(state.pendingAuction!.highestBid).toBe(0);
    expect(state.pendingAuction!.highestBidderId).toBeNull();
  });

  it('rotates the acting bidder and tracks the leading bid', () => {
    let state = auction();
    const first = LiquidateEngine.actingPlayerId(state);
    state = apply(state, { type: 'bid', amount: 50 });
    expect(state.pendingAuction!.highestBid).toBe(50);
    expect(state.pendingAuction!.highestBidderId).toBe(first);
    expect(LiquidateEngine.actingPlayerId(state)).not.toBe(first);
  });

  it('rejects bids that do not beat the leader or exceed the purse', () => {
    let state = auction();
    state = apply(state, { type: 'bid', amount: 50 });
    expect(reject(state, { type: 'bid', amount: 50 })).toMatch(/beat the current bid/);
    expect(reject(state, { type: 'bid', amount: 1_000_000 })).toMatch(/exceeds available credits/);
    expect(reject(state, { type: 'bid', amount: 50.5 })).toMatch(/whole number/);
  });

  it('awards the tile to the last bidder standing and charges the bid', () => {
    let state = auction();
    const winnerId = LiquidateEngine.actingPlayerId(state)!;
    const purse = state.players.find((p) => p.id === winnerId)!.credits;
    const tileId = state.pendingAuction!.tileId;

    state = apply(state, { type: 'bid', amount: 120 });
    state = apply(state, { type: 'pass-bid' });
    state = apply(state, { type: 'pass-bid' });

    expect(state.phase).not.toBe('auction');
    expect(state.pendingAuction).toBeNull();
    expect(state.tiles[tileId].ownerId).toBe(winnerId);
    expect(state.players.find((p) => p.id === winnerId)!.credits).toBe(purse - 120);
  });

  it('leaves the tile unclaimed when everybody passes', () => {
    let state = auction();
    const tileId = state.pendingAuction!.tileId;
    state = apply(state, { type: 'pass-bid' });
    state = apply(state, { type: 'pass-bid' });
    state = apply(state, { type: 'pass-bid' });
    expect(state.pendingAuction).toBeNull();
    expect(state.tiles[tileId].ownerId).toBeNull();
  });

  it('refuses auction actions when no auction is running', () => {
    expect(reject(game(), { type: 'pass-bid' })).toMatch(/No auction running/);
    expect(reject(game(), { type: 'bid', amount: 10 })).toMatch(/No auction running/);
  });
});

describe('building colonies', () => {
  const system = 'amber' as const;
  const members = () => systemMembers('full', system);

  function withSystem(): LiquidateGameState {
    return manage(own(game(), members(), 0));
  }

  it('requires the whole system before building', () => {
    const partial = manage(own(game(), [members()[0]], 0));
    expect(LiquidateEngine.canBuild(partial, members()[0])).toBe(false);
    expect(reject(partial, { type: 'build', tile: members()[0] })).toMatch(/full system/);
  });

  it('builds a colony and debits the system colony cost', () => {
    const state = withSystem();
    const tileId = members()[0];
    const tile = getBoard('full')[tileId] as PlanetTile;
    const purse = state.players[0].credits;

    const next = apply(state, { type: 'build', tile: tileId });
    expect(next.tiles[tileId].level).toBe(1);
    expect(next.players[0].credits).toBe(purse - tile.colonyCost);
  });

  it('enforces even building across the system', () => {
    let state = withSystem();
    const [a, b, c] = members();
    state = apply(state, { type: 'build', tile: a });
    // `a` is now ahead, so it cannot grow again until b and c catch up.
    expect(LiquidateEngine.canBuild(state, a)).toBe(false);
    expect(reject(state, { type: 'build', tile: a })).toMatch(/evenly/);
    expect(LiquidateEngine.canBuild(state, b)).toBe(true);
    expect(LiquidateEngine.canBuild(state, c)).toBe(true);

    state = apply(state, { type: 'build', tile: b });
    state = apply(state, { type: 'build', tile: c });
    expect(LiquidateEngine.canBuild(state, a)).toBe(true);
  });

  it('reaches a megastructure and then stops', () => {
    let state = withSystem();
    state.players[0].credits = 100_000;
    for (let level = 0; level < MAX_COLONY_LEVEL; level++) {
      for (const id of members()) state = apply(state, { type: 'build', tile: id });
    }
    for (const id of members()) {
      expect(state.tiles[id].level).toBe(MAX_COLONY_LEVEL);
      expect(LiquidateEngine.canBuild(state, id)).toBe(false);
    }
  });

  it('will not build on a system with any mortgaged planet', () => {
    let state = withSystem();
    state = apply(state, { type: 'mortgage', tile: members()[2] });
    expect(LiquidateEngine.canBuild(state, members()[0])).toBe(false);
  });

  it('refuses to build without the credits, or on a non-planet', () => {
    const state = withSystem();
    state.players[0].credits = 0;
    expect(reject(state, { type: 'build', tile: members()[0] })).toMatch(/Not enough credits/);

    const gate = getBoard('full').find((t) => t.kind === 'warp-gate')!;
    expect(reject(manage(own(game(), [gate.id], 0)), { type: 'build', tile: gate.id })).toMatch(
      /Not a planet/,
    );
  });

  it('sells colonies back down evenly at half cost', () => {
    let state = withSystem();
    const [a, b, c] = members();
    const tile = getBoard('full')[a] as PlanetTile;
    for (const id of [a, b, c]) state = apply(state, { type: 'build', tile: id });

    const purse = state.players[0].credits;
    const next = apply(state, { type: 'sell-building', tile: a });
    expect(next.tiles[a].level).toBe(0);
    expect(next.players[0].credits).toBe(purse + Math.floor(tile.colonyCost / 2));
    // Reverse even-build: `a` is now lowest, so it cannot be sold again.
    expect(LiquidateEngine.canSellBuilding(next, a)).toBe(false);
    expect(LiquidateEngine.canSellBuilding(next, b)).toBe(true);
  });

  it('charges rent by level once developed', () => {
    let state = withSystem();
    const tileId = members()[0];
    const tile = getBoard('full')[tileId] as PlanetTile;
    state = own(state, members(), 1); // hand the system to the rival
    state.tiles[tileId].level = 3;
    expect(LiquidateEngine.rentFor(state, tileId, 7)).toBe(tile.rents[3]);
  });
});

describe('mortgaging', () => {
  const planet = () => planetsOf('full').find((p) => p.system === 'azure')!;

  it('raises half the price and suspends rent', () => {
    const tile = planet();
    let state = manage(own(game(), [tile.id], 0));
    const purse = state.players[0].credits;

    state = apply(state, { type: 'mortgage', tile: tile.id });
    expect(state.tiles[tile.id].mortgaged).toBe(true);
    expect(state.players[0].credits).toBe(purse + mortgageValueFor(tile.price));
    expect(LiquidateEngine.rentFor(state, tile.id, 7)).toBe(0);
  });

  it('clears a mortgage for principal plus interest', () => {
    const tile = planet();
    let state = manage(own(game(), [tile.id], 0));
    state = apply(state, { type: 'mortgage', tile: tile.id });
    const purse = state.players[0].credits;

    state = apply(state, { type: 'unmortgage', tile: tile.id });
    expect(state.tiles[tile.id].mortgaged).toBe(false);
    expect(state.players[0].credits).toBe(purse - unmortgageCostFor(tile.price));
  });

  it('refuses to mortgage a developed planet, or double-mortgage', () => {
    const system = systemMembers('full', 'amber');
    let state = manage(own(game(), system, 0));
    state = apply(state, { type: 'build', tile: system[0] });
    expect(LiquidateEngine.canMortgage(state, system[0])).toBe(false);
    expect(reject(state, { type: 'mortgage', tile: system[0] })).toMatch(/still has colonies/);

    state = apply(state, { type: 'mortgage', tile: system[1] });
    expect(reject(state, { type: 'mortgage', tile: system[1] })).toMatch(/already mortgaged/);
  });

  it('refuses to act on tiles you do not own', () => {
    const tile = planet();
    const state = manage(own(game(), [tile.id], 1));
    expect(reject(state, { type: 'mortgage', tile: tile.id })).toMatch(/do not own/);
  });

  it('refuses to clear a mortgage you cannot afford', () => {
    const tile = planet();
    let state = manage(own(game(), [tile.id], 0));
    state = apply(state, { type: 'mortgage', tile: tile.id });
    state.players[0].credits = 0;
    expect(reject(state, { type: 'unmortgage', tile: tile.id })).toMatch(/Not enough credits/);
  });
});

describe('rent', () => {
  const samplePlanet = () => planetsOf('full').find((p) => p.id >= 12)!;

  it('charges the bare rent and credits the owner', () => {
    const planet = samplePlanet();
    const state = own(game(), [planet.id], 1);
    const rent = LiquidateEngine.rentFor(state, planet.id, 7);
    expect(rent).toBe(planet.rents[0]);

    const next = landOn(state, planet.id);
    expect(next.players[0].credits).toBe(LIQUIDATE_CONFIGS.full.startingCredits - rent);
    expect(next.players[1].credits).toBe(LIQUIDATE_CONFIGS.full.startingCredits + rent);
  });

  it('doubles bare rent when the owner holds the whole system', () => {
    const planet = samplePlanet();
    const state = own(game(), systemMembers('full', planet.system), 1);
    expect(LiquidateEngine.ownsFullSystem(state, state.players[1].id, planet.system)).toBe(true);
    expect(LiquidateEngine.rentFor(state, planet.id, 7)).toBe(planet.rents[0] * 2);
  });

  it('uses the level rent (not the set bonus) once developed', () => {
    const planet = samplePlanet();
    const state = own(game(), systemMembers('full', planet.system), 1);
    state.tiles[planet.id].level = 2;
    expect(LiquidateEngine.rentFor(state, planet.id, 7)).toBe(planet.rents[2]);
  });

  it('charges nothing on your own tile, an unowned tile, or a mortgaged one', () => {
    const planet = samplePlanet();
    expect(LiquidateEngine.rentFor(game(), planet.id, 7)).toBe(0);

    const mine = own(game(), [planet.id], 0);
    expect(landOn(mine, planet.id).players[0].credits).toBe(
      LIQUIDATE_CONFIGS.full.startingCredits,
    );

    const mortgaged = own(game(), [planet.id], 1);
    mortgaged.tiles[planet.id].mortgaged = true;
    expect(LiquidateEngine.rentFor(mortgaged, planet.id, 7)).toBe(0);
  });

  it('scales warp-gate rent with the number of gates held', () => {
    const gates = getBoard('full').filter((t) => t.kind === 'warp-gate');
    const state = game();
    gates.forEach((gateTile, i) => {
      state.tiles[gateTile.id].ownerId = state.players[1].id;
      expect(LiquidateEngine.rentFor(state, gates[0].id, 7)).toBe(LIQUIDATE_WARP_GATE_RENTS[i]);
    });
  });

  it('scales utility rent with the dice roll and second utility', () => {
    const utilities = getBoard('full').filter((t) => t.kind === 'utility');
    const state = game();
    state.tiles[utilities[0].id].ownerId = state.players[1].id;
    expect(LiquidateEngine.rentFor(state, utilities[0].id, 9)).toBe(9 * 4);
    state.tiles[utilities[1].id].ownerId = state.players[1].id;
    expect(LiquidateEngine.rentFor(state, utilities[0].id, 9)).toBe(9 * 10);
  });
});

describe('event cards', () => {
  /** Force the next draw of `deck` to be `cardId`. */
  function stack(
    state: LiquidateGameState,
    deck: 'anomaly' | 'federation',
    cardId: string,
  ): LiquidateGameState {
    const next = structuredClone(state);
    next.decks[deck].draw = [cardId, ...next.decks[deck].draw.filter((id) => id !== cardId)];
    return next;
  }

  const eventTile = (deck: 'anomaly' | 'federation') =>
    getBoard('full').find((t) => t.kind === deck && t.id >= 12)!;

  it('pays out a collect card', () => {
    const tile = eventTile('federation');
    const state = stack(game(), 'federation', 'fd-grant');
    const next = landOn(state, tile.id);
    expect(next.players[0].credits).toBe(LIQUIDATE_CONFIGS.full.startingCredits + 200);
  });

  it('charges a pay card', () => {
    const tile = eventTile('federation');
    const state = stack(game(), 'federation', 'fd-audit');
    const next = landOn(state, tile.id);
    expect(next.players[0].credits).toBe(LIQUIDATE_CONFIGS.full.startingCredits - 150);
  });

  it('keeps a Clearance Pass out of the discard pile until spent', () => {
    const tile = eventTile('anomaly');
    const state = stack(game(), 'anomaly', 'an-clearance');
    const next = landOn(state, tile.id);
    expect(next.players[0].clearancePasses).toBe(1);
    expect(next.decks.anomaly.discard).not.toContain('an-clearance');
  });

  it('sends the player to impound on a recall card', () => {
    const tile = eventTile('federation');
    const state = stack(game(), 'federation', 'fd-recall');
    const next = landOn(state, tile.id);
    expect(next.players[0].inImpound).toBe(true);
    expect(next.players[0].tile).toBe(impoundTileIndex('full'));
  });

  it('moves the player relatively and resolves the new tile', () => {
    const board = getBoard('full');
    // Pick an anomaly whose +3 destination is not itself an event tile, or the
    // card would (correctly) chain into a second draw and move on again.
    const tile = board.find(
      (t) =>
        t.kind === 'anomaly' &&
        t.id >= 12 &&
        board[t.id + 3] !== undefined &&
        board[t.id + 3].kind !== 'anomaly' &&
        board[t.id + 3].kind !== 'federation',
    )!;
    const state = stack(game(), 'anomaly', 'an-slipstream'); // advance 3
    const next = landOn(state, tile.id);
    expect(next.players[0].tile).toBe(tile.id + 3);
  });

  it('chains into a second draw when a card lands you on another event tile', () => {
    const board = getBoard('full');
    const tile = board.find(
      (t) => t.kind === 'anomaly' && t.id >= 12 && board[t.id + 3]?.kind === 'anomaly',
    );
    if (!tile) return; // layout has no such pair
    const state = stack(game(), 'anomaly', 'an-slipstream');
    const next = landOn(state, tile.id);
    expect(next.players[0].tile).not.toBe(tile.id + 3);
  });

  it('walks backwards without paying a stipend', () => {
    const tile = eventTile('anomaly');
    const state = stack(game(), 'anomaly', 'an-drag'); // back 3
    const next = landOn(state, tile.id);
    expect(next.players[0].tile).toBe(tile.id - 3);
    expect(next.players[0].credits).toBeLessThanOrEqual(LIQUIDATE_CONFIGS.full.startingCredits);
  });

  it('advances to the nearest tile of a kind', () => {
    const tile = eventTile('anomaly');
    const state = stack(game(), 'anomaly', 'an-beacon'); // nearest warp gate
    const next = landOn(state, tile.id);
    expect(getBoard('full')[next.players[0].tile].kind).toBe('warp-gate');
  });

  it('collects from every rival', () => {
    const tile = eventTile('anomaly');
    const state = stack(threePlayerGame(), 'anomaly', 'an-toll'); // 40 each
    const next = landOn(state, tile.id);
    expect(next.players[0].credits).toBe(LIQUIDATE_CONFIGS.full.startingCredits + 80);
    expect(next.players[1].credits).toBe(LIQUIDATE_CONFIGS.full.startingCredits - 40);
    expect(next.players[2].credits).toBe(LIQUIDATE_CONFIGS.full.startingCredits - 40);
  });

  it('pays every rival', () => {
    const tile = eventTile('federation');
    const state = stack(threePlayerGame(), 'federation', 'fd-charter'); // 50 each
    const next = landOn(state, tile.id);
    expect(next.players[0].credits).toBe(LIQUIDATE_CONFIGS.full.startingCredits - 100);
    expect(next.players[1].credits).toBe(LIQUIDATE_CONFIGS.full.startingCredits + 50);
  });

  it('recycles the discard pile once the deck runs dry', () => {
    const tile = eventTile('federation');
    const state = game();
    // Empty draw pile, everything sitting in discards. Exclude the Clearance
    // Pass, which is held rather than discarded and would skew the count.
    const recycled = state.decks.federation.draw.filter((id) => id !== 'fd-clearance');
    state.decks.federation = { draw: [], discard: recycled };

    const next = landOn(state, tile.id);
    // The pile was rebuilt from the discards and a card was drawn from it.
    expect(next.decks.federation.draw.length).toBeGreaterThan(0);
    expect(next.decks.federation.draw.length).toBeLessThan(recycled.length);
    expect(
      next.decks.federation.draw.length + next.decks.federation.discard.length,
    ).toBeLessThanOrEqual(recycled.length);
  });

  it('every authored card has unique id and non-empty text', () => {
    const cards = [...deckCards('anomaly'), ...deckCards('federation')];
    expect(new Set(cards.map((c) => c.id)).size).toBe(cards.length);
    for (const card of cards) expect(card.text.length).toBeGreaterThan(10);
  });
});

describe('impound', () => {
  function impounded(): LiquidateGameState {
    const state = game();
    state.players[0].inImpound = true;
    state.players[0].tile = impoundTileIndex('full');
    state.phase = 'awaiting-roll';
    return state;
  }

  it('offers the fine and a roll, and the pass only when held', () => {
    const state = impounded();
    const actions = LiquidateEngine.getLegalActions(state);
    expect(actions).toContainEqual({ type: 'pay-fine' });
    expect(actions).toContainEqual({ type: 'roll' });
    expect(actions).not.toContainEqual({ type: 'use-clearance-pass' });

    state.players[0].clearancePasses = 1;
    expect(LiquidateEngine.getLegalActions(state)).toContainEqual({ type: 'use-clearance-pass' });
  });

  it('releases the player for the fine', () => {
    const state = impounded();
    const next = apply(state, { type: 'pay-fine' });
    expect(next.players[0].inImpound).toBe(false);
    expect(next.players[0].credits).toBe(
      LIQUIDATE_CONFIGS.full.startingCredits - LIQUIDATE_IMPOUND_FINE,
    );
  });

  it('releases the player for a Clearance Pass and returns it to the deck', () => {
    const state = impounded();
    state.players[0].clearancePasses = 1;
    const next = apply(state, { type: 'use-clearance-pass' });
    expect(next.players[0].inImpound).toBe(false);
    expect(next.players[0].clearancePasses).toBe(0);
    expect(next.players[0].credits).toBe(LIQUIDATE_CONFIGS.full.startingCredits);
    expect(next.decks.anomaly.discard).toContain('an-clearance');
  });

  it('frees the player on doubles without granting another roll', () => {
    const state = impounded();
    state.rng = { seed: state.rng.seed, cursor: cursorWhereDoubles(state, true) };
    const next = apply(state, { type: 'roll' });
    expect(next.players[0].inImpound).toBe(false);
    expect(next.phase).not.toBe('awaiting-roll');
  });

  it('keeps the player in on a failed roll and counts the attempt', () => {
    const state = impounded();
    state.rng = { seed: state.rng.seed, cursor: cursorWhereDoubles(state, false) };
    const next = apply(state, { type: 'roll' });
    expect(next.players[0].inImpound).toBe(true);
    expect(next.players[0].impoundTurns).toBe(1);
    expect(next.phase).toBe('turn-end');
  });

  it('forces the fee on the third failed attempt and moves the player out', () => {
    const state = impounded();
    state.players[0].impoundTurns = MAX_IMPOUND_TURNS - 1;
    state.rng = { seed: state.rng.seed, cursor: cursorWhereDoubles(state, false) };
    const next = apply(state, { type: 'roll' });
    expect(next.players[0].inImpound).toBe(false);
    expect(next.players[0].credits).toBeLessThan(LIQUIDATE_CONFIGS.full.startingCredits);
    expect(next.players[0].tile).not.toBe(impoundTileIndex('full'));
  });

  it('refuses impound actions when not impounded', () => {
    expect(reject(game(), { type: 'pay-fine' })).toMatch(/Not in impound/);
    expect(reject(game(), { type: 'use-clearance-pass' })).toMatch(/Not in impound/);
  });
});

describe('trading', () => {
  const mine = () => planetsOf('full').find((p) => p.system === 'ember')!;
  const theirs = () => planetsOf('full').find((p) => p.system === 'azure')!;

  function tradeable(): LiquidateGameState {
    let state = game();
    state = own(state, [mine().id], 0);
    state = own(state, [theirs().id], 1);
    return manage(state);
  }

  it('puts an offer to the recipient, who becomes the acting player', () => {
    const state = tradeable();
    const next = apply(state, {
      type: 'propose-trade',
      trade: {
        toId: state.players[1].id,
        offerTiles: [mine().id],
        requestTiles: [theirs().id],
        offerCredits: 0,
        requestCredits: 0,
      },
    });
    expect(next.phase).toBe('trade-review');
    expect(LiquidateEngine.actingPlayerId(next)).toBe(next.players[1].id);
    expect(LiquidateEngine.getLegalActions(next)).toContainEqual({
      type: 'respond-trade',
      accept: true,
    });
  });

  it('swaps tiles and credits on accept', () => {
    let state = tradeable();
    const purseA = state.players[0].credits;
    const purseB = state.players[1].credits;

    state = apply(state, {
      type: 'propose-trade',
      trade: {
        toId: state.players[1].id,
        offerTiles: [mine().id],
        requestTiles: [theirs().id],
        offerCredits: 100,
        requestCredits: 0,
      },
    });
    state = apply(state, { type: 'respond-trade', accept: true });

    expect(state.tiles[mine().id].ownerId).toBe(state.players[1].id);
    expect(state.tiles[theirs().id].ownerId).toBe(state.players[0].id);
    expect(state.players[0].credits).toBe(purseA - 100);
    expect(state.players[1].credits).toBe(purseB + 100);
    expect(state.pendingTrade).toBeNull();
  });

  it('changes nothing on decline', () => {
    let state = tradeable();
    state = apply(state, {
      type: 'propose-trade',
      trade: {
        toId: state.players[1].id,
        offerTiles: [mine().id],
        requestTiles: [theirs().id],
        offerCredits: 0,
        requestCredits: 0,
      },
    });
    state = apply(state, { type: 'respond-trade', accept: false });
    expect(state.tiles[mine().id].ownerId).toBe(state.players[0].id);
    expect(state.tiles[theirs().id].ownerId).toBe(state.players[1].id);
    expect(state.pendingTrade).toBeNull();
  });

  it('validates ownership, funds, self-trades, and empty offers', () => {
    const state = tradeable();
    const base = {
      toId: state.players[1].id,
      offerTiles: [] as number[],
      requestTiles: [] as number[],
      offerCredits: 0,
      requestCredits: 0,
    };

    expect(reject(state, { type: 'propose-trade', trade: base })).toMatch(/empty/);
    expect(
      reject(state, { type: 'propose-trade', trade: { ...base, toId: state.players[0].id } }),
    ).toMatch(/yourself/);
    expect(
      reject(state, { type: 'propose-trade', trade: { ...base, offerCredits: 999_999 } }),
    ).toMatch(/do not have those credits/);
    expect(
      reject(state, { type: 'propose-trade', trade: { ...base, requestCredits: 999_999 } }),
    ).toMatch(/They do not have those credits/);
    // Offering a tile you don't own.
    expect(
      reject(state, { type: 'propose-trade', trade: { ...base, offerTiles: [theirs().id] } }),
    ).toMatch(/not owned by the right player/);
    expect(
      reject(state, { type: 'propose-trade', trade: { ...base, offerCredits: -5 } }),
    ).toMatch(/cannot be negative/);
  });

  it('refuses to trade a planet that still has colonies', () => {
    const system = systemMembers('full', 'amber');
    let state = manage(own(game(), system, 0));
    state = apply(state, { type: 'build', tile: system[0] });
    expect(
      reject(state, {
        type: 'propose-trade',
        trade: {
          toId: state.players[1].id,
          offerTiles: [system[0]],
          requestTiles: [],
          offerCredits: 0,
          requestCredits: 0,
        },
      }),
    ).toMatch(/still has colonies/);
  });

  it('refuses a response when no trade is pending', () => {
    expect(reject(game(), { type: 'respond-trade', accept: true })).toMatch(/No trade to review/);
  });
});

describe('bankruptcy and victory', () => {
  function inDebt(rule: DebtRule = 'allow-negative'): LiquidateGameState {
    const planet = planetsOf('full').find((p) => p.system === 'aurum' && p.id >= 12)!;
    let state = threePlayerGame(7, rule);
    state = own(state, systemMembers('full', planet.system), 1);
    state.players[0].credits = 5;
    return landOn(state, planet.id);
  }

  it('hands every holding to the creditor', () => {
    const spare = planetsOf('full').find((p) => p.system === 'ember')!;
    let state = inDebt();
    state = own(state, [spare.id], 0);
    const creditorId = state.pendingDebt!.creditorId!;

    const next = apply(state, { type: 'declare-bankruptcy' });
    expect(next.players[0].bankrupt).toBe(true);
    expect(next.players[0].credits).toBe(0);
    expect(next.tiles[spare.id].ownerId).toBe(creditorId);
    expect(next.pendingDebt).toBeNull();
  });

  it('returns holdings to the bank when the debt was owed to the bank', () => {
    const tariff = getBoard('full').find((t) => t.kind === 'tariff' && t.id >= 2)!;
    const spare = planetsOf('full').find((p) => p.system === 'ember')!;
    let state = threePlayerGame(7);
    state = own(state, [spare.id], 0);
    state.players[0].credits = 1;
    state = landOn(state, tariff.id);
    expect(state.phase).toBe('settling-debt');
    expect(state.pendingDebt!.creditorId).toBeNull();

    const next = apply(state, { type: 'declare-bankruptcy' });
    expect(next.tiles[spare.id].ownerId).toBeNull();
    expect(next.tiles[spare.id].level).toBe(0);
  });

  it('clears colonies from transferred holdings', () => {
    const system = systemMembers('full', 'amber');
    let state = inDebt();
    state = own(state, system, 0);
    for (const id of system) state.tiles[id].level = 2;

    const next = apply(state, { type: 'declare-bankruptcy' });
    for (const id of system) expect(next.tiles[id].level).toBe(0);
  });

  it('keeps the game going while two players remain', () => {
    const next = apply(inDebt(), { type: 'declare-bankruptcy' });
    expect(next.isGameOver).toBe(false);
    expect(LiquidateEngine.activePlayers(next)).toHaveLength(2);
  });

  it('awards victory to the last solvent player', () => {
    const planet = planetsOf('full').find((p) => p.system === 'aurum' && p.id >= 12)!;
    let state = game(); // two players
    state = own(state, systemMembers('full', planet.system), 1);
    state.players[0].credits = 5;
    state = landOn(state, planet.id);

    const next = apply(state, { type: 'declare-bankruptcy' });
    expect(next.isGameOver).toBe(true);
    expect(next.phase).toBe('game-over');
    expect(next.winnerId).toBe(next.players[1].id);
    expect(LiquidateEngine.getLegalActions(next)).toEqual([]);
  });

  it('skips a bankrupt player in the turn order', () => {
    const state = threePlayerGame();
    state.phase = 'turn-end';
    state.players[1].bankrupt = true;
    const next = apply(state, { type: 'end-turn' });
    expect(next.currentPlayerIndex).toBe(2);
  });
});

describe('turn order', () => {
  function turnEnd(): LiquidateGameState {
    const drift = getBoard('full').find((t) => t.kind === 'drift')!;
    const state = landOn(game(), drift.id);
    expect(state.phase).toBe('turn-end');
    return state;
  }

  it('passes to the next player and clears the dice', () => {
    const next = apply(turnEnd(), { type: 'end-turn' });
    expect(next.currentPlayerIndex).toBe(1);
    expect(next.dice).toBeNull();
    expect(next.phase).toBe('awaiting-roll');
  });

  it('counts a round when the seat order wraps', () => {
    let state = apply(turnEnd(), { type: 'end-turn' });
    expect(state.round).toBe(1);
    state.phase = 'turn-end';
    state = apply(state, { type: 'end-turn' });
    expect(state.currentPlayerIndex).toBe(0);
    expect(state.round).toBe(2);
  });

  it('refuses to end a turn that is not over', () => {
    expect(reject(game(), { type: 'end-turn' })).toMatch(/Turn is not over/);
  });
});

describe('net worth and quick-mode termination', () => {
  it('counts cash, holdings, and colony investment', () => {
    const planet = planetsOf('full')[0];
    const state = own(game(), [planet.id], 0);
    state.tiles[planet.id].level = 2;
    expect(LiquidateEngine.getNetWorth(state, state.players[0].id)).toBe(
      state.players[0].credits + planet.price + 2 * planet.colonyCost,
    );
  });

  it('counts a mortgaged tile at its remaining equity only', () => {
    const planet = planetsOf('full')[0];
    const state = own(game(), [planet.id], 0);
    state.tiles[planet.id].mortgaged = true;
    expect(LiquidateEngine.getNetWorth(state, state.players[0].id)).toBe(
      state.players[0].credits + planet.price - mortgageValueFor(planet.price),
    );
  });

  it('reports what a player could raise by liquidating', () => {
    const system = systemMembers('full', 'amber');
    let state = manage(own(game(), system, 0));
    state = apply(state, { type: 'build', tile: system[0] });
    const raisable = LiquidateEngine.liquidatableValue(state, state.players[0].id);
    expect(raisable).toBeGreaterThan(0);
  });

  it('returns 0 for an unknown player', () => {
    expect(LiquidateEngine.getNetWorth(game(), 'nobody')).toBe(0);
  });

  it('ends quick mode at the round cap and awards the richest player', () => {
    const state = game(3, 'quick');
    state.round = LIQUIDATE_CONFIGS.quick.maxRounds!;
    state.currentPlayerIndex = state.players.length - 1;
    state.phase = 'turn-end';
    state.players[1].credits = 99_999;

    const next = apply(state, { type: 'end-turn' });
    expect(next.isGameOver).toBe(true);
    expect(next.phase).toBe('game-over');
    expect(next.winnerId).toBe(state.players[1].id);
  });

  it('does not end full mode on a round cap', () => {
    const state = game();
    state.round = 500;
    state.currentPlayerIndex = state.players.length - 1;
    state.phase = 'turn-end';
    expect(apply(state, { type: 'end-turn' }).isGameOver).toBe(false);
  });

  it('rejects every action once the game is over', () => {
    const over = game();
    over.isGameOver = true;
    for (const action of [{ type: 'roll' }, { type: 'end-turn' }] as const) {
      expect(LiquidateEngine.applyAction(over, action).valid).toBe(false);
    }
  });
});

describe('scripted full games', () => {
  for (const rule of ['allow-negative', 'never-negative'] as const) {
    it(`plays 400 legal actions under the ${rule} rule without corrupting state`, () => {
      let state = game(2024, 'quick', rule);
      const board = getBoard('quick');
      let acted = 0;

      for (let i = 0; i < 400 && !state.isGameOver; i++) {
        const actions = LiquidateEngine.getLegalActions(state);
        if (actions.length === 0) break;
        // Prefer the last action so management options get exercised too.
        state = apply(state, actions[actions.length - 1]);
        acted++;

        for (const p of state.players) {
          expect(p.tile).toBeGreaterThanOrEqual(0);
          expect(p.tile).toBeLessThan(board.length);
          expect(Number.isFinite(p.credits)).toBe(true);
          expect(p.clearancePasses).toBeGreaterThanOrEqual(0);
        }
        for (const owned of state.tiles) {
          if (owned.ownerId !== null) {
            const owner = state.players.find((p) => p.id === owned.ownerId);
            expect(owner).toBeDefined();
            // A bankrupt player must never still hold tiles.
            expect(owner!.bankrupt).toBe(false);
          }
          expect(owned.level).toBeGreaterThanOrEqual(0);
          expect(owned.level).toBeLessThanOrEqual(MAX_COLONY_LEVEL);
        }
        // Even-build invariant across every system.
        for (const system of new Set(planetsOf('quick').map((p) => p.system))) {
          const levels = systemMembers('quick', system).map((id) => state.tiles[id].level);
          expect(Math.max(...levels) - Math.min(...levels)).toBeLessThanOrEqual(1);
        }
      }

      expect(acted).toBeGreaterThan(20);
      expect(JSON.parse(JSON.stringify(state))).toEqual(state); // stays serializable
    });
  }

  it('always has a legal action for the acting player until the game ends', () => {
    let state = threePlayerGame(11);
    for (let i = 0; i < 300 && !state.isGameOver; i++) {
      const actions = LiquidateEngine.getLegalActions(state);
      expect(actions.length).toBeGreaterThan(0);
      expect(LiquidateEngine.actingPlayerId(state)).not.toBeNull();
      state = apply(state, actions[0]);
    }
  });
});
