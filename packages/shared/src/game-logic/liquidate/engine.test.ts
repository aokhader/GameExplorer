import { describe, it, expect } from 'vitest';
import { rollDice } from '../../utils/rng';
import { LiquidateEngine } from './engine';
import { getBoard, impoundTileIndex, systemMembers } from './board';
import {
  LIQUIDATE_CONFIGS,
  LIQUIDATE_WARP_GATE_RENTS,
  baseRentFor,
  colonyCostFor,
  mortgageValueFor,
  rentTableFor,
  unmortgageCostFor,
} from './economy';
import type { LiquidateGameState, PlanetTile, StarSystem } from './types';
import { isOwnable } from './types';

/** A deterministic two-player game. */
function game(seed = 1, mode: 'full' | 'quick' = 'full'): LiquidateGameState {
  return LiquidateEngine.newGame({
    players: [{ name: 'Ada' }, { name: 'Bo', isBot: true }],
    mode,
    seed,
  });
}

/** Force a player onto a tile and set the phase so `roll` is legal. */
function at(state: LiquidateGameState, tile: number): LiquidateGameState {
  const next = structuredClone(state);
  next.players[next.currentPlayerIndex].tile = tile;
  next.phase = 'awaiting-roll';
  return next;
}

/** Apply an action, asserting it was legal, and return the new state. */
function apply(
  state: LiquidateGameState,
  action: Parameters<typeof LiquidateEngine.applyAction>[1],
): LiquidateGameState {
  const result = LiquidateEngine.applyAction(state, action);
  expect(result.reason).toBeUndefined();
  expect(result.valid).toBe(true);
  return result.resultingState!;
}

function planetsOf(mode: 'full' | 'quick'): PlanetTile[] {
  return getBoard(mode).filter((t): t is PlanetTile => t.kind === 'planet');
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
    expect(kinds).toContain('warp-gate');
    expect(kinds).toContain('utility');
    expect(kinds).toContain('tariff');
    expect(kinds).toContain('anomaly');
    expect(kinds).toContain('federation');
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

  it('mortgages at half price and charges interest to clear', () => {
    expect(mortgageValueFor(200)).toBe(100);
    expect(unmortgageCostFor(200)).toBe(110);
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

  it('marks bot seats and assigns stable ids', () => {
    const state = game();
    expect(state.players.map((p) => p.id)).toEqual(['p1', 'p2']);
    expect(state.players[1].isBot).toBe(true);
  });

  it('supports 2 to 6 players and rejects anything else', () => {
    const seats = (n: number) => Array.from({ length: n }, (_, i) => ({ name: `P${i}` }));
    expect(() => LiquidateEngine.newGame({ players: seats(2) })).not.toThrow();
    expect(() => LiquidateEngine.newGame({ players: seats(6) })).not.toThrow();
    expect(() => LiquidateEngine.newGame({ players: seats(1) })).toThrow(/2–6 players/);
    expect(() => LiquidateEngine.newGame({ players: seats(7) })).toThrow(/2–6 players/);
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

describe('rolling and movement', () => {
  it('advances by the dice total and records the roll', () => {
    const state = apply(game(), { type: 'roll' });
    const [a, b] = state.dice!;
    expect(a).toBeGreaterThanOrEqual(1);
    expect(b).toBeLessThanOrEqual(6);
    expect(state.players[0].tile).toBe(a + b);
  });

  it('never mutates the state passed in', () => {
    const before = game();
    const snapshot = structuredClone(before);
    LiquidateEngine.applyAction(before, { type: 'roll' });
    expect(before).toEqual(snapshot);
  });

  it('wraps the loop and pays the stipend for passing Home Station', () => {
    const size = getBoard('full').length;
    const start = at(game(), size - 3); // any roll of 3+ wraps
    const purse = start.players[0].credits;
    const next = apply(start, { type: 'roll' });
    const total = next.dice![0] + next.dice![1];

    expect(next.players[0].tile).toBe((size - 3 + total) % size);
    expect(next.players[0].credits).toBe(purse + LIQUIDATE_CONFIGS.full.stipend);
  });

  it('does not pay a stipend on a roll that stays on the loop', () => {
    const start = at(game(), 1);
    const next = apply(start, { type: 'roll' });
    expect(next.players[0].credits).toBe(LIQUIDATE_CONFIGS.full.startingCredits);
  });

  it('rejects a roll when the game is waiting on a buy decision', () => {
    // Land on tile 1 (a planet) by seeking a seed that lands there.
    const state = findBuyDecision();
    const result = LiquidateEngine.applyAction(state, { type: 'roll' });
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/Not waiting for a roll/);
  });
});

describe('doubles', () => {
  /** Find a seed whose first roll is doubles, and one whose first roll is not. */
  function seedWhere(doubles: boolean): number {
    for (let seed = 0; seed < 400; seed++) {
      const s = apply(game(seed), { type: 'roll' });
      if ((s.dice![0] === s.dice![1]) === doubles) return seed;
    }
    throw new Error('no suitable seed');
  }

  it('lets a player roll again after doubles', () => {
    const state = apply(game(seedWhere(true)), { type: 'roll' });
    expect(state.doublesCount).toBe(1);
    // Landing resolved into another roll rather than the end of the turn.
    if (state.phase === 'awaiting-roll') {
      expect(LiquidateEngine.getLegalActions(state)).toEqual([{ type: 'roll' }]);
    } else {
      // Landed on an unowned tile: decide first, then roll again.
      expect(state.phase).toBe('buy-decision');
      const after = apply(state, { type: 'decline' });
      expect(after.phase).toBe('awaiting-roll');
      expect(after.currentPlayerIndex).toBe(0);
    }
  });

  it('ends the turn when the roll is not doubles', () => {
    const state = apply(game(seedWhere(false)), { type: 'roll' });
    expect(state.doublesCount).toBe(0);
    expect(['turn-end', 'buy-decision']).toContain(state.phase);
  });

  it('sends a player to impound on the third consecutive double', () => {
    let state = game();
    // Drive the state machine directly: three doubles in a row.
    state = structuredClone(state);
    state.doublesCount = 2;
    state.players[0].tile = 5;
    // Find a seed-position whose next roll is doubles by scanning the rng cursor.
    let found = false;
    for (let cursor = 0; cursor < 400 && !found; cursor++) {
      const attempt = structuredClone(state);
      attempt.rng = { seed: attempt.rng.seed, cursor };
      const next = apply(attempt, { type: 'roll' });
      if (next.players[0].inImpound) {
        expect(next.players[0].tile).toBe(impoundTileIndex('full'));
        expect(next.phase).toBe('turn-end');
        expect(next.doublesCount).toBe(0);
        found = true;
      }
    }
    expect(found).toBe(true);
  });
});

describe('buying', () => {
  it('offers a buy decision on an unowned tile', () => {
    const state = findBuyDecision();
    const tile = getBoard('full')[state.pendingPurchase!];
    expect(isOwnable(tile)).toBe(true);
    expect(LiquidateEngine.getLegalActions(state)).toContainEqual({ type: 'buy' });
    expect(LiquidateEngine.getLegalActions(state)).toContainEqual({ type: 'decline' });
  });

  it('transfers the tile and debits the price', () => {
    const state = findBuyDecision();
    const tile = getBoard('full')[state.pendingPurchase!];
    const purse = state.players[state.currentPlayerIndex].credits;
    const player = state.players[state.currentPlayerIndex].id;

    const next = apply(state, { type: 'buy' });
    expect(next.tiles[tile.id].ownerId).toBe(player);
    expect(next.players[next.players.findIndex((p) => p.id === player)].credits).toBe(
      purse - (isOwnable(tile) ? tile.price : 0),
    );
    expect(next.pendingPurchase).toBeNull();
  });

  it('leaves the tile unowned when declined', () => {
    const state = findBuyDecision();
    const tileId = state.pendingPurchase!;
    const next = apply(state, { type: 'decline' });
    expect(next.tiles[tileId].ownerId).toBeNull();
    expect(next.pendingPurchase).toBeNull();
  });

  it('refuses a purchase the player cannot afford', () => {
    const state = findBuyDecision();
    const broke = structuredClone(state);
    broke.players[broke.currentPlayerIndex].credits = 0;
    expect(LiquidateEngine.getLegalActions(broke)).not.toContainEqual({ type: 'buy' });
    const result = LiquidateEngine.applyAction(broke, { type: 'buy' });
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/Not enough credits/);
  });

  it('refuses buying when nothing is for sale', () => {
    const result = LiquidateEngine.applyAction(game(), { type: 'buy' });
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/Nothing is for sale/);
  });
});

describe('rent', () => {
  /** Give `ownerId` a tile, then place the other player on it. */
  function rentSetup(tileId: number, ownerIndex = 1): LiquidateGameState {
    const state = structuredClone(game());
    state.tiles[tileId].ownerId = state.players[ownerIndex].id;
    return state;
  }

  /**
   * A planet far enough along the loop that a player can always be placed
   * behind it without wrapping past Home Station (see `applyLandingOn`).
   */
  const samplePlanet = () => planetsOf('full').find((p) => p.id >= 12)!;

  it('charges the bare rent and credits the owner', () => {
    const planet = samplePlanet();
    const state = rentSetup(planet.id);
    const rent = LiquidateEngine.rentFor(state, planet.id, 7);
    expect(rent).toBe(planet.rents[0]);

    // Walk the payer onto it and confirm the transfer.
    const landed = at(state, planet.id);
    const payer = landed.players[0];
    const owner = landed.players[1];
    const before = { payer: payer.credits, owner: owner.credits };
    const next = applyLandingOn(landed, planet.id);
    expect(next.players[0].credits).toBe(before.payer - rent);
    expect(next.players[1].credits).toBe(before.owner + rent);
  });

  it('doubles bare rent when the owner holds the whole system', () => {
    const planet = samplePlanet();
    const state = structuredClone(game());
    for (const id of systemMembers('full', planet.system)) {
      state.tiles[id].ownerId = state.players[1].id;
    }
    expect(LiquidateEngine.ownsFullSystem(state, state.players[1].id, planet.system)).toBe(true);
    expect(LiquidateEngine.rentFor(state, planet.id, 7)).toBe(planet.rents[0] * 2);
  });

  it('uses the level rent (not the set bonus) once developed', () => {
    const planet = samplePlanet();
    const state = structuredClone(game());
    for (const id of systemMembers('full', planet.system)) {
      state.tiles[id].ownerId = state.players[1].id;
    }
    state.tiles[planet.id].level = 2;
    expect(LiquidateEngine.rentFor(state, planet.id, 7)).toBe(planet.rents[2]);
  });

  it('charges nothing on your own tile, an unowned tile, or a mortgaged one', () => {
    const planet = samplePlanet();
    const unowned = game();
    expect(LiquidateEngine.rentFor(unowned, planet.id, 7)).toBe(0);

    const mine = rentSetup(planet.id, 0);
    const landed = at(mine, planet.id);
    const before = landed.players[0].credits;
    expect(applyLandingOn(landed, planet.id).players[0].credits).toBe(before);

    const mortgaged = rentSetup(planet.id);
    mortgaged.tiles[planet.id].mortgaged = true;
    expect(LiquidateEngine.rentFor(mortgaged, planet.id, 7)).toBe(0);
  });

  it('scales warp-gate rent with the number of gates held', () => {
    const gates = getBoard('full').filter((t) => t.kind === 'warp-gate');
    const state = structuredClone(game());
    const owner = state.players[1].id;

    gates.forEach((gateTile, i) => {
      state.tiles[gateTile.id].ownerId = owner;
      expect(LiquidateEngine.rentFor(state, gates[0].id, 7)).toBe(LIQUIDATE_WARP_GATE_RENTS[i]);
    });
  });

  it('scales utility rent with the dice roll and second utility', () => {
    const utilities = getBoard('full').filter((t) => t.kind === 'utility');
    const state = structuredClone(game());
    const owner = state.players[1].id;

    state.tiles[utilities[0].id].ownerId = owner;
    expect(LiquidateEngine.rentFor(state, utilities[0].id, 9)).toBe(9 * 4);

    state.tiles[utilities[1].id].ownerId = owner;
    expect(LiquidateEngine.rentFor(state, utilities[0].id, 9)).toBe(9 * 10);
  });

  it('lets a debt drive credits negative for M2 to settle', () => {
    const planet = planetsOf('full').find((p) => p.system === 'aurum')!;
    const state = structuredClone(game());
    state.tiles[planet.id].ownerId = state.players[1].id;
    for (const id of systemMembers('full', planet.system)) {
      state.tiles[id].ownerId = state.players[1].id;
    }
    state.players[0].credits = 1;

    const next = applyLandingOn(at(state, planet.id), planet.id);
    expect(next.players[0].credits).toBeLessThan(0);
  });
});

describe('tariffs and corners', () => {
  it('debits a tariff to the bank', () => {
    const tariff = getBoard('full').find((t) => t.kind === 'tariff')!;
    const state = at(game(), tariff.id);
    const before = state.players[0].credits;
    const next = applyLandingOn(state, tariff.id);
    expect(next.players[0].credits).toBe(
      before - (tariff.kind === 'tariff' ? tariff.amount : 0),
    );
  });

  it('impounds a player who lands on Contraband Scan', () => {
    const scan = getBoard('full').find((t) => t.kind === 'contraband-scan')!;
    const next = applyLandingOn(at(game(), scan.id), scan.id);
    expect(next.players[0].tile).toBe(impoundTileIndex('full'));
    expect(next.players[0].inImpound).toBe(true);
    expect(next.phase).toBe('turn-end');
  });

  it('treats Drift and Impound as inert when merely landed on', () => {
    for (const kind of ['drift', 'impound'] as const) {
      const tile = getBoard('full').find((t) => t.kind === kind)!;
      const next = applyLandingOn(at(game(), tile.id), tile.id);
      expect(next.players[0].credits).toBe(LIQUIDATE_CONFIGS.full.startingCredits);
      expect(next.players[0].inImpound).toBe(false);
    }
  });
});

describe('turn order', () => {
  it('passes to the next player and clears the dice', () => {
    let state = findTurnEnd();
    expect(state.currentPlayerIndex).toBe(0);
    state = apply(state, { type: 'end-turn' });
    expect(state.currentPlayerIndex).toBe(1);
    expect(state.dice).toBeNull();
    expect(state.phase).toBe('awaiting-roll');
  });

  it('counts a round when the seat order wraps', () => {
    let state = findTurnEnd();
    state = apply(state, { type: 'end-turn' }); // → p2, still round 1
    expect(state.round).toBe(1);
    state.phase = 'turn-end';
    state = apply(state, { type: 'end-turn' }); // wraps → p1, round 2
    expect(state.currentPlayerIndex).toBe(0);
    expect(state.round).toBe(2);
  });

  it('skips bankrupt players', () => {
    const state = findTurnEnd();
    const withThree = LiquidateEngine.newGame({
      players: [{ name: 'A' }, { name: 'B' }, { name: 'C' }],
      seed: 5,
    });
    const staged = structuredClone(withThree);
    staged.phase = 'turn-end';
    staged.players[1].bankrupt = true;
    const next = apply(staged, { type: 'end-turn' });
    expect(next.currentPlayerIndex).toBe(2);
    expect(state.players).toHaveLength(2); // sanity: original untouched
  });

  it('refuses to end a turn that is not over', () => {
    const result = LiquidateEngine.applyAction(game(), { type: 'end-turn' });
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/Turn is not over/);
  });
});

describe('net worth and quick-mode termination', () => {
  it('counts cash, holdings, and colony investment', () => {
    const planet = planetsOf('full')[0];
    const state = structuredClone(game());
    const id = state.players[0].id;
    state.tiles[planet.id].ownerId = id;
    state.tiles[planet.id].level = 2;

    expect(LiquidateEngine.getNetWorth(state, id)).toBe(
      state.players[0].credits + planet.price + 2 * planet.colonyCost,
    );
  });

  it('counts a mortgaged tile at its remaining equity only', () => {
    const planet = planetsOf('full')[0];
    const state = structuredClone(game());
    const id = state.players[0].id;
    state.tiles[planet.id].ownerId = id;
    state.tiles[planet.id].mortgaged = true;

    expect(LiquidateEngine.getNetWorth(state, id)).toBe(
      state.players[0].credits + planet.price - mortgageValueFor(planet.price),
    );
  });

  it('returns 0 for an unknown player', () => {
    expect(LiquidateEngine.getNetWorth(game(), 'nobody')).toBe(0);
  });

  it('ends quick mode at the round cap and awards the richest player', () => {
    const state = structuredClone(game(3, 'quick'));
    state.round = LIQUIDATE_CONFIGS.quick.maxRounds!;
    state.currentPlayerIndex = state.players.length - 1; // ending this turn wraps
    state.phase = 'turn-end';
    state.players[1].credits = 99_999;

    const next = apply(state, { type: 'end-turn' });
    expect(next.isGameOver).toBe(true);
    expect(next.phase).toBe('game-over');
    expect(next.winnerId).toBe(state.players[1].id);
    expect(LiquidateEngine.getLegalActions(next)).toEqual([]);
  });

  it('does not end full mode on a round cap', () => {
    const state = structuredClone(game());
    state.round = 500;
    state.currentPlayerIndex = state.players.length - 1;
    state.phase = 'turn-end';
    const next = apply(state, { type: 'end-turn' });
    expect(next.isGameOver).toBe(false);
  });

  it('rejects every action once the game is over', () => {
    const over = structuredClone(game());
    over.isGameOver = true;
    for (const action of [{ type: 'roll' }, { type: 'end-turn' }] as const) {
      expect(LiquidateEngine.applyAction(over, action).valid).toBe(false);
    }
  });
});

describe('a full scripted game loop', () => {
  it('plays 60 legal actions without corrupting state', () => {
    let state = game(2024, 'quick');
    const board = getBoard('quick');

    for (let i = 0; i < 60 && !state.isGameOver; i++) {
      const actions = LiquidateEngine.getLegalActions(state);
      expect(actions.length).toBeGreaterThan(0);
      state = apply(state, actions[0]);

      // Invariants that must hold after every single action.
      for (const p of state.players) {
        expect(p.tile).toBeGreaterThanOrEqual(0);
        expect(p.tile).toBeLessThan(board.length);
        expect(Number.isFinite(p.credits)).toBe(true);
      }
      expect(state.tiles).toHaveLength(board.length);
      for (const owned of state.tiles) {
        if (owned.ownerId !== null) {
          expect(state.players.some((p) => p.id === owned.ownerId)).toBe(true);
        }
      }
      expect(state.rng.cursor).toBeGreaterThanOrEqual(0);
    }

    expect(state.log.length).toBeGreaterThan(0);
    expect(JSON.parse(JSON.stringify(state))).toEqual(state); // stays serializable
  });
});

// ---------------------------------------------------------------------------
// helpers that need the engine
// ---------------------------------------------------------------------------

/** Roll from a seed until the current player faces a buy decision. */
function findBuyDecision(): LiquidateGameState {
  for (let seed = 0; seed < 400; seed++) {
    const next = apply(game(seed), { type: 'roll' });
    if (next.phase === 'buy-decision') return next;
  }
  throw new Error('no seed produced a buy decision');
}

/** Roll from a seed until the current player's turn is over. */
function findTurnEnd(): LiquidateGameState {
  for (let seed = 0; seed < 400; seed++) {
    let next = apply(game(seed), { type: 'roll' });
    if (next.phase === 'buy-decision') next = apply(next, { type: 'decline' });
    if (next.phase === 'turn-end' && next.currentPlayerIndex === 0) return next;
  }
  throw new Error('no seed produced a turn end');
}

/**
 * Roll the current player onto `tileId` through the real engine.
 *
 * Peeks at what each rng cursor will roll, then places the player exactly that
 * many steps short. Cursors that would need the player to start "before" tile 0
 * are skipped, so the move **never wraps the board** and no stipend is paid —
 * which keeps credit assertions about rent and fees exact. Requires
 * `tileId >= 2` (the minimum dice total).
 */
function applyLandingOn(state: LiquidateGameState, tileId: number): LiquidateGameState {
  for (let cursor = 0; cursor < 800; cursor++) {
    const attempt = structuredClone(state);
    attempt.rng = { seed: attempt.rng.seed, cursor };

    const { dice } = rollDice(attempt.rng);
    const from = tileId - (dice[0] + dice[1]);
    if (from < 0) continue; // would pass Home Station and collect the stipend

    attempt.players[attempt.currentPlayerIndex].tile = from;
    attempt.phase = 'awaiting-roll';
    attempt.doublesCount = 0;

    const result = LiquidateEngine.applyAction(attempt, { type: 'roll' });
    if (result.valid) return result.resultingState!;
  }
  throw new Error(`could not land on tile ${tileId} without wrapping the board`);
}
