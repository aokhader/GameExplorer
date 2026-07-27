import { describe, it, expect } from 'vitest';
import { LiquidateEngine } from './engine';
import { getBotAction, type LiquidateBotLevel } from './bot';
import { getBoard, systemMembers } from './board';
import { LIQUIDATE_CONFIGS } from './economy';
import { isOwnable, type PlanetTile } from './types';

/**
 * Economy balance regression tests.
 *
 * These exist because M6's simulation found the game could not *end*: the
 * stipend out-earned every rent on the board, and at 4–6 players the tiles
 * fragmented so completely that no star system was ever cornered — so nothing
 * was built, rents stayed at bare rates, and games ran forever (only 7 of 60
 * six-player games finished). Three changes fixed it: a lower stipend, higher
 * base rents, and bots that trade to complete a set.
 *
 * The assertions below are deliberately loose — they pin *health*, not exact
 * numbers, so ordinary tuning does not break them but a return to the old
 * stalemate does.
 */

/** Play a bot-only game to its end (or the limit) and report what happened. */
function simulate(
  seed: number,
  mode: 'full' | 'quick',
  seats: number,
  level: LiquidateBotLevel = 'steady',
  limit = 4000,
) {
  let state = LiquidateEngine.newGame({
    players: Array.from({ length: seats }, (_, i) => ({ name: `B${i}`, isBot: true })),
    mode,
    seed,
  });

  let actions = 0;
  while (!state.isGameOver && actions < limit) {
    const action = getBotAction(state, level);
    if (!action) break;
    const result = LiquidateEngine.applyAction(state, action);
    if (!result.valid) break;
    state = result.resultingState!;
    actions++;
  }

  const board = getBoard(mode);
  const planets = board.filter((t): t is PlanetTile => t.kind === 'planet');
  const systems = [...new Set(planets.map((p) => p.system))];
  const cornered = systems.filter((sys) => {
    const members = systemMembers(mode, sys);
    const owner = state.tiles[members[0]].ownerId;
    return owner !== null && members.every((id) => state.tiles[id].ownerId === owner);
  }).length;

  return {
    state,
    actions,
    finished: state.isGameOver,
    hitLimit: actions >= limit,
    rounds: state.round,
    bankrupts: state.players.filter((p) => p.bankrupt).length,
    built: planets.filter((p) => state.tiles[p.id].level > 0).length,
    cornered,
    claimed: board.filter((t) => isOwnable(t) && state.tiles[t.id].ownerId !== null).length,
  };
}

const SEEDS = [1, 29, 57, 85, 113, 141, 169, 197];
const median = (nums: number[]) => [...nums].sort((a, b) => a - b)[Math.floor(nums.length / 2)];

describe('economy balance', () => {
  for (const seats of [2, 4, 6]) {
    describe(`${seats} players`, () => {
      const full = SEEDS.map((s) => simulate(s, 'full', seats));
      const quick = SEEDS.map((s) => simulate(s, 'quick', seats));

      it('every full game reaches an end', () => {
        for (const run of full) {
          expect(run.hitLimit, `seed hit the action limit at ${seats}p`).toBe(false);
          expect(run.finished).toBe(true);
        }
      });

      it('every quick game reaches an end within its round cap', () => {
        for (const run of quick) {
          expect(run.hitLimit).toBe(false);
          expect(run.finished).toBe(true);
          expect(run.rounds).toBeLessThanOrEqual(LIQUIDATE_CONFIGS.quick.maxRounds! + 1);
        }
      });

      /**
       * The heart of the regression: full mode is won by outlasting everyone, so
       * games should end because someone went broke — not because the safety cap
       * expired. Before the fix this was 0% at six players.
       */
      it('full games end in bankruptcy, not by running out the safety cap', () => {
        const withBankruptcy = full.filter((r) => r.bankrupts > 0).length;
        expect(withBankruptcy).toBeGreaterThanOrEqual(Math.ceil(full.length * 0.75));
        expect(median(full.map((r) => r.rounds))).toBeLessThan(
          LIQUIDATE_CONFIGS.full.maxRounds!,
        );
      });

      /**
       * Cornering a system unlocks building, which is what turns rent from an
       * inconvenience into a threat. If this ever returns to zero the game has
       * regressed to the pre-M6 stalemate, whatever the other numbers say.
       */
      it('players corner systems and build on them', () => {
        expect(median(full.map((r) => r.cornered))).toBeGreaterThan(0);
        expect(median(full.map((r) => r.built))).toBeGreaterThan(0);
      });

      it('the board actually gets claimed', () => {
        const ownable = getBoard('full').filter(isOwnable).length;
        expect(median(full.map((r) => r.claimed))).toBeGreaterThan(ownable * 0.5);
      });
    });
  }

  it('a full game runs longer than a quick one', () => {
    const full = median(SEEDS.map((s) => simulate(s, 'full', 4).rounds));
    const quick = median(SEEDS.map((s) => simulate(s, 'quick', 4).rounds));
    expect(full).toBeGreaterThan(quick);
  });

  it('games stay decisive — the winner is never bankrupt', () => {
    for (const seats of [2, 4, 6]) {
      for (const run of SEEDS.map((s) => simulate(s, 'full', seats))) {
        const winner = run.state.players.find((p) => p.id === run.state.winnerId);
        expect(winner).toBeDefined();
        expect(winner!.bankrupt).toBe(false);
      }
    }
  });
});
