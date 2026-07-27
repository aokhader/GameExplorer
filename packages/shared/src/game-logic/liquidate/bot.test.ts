import { describe, it, expect } from 'vitest';
import { LiquidateEngine } from './engine';
import {
  LIQUIDATE_BOT_LABELS,
  LIQUIDATE_BOT_LEVELS,
  assessTile,
  getBotAction,
  type LiquidateBotLevel,
} from './bot';
import { getBoard, impoundTileIndex, systemMembers } from './board';
import { LIQUIDATE_CONFIGS } from './economy';
import {
  MAX_COLONY_LEVEL,
  isOwnable,
  type DebtRule,
  type LiquidateGameState,
  type PlanetTile,
} from './types';

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function botGame(
  seed = 1,
  mode: 'full' | 'quick' = 'quick',
  debtRule?: DebtRule,
): LiquidateGameState {
  return LiquidateEngine.newGame({
    players: [
      { name: 'Bot A', isBot: true },
      { name: 'Bot B', isBot: true },
    ],
    mode,
    seed,
    debtRule,
  });
}

function planetsOf(mode: 'full' | 'quick'): PlanetTile[] {
  return getBoard(mode).filter((t): t is PlanetTile => t.kind === 'planet');
}

function own(
  state: LiquidateGameState,
  tileIds: number[],
  playerIndex: number,
): LiquidateGameState {
  const next = structuredClone(state);
  for (const id of tileIds) next.tiles[id].ownerId = next.players[playerIndex].id;
  return next;
}

/** Put a bot in front of a buy decision for `tileId`. */
function buyDecision(state: LiquidateGameState, tileId: number): LiquidateGameState {
  const next = structuredClone(state);
  next.players[next.currentPlayerIndex].tile = tileId;
  next.pendingPurchase = tileId;
  next.phase = 'buy-decision';
  next.dice = [3, 4];
  return next;
}

/** Run a whole game between bots, returning the final state and action count. */
function playOut(
  state: LiquidateGameState,
  level: LiquidateBotLevel,
  limit = 4000,
): { state: LiquidateGameState; actions: number } {
  let current = state;
  let actions = 0;
  while (!current.isGameOver && actions < limit) {
    const action = getBotAction(current, level);
    if (action === null) break;
    const result = LiquidateEngine.applyAction(current, action);
    // A bot must never produce an illegal action — that would stall the caller.
    expect(result.reason).toBeUndefined();
    expect(result.valid).toBe(true);
    current = result.resultingState!;
    actions++;
  }
  return { state: current, actions };
}

// ---------------------------------------------------------------------------

describe('bot levels', () => {
  it('exposes four bands weakest-first with labels for every one', () => {
    expect(LIQUIDATE_BOT_LEVELS).toEqual(['cautious', 'steady', 'shrewd', 'ruthless']);
    for (const level of LIQUIDATE_BOT_LEVELS) {
      expect(LIQUIDATE_BOT_LABELS[level]).toBeTruthy();
    }
  });
});

describe('purity and determinism', () => {
  it('never mutates the state it is given', () => {
    const state = botGame();
    const snapshot = structuredClone(state);
    getBotAction(state, 'shrewd');
    expect(state).toEqual(snapshot);
  });

  it('does not advance the game RNG cursor', () => {
    const state = botGame();
    const before = { ...state.rng };
    getBotAction(state, 'cautious');
    expect(state.rng).toEqual(before);
  });

  it('returns the same action for the same position and level', () => {
    const state = botGame(11);
    for (const level of LIQUIDATE_BOT_LEVELS) {
      expect(getBotAction(state, level)).toEqual(getBotAction(state, level));
    }
  });

  it('replays a whole game identically from the same seed', () => {
    const a = playOut(botGame(1234), 'steady');
    const b = playOut(botGame(1234), 'steady');
    expect(a.actions).toBe(b.actions);
    expect(a.state).toEqual(b.state);
  });

  it('returns null when the game is over', () => {
    const state = botGame();
    state.isGameOver = true;
    expect(getBotAction(state, 'steady')).toBeNull();
  });
});

describe('legality', () => {
  it('only ever returns an action the engine accepts, across many positions', () => {
    for (const level of LIQUIDATE_BOT_LEVELS) {
      for (const seed of [3, 17, 99]) {
        // playOut asserts validity on every single action it applies.
        const { actions } = playOut(botGame(seed), level, 1500);
        expect(actions).toBeGreaterThan(10);
      }
    }
  });

  it('acts for whoever is on the clock, not just the seat holder', () => {
    // Declining opens an auction, where the actor rotates away from the roller.
    const planet = planetsOf('quick').find((p) => p.id >= 2)!;
    let state = buyDecision(botGame(5), planet.id);
    state = LiquidateEngine.applyAction(state, { type: 'decline' }).resultingState!;
    expect(state.phase).toBe('auction');

    const actor = LiquidateEngine.actingPlayerId(state);
    const action = getBotAction(state, 'shrewd');
    expect(action).not.toBeNull();
    expect(['bid', 'pass-bid']).toContain(action!.type);
    expect(LiquidateEngine.applyAction(state, action!).valid).toBe(true);
    expect(actor).not.toBeNull();
  });
});

describe('tile assessment', () => {
  const mode = 'full' as const;

  it('values a set-completing planet far above its price', () => {
    const planet = planetsOf(mode).find((p) => p.system === 'amber')!;
    const members = systemMembers(mode, planet.system);
    const base = LiquidateEngine.newGame({
      players: [{ name: 'A' }, { name: 'B' }],
      mode,
      seed: 2,
    });
    const bare = assessTile(base, planet.id, base.players[0].id);

    // Own the rest of the system: this tile now completes it.
    const nearly = own(base, members.filter((id) => id !== planet.id), 0);
    expect(assessTile(nearly, planet.id, nearly.players[0].id)).toBeGreaterThan(bare);
    expect(assessTile(nearly, planet.id, nearly.players[0].id)).toBeGreaterThan(planet.price);
  });

  it('discounts a planet whose system a rival has already cornered', () => {
    const planet = planetsOf(mode).find((p) => p.system === 'azure')!;
    const members = systemMembers(mode, planet.system);
    const base = LiquidateEngine.newGame({
      players: [{ name: 'A' }, { name: 'B' }],
      mode,
      seed: 2,
    });
    const blocked = own(base, members.filter((id) => id !== planet.id), 1);

    // Still worth something as a spoiler, but less than completing our own set.
    const spoiler = assessTile(blocked, planet.id, blocked.players[0].id);
    const nearly = own(base, members.filter((id) => id !== planet.id), 0);
    expect(spoiler).toBeLessThan(assessTile(nearly, planet.id, nearly.players[0].id));
  });

  it('compounds warp-gate value as more gates are held', () => {
    const gates = getBoard(mode).filter((t) => t.kind === 'warp-gate');
    let state = LiquidateEngine.newGame({
      players: [{ name: 'A' }, { name: 'B' }],
      mode,
      seed: 2,
    });
    const alone = assessTile(state, gates[0].id, state.players[0].id);
    state = own(state, [gates[1].id, gates[2].id], 0);
    expect(assessTile(state, gates[0].id, state.players[0].id)).toBeGreaterThan(alone);
  });

  it('scores nothing for tiles that cannot be owned', () => {
    const state = LiquidateEngine.newGame({
      players: [{ name: 'A' }, { name: 'B' }],
      mode,
      seed: 2,
    });
    const corner = getBoard(mode).find((t) => t.kind === 'drift')!;
    expect(assessTile(state, corner.id, state.players[0].id)).toBe(0);
  });
});

describe('buying decisions', () => {
  const cheap = () => planetsOf('quick').find((p) => p.system === 'ember' && p.id >= 2)!;

  it('grabs land on an empty board', () => {
    const state = buyDecision(botGame(4), cheap().id);
    // Every profile should open by buying: unowned tiles are the cheap ones.
    expect(getBotAction(state, 'ruthless')).toEqual({ type: 'buy' });
    expect(getBotAction(state, 'shrewd')).toEqual({ type: 'buy' });
  });

  it('declines when it cannot afford the tile at all', () => {
    const state = buyDecision(botGame(4), cheap().id);
    state.players[state.currentPlayerIndex].credits = 1;
    for (const level of LIQUIDATE_BOT_LEVELS) {
      const action = getBotAction(state, level);
      expect(action).toEqual({ type: 'decline' });
    }
  });

  it('pays over the odds for a tile that completes a system', () => {
    const planet = planetsOf('quick').find((p) => p.system === 'azure' && p.id >= 2)!;
    const members = systemMembers('quick', planet.system);
    let state = botGame(6);
    state = own(state, members.filter((id) => id !== planet.id), state.currentPlayerIndex);
    // Claim most of the board so the land-grab shortcut is not what drives this.
    for (const tile of getBoard('quick')) {
      if (isOwnable(tile) && !members.includes(tile.id)) {
        state.tiles[tile.id].ownerId = state.players[1].id;
      }
    }
    const decision = buyDecision(state, planet.id);
    decision.players[decision.currentPlayerIndex].credits = planet.price + 400;
    expect(getBotAction(decision, 'shrewd')).toEqual({ type: 'buy' });
  });

  it('a cautious bot guards its reserve late in the game', () => {
    const planet = planetsOf('quick').find((p) => p.system === 'aurum' && p.id >= 2)!;
    let state = botGame(8);
    // Board mostly claimed → no land-grab licence.
    for (const tile of getBoard('quick')) {
      if (isOwnable(tile) && tile.id !== planet.id) {
        state.tiles[tile.id].ownerId = state.players[1].id;
      }
    }
    const decision = buyDecision(state, planet.id);
    // Just barely affordable: the reserve rule should stop the cautious bot.
    decision.players[decision.currentPlayerIndex].credits = planet.price + 10;
    expect(getBotAction(decision, 'cautious')).toEqual({ type: 'decline' });
  });
});

describe('auction behaviour', () => {
  function auction(seed: number): LiquidateGameState {
    const planet = planetsOf('quick').find((p) => p.id >= 2)!;
    const state = buyDecision(botGame(seed), planet.id);
    return LiquidateEngine.applyAction(state, { type: 'decline' }).resultingState!;
  }

  it('bids within its purse and beats the standing bid', () => {
    const state = auction(9);
    const action = getBotAction(state, 'ruthless');
    if (action?.type === 'bid') {
      expect(action.amount).toBeGreaterThan(state.pendingAuction!.highestBid);
      const actorId = LiquidateEngine.actingPlayerId(state)!;
      const actor = state.players.find((p) => p.id === actorId)!;
      expect(action.amount).toBeLessThanOrEqual(actor.credits);
    }
  });

  it('a ruthless bot outbids a cautious one on the same tile', () => {
    const state = auction(9);
    const bidOf = (level: LiquidateBotLevel): number => {
      const action = getBotAction(state, level);
      return action?.type === 'bid' ? action.amount : 0;
    };
    expect(bidOf('ruthless')).toBeGreaterThanOrEqual(bidOf('cautious'));
  });

  it('passes rather than bidding past its ceiling', () => {
    const state = auction(9);
    // An absurd standing bid nobody should chase.
    state.pendingAuction!.highestBid = 100_000;
    state.pendingAuction!.highestBidderId = state.players[1].id;
    for (const level of LIQUIDATE_BOT_LEVELS) {
      expect(getBotAction(state, level)).toEqual({ type: 'pass-bid' });
    }
  });

  it('always terminates a bot-only auction', () => {
    let state = auction(12);
    let guard = 0;
    while (state.phase === 'auction' && guard < 200) {
      state = LiquidateEngine.applyAction(state, getBotAction(state, 'ruthless')!).resultingState!;
      guard++;
    }
    expect(state.phase).not.toBe('auction');
    expect(guard).toBeLessThan(200);
  });
});

describe('development decisions', () => {
  const system = 'amber' as const;

  it('builds once it holds a full system and has spare cash', () => {
    const members = systemMembers('quick', system);
    let state = own(botGame(3), members, 0);
    state.phase = 'turn-end';
    state.dice = [2, 3];
    state.players[0].credits = 5000;

    const action = getBotAction(state, 'shrewd');
    expect(action?.type).toBe('build');
    expect(members).toContain((action as { tile: number }).tile);
  });

  it('will not build itself below its reserve', () => {
    const members = systemMembers('quick', system);
    const state = own(botGame(3), members, 0);
    state.phase = 'turn-end';
    state.dice = [2, 3];
    state.players[0].credits = 10;
    expect(getBotAction(state, 'cautious')).toEqual({ type: 'end-turn' });
  });

  it('develops evenly, respecting the engine rule, and stops at the cap', () => {
    const members = systemMembers('quick', system);
    let state = own(botGame(3), members, 0);
    state.phase = 'turn-end';
    state.dice = [2, 3];
    state.players[0].credits = 100_000;

    for (let i = 0; i < 200; i++) {
      const action = getBotAction(state, 'ruthless');
      if (!action || action.type !== 'build') break;
      state = LiquidateEngine.applyAction(state, action).resultingState!;
      const levels = members.map((id) => state.tiles[id].level);
      expect(Math.max(...levels) - Math.min(...levels)).toBeLessThanOrEqual(1);
    }
    expect(members.every((id) => state.tiles[id].level === MAX_COLONY_LEVEL)).toBe(true);
    expect(getBotAction(state, 'ruthless')).toEqual({ type: 'end-turn' });
  });

  it('never cycles between inverse actions, at any level', () => {
    // Regression: a flush bot holding a mortgaged tile used to slip into
    // mortgage → unmortgage → mortgage forever. Two causes, both fixed — the
    // mistake branch could pick either reversible action, and the derived
    // jitter was constant across a turn's management actions, so the "mistake"
    // verdict never changed and the two-cycle locked in.
    const tile = planetsOf('quick').find((p) => p.system === 'aurum')!;

    for (const level of LIQUIDATE_BOT_LEVELS) {
      let state = own(botGame(91, 'quick'), [tile.id], 0);
      state.tiles[tile.id].mortgaged = true;
      state.phase = 'turn-end';
      state.dice = [2, 3];
      state.players[0].credits = 5000;

      const seen: string[] = [];
      for (let i = 0; i < 60; i++) {
        const action = getBotAction(state, level);
        if (!action) break;
        seen.push(action.type);
        state = LiquidateEngine.applyAction(state, action).resultingState!;
        if (action.type === 'end-turn') break;
      }

      expect(seen, `level ${level}`).toContain('end-turn');
      // Clearing the mortgage is fine; re-pledging it in the same window is not.
      expect(seen.filter((t) => t === 'mortgage'), `level ${level}`).toHaveLength(0);
      expect(seen.filter((t) => t === 'unmortgage').length, `level ${level}`).toBeLessThanOrEqual(1);
    }
  });

  it('never mortgages during a normal turn (which would let it oscillate)', () => {
    const members = systemMembers('quick', system);
    const state = own(botGame(3), members, 0);
    state.phase = 'turn-end';
    state.dice = [2, 3];
    state.players[0].credits = 400;

    for (let i = 0; i < 40; i++) {
      const action = getBotAction(state, 'shrewd');
      expect(action?.type).not.toBe('mortgage');
      expect(action?.type).not.toBe('sell-building');
      if (action?.type === 'end-turn') break;
    }
  });
});

describe('debt settlement', () => {
  /** A bot facing an unpayable rent bill, owning spare land it could pledge. */
  function inDebt(spareTiles: number[]): LiquidateGameState {
    const planet = planetsOf('full').find((p) => p.system === 'aurum' && p.id >= 12)!;
    let state = LiquidateEngine.newGame({
      players: [{ name: 'A', isBot: true }, { name: 'B' }, { name: 'C' }],
      mode: 'full',
      seed: 7,
    });
    state = own(state, systemMembers('full', planet.system), 1);
    state = own(state, spareTiles, 0);
    state.players[0].credits = 5;
    state.players[0].tile = planet.id;

    // Charge the rent through the engine so pendingDebt is real.
    const rent = LiquidateEngine.rentFor(state, planet.id, 7);
    state.phase = 'settling-debt';
    state.players[0].credits = 5 - rent;
    state.pendingDebt = {
      debtorId: state.players[0].id,
      creditorId: state.players[1].id,
      amount: rent - 5,
    };
    return state;
  }

  it('mortgages instead of folding when it can cover the debt', () => {
    const spare = planetsOf('full')
      .filter((p) => p.system === 'crimson')
      .map((p) => p.id);
    const state = inDebt(spare);
    const action = getBotAction(state, 'shrewd');
    expect(action?.type).toBe('mortgage');
  });

  it('pledges its least valuable land first', () => {
    const cheap = planetsOf('full').find((p) => p.system === 'ember')!;
    const dear = planetsOf('full').find((p) => p.system === 'crimson')!;
    const state = inDebt([cheap.id, dear.id]);
    // Both are mortgageable; the cheaper one should go first.
    const action = getBotAction(state, 'shrewd');
    expect(action).toEqual({ type: 'mortgage', tile: cheap.id });
  });

  it('folds when nothing it owns can cover the debt', () => {
    const state = inDebt([]);
    expect(LiquidateEngine.liquidatableValue(state, state.players[0].id)).toBe(0);
    expect(getBotAction(state, 'ruthless')).toEqual({ type: 'declare-bankruptcy' });
  });

  it('works its way out of debt over successive actions', () => {
    const spare = planetsOf('full')
      .filter((p) => p.system === 'crimson' || p.system === 'violet')
      .map((p) => p.id);
    let state = inDebt(spare);
    for (let i = 0; i < 20 && state.phase === 'settling-debt'; i++) {
      state = LiquidateEngine.applyAction(state, getBotAction(state, 'shrewd')!).resultingState!;
    }
    expect(state.phase).not.toBe('settling-debt');
    expect(state.players[0].bankrupt).toBe(false);
    expect(state.players[0].credits).toBeGreaterThanOrEqual(0);
  });
});

describe('impound decisions', () => {
  function impounded(seed = 2): LiquidateGameState {
    const state = botGame(seed);
    state.players[0].inImpound = true;
    state.players[0].tile = impoundTileIndex('quick');
    state.phase = 'awaiting-roll';
    return state;
  }

  it('spends a Clearance Pass before any cash', () => {
    const state = impounded();
    state.players[0].clearancePasses = 1;
    for (const level of LIQUIDATE_BOT_LEVELS) {
      expect(getBotAction(state, level)).toEqual({ type: 'use-clearance-pass' });
    }
  });

  it('pays the fine early, when there is still land to claim', () => {
    const state = impounded();
    expect(getBotAction(state, 'steady')).toEqual({ type: 'pay-fine' });
  });

  it('a shrewd bot stalls once the board is claimed and developed', () => {
    const state = impounded(3);
    const system = systemMembers('quick', 'amber');
    for (const tile of getBoard('quick')) {
      if (isOwnable(tile)) state.tiles[tile.id].ownerId = state.players[1].id;
    }
    for (const id of system) state.tiles[id].level = 3;

    expect(getBotAction(state, 'shrewd')).toEqual({ type: 'roll' });
    // The weaker profiles do not understand this and just pay up.
    expect(getBotAction(state, 'steady')).toEqual({ type: 'pay-fine' });
  });
});

describe('trade responses', () => {
  function offered(offerTiles: number[], requestTiles: number[], offerCredits = 0) {
    const state = LiquidateEngine.newGame({
      players: [{ name: 'A' }, { name: 'B', isBot: true }],
      mode: 'full',
      seed: 4,
    });
    let staged = own(state, offerTiles, 0);
    staged = own(staged, requestTiles, 1);
    staged.phase = 'trade-review';
    staged.pendingTrade = {
      fromId: staged.players[0].id,
      toId: staged.players[1].id,
      offerTiles,
      requestTiles,
      offerCredits,
      requestCredits: 0,
    };
    return staged;
  }

  it('accepts a clearly favourable offer', () => {
    const dear = planetsOf('full').find((p) => p.system === 'aurum')!;
    const cheap = planetsOf('full').find((p) => p.system === 'ember')!;
    const state = offered([dear.id], [cheap.id], 300);
    expect(getBotAction(state, 'shrewd')).toEqual({ type: 'respond-trade', accept: true });
  });

  it('refuses a lopsided offer against it', () => {
    const dear = planetsOf('full').find((p) => p.system === 'aurum')!;
    const cheap = planetsOf('full').find((p) => p.system === 'ember')!;
    const state = offered([cheap.id], [dear.id]);
    for (const level of LIQUIDATE_BOT_LEVELS) {
      expect(getBotAction(state, level)).toEqual({ type: 'respond-trade', accept: false });
    }
  });

  it('refuses any trade it cannot fund', () => {
    const dear = planetsOf('full').find((p) => p.system === 'aurum')!;
    const state = offered([dear.id], []);
    state.pendingTrade!.requestCredits = 999_999;
    expect(getBotAction(state, 'ruthless')).toEqual({ type: 'respond-trade', accept: false });
  });
});

describe('full bot-vs-bot games', () => {
  for (const level of LIQUIDATE_BOT_LEVELS) {
    it(`${level} bots finish a quick game without stalling`, () => {
      const { state, actions } = playOut(botGame(2024, 'quick'), level);
      expect(state.isGameOver).toBe(true);
      expect(state.winnerId).not.toBeNull();
      // A tight bound: an action-cycle regression would blow straight past this
      // rather than quietly finishing near the safety limit.
      expect(actions).toBeLessThan(1200);
    });
  }

  it('finishes under the never-negative rule too', () => {
    const { state } = playOut(botGame(31, 'quick', 'never-negative'), 'ruthless');
    expect(state.isGameOver).toBe(true);
    for (const p of state.players) expect(p.credits).toBeGreaterThanOrEqual(0);
  });

  it('actually develops the board rather than only rolling', () => {
    const { state } = playOut(botGame(77, 'quick'), 'ruthless');
    const claimed = getBoard('quick').filter(
      (t) => isOwnable(t) && state.tiles[t.id].ownerId !== null,
    ).length;
    expect(claimed).toBeGreaterThan(0);
    expect(state.log.length).toBeGreaterThan(20);
  });

  it('keeps state serializable and consistent to the final action', () => {
    const { state } = playOut(botGame(555, 'quick'), 'shrewd');
    expect(JSON.parse(JSON.stringify(state))).toEqual(state);
    for (const owned of state.tiles) {
      if (owned.ownerId === null) continue;
      const owner = state.players.find((p) => p.id === owned.ownerId)!;
      expect(owner.bankrupt).toBe(false);
    }
  });

  it('runs six-player games to completion', () => {
    const state = LiquidateEngine.newGame({
      players: Array.from({ length: 6 }, (_, i) => ({ name: `Bot ${i}`, isBot: true })),
      mode: 'quick',
      seed: 91,
    });
    const played = playOut(state, 'steady');
    expect(played.state.isGameOver).toBe(true);
    expect(played.state.round).toBeGreaterThan(1);
    // This is the case that originally exposed the mortgage/unmortgage cycle
    // (it burned all 4000 actions); it now settles in a few hundred.
    expect(played.actions).toBeLessThan(1200);
  });

  it('plays full-length games to a last-player-standing finish', () => {
    // Full mode has no round cap, so the only exit is bankruptcy.
    const { state } = playOut(botGame(64, 'full'), 'ruthless', 20_000);
    if (state.isGameOver) {
      expect(LiquidateEngine.activePlayers(state)).toHaveLength(1);
      expect(state.winnerId).toBe(LiquidateEngine.activePlayers(state)[0].id);
    }
  });

  it('produces different games from different seeds', () => {
    const outcomes = new Set<string>();
    for (const seed of [1, 2, 3, 4, 5]) {
      const { state } = playOut(botGame(seed, 'quick'), 'steady');
      outcomes.add(`${state.winnerId}:${state.round}:${state.log.length}`);
    }
    expect(outcomes.size).toBeGreaterThan(1);
  });

  it('leaves the starting purse untouched in the config presets', () => {
    playOut(botGame(2, 'quick'), 'ruthless');
    expect(LIQUIDATE_CONFIGS.quick.startingCredits).toBe(2400);
  });
});
