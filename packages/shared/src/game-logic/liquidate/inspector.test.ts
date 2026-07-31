import { describe, expect, it } from 'vitest';
import { buildInspector } from './inspector';
import { LiquidateEngine } from './engine';
import { getBoard, systemMembers } from './board';
import { formatCredits } from '../../utils/currency';
import { MAX_COLONY_LEVEL, type LiquidateGameState, type PlanetTile } from './types';

/**
 * `inspector.ts` claims its rent ladder "has to agree with
 * `LiquidateEngine.rentFor` exactly". That was never checked. These tests hold
 * the two against each other rather than against a transcribed table, so the
 * ladder cannot drift when the economy changes.
 *
 * The rung that matters most is the full-system double: it applies ONLY at
 * colony level 0, so it is a row of its own rather than a modifier on the rest.
 */

function game(mode: 'full' | 'quick' = 'full'): LiquidateGameState {
  return LiquidateEngine.newGame({
    players: [{ name: 'Ada' }, { name: 'Bo' }],
    mode,
    seed: 5,
  });
}

/** The rung the ladder marks as in force. */
function activeValue(state: LiquidateGameState, tileId: number, viewerId: string | null) {
  const rows = buildInspector(state, tileId, viewerId, '').rent;
  const active = rows.filter((r) => r.active);
  expect(active).toHaveLength(1);
  return active[0]!.value;
}

/** First planet of a system, plus every index in that system. */
function planetOf(state: LiquidateGameState, system: PlanetTile['system']) {
  const members = systemMembers(state.config.mode, system);
  const tile = LiquidateEngine.board(state)[members[0]!] as PlanetTile;
  return { tile, members };
}

describe('buildInspector — planets', () => {
  it('marks the bare-rent rung when one tile of a system is held', () => {
    const state = game();
    const { tile } = planetOf(state, 'ember');
    state.tiles[tile.id].ownerId = state.players[1]!.id;

    expect(activeValue(state, tile.id, state.players[0]!.id)).toBe(
      formatFor(LiquidateEngine.rentFor(state, tile.id, 7)),
    );
  });

  it('marks the full-system rung, and it is double the bare rent', () => {
    const state = game();
    const { tile, members } = planetOf(state, 'ember');
    const owner = state.players[1]!.id;
    for (const id of members) state.tiles[id].ownerId = owner;

    const rows = buildInspector(state, tile.id, state.players[0]!.id, '').rent;
    const full = rows.find((r) => r.label === 'Full system · no colonies')!;
    const bare = rows.find((r) => r.label === 'Base rent')!;

    expect(full.active).toBe(true);
    expect(bare.active).toBe(false);
    expect(full.value).toBe(formatFor(tile.rents[0] * 2));
    expect(full.value).toBe(formatFor(LiquidateEngine.rentFor(state, tile.id, 7)));
  });

  it('tracks every colony level against the engine', () => {
    for (let level = 1; level <= MAX_COLONY_LEVEL; level++) {
      const state = game();
      const { tile, members } = planetOf(state, 'ember');
      const owner = state.players[1]!.id;
      for (const id of members) state.tiles[id].ownerId = owner;
      state.tiles[tile.id].level = level as 1 | 2 | 3 | 4 | 5;

      expect(activeValue(state, tile.id, state.players[0]!.id)).toBe(
        formatFor(LiquidateEngine.rentFor(state, tile.id, 7)),
      );
    }
  });

  it('labels the top rung as the megastructure', () => {
    const state = game();
    const { tile, members } = planetOf(state, 'ember');
    const owner = state.players[1]!.id;
    for (const id of members) state.tiles[id].ownerId = owner;
    state.tiles[tile.id].level = MAX_COLONY_LEVEL;

    const rows = buildInspector(state, tile.id, state.players[0]!.id, '').rent;
    expect(rows.at(-1)!.label).toBe('Megastructure ★');
    expect(rows.at(-1)!.active).toBe(true);
  });

  it('reports system progress for the viewer, not the owner', () => {
    const state = game();
    const { tile, members } = planetOf(state, 'ember');
    const me = state.players[0]!.id;
    state.tiles[members[0]!].ownerId = me;
    state.tiles[members[1]!].ownerId = me;

    const data = buildInspector(state, tile.id, me, '');
    expect(data.progress).not.toBeNull();
    expect(data.progress!.pct).toBe(Math.round((2 / members.length) * 100));
    // The raw pair the sheet's fraction chip renders, and the sentence it is
    // derived from, have to agree — they are two views of one count.
    expect(data.progress!.held).toBe(2);
    expect(data.progress!.total).toBe(members.length);
    expect(data.progress!.label).toContain(`${2} of ${members.length}`);
  });

  it('counts the viewer only, so a rival holding the set reads as zero', () => {
    const state = game();
    const { tile, members } = planetOf(state, 'ember');
    const rival = state.players[1]!.id;
    for (const id of members) state.tiles[id]!.ownerId = rival;

    const data = buildInspector(state, tile.id, state.players[0]!.id, '');
    expect(data.progress!.held).toBe(0);
    expect(data.progress!.total).toBe(members.length);
  });

  it('flags the tile that would complete a system', () => {
    const state = game();
    const { members } = planetOf(state, 'ember');
    const me = state.players[0]!.id;
    // Hold everything but the last one, which stays unowned and buyable.
    for (const id of members.slice(0, -1)) state.tiles[id].ownerId = me;

    const data = buildInspector(state, members.at(-1)!, me, '');
    expect(data.highlight).toMatch(/completes the system/i);
  });

  it('says a holding is mortgaged in its status line', () => {
    const state = game();
    const { tile } = planetOf(state, 'ember');
    state.tiles[tile.id].ownerId = state.players[1]!.id;
    state.tiles[tile.id].mortgaged = true;

    expect(buildInspector(state, tile.id, state.players[0]!.id, '').status).toMatch(/mortgaged/);
  });
});

describe('buildInspector — warp gates', () => {
  it('tracks the rung against the number of gates the owner holds', () => {
    const gates = getBoard('full').filter((t) => t.kind === 'warp-gate');

    for (let held = 1; held <= gates.length; held++) {
      const state = game();
      const owner = state.players[1]!.id;
      for (const g of gates.slice(0, held)) state.tiles[g.id].ownerId = owner;

      expect(activeValue(state, gates[0]!.id, state.players[0]!.id)).toBe(
        formatFor(LiquidateEngine.rentFor(state, gates[0]!.id, 7)),
      );
    }
  });
});

describe('buildInspector — utilities', () => {
  it('shows the multiplier rung rather than a fixed sum', () => {
    const utilities = getBoard('full').filter((t) => t.kind === 'utility');
    const state = game();
    const owner = state.players[1]!.id;
    state.tiles[utilities[0]!.id].ownerId = owner;

    const rows = buildInspector(state, utilities[0]!.id, state.players[0]!.id, '').rent;
    expect(rows.find((r) => r.active)!.value).toMatch(/^dice × \d+$/);
  });

  it('moves to the both-held rung when the owner has each utility', () => {
    const utilities = getBoard('full').filter((t) => t.kind === 'utility');
    const state = game();
    const owner = state.players[1]!.id;
    for (const u of utilities) state.tiles[u.id].ownerId = owner;

    const rows = buildInspector(state, utilities[0]!.id, state.players[0]!.id, '').rent;
    expect(rows.find((r) => r.active)!.label).toBe('Both utilities held');
  });
});

describe('buildInspector — non-ownable tiles', () => {
  it('explains each corner and deck without a rent ladder', () => {
    const state = game();
    for (const tile of LiquidateEngine.board(state)) {
      if (tile.kind === 'planet' || tile.kind === 'warp-gate' || tile.kind === 'utility') continue;
      const data = buildInspector(state, tile.id, state.players[0]!.id, '');
      expect(data.rent).toHaveLength(0);
      expect(data.status.length).toBeGreaterThan(0);
      // Their group label would only restate the tile's own name.
      expect(data.groupLabel).toBe('');
    }
  });
});

/** The ladder renders through `formatCredits`; compare like for like. */
function formatFor(amount: number): string {
  return formatCredits(amount);
}
