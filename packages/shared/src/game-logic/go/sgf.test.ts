/**
 * SGF export and import.
 *
 * The assertion that matters most is the **coordinate flip**. SGF counts rows
 * down from the top; the engine counts ranks up from the bottom. A file written
 * with that backwards is still valid SGF, still opens in every other program,
 * and shows the game upside down — so it is checked against a hand-worked
 * example rather than only round-tripped, because a round trip is happy to be
 * consistently wrong.
 */
import { describe, it, expect } from 'vitest';
import { GoEngine } from './engine';
import { fromSgfPoint, parseSgf, sgfToState, sgfToTimeline, stateToSgf, toSgfPoint } from './sgf';

describe('coordinates', () => {
  it('flips the row, because SGF counts down from the top', () => {
    // On a 9x9 board `a1` is the BOTTOM-left. SGF's `a` row is the TOP, so the
    // bottom rank is its ninth letter, `i`.
    expect(toSgfPoint('a1', 9)).toBe('ai');
    expect(toSgfPoint('a9', 9)).toBe('aa');
    // And on 19x19, the 4-4 point Go players call Q16.
    expect(toSgfPoint('p16', 19)).toBe('pd');
  });

  it('does not skip I the way the display coordinates do', () => {
    // `notation.ts` maps this same point to J9 for a human, because board
    // labels skip I. SGF does not, and conflating the two is the classic bug.
    expect(toSgfPoint('i9', 9)).toBe('ia');
  });

  it('round-trips every point on the board', () => {
    for (const size of [9, 13, 19]) {
      for (let row = 0; row < size; row++) {
        for (let col = 0; col < size; col++) {
          const position = String.fromCharCode(97 + col) + (row + 1);
          expect(fromSgfPoint(toSgfPoint(position, size), size)).toBe(position);
        }
      }
    }
  });

  it('reads both spellings of a pass', () => {
    expect(fromSgfPoint('', 19)).toBeNull();
    // What older programs wrote before the empty form was standardised.
    expect(fromSgfPoint('tt', 19)).toBeNull();
  });

  it('refuses a coordinate off the board rather than clamping it', () => {
    expect(() => fromSgfPoint('ss', 9)).toThrow(/Invalid SGF coordinate/);
  });
});

describe('export', () => {
  it('writes a header a Go program can read', () => {
    const state = GoEngine.newGame({ size: 19, komi: 6.5, scoring: 'territory' });
    const sgf = stateToSgf(state, { date: '2026-09-04' });

    expect(sgf.startsWith('(;')).toBe(true);
    expect(sgf).toContain('FF[4]');
    expect(sgf).toContain('GM[1]');
    expect(sgf).toContain('SZ[19]');
    expect(sgf).toContain('KM[6.5]');
    // Territory scoring is what the rest of the world calls Japanese rules.
    expect(sgf).toContain('RU[Japanese]');
    expect(sgf).toContain('DT[2026-09-04]');
    expect(sgf.endsWith(')')).toBe(true);
  });

  it('labels area scoring as Chinese, which is what readers understand', () => {
    const sgf = stateToSgf(GoEngine.newGame({ scoring: 'area' }));
    expect(sgf).toContain('RU[Chinese]');
  });

  it('writes the moves in order, with the right colour on each', () => {
    let state = GoEngine.newGame();
    state = GoEngine.executeMove(state, 'd4');
    state = GoEngine.executeMove(state, 'f6');
    const sgf = stateToSgf(state);
    expect(sgf).toContain(';B[df];W[fd]');
  });

  it('writes a pass as the empty value', () => {
    let state = GoEngine.newGame();
    state = GoEngine.executePass(state);
    expect(stateToSgf(state)).toContain(';B[]');
  });

  it('carries the result once the game has been scored', () => {
    let state = GoEngine.newGame();
    state = GoEngine.executePass(state);
    state = GoEngine.executePass(state);
    state = GoEngine.finalize(state, []);
    // An empty board is all neutral, so White wins on komi alone.
    expect(stateToSgf(state)).toContain('RE[W+7.5]');
  });

  it('says nothing about the result of a game still in progress', () => {
    const state = GoEngine.executeMove(GoEngine.newGame(), 'd4');
    expect(stateToSgf(state)).not.toContain('RE[');
  });

  it('escapes a player name that would otherwise close the property', () => {
    const sgf = stateToSgf(GoEngine.newGame(), { blackName: 'a]b\\c' });
    expect(sgf).toContain('PB[a\\]b\\\\c]');
  });
});

describe('import', () => {
  it('reads a file written by another program', () => {
    // Shaped like what OGS exports, including properties we do not model.
    const sgf =
      '(;FF[4]CA[UTF-8]GM[1]DT[2024-01-01]PC[OGS]GN[Test]PB[Black]PW[White]' +
      'BR[5k]WR[4k]TM[600]RE[B+3.5]SZ[19]KM[6.5]RU[Japanese]' +
      ';B[pd];W[dp]C[a comment];B[qp];W[dd])';

    const parsed = parseSgf(sgf);
    expect(parsed.size).toBe(19);
    expect(parsed.komi).toBe(6.5);
    expect(parsed.scoring).toBe('territory');
    expect(parsed.result).toBe('B+3.5');
    expect(parsed.blackName).toBe('Black');
    expect(parsed.whiteName).toBe('White');
    expect(parsed.moves).toEqual(['p16', 'd4', 'q4', 'd16']);
  });

  it('does not mistake a player name or a result for a move', () => {
    /*
     * The trap a naive `/\[([a-z]{2})\]/` regex falls into: `PB[Black]` and
     * `RE[B+3.5]` both contain something that looks like a move property. The
     * matcher requires a node marker, so neither is read as one.
     */
    const parsed = parseSgf('(;FF[4]GM[1]SZ[9]PB[bb]PW[cc]RE[B+1];B[dd])');
    expect(parsed.moves).toEqual(['d6']);
  });

  it('reads an unlabelled ruleset as area, the modern default', () => {
    expect(parseSgf('(;FF[4]GM[1]SZ[9];B[cc])').scoring).toBe('area');
  });

  it('refuses a file with no board size rather than guessing one', () => {
    // Guessing 9x9 would import a 19x19 game as a truncated 9x9 one: a
    // plausible, wrong game with no error anywhere.
    expect(() => parseSgf('(;FF[4]GM[1];B[cc])')).toThrow(/no board size/);
  });

  it('refuses a file that is not Go', () => {
    expect(() => parseSgf('(;FF[4]GM[2]SZ[8])')).toThrow(/Not a Go game/);
  });

  it('refuses a rectangular board', () => {
    expect(() => parseSgf('(;FF[4]GM[1]SZ[19:9])')).toThrow(/Rectangular/);
  });

  it('refuses something that is not SGF at all', () => {
    expect(() => parseSgf('{"moves": []}')).toThrow(/Not an SGF file/);
  });
});

describe('round trip', () => {
  it('replays an exported game back to the same board', () => {
    let state = GoEngine.newGame({ size: 13, komi: 0.5, scoring: 'territory' });
    for (const move of ['d4', 'j10', 'd10', 'j4', 'g7']) {
      state = GoEngine.executeMove(state, move);
    }
    state = GoEngine.executePass(state);

    const restored = sgfToState(stateToSgf(state));

    expect(restored.size).toBe(13);
    expect(restored.komi).toBe(0.5);
    expect(restored.scoring).toBe('territory');
    expect(restored.board).toEqual(state.board);
    expect(restored.moveHistory.map((m) => m.position)).toEqual(
      state.moveHistory.map((m) => m.position),
    );
  });

  it('survives a game with captures in it', () => {
    // Captures are not written to the file — SGF stores moves, and which stones
    // came off is derived by replaying the rules. This is the assertion that
    // the derivation actually agrees.
    let state = GoEngine.newGame();
    for (const move of ['d4', 'd5', 'e5', 'c4', 'd3', 'e4', 'c5', 'd6']) {
      state = GoEngine.executeMove(state, move);
    }
    const restored = sgfToState(stateToSgf(state));
    expect(restored.board).toEqual(state.board);
    expect(restored.captured).toEqual(state.captured);
  });

  it('stops at a move the rules reject rather than throwing the file away', () => {
    // A foreign file may contain handicap setup or a ruleset detail we do not
    // model. Half a game beats none.
    const state = sgfToState('(;FF[4]GM[1]SZ[9];B[cc];W[cc];B[dd])');
    expect(state.moveHistory).toHaveLength(1);
  });
});

describe('sgfToTimeline', () => {
  /*
   * What review actually reads. Grading a move means comparing the position
   * before it with the position after, so the file is played out once and every
   * position is kept — rather than reduced to a final board and replayed from
   * its own move list by each screen.
   */
  const game = '(;FF[4]GM[1]SZ[19]KM[6.5]RU[Japanese];B[pd];W[dp];B[qp];W[dd])';

  it('opens on the empty board and adds one position per move', () => {
    const timeline = sgfToTimeline(game);
    expect(timeline).toHaveLength(5);
    expect(timeline[0].moveHistory).toHaveLength(0);
    // ENGINE coordinates, which are the third system in play and the one that
    // does NOT skip I: the file's `pd` is engine `p16`, and a Go player reads
    // that point as Q16. Only `toGoPoint` may put it on a screen.
    expect(timeline[4].moveHistory.map((m) => m.position)).toEqual(['p16', 'd4', 'q4', 'd16']);
  });

  it('carries the file’s ruleset into every position', () => {
    for (const state of sgfToTimeline(game)) {
      expect(state.size).toBe(19);
      expect(state.komi).toBe(6.5);
      expect(state.scoring).toBe('territory');
    }
  });

  it('ends where sgfToState says the game ends', () => {
    const timeline = sgfToTimeline(game);
    expect(timeline[timeline.length - 1]).toEqual(sgfToState(game));
  });

  it('records passes, which are moves', () => {
    const timeline = sgfToTimeline('(;FF[4]GM[1]SZ[9];B[cc];W[];B[])');
    expect(timeline).toHaveLength(4);
    expect(timeline[3].phase).toBe('marking');
  });

  it('comes back as a single position when there is nothing to review', () => {
    // Parses cleanly and has no moves — the length the screens refuse on.
    expect(sgfToTimeline('(;FF[4]GM[1]SZ[19]KM[6.5])')).toHaveLength(1);
  });

  it('stops at a move the rules reject, keeping the part that is real', () => {
    expect(sgfToTimeline('(;FF[4]GM[1]SZ[9];B[cc];W[cc];B[dd])')).toHaveLength(2);
  });
});
