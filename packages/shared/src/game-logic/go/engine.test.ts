import { describe, it, expect } from 'vitest';
import { GoEngine } from './engine';
import { boardKey, createInitialGameState } from './utils';
import { getGroup, isSingleSpaceEye } from './moves';
import type { GoBoard, GoColor, GoGameState } from './types';

/**
 * Build a position from a diagram. Rows are given **top first** (rank 9 down to
 * rank 1), which is how a board is drawn and how anyone reading the test will
 * picture it; `board[0]` is rank 1, so the rows are reversed on the way in.
 * `.` empty, `X` black, `O` white. Whitespace is ignored so a diagram can be
 * spaced out for legibility.
 *
 * Some diagrams below are positions that could not arise in play (a group with
 * no liberties still standing, say). That is fine and deliberate: `score` and
 * the legality helpers are pure functions of a board, and constructing the
 * shape directly is far clearer than playing thirty moves to reach it.
 */
function stateFrom(
  rows: string[],
  currentTurn: GoColor,
  overrides: Partial<GoGameState> = {},
): GoGameState {
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
    ...overrides,
  };
}

/**
 * The classic ko shape. White d5 has one liberty (e5); black may take it, and
 * white's recapture at d5 would put the board back exactly as it is here.
 */
const KO_POSITION = [
  '.........',
  '.........',
  '.........',
  '...XO....',
  '..XO.O...',
  '...XO....',
  '.........',
  '.........',
  '.........',
];

describe('GoEngine.newGame', () => {
  it('starts empty, 9x9, black to move, with komi to white', () => {
    const state = GoEngine.newGame();
    expect(state.size).toBe(9);
    expect(state.komi).toBe(7.5);
    expect(state.currentTurn).toBe('black');
    expect(state.board.flat().every(point => point === null)).toBe(true);
    expect(state.captured).toEqual({ black: 0, white: 0 });
  });

  it('offers every intersection as a legal first move', () => {
    expect(GoEngine.getAllLegalMoves(GoEngine.newGame())).toHaveLength(81);
  });

  it('records the empty board as an occurred position', () => {
    expect(GoEngine.newGame().positionKeys).toHaveLength(1);
  });
});

describe('GoEngine — captures', () => {
  it('captures a single surrounded stone and counts it', () => {
    const state = stateFrom(
      [
        '.........',
        '.........',
        '.........',
        '....X....',
        '...XOX...',
        '.........',
        '.........',
        '.........',
        '.........',
      ],
      'black',
    );
    expect(getGroup(state.board, 'e5', 9)!.liberties).toEqual(['e4']);

    const result = GoEngine.validateMove(state, 'e4');
    expect(result.valid).toBe(true);

    const next = result.resultingState!;
    expect(next.board[4][4]).toBeNull(); // e5 is gone
    expect(next.moveHistory[next.moveHistory.length - 1].captures).toEqual(['e5']);
    expect(next.captured).toEqual({ black: 1, white: 0 });
  });

  it('captures a whole connected group at once', () => {
    const state = stateFrom(
      [
        '.........',
        '.........',
        '...X.....',
        '...XOX...',
        '...XOX...',
        '....X....',
        '.........',
        '.........',
        '.........',
      ],
      'black',
    );
    expect(getGroup(state.board, 'e5', 9)!.liberties).toEqual(['e7']);

    const next = GoEngine.executeMove(state, 'e7');
    expect(next.captured.black).toBe(2);
    expect(next.board[4][4]).toBeNull(); // e5
    expect(next.board[5][4]).toBeNull(); // e6
  });

  it('captures two separate groups with a single stone', () => {
    // Black e5 takes the lone white stones on d5 and f5 — two distinct groups,
    // both resolved by one placement.
    const state = stateFrom(
      [
        '.........',
        '.........',
        '.........',
        '...XXX...',
        '..XO.OX..',
        '...XXX...',
        '.........',
        '.........',
        '.........',
      ],
      'black',
    );
    const next = GoEngine.executeMove(state, 'e5');
    const played = next.moveHistory[next.moveHistory.length - 1];
    expect(played.captures.sort()).toEqual(['d5', 'f5']);
    expect(next.captured.black).toBe(2);
  });
});

describe('GoEngine — suicide', () => {
  it('rejects filling the last liberty of a lone stone you just placed', () => {
    const state = stateFrom(
      [
        '.........',
        '.........',
        '.........',
        '....X....',
        '...X.X...',
        '....X....',
        '.........',
        '.........',
        '.........',
      ],
      'white',
    );
    const result = GoEngine.validateMove(state, 'e5');
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/self-capture/i);
    expect(GoEngine.getAllLegalMoves(state)).not.toContain('e5');
  });

  it('rejects a play that would leave your whole group without liberties', () => {
    const state = stateFrom(
      [
        '.........',
        '....X....',
        '...X.X...',
        '...XOX...',
        '...XOX...',
        '....X....',
        '.........',
        '.........',
        '.........',
      ],
      'white',
    );
    // The white pair's one liberty is e7 — and filling it kills all three stones.
    expect(getGroup(state.board, 'e5', 9)!.liberties).toEqual(['e7']);
    const result = GoEngine.validateMove(state, 'e7');
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/self-capture/i);
  });

  it('allows a play with no liberties of its own when it captures', () => {
    // Black e5 has zero liberties on placement, but takes white d5 first —
    // captures resolve before the suicide test, which is what makes ko work.
    const state = stateFrom(KO_POSITION, 'black');
    const result = GoEngine.validateMove(state, 'e5');
    expect(result.valid).toBe(true);
    expect(result.resultingState!.captured.black).toBe(1);
  });
});

describe('GoEngine — ko and superko', () => {
  it('forbids the immediate recapture that would repeat the position', () => {
    const start = stateFrom(KO_POSITION, 'black');
    const afterBlack = GoEngine.executeMove(start, 'e5');

    const recapture = GoEngine.validateMove(afterBlack, 'd5');
    expect(recapture.valid).toBe(false);
    expect(recapture.reason).toMatch(/ko/i);
    expect(GoEngine.getAllLegalMoves(afterBlack)).not.toContain('d5');
  });

  it('allows the recapture once the position has moved on', () => {
    const start = stateFrom(KO_POSITION, 'black');
    let state = GoEngine.executeMove(start, 'e5'); // black takes the ko
    state = GoEngine.executeMove(state, 'a1');     // white plays a ko threat
    state = GoEngine.executeMove(state, 'a9');     // black answers elsewhere

    // Two stones have been added, so retaking no longer repeats a position.
    expect(GoEngine.validateMove(state, 'd5').valid).toBe(true);
  });

  it('looks back through the whole history, not just the previous position', () => {
    // This is what makes it superko rather than a one-point ko rule: the
    // repeated position is the FIRST entry in the history, and stays forbidden
    // however many positions are stacked on top of it.
    const start = stateFrom(KO_POSITION, 'black');
    const afterBlack = GoEngine.executeMove(start, 'e5');
    expect(afterBlack.positionKeys[0]).toBe(boardKey(start.board));

    const withMoreHistory: GoGameState = {
      ...afterBlack,
      positionKeys: [...afterBlack.positionKeys, 'later-position-a', 'later-position-b'],
    };
    expect(GoEngine.validateMove(withMoreHistory, 'd5').valid).toBe(false);
  });

  it('grows the position history by one per placement and none per pass', () => {
    let state = GoEngine.newGame();
    expect(state.positionKeys).toHaveLength(1);
    state = GoEngine.executeMove(state, 'e5');
    expect(state.positionKeys).toHaveLength(2);
    state = GoEngine.executePass(state);
    expect(state.positionKeys).toHaveLength(2);
  });
});

describe('GoEngine — passing and game end', () => {
  it('ends the game after two consecutive passes and scores the board', () => {
    let state = GoEngine.newGame();
    state = GoEngine.executePass(state);
    expect(state.isGameOver).toBe(false);
    expect(state.consecutivePasses).toBe(1);

    state = GoEngine.executePass(state);
    expect(state.isGameOver).toBe(true);
    // An empty board is all neutral, so white wins on komi alone.
    expect(state.winner).toBe('white');
  });

  it('resets the pass count when a stone is played', () => {
    let state = GoEngine.newGame();
    state = GoEngine.executePass(state);
    state = GoEngine.executeMove(state, 'e5');
    expect(state.consecutivePasses).toBe(0);

    state = GoEngine.executePass(state);
    expect(state.isGameOver).toBe(false);
    state = GoEngine.executePass(state);
    expect(state.isGameOver).toBe(true);
  });

  it('records a pass in the move history with a null position', () => {
    const state = GoEngine.executePass(GoEngine.newGame());
    expect(state.moveHistory).toEqual([{ position: null, color: 'black', captures: [] }]);
  });

  it('rejects any move once the game is over', () => {
    let state = GoEngine.newGame();
    state = GoEngine.executePass(state);
    state = GoEngine.executePass(state);
    expect(GoEngine.validateMove(state, 'e5').valid).toBe(false);
    expect(GoEngine.getAllLegalMoves(state)).toEqual([]);
    expect(GoEngine.mustPass(state)).toBe(false);
  });

  it('reports mustPass only for a side with no legal point at all', () => {
    // 3×3: black surrounds two separate eyes at b1 and b3. Filling either is
    // self-capture for WHITE (nothing to take, no liberty left), while black
    // may fill one because its group still has the other.
    const twoEyes = stateFrom(['X.X', 'XXX', 'X.X'], 'white');

    expect(GoEngine.getAllLegalMoves(twoEyes)).toEqual([]);
    expect(GoEngine.mustPass(twoEyes)).toBe(true);

    const blackToPlay = { ...twoEyes, currentTurn: 'black' as const };
    expect(GoEngine.getAllLegalMoves(blackToPlay)).toEqual(['b1', 'b3']);
    expect(GoEngine.mustPass(blackToPlay)).toBe(false);

    expect(GoEngine.mustPass(GoEngine.newGame())).toBe(false);
  });
});

describe('GoEngine.score — Tromp-Taylor area scoring', () => {
  /** A black wall on file d and a white wall on file f, with file e between them. */
  const WALLS = [
    '...X.O...',
    '...X.O...',
    '...X.O...',
    '...X.O...',
    '...X.O...',
    '...X.O...',
    '...X.O...',
    '...X.O...',
    '...X.O...',
  ];

  it('gives each colour its stones plus the empty points only it borders', () => {
    const state = stateFrom(WALLS, 'black');
    const score = GoEngine.score(state);
    expect(score.black).toBe(9 + 27); // stones + files a–c
    expect(score.white).toBe(9 + 27 + 7.5); // stones + files g–i + komi
    expect(score.lead).toBe(-7.5);
    expect(GoEngine.determineWinner(state)).toBe('white');
  });

  it('counts a region touching both colours for nobody', () => {
    // File e borders black and white, so it is dame and scores for neither.
    // Seki needs no special case for the same reason: the liberties two live
    // groups share touch both colours, so they fall out of the count here.
    const { black, white, komi } = GoEngine.score(stateFrom(WALLS, 'black'));
    expect(black + (white - komi)).toBe(81 - 9);
  });

  it('gives an empty board to white on komi', () => {
    expect(GoEngine.score(GoEngine.newGame())).toEqual({
      black: 0,
      white: 7.5,
      komi: 7.5,
      lead: -7.5,
    });
  });

  it('lets komi decide a game black leads on the board', () => {
    // A filled board: 44 black points against 37 white. Black is 7 ahead on
    // the board and loses by half a point once komi is added.
    const state = stateFrom(
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
      'black',
    );
    const score = GoEngine.score(state);
    expect(score.black).toBe(44);
    expect(score.white).toBe(37 + 7.5);
    expect(score.lead).toBe(-0.5);
    expect(GoEngine.determineWinner(state)).toBe('white');
  });
});

describe('GoEngine — move mechanics', () => {
  it('alternates turns and stores the move played', () => {
    const state = GoEngine.executeMove(GoEngine.newGame(), 'd4');
    expect(state.currentTurn).toBe('white');
    expect(state.moveHistory).toEqual([{ position: 'd4', color: 'black', captures: [] }]);
  });

  it('rejects an occupied point and a point off the board', () => {
    const state = GoEngine.executeMove(GoEngine.newGame(), 'd4');
    expect(GoEngine.validateMove(state, 'd4').valid).toBe(false);
    expect(GoEngine.validateMove(state, 'z9').valid).toBe(false);
    expect(GoEngine.validateMove(state, 'a99').valid).toBe(false);
    expect(GoEngine.validateMove(state, 'nonsense').valid).toBe(false);
  });

  it('never mutates the state it was given', () => {
    const state = GoEngine.newGame();
    const before = boardKey(state.board);
    GoEngine.executeMove(state, 'e5');
    GoEngine.executePass(state);
    expect(boardKey(state.board)).toBe(before);
    expect(state.moveHistory).toHaveLength(0);
    expect(state.positionKeys).toHaveLength(1);
  });

  it('throws when executeMove is handed an illegal move', () => {
    const state = GoEngine.executeMove(GoEngine.newGame(), 'd4');
    expect(() => GoEngine.executeMove(state, 'd4')).toThrow();
  });
});

describe('isSingleSpaceEye', () => {
  it('recognises a true eye in the centre', () => {
    const state = stateFrom(
      [
        '.........',
        '.........',
        '...XXX...',
        '...X.X...',
        '...XXX...',
        '.........',
        '.........',
        '.........',
        '.........',
      ],
      'black',
    );
    expect(isSingleSpaceEye(state.board, 'e6', 'black', 9)).toBe(true);
    expect(isSingleSpaceEye(state.board, 'e6', 'white', 9)).toBe(false);
  });

  it('demands every diagonal in the corner', () => {
    // a1 is surrounded orthogonally by black, but white holds the one diagonal
    // — a false eye, and filling it is exactly what a playout must still allow.
    const state = stateFrom(
      [
        '.........',
        '.........',
        '.........',
        '.........',
        '.........',
        '.........',
        '.........',
        'XO.......',
        '.X.......',
      ],
      'black',
    );
    expect(isSingleSpaceEye(state.board, 'a1', 'black', 9)).toBe(false);
  });

  it('is never an eye on an occupied point', () => {
    const state = GoEngine.executeMove(GoEngine.newGame(), 'e5');
    expect(isSingleSpaceEye(state.board, 'e5', 'black', 9)).toBe(false);
  });
});
