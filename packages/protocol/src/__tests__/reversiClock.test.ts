// Reversi clock regressions, ported from the Render hot-fix
// (multiplayer.e2e.test.ts › "clocks follow the side to move") and run the
// way the game room will: the clock starts on `sideToMove(initial)` and
// switches to `sideToMove(next)`.
//
// Assert the untouched clock, not just `active_color`. The old server started
// every clock on white and always switched to the other side. On the seeded
// position below black moves, white passes and black is to move again; the
// old code charged white for black's move and then switched to black. Two
// inversions cancel, so `active_color` comes out right on the buggy code.
import { describe, expect, it } from 'vitest';
import { ReversiEngine } from '../../../shared/src/game-logic/reversi/engine';
import type { ReversiGameState } from '../../../shared/src/game-logic/reversi/types';
import { reversiAdapter } from '../adapters/reversi';
import { deductAndSwitch, init, start, type ClockState } from '../clock';
import { TIME_CONTROL_CONFIGS } from '../timeControls';
import type { PlayerColor } from '../sharedTypes';

const T0 = 1_700_000_000_000;
const THINK = 1_500;
const blitz = TIME_CONTROL_CONFIGS.blitz;

/**
 * a1 black, b1 white; a8 black, b8 white. Black's c1 takes b1, which leaves
 * white's b8 with no legal move while black can still play c8, so white must
 * pass and the turn comes straight back to black.
 */
function passPosition(): ReversiGameState {
  const board = Array.from({ length: 8 }, () => Array<{ color: 'black' | 'white' } | null>(8).fill(null));
  board[0][0] = { color: 'black' };
  board[0][1] = { color: 'white' };
  board[7][0] = { color: 'black' };
  board[7][1] = { color: 'white' };
  return { ...ReversiEngine.newGame(), board };
}

/** The room's move path: the adapter decides the position, the clock follows it. */
function move(state: ReversiGameState, clock: ClockState, position: string, now: number) {
  const mover = reversiAdapter.sideToMove(state)!;
  const r = reversiAdapter.apply(state, mover, { type: 'reversi', position });
  if (!r.ok) throw new Error(r.reason);
  const d = deductAndSwitch(clock, reversiAdapter.sideToMove(r.state), now);
  return { game: r.state, clock: d.state, clocks: d.clocks, flagged: d.flagged };
}

describe('reversi clocks follow the side to move', () => {
  it('a reversi game starts on black’s clock, because black opens', () => {
    const initial = reversiAdapter.newGame({});
    expect(reversiAdapter.sideToMove(initial)).toBe('black');
    const clock = init(blitz, reversiAdapter.sideToMove(initial)!, T0);
    expect(clock.active_color).toBe('black');
  });

  it('the opening move is charged to black, and white’s clock starts after it', () => {
    const initial = reversiAdapter.newGame({});
    const clock = start(init(blitz, reversiAdapter.sideToMove(initial)!, T0), T0);
    const r = move(initial, clock, 'd3', T0 + THINK);
    expect(r.clocks).toEqual({ white_ms: 180_000, black_ms: 180_000 - THINK + 2000, active_color: 'white' });
  });

  it('keeps black’s clock running when white has no move and the turn comes back', () => {
    const initial = passPosition();
    const clock = start(init(blitz, reversiAdapter.sideToMove(initial)!, T0), T0);

    const r = move(initial, clock, 'c1', T0 + THINK);
    expect(r.game.currentTurn).toBe('black'); // white passed
    expect(r.game.isGameOver).toBe(false);
    expect(r.game.moveHistory.map(m => m.position)).toEqual(['c1', null]);
    expect(r.flagged).toBe(false);
    expect(r.clocks.active_color).toBe('black');
    // White never had the move: no time spent, no increment earned.
    expect(r.clocks.white_ms).toBe(180_000);
    // Black thought, then earned the +2s blitz increment.
    expect(r.clocks.black_ms).toBeGreaterThan(180_000);
    expect(r.clocks.black_ms).toBeLessThanOrEqual(182_000);
    expect(r.clocks.black_ms).toBe(180_000 - THINK + 2000);
    // And black's clock is the one running now.
    expect(r.clock.running).toBe(true);
    expect(r.clock.active_color).toBe(r.game.currentTurn);
  });

  it('the assertion on white’s clock is the one that catches the old bug', () => {
    // Replays the old policy: white's clock first, then always the other side.
    const initial = passPosition();
    const oldClock = start(init(blitz, 'white' as PlayerColor, T0), T0);
    const r = reversiAdapter.apply(initial, 'black', { type: 'reversi', position: 'c1' });
    if (!r.ok) throw new Error(r.reason);
    const opponent = oldClock.active_color === 'white' ? 'black' : 'white';
    const { clocks } = deductAndSwitch(oldClock, opponent, T0 + THINK);
    expect(clocks.active_color).toBe('black'); // passes on the buggy code...
    expect(clocks.white_ms).not.toBe(180_000); // ...and this does not
  });
});
