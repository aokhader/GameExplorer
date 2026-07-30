import { describe, expect, it } from 'vitest';
import {
  bidHistory,
  dockSlots,
  focusView,
  groupLabel,
  primaryAction,
  tileCode,
  tileMetrics,
  turnSteps,
} from './presentation';
import { LiquidateEngine } from './engine';
import { getBoard, systemMembers } from './board';
import { MAX_TRADE_PROPOSALS_PER_TURN } from './economy';
import {
  isOwnable,
  type LiquidateAction,
  type LiquidateGameState,
  type PlanetTile,
} from './types';

/**
 * The phase → UI table.
 *
 * The property at the bottom is the one that makes the whole dock safe: every
 * action this module hands a button is asserted against `getLegalActions` rather
 * than against a second copy of the phase rules, so the two cannot drift.
 */

function game(mode: 'full' | 'quick' = 'full'): LiquidateGameState {
  return LiquidateEngine.newGame({
    players: [{ name: 'Ada' }, { name: 'Bo', isBot: true }, { name: 'Cy', isBot: true }],
    mode,
    seed: 11,
  });
}

function apply(state: LiquidateGameState, action: LiquidateAction): LiquidateGameState {
  const result = LiquidateEngine.applyAction(state, action);
  expect(result.reason).toBeUndefined();
  return result.resultingState!;
}

/** Seats this device plays — the human only, as in vs-bot mode. */
const mine = (s: LiquidateGameState) => [s.players[0]!.id];
/** Every seat, as in pass-and-play. */
const all = (s: LiquidateGameState) => s.players.map((p) => p.id);

/** First unowned planet, for a buy decision. */
function firstPlanet(state: LiquidateGameState): PlanetTile {
  return LiquidateEngine.board(state).find((t): t is PlanetTile => t.kind === 'planet')!;
}

function buyDecision(credits: number): LiquidateGameState {
  const s = game();
  const tile = firstPlanet(s);
  s.phase = 'buy-decision';
  s.pendingPurchase = tile.id;
  s.players[0]!.credits = credits;
  s.players[0]!.tile = tile.id;
  return s;
}

// ---------------------------------------------------------------------------
// primaryAction
// ---------------------------------------------------------------------------

describe('primaryAction — awaiting-roll', () => {
  it('offers a plain roll at the start of a turn', () => {
    const s = game();
    const cta = primaryAction(s, mine(s))!;
    expect(cta.action).toEqual({ type: 'roll' });
    expect(cta.label).toBe('Roll dice');
  });

  it('says "roll again" when doubles are pending', () => {
    const s = game();
    s.doublesCount = 1;
    expect(primaryAction(s, mine(s))!.label).toBe('Roll again');
  });

  it('rolls for doubles while impounded, and counts the turns held', () => {
    const s = game();
    s.players[0]!.inImpound = true;
    s.players[0]!.impoundTurns = 2;
    const cta = primaryAction(s, mine(s))!;
    expect(cta.label).toBe('Roll for doubles');
    expect(cta.sub).toMatch(/Held 2 of 3/);
  });

  it('goes quiet when the acting seat is a bot', () => {
    const s = game();
    s.currentPlayerIndex = 1;
    expect(primaryAction(s, mine(s))).toBeNull();
  });

  it('still speaks for a bot seat in pass-and-play, where every seat is ours', () => {
    const s = game();
    s.currentPlayerIndex = 1;
    expect(primaryAction(s, all(s))).not.toBeNull();
  });
});

describe('primaryAction — buy-decision', () => {
  it('offers the buy when the price is covered, with the price on the button', () => {
    const s = buyDecision(5000);
    const tile = firstPlanet(s);
    const cta = primaryAction(s, mine(s))!;

    expect(cta.action).toEqual({ type: 'buy' });
    expect(cta.label).toBe(`Buy ${tile.name}`);
    expect(cta.right).toBeTruthy();
  });

  it('falls back to the auction when the price is out of reach', () => {
    const s = buyDecision(10);
    const cta = primaryAction(s, mine(s))!;

    expect(cta.action).toEqual({ type: 'decline' });
    expect(cta.label).toBe('Send to auction');
    expect(cta.sub).toMatch(/on hand/);
  });

  it('calls out a purchase that completes a system', () => {
    const s = buyDecision(5000);
    const tile = firstPlanet(s);
    const members = systemMembers(s.config.mode, tile.system);
    // Hold every sibling, so this tile is the last one.
    for (const id of members) {
      if (id !== tile.id) s.tiles[id]!.ownerId = s.players[0]!.id;
    }
    expect(primaryAction(s, mine(s))!.sub).toMatch(/Completes the \w+ system/);
  });
});

describe('primaryAction — turn-end and trade-review', () => {
  it('ends the turn', () => {
    const s = game();
    s.phase = 'turn-end';
    const cta = primaryAction(s, mine(s))!;
    expect(cta.action).toEqual({ type: 'end-turn' });
  });

  it('accepts an incoming offer, and names who sent it', () => {
    let s = game();
    s = apply(s, {
      type: 'propose-trade',
      trade: {
        toId: s.players[1]!.id,
        offerTiles: [],
        requestTiles: [],
        offerCredits: 25,
        requestCredits: 0,
      },
    });

    expect(s.phase).toBe('trade-review');
    // The recipient acts, so from THEIR device the CTA is Accept.
    const cta = primaryAction(s, [s.players[1]!.id])!;
    expect(cta.action).toEqual({ type: 'respond-trade', accept: true });
    expect(cta.sub).toBe('From Ada');
  });
});

describe('primaryAction — settling-debt', () => {
  /** A debtor who still owns something they can pledge. */
  function withDebt(canRaise: boolean): LiquidateGameState {
    const s = game();
    const tile = firstPlanet(s);
    s.phase = 'settling-debt';
    s.pendingDebt = { debtorId: s.players[0]!.id, creditorId: s.players[1]!.id, amount: 400 };
    s.players[0]!.credits = -400;
    if (canRaise) s.tiles[tile.id]!.ownerId = s.players[0]!.id;
    return s;
  }

  it('stays silent while funds can still be raised — the list is the action', () => {
    expect(primaryAction(withDebt(true), [game().players[0]!.id])).toBeNull();
  });

  it('offers folding, in the danger tone, once nothing is left to sell', () => {
    const s = withDebt(false);
    const cta = primaryAction(s, [s.players[0]!.id])!;
    expect(cta.action).toEqual({ type: 'declare-bankruptcy' });
    expect(cta.label).toBe('Fold');
    expect(cta.tone).toBe('danger');
  });
});

describe('primaryAction — silent phases', () => {
  it('says nothing during an auction; the bid stepper owns that decision', () => {
    let s = buyDecision(10);
    s = apply(s, { type: 'decline' });
    expect(s.phase).toBe('auction');
    expect(primaryAction(s, all(s))).toBeNull();
  });

  it('says nothing once the game is over', () => {
    const s = game();
    s.isGameOver = true;
    expect(primaryAction(s, all(s))).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// dockSlots
// ---------------------------------------------------------------------------

describe('dockSlots', () => {
  it('always returns four slots, with Standings and Board reachable', () => {
    const s = game();
    const slots = dockSlots(s, mine(s));
    expect(slots).toHaveLength(4);
    expect(slots[2]).toEqual({ id: 'standings', enabled: true });
    expect(slots[3]).toEqual({ id: 'board', enabled: true });
  });

  it('carries Manage in the first slot on a normal turn', () => {
    const s = game();
    expect(dockSlots(s, mine(s))[0]!.id).toBe('manage');
  });

  it('swaps the first slot for the live auction, and keeps Standings reachable', () => {
    let s = buyDecision(10);
    s = apply(s, { type: 'decline' });

    const slots = dockSlots(s, all(s));
    expect(slots[0]).toEqual({ id: 'auction', enabled: true });
    expect(slots[2]!.enabled).toBe(true);
    expect(slots[3]!.enabled).toBe(true);
  });

  it('disables Manage when there is nothing owned to manage', () => {
    const s = game();
    const manage = dockSlots(s, mine(s))[0]!;
    expect(manage.enabled).toBe(false);
    expect(manage.reason).toBe('Nothing to manage yet');
  });

  it('enables Manage once a colony can be built', () => {
    const s = game();
    const tile = firstPlanet(s);
    for (const id of systemMembers(s.config.mode, tile.system)) {
      s.tiles[id]!.ownerId = s.players[0]!.id;
    }
    s.players[0]!.credits = 10_000;
    expect(dockSlots(s, mine(s))[0]!.enabled).toBe(true);
  });

  it('enables Trade on your own turn', () => {
    const s = game();
    expect(dockSlots(s, mine(s))[1]).toEqual({ id: 'trade', enabled: true });
  });

  it('disables Trade off your own turn', () => {
    const s = game();
    s.currentPlayerIndex = 1;
    expect(dockSlots(s, mine(s))[1]!.reason).toBe('Only on your own turn');
  });

  it('disables Trade once the per-turn offer cap is spent', () => {
    const s = game();
    s.tradesProposedThisTurn = MAX_TRADE_PROPOSALS_PER_TURN;
    expect(dockSlots(s, mine(s))[1]!.reason).toBe('No more offers this turn');
  });

  it('disables Trade when every rival has folded', () => {
    const s = game();
    s.players[1]!.bankrupt = true;
    s.players[2]!.bankrupt = true;
    expect(dockSlots(s, mine(s))[1]!.reason).toBe('No one left to trade with');
  });
});

// ---------------------------------------------------------------------------
// focusView
// ---------------------------------------------------------------------------

describe('focusView', () => {
  it('demands nothing on a normal turn', () => {
    const s = game();
    expect(focusView(s, mine(s))).toBeNull();
  });

  it('opens an auction for spectators too', () => {
    let s = buyDecision(10);
    s = apply(s, { type: 'decline' });
    // Even for a device that holds no seat in the bidding order.
    expect(focusView(s, [])).toBe('auction');
  });

  it('opens a trade review only for the recipient', () => {
    let s = game();
    s = apply(s, {
      type: 'propose-trade',
      trade: {
        toId: s.players[1]!.id,
        offerTiles: [],
        requestTiles: [],
        offerCredits: 25,
        requestCredits: 0,
      },
    });
    expect(focusView(s, [s.players[1]!.id])).toBe('trade-review');
    expect(focusView(s, [s.players[0]!.id])).toBeNull();
  });

  it('opens the debt view only for the debtor', () => {
    const s = game();
    s.phase = 'settling-debt';
    s.pendingDebt = { debtorId: s.players[0]!.id, creditorId: null, amount: 100 };
    expect(focusView(s, mine(s))).toBe('debt');
    expect(focusView(s, [s.players[2]!.id])).toBeNull();
  });

  it('demands nothing once the game is over', () => {
    const s = game();
    s.isGameOver = true;
    s.phase = 'auction';
    expect(focusView(s, all(s))).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// bidHistory
// ---------------------------------------------------------------------------

describe('bidHistory', () => {
  it('is empty when no auction is running', () => {
    expect(bidHistory(game())).toEqual([]);
  });

  it('reads bids and passes back out of the log, newest first', () => {
    let s = buyDecision(10);
    s = apply(s, { type: 'decline' });

    const first = LiquidateEngine.actingPlayerId(s)!;
    s = apply(s, { type: 'bid', amount: s.pendingAuction!.highestBid + 1 });
    const second = LiquidateEngine.actingPlayerId(s)!;
    s = apply(s, { type: 'bid', amount: s.pendingAuction!.highestBid + 5 });

    const rows = bidHistory(s);
    expect(rows).toHaveLength(2);
    // Newest first.
    expect(rows[0]!.playerId).toBe(second);
    expect(rows[1]!.playerId).toBe(first);
    expect(rows[0]!.amount).toBeGreaterThan(rows[1]!.amount!);
    expect(rows.every((r) => !r.passed)).toBe(true);
  });

  it('does NOT count the opening line as a pass', () => {
    let s = buyDecision(10);
    s = apply(s, { type: 'decline' });

    // The opening entry reads "<name> passes on <tile> — it goes to auction",
    // which an unanchored / passes/ would wrongly pick up as a bidder passing.
    expect(s.log.at(-1)!.message).toMatch(/passes on .+ — it goes to auction$/);
    expect(bidHistory(s)).toEqual([]);
  });

  it('records a genuine pass', () => {
    let s = buyDecision(10);
    s = apply(s, { type: 'decline' });
    const passer = LiquidateEngine.actingPlayerId(s)!;
    s = apply(s, { type: 'pass-bid' });

    if (!s.pendingAuction) return; // settled immediately with two bidders left
    const rows = bidHistory(s);
    expect(rows[0]).toMatchObject({ playerId: passer, amount: null, passed: true });
  });

  it('ignores a previous auction on the same board', () => {
    let s = buyDecision(10);
    s = apply(s, { type: 'decline' });
    // Bid it out so the first auction settles.
    while (s.pendingAuction) {
      s = apply(s, { type: 'pass-bid' });
    }
    const settledLog = s.log.length;

    // Stage a second auction and confirm nothing before it is picked up.
    const tile = LiquidateEngine.board(s).find(
      (t) => isOwnable(t) && s.tiles[t.id]!.ownerId === null,
    )!;
    s.phase = 'buy-decision';
    s.pendingPurchase = tile.id;
    s.players[s.currentPlayerIndex]!.credits = 1;
    s = apply(s, { type: 'decline' });

    expect(s.log.length).toBeGreaterThan(settledLog);
    expect(bidHistory(s)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Tile presentation
// ---------------------------------------------------------------------------

describe('tile presentation', () => {
  it('labels every group on both boards', () => {
    for (const mode of ['full', 'quick'] as const) {
      for (const tile of getBoard(mode)) {
        expect(groupLabel(tile).length).toBeGreaterThan(0);
      }
    }
  });

  it('gives every tile a distinct-enough two-letter code', () => {
    for (const tile of getBoard('full')) {
      const code = tileCode(tile);
      expect(code).toHaveLength(2);
      expect(code).toMatch(/^[A-Z]/);
    }
  });

  it('drops the glyph, price and owner row once cells get dense', () => {
    // A 12-per-side ring on a 336px board lands near 22.6px per cell.
    const dense = tileMetrics(22.6, 12);
    expect(dense.showGlyph).toBe(false);
    expect(dense.showPrice).toBe(false);
    expect(dense.showOwnerRow).toBe(false);
    expect(dense.nameLines).toBe(1);
  });

  it('keeps them on the roomier 8-per-side ring', () => {
    const roomy = tileMetrics(36.4, 8);
    expect(roomy.showGlyph).toBe(true);
    expect(roomy.nameLines).toBe(2);
  });
});

describe('turnSteps', () => {
  it('marks Roll active before the dice and done after', () => {
    const s = game();
    expect(turnSteps(s)[0]!.state).toBe('active');

    const rolled = apply(s, { type: 'roll' });
    expect(turnSteps(rolled)[0]!.state).toBe('done');
    expect(turnSteps(rolled)[1]!.state).toBe('done');
  });

  it('always returns the same four labels', () => {
    expect(turnSteps(game()).map((s) => s.label)).toEqual(['Roll', 'Move', 'Decide', 'End']);
  });
});

// ---------------------------------------------------------------------------
// The property that keeps the dock honest
// ---------------------------------------------------------------------------

describe('every offered action is one the engine accepts', () => {
  function scenarios(): Array<[string, LiquidateGameState, string[]]> {
    const out: Array<[string, LiquidateGameState, string[]]> = [];

    const fresh = game();
    out.push(['awaiting-roll', fresh, all(fresh)]);

    const doubles = game();
    doubles.doublesCount = 1;
    out.push(['doubles', doubles, all(doubles)]);

    const impounded = game();
    impounded.players[0]!.inImpound = true;
    out.push(['impounded', impounded, all(impounded)]);

    const impoundedRich = game();
    impoundedRich.players[0]!.inImpound = true;
    impoundedRich.players[0]!.clearancePasses = 1;
    out.push(['impounded with a pass', impoundedRich, all(impoundedRich)]);

    out.push(['buy affordable', buyDecision(5000), all(buyDecision(5000))]);
    out.push(['buy unaffordable', buyDecision(10), all(buyDecision(10))]);

    const ending = game();
    ending.phase = 'turn-end';
    out.push(['turn-end', ending, all(ending)]);

    let trade = game();
    trade = apply(trade, {
      type: 'propose-trade',
      trade: {
        toId: trade.players[1]!.id,
        offerTiles: [],
        requestTiles: [],
        offerCredits: 25,
        requestCredits: 0,
      },
    });
    out.push(['trade-review', trade, all(trade)]);

    const broke = game();
    broke.phase = 'settling-debt';
    broke.pendingDebt = {
      debtorId: broke.players[0]!.id,
      creditorId: broke.players[1]!.id,
      amount: 400,
    };
    broke.players[0]!.credits = -400;
    out.push(['settling-debt, nothing to sell', broke, all(broke)]);

    let auction = buyDecision(10);
    auction = apply(auction, { type: 'decline' });
    out.push(['auction', auction, all(auction)]);

    return out;
  }

  it.each(scenarios())('%s', (_label, state, deviceIds) => {
    const cta = primaryAction(state, deviceIds);
    if (cta === null) return;
    expect(LiquidateEngine.getLegalActions(state)).toContainEqual(cta.action);
  });

  it('also holds for the dock, whose Trade slot the engine cannot enumerate', () => {
    for (const [, state, deviceIds] of scenarios()) {
      const [, trade] = dockSlots(state, deviceIds);
      if (!trade.enabled) continue;
      // `propose-trade` never appears in getLegalActions (its payload is not
      // enumerable), so assert the engine's own guards instead.
      expect(['awaiting-roll', 'turn-end']).toContain(state.phase);
      expect(state.tradesProposedThisTurn).toBeLessThan(MAX_TRADE_PROPOSALS_PER_TURN);
      expect(state.players.some((p) => p.id !== state.players[state.currentPlayerIndex]!.id && !p.bankrupt)).toBe(true);
    }
  });
});
