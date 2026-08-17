import { describe, it, expect } from 'vitest';
import { GoEngine } from './engine';
import { boardKey, createInitialGameState } from './utils';
import {
  analyzeGoPosition,
  getBestGoMove,
  goEloToConfig,
  __testing,
} from './bot';
import type { GoBoard, GoColor, GoGameState } from './types';

const { geometryFor, toFastBoard, scoreFast, createScratch } = __testing;

function stateFrom(rows: string[], currentTurn: GoColor): GoGameState {
  const cleaned = rows.map(row => row.replace(/\s/g, ''));
  const size = cleaned.length;
  const board: GoBoard = cleaned
    .slice()
    .reverse()
    .map(row => row.split('').map(ch => (ch === 'X' ? 'black' : ch === 'O' ? 'white' : null)));
  return {
    ...createInitialGameState({ size }),
    board,
    currentTurn,
    positionKeys: [boardKey(board)],
  };
}

/**
 * Play a whole game between two bots. Seeds vary per move so a fixed run seed
 * still produces a real game rather than the same decision repeatedly.
 */
async function playBotGame(
  seed: number,
  elo = 700,
  moveCap = 400,
): Promise<{ state: GoGameState; moves: number }> {
  let state = GoEngine.newGame();
  let moves = 0;

  while (!state.isGameOver && moves < moveCap) {
    const { position } = await getBestGoMove(state, elo, { seed: seed + moves });
    state = position === null
      ? GoEngine.executePass(state)
      : GoEngine.executeMove(state, position);
    moves++;
  }
  return { state, moves };
}

describe('goEloToConfig', () => {
  it('buys strength with playouts and sells weakness with random moves', () => {
    const weak = goEloToConfig(400);
    const strong = goEloToConfig(2000);
    expect(weak.iterations).toBeLessThan(strong.iterations);
    expect(weak.randomChance).toBeGreaterThan(strong.randomChance);
    expect(strong.randomChance).toBe(0);
  });

  it('interpolates inside a band and clamps outside the ladder', () => {
    const low = goEloToConfig(1000);
    const mid = goEloToConfig(1150);
    const high = goEloToConfig(1300);
    expect(mid.iterations).toBeGreaterThan(low.iterations);
    expect(mid.iterations).toBeLessThan(high.iterations);

    expect(goEloToConfig(100)).toEqual(goEloToConfig(400));
    expect(goEloToConfig(5000)).toEqual(goEloToConfig(2000));
  });
});

describe('scoreFast — the playout scorer agrees with the engine', () => {
  // Two independent implementations of Tromp-Taylor area scoring: the engine's
  // readable one over the immutable board, and the flat one the playouts use
  // millions of times. Cross-checking them is what keeps the bot honest about
  // who won a playout.
  const positions: string[][] = [
    [
      '...X.O...',
      '...X.O...',
      '...X.O...',
      '...X.O...',
      '...X.O...',
      '...X.O...',
      '...X.O...',
      '...X.O...',
      '...X.O...',
    ],
    [
      'XXXXXXXXX',
      'XXXXXXXXX',
      'XXXXXXXXX',
      'XXXXXXXXX',
      'OXXXXXXXX',
      'OOOOOOOOO',
      'OOOOOOOOO',
      'OOOOOOOOO',
      'OOOOOOOOO',
    ],
    [
      '.........',
      '..XXX....',
      '..X.X....',
      '..XXX....',
      '.....OOO.',
      '.....O.O.',
      '.....OOO.',
      '.........',
      '.........',
    ],
  ];

  it.each(positions.map((rows, i) => [i, rows] as const))(
    'matches GoEngine.score on position %i',
    (_i, rows) => {
      const state = stateFrom(rows, 'black');
      const geo = geometryFor(state.size);
      const fast = scoreFast(toFastBoard(state), geo, createScratch(geo.points));
      const { black, white, komi } = GoEngine.score(state);
      expect(fast).toBe(black - (white - komi));
    },
  );

  it('scores an empty board as level before komi', () => {
    const state = GoEngine.newGame();
    const geo = geometryFor(state.size);
    expect(scoreFast(toFastBoard(state), geo, createScratch(geo.points))).toBe(0);
  });
});

describe('getBestGoMove', () => {
  it('returns a legal move at every strength', async () => {
    const state = GoEngine.newGame();
    for (const elo of [400, 800, 1200, 1600, 2000]) {
      const { position } = await getBestGoMove(state, elo, { seed: 7 });
      expect(position).not.toBeNull();
      expect(GoEngine.validateMove(state, position as string).valid).toBe(true);
    }
  }, 30_000);

  it('never suggests a point the ko rule forbids', async () => {
    const start = stateFrom(
      [
        '.........',
        '.........',
        '.........',
        '...XO....',
        '..XO.O...',
        '...XO....',
        '.........',
        '.........',
        '.........',
      ],
      'black',
    );
    const afterBlack = GoEngine.executeMove(start, 'e5'); // white to move, d5 is ko
    for (let seed = 0; seed < 12; seed++) {
      const { position } = await getBestGoMove(afterBlack, 700, { seed });
      expect(position).not.toBe('d5');
    }
  });

  it('is deterministic for a given seed and position', async () => {
    const state = GoEngine.executeMove(GoEngine.newGame(), 'e5');
    const first = await getBestGoMove(state, 1300, { seed: 42 });
    const second = await getBestGoMove(state, 1300, { seed: 42 });
    expect(second.position).toBe(first.position);
  });

  it('passes when the opponent has passed and it is winning', async () => {
    // Black owns the whole board and white has just passed: taking the win is
    // the only sensible answer.
    let state = stateFrom(
      [
        'XXXXXXXXX',
        'XXXXXXXXX',
        'XXXXXXXXX',
        'XXXXXXXXX',
        'XXXXXXXXX',
        'XXXXXXXXX',
        'XXXXXXXXX',
        'XXXXXXXXX',
        'XXXXXXXX.',
      ],
      'white',
    );
    state = GoEngine.executePass(state); // white passes, black to move and far ahead

    const { position } = await getBestGoMove(state, 1300, { seed: 3 });
    expect(position).toBeNull();

    const ended = GoEngine.executePass(state);
    expect(ended.isGameOver).toBe(true);
    expect(ended.winner).toBe('black');
  });

  it('plays on when the opponent passes while it is behind', async () => {
    // White has just passed, but black is losing on the board — passing would
    // end the game as a loss, so it must keep playing.
    let state = stateFrom(
      [
        'OOOOOOOOO',
        'OOOOOOOOO',
        'OOOOOOOOO',
        'OOOOOOOOO',
        'OOOOOOOOO',
        'OOOOOOOOO',
        'OOOOOOOO.',
        '.........',
        '.........',
      ],
      'white',
    );
    state = GoEngine.executePass(state);
    expect(state.currentTurn).toBe('black');

    const { position } = await getBestGoMove(state, 1300, { seed: 5 });
    expect(position).not.toBeNull();
  });

  it('passes when it has no move that is not its own eye', async () => {
    // Black fills the board but for two eyes; every legal point is an eye.
    const state = stateFrom(['X.X', 'XXX', 'X.X'], 'black');
    expect(GoEngine.getAllLegalMoves(state)).toEqual(['b1', 'b3']);
    const { position } = await getBestGoMove(state, 1300, { seed: 9 });
    expect(position).toBeNull();
  });

  it('refuses to move once the game is over', async () => {
    let state = GoEngine.newGame();
    state = GoEngine.executePass(state);
    state = GoEngine.executePass(state);
    await expect(getBestGoMove(state, 1000)).rejects.toThrow(/over/i);
  });

  it('honours an abort signal', async () => {
    const state = GoEngine.newGame();
    const signal = { aborted: true };
    await expect(getBestGoMove(state, 2000, { seed: 1, signal })).rejects.toMatchObject({
      name: 'AbortError',
    });
  });
});

describe('getBestGoMove — Go knowledge that must survive', () => {
  it('takes a stone that is one liberty from capture', async () => {
    // White's three stones have a single liberty at e5. Any reasonable strength
    // should take them rather than play elsewhere.
    const state = stateFrom(
      [
        '.........',
        '.........',
        '.........',
        '...XXX...',
        '..XOOO...',
        '...XXX...',
        '.........',
        '.........',
        '.........',
      ],
      'black',
    );
    const { position } = await getBestGoMove(state, 1600, { seed: 11 });
    expect(position).toBe('g5');
  });

  it('does not fill its own eye while it still has a real move', async () => {
    // Black is alive with two eyes at b1/b3 on a 5x5 and has ordinary points
    // left; filling an eye would be self-destruction.
    const state = stateFrom(
      [
        '.....',
        '.....',
        'X.X..',
        'XXX..',
        'X.X..',
      ],
      'black',
    );
    for (let seed = 0; seed < 6; seed++) {
      const { position } = await getBestGoMove(state, 1600, { seed });
      expect(position).not.toBe('b1');
      expect(position).not.toBe('b3');
    }
  });
});

describe('analyzeGoPosition', () => {
  it('reads a won position as won for the side ahead', async () => {
    const state = stateFrom(
      [
        'XXXXXXXXX',
        'XXXXXXXXX',
        'XXXXXXXXX',
        'XXXXXXXXX',
        'XXXXXXXX.',
        '.........',
        '.........',
        '.........',
        '.........',
      ],
      'black',
    );
    const result = await analyzeGoPosition(state, { seed: 4, iterations: 400 });
    expect(result.winRate).toBeGreaterThan(0.9);
    expect(result.scoreLead).toBeGreaterThan(0);
  });

  it('scores a finished game from the rules rather than the search', async () => {
    let state = GoEngine.newGame();
    state = GoEngine.executePass(state);
    state = GoEngine.executePass(state);
    const result = await analyzeGoPosition(state, { seed: 1 });
    expect(result.position).toBeNull();
    expect(result.scoreLead).toBe(-7.5); // empty board, white on komi
  });

  it('suggests a legal move in an ordinary position', async () => {
    const state = GoEngine.executeMove(GoEngine.newGame(), 'e5');
    const result = await analyzeGoPosition(state, { seed: 2, iterations: 300 });
    expect(GoEngine.validateMove(state, result.position as string).valid).toBe(true);
  });
});

describe('bot-vs-bot harness', () => {
  // The health check the plan calls for: every configuration must reach a real
  // end by two passes, not by running out of moves. A Go bot that will not pass
  // is the classic way this feature never finishes a game.
  it.each([1, 2, 3, 4, 5])('finishes a full game from seed %i', async seed => {
    const { state, moves } = await playBotGame(seed, 700);

    expect(state.isGameOver).toBe(true);
    expect(state.consecutivePasses).toBe(2);
    expect(moves).toBeLessThan(400);

    const score = GoEngine.score(state);
    expect(score.black + score.white).toBeGreaterThan(0);
    // Area scoring accounts for every point except dame.
    expect(score.black + (score.white - score.komi)).toBeLessThanOrEqual(81);
    expect(state.winner).toBe(score.lead > 0 ? 'black' : 'white');
  }, 60_000);

  it('replays a game exactly from the same seed', async () => {
    const first = await playBotGame(77, 700);
    const second = await playBotGame(77, 700);
    expect(boardKey(second.state.board)).toBe(boardKey(first.state.board));
    expect(second.moves).toBe(first.moves);
  }, 60_000);

  it('gives the stronger tier the better of the weaker one', async () => {
    // The ladder has to point the right way, or a "Master" tier is a lie and the
    // rating a player earns against it means nothing. Deliberately run at the
    // two cheapest tiers that still differ by 10x in playouts — the same check
    // at 1600 vs 500 takes minutes, and this catches an inverted ladder just as
    // well. Seeds are fixed, so the result is deterministic, not a coin flip.
    let strongWins = 0;
    const games = 4;

    for (let i = 0; i < games; i++) {
      const strongIsBlack = i % 2 === 0;
      const black = strongIsBlack ? 1000 : 400;
      const white = strongIsBlack ? 400 : 1000;

      let state = GoEngine.newGame();
      let moves = 0;
      while (!state.isGameOver && moves < 400) {
        const elo = state.currentTurn === 'black' ? black : white;
        const { position } = await getBestGoMove(state, elo, { seed: 500 + i * 97 + moves });
        state = position === null
          ? GoEngine.executePass(state)
          : GoEngine.executeMove(state, position);
        moves++;
      }
      if (state.winner === (strongIsBlack ? 'black' : 'white')) strongWins++;
    }

    expect(strongWins).toBeGreaterThanOrEqual(3);
  }, 120_000);

  it('leaves living groups on the board rather than filling every point', async () => {
    // If the eye exclusion were missing, random play would fill the board
    // completely and both sides would end with almost no enclosed territory.
    const { state } = await playBotGame(21, 1000);
    const empties = state.board.flat().filter(point => point === null).length;
    expect(empties).toBeGreaterThan(0);
  }, 60_000);
});
