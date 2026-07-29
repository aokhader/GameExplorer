import { ChessEngine, CheckersEngine, ReversiEngine } from '@gameexplorer/shared';
import { chessAnalysis, checkersAnalysis, reversiAnalysis } from '@/analysis/adapters';

const mockEvaluation = jest.fn();
const mockAvailable = jest.fn(() => true);

jest.mock('@/engine/chessEngineNative', () => ({
  getEngineEvaluation: (...args: unknown[]) => mockEvaluation(...args),
  isEngineAvailable: () => mockAvailable(),
}));

beforeEach(() => {
  mockAvailable.mockReset().mockReturnValue(true);
  mockEvaluation.mockReset();
});

describe('chessAnalysis — sign normalisation', () => {
  /** A position with Black to move: 1. e4. */
  function blackToMove() {
    const r = ChessEngine.validateMove(ChessEngine.newGame(), 'e2', 'e4');
    return r.resultingState!;
  }

  it('passes a White-to-move score straight through', async () => {
    mockEvaluation.mockResolvedValue({ cp: 120, mate: null, depth: 18, bestMove: null });
    const result = await chessAnalysis.evaluate(ChessEngine.newGame(), 300);
    expect(result.score).toBe(120);
  });

  it('flips a Black-to-move score, since UCI reports side-to-move relative', async () => {
    // +120 for Black to move means Black is better, which is -120 White-positive.
    // Without the flip, every other move of a game would read inverted — the
    // single most consequential bug this layer can have.
    mockEvaluation.mockResolvedValue({ cp: 120, mate: null, depth: 18, bestMove: null });
    const result = await chessAnalysis.evaluate(blackToMove(), 300);
    expect(result.score).toBe(-120);
  });

  it('reports a mate for the side to move as a mate for that colour', async () => {
    mockEvaluation.mockResolvedValue({ cp: null, mate: 3, depth: 12, bestMove: null });
    expect((await chessAnalysis.evaluate(ChessEngine.newGame(), 300)).mate).toBe(3);
    expect((await chessAnalysis.evaluate(blackToMove(), 300)).mate).toBe(-3);
  });

  it('scores a mate far above any material edge, so it always wins the comparison', async () => {
    mockEvaluation.mockResolvedValue({ cp: null, mate: 2, depth: 12, bestMove: null });
    const mate = await chessAnalysis.evaluate(ChessEngine.newGame(), 300);

    mockEvaluation.mockResolvedValue({ cp: 2000, mate: null, depth: 12, bestMove: null });
    const huge = await chessAnalysis.evaluate(ChessEngine.newGame(), 300);

    expect(mate.score).toBeGreaterThan(huge.score);
    expect(Number.isFinite(mate.score)).toBe(true);
  });

  it('prefers a faster mate', async () => {
    mockEvaluation.mockResolvedValue({ cp: null, mate: 1, depth: 12, bestMove: null });
    const fast = await chessAnalysis.evaluate(ChessEngine.newGame(), 300);
    mockEvaluation.mockResolvedValue({ cp: null, mate: 5, depth: 12, bestMove: null });
    const slow = await chessAnalysis.evaluate(ChessEngine.newGame(), 300);

    expect(fast.score).toBeGreaterThan(slow.score);
  });

  it('refuses to guess when the engine is not in this build', async () => {
    mockAvailable.mockReturnValue(false);
    await expect(chessAnalysis.evaluate(ChessEngine.newGame(), 300)).rejects.toThrow(
      'Engine unavailable',
    );
  });

  it('formats pawns, mates, and checkmate', () => {
    const base = { bestMove: null, terminal: false };
    expect(chessAnalysis.formatScore({ ...base, score: 125, mate: null })).toBe('+1.25');
    expect(chessAnalysis.formatScore({ ...base, score: -80, mate: null })).toBe('-0.80');
    // Dead level carries no sign, the way every chess UI prints it.
    expect(chessAnalysis.formatScore({ ...base, score: 0, mate: null })).toBe('0.00');
    expect(chessAnalysis.formatScore({ ...base, score: 99_997, mate: 3 })).toBe('Mate in 3 for White');
    expect(chessAnalysis.formatScore({ ...base, score: -99_997, mate: -3 })).toBe(
      'Mate in 3 for Black',
    );
    // Mate already on the board: `mate: 0` has no side of its own, so the
    // winner comes off the score.
    expect(chessAnalysis.formatScore({ ...base, score: 100_000, mate: 0 })).toBe(
      'Checkmate — White wins',
    );
    expect(chessAnalysis.formatScore({ ...base, score: -100_000, mate: 0 })).toBe(
      'Checkmate — Black wins',
    );
  });
});

describe('chessAnalysis — finished positions', () => {
  /** Fool's mate: 1. f3 e5 2. g4 Qh4#. */
  function foolsMate() {
    let s = ChessEngine.newGame();
    for (const [from, to] of [
      ['f2', 'f3'],
      ['e7', 'e5'],
      ['g2', 'g4'],
      ['d8', 'h4'],
    ] as const) {
      s = ChessEngine.validateMove(s, from, to).resultingState!;
    }
    return s;
  }

  it('scores a mated position from the rules, never from the engine', async () => {
    // Arasan answers a mated root with a bare `bestmove (none)` and no score
    // line, which used to surface as a flat 0.00 on the one position whose
    // result is least ambiguous. Device-caught; pinned here.
    const state = foolsMate();
    expect(state.isCheckmate).toBe(true);

    const result = await chessAnalysis.evaluate(state, 300);

    expect(mockEvaluation).not.toHaveBeenCalled();
    expect(result.terminal).toBe(true);
    expect(result.mate).toBe(0);
    // White is the side to move and is mated, so Black won.
    expect(result.score).toBeLessThan(0);
    expect(chessAnalysis.formatScore(result)).toBe('Checkmate — Black wins');
    expect(chessAnalysis.whiteShare(result)).toBeLessThan(0.1);
  });

  it('needs no engine at all for a finished game', async () => {
    // Review of a completed game must not fail on a build without the engine.
    mockAvailable.mockReturnValue(false);
    await expect(chessAnalysis.evaluate(foolsMate(), 300)).resolves.toMatchObject({
      terminal: true,
    });
  });
});

describe('analysis adapters — eval bar share', () => {
  const adapters = [
    ['chess', chessAnalysis],
    ['checkers', checkersAnalysis],
    ['reversi', reversiAnalysis],
  ] as const;

  it.each(adapters)('keeps %s inside the bar and level at zero', (_name, adapter) => {
    const at = (score: number) =>
      adapter.whiteShare({ score, mate: null, bestMove: null, terminal: false });

    expect(at(0)).toBeCloseTo(0.5, 5);
    expect(at(50_000)).toBeLessThanOrEqual(1);
    expect(at(-50_000)).toBeGreaterThanOrEqual(0);
    // Monotonic: more White advantage never shrinks White's share.
    expect(at(300)).toBeGreaterThan(at(100));
    expect(at(-300)).toBeLessThan(at(-100));
  });

  it('pins the bar for a forced mate rather than squashing a huge number', () => {
    // Score and mate always travel together out of `evaluate` — a mate score is
    // ±(MATE_SCORE - n), which is what the bar reads its side from.
    const mateFor = (mate: number) => ({
      score: mate > 0 ? 100_000 - mate : -100_000 - mate,
      mate,
      bestMove: null,
      terminal: false,
    });
    expect(chessAnalysis.whiteShare(mateFor(2))).toBeGreaterThan(0.9);
    expect(chessAnalysis.whiteShare(mateFor(-2))).toBeLessThan(0.1);
  });
});

describe('analysis adapters — last move', () => {
  it('reads the chess move that produced a state', () => {
    const after = ChessEngine.validateMove(ChessEngine.newGame(), 'e2', 'e4').resultingState!;
    expect(chessAnalysis.lastMove(after)).toMatchObject({ from: 'e2', to: 'e4' });
    expect(chessAnalysis.lastMove(ChessEngine.newGame())).toBeNull();
  });

  it('reads the checkers move that produced a state', () => {
    const start = CheckersEngine.newGame();
    const move = CheckersEngine.getAllLegalMoves(start)[0];
    const after = CheckersEngine.executeMove(start, move);
    expect(checkersAnalysis.lastMove(after)).toEqual({ from: move.from, to: move.to });
  });

  it('collapses a reversi placement to one square', () => {
    const start = ReversiEngine.newGame();
    const after = ReversiEngine.executeMove(start, 'd3');
    expect(reversiAnalysis.lastMove(after)).toEqual({ from: 'd3', to: 'd3' });
  });

  it('reports a reversi pass as no move, so review cannot blame it on anyone', () => {
    const passed = ReversiEngine.executePass(ReversiEngine.newGame());
    expect(reversiAnalysis.lastMove(passed)).toBeNull();
  });
});

describe('analysis adapters — board-game scoring', () => {
  it('scores checkers White-positive and finds a legal move', async () => {
    const state = CheckersEngine.newGame();
    const result = await checkersAnalysis.evaluate(state, 0);

    expect(Math.abs(result.score)).toBeLessThan(50); // symmetric opening
    const legal = CheckersEngine.getAllLegalMoves(state);
    expect(legal.some((m) => m.from === result.bestMove!.from && m.to === result.bestMove!.to)).toBe(
      true,
    );
  });

  it('scores reversi White-positive and finds a legal square', async () => {
    const state = ReversiEngine.newGame();
    const result = await reversiAnalysis.evaluate(state, 0);
    expect(ReversiEngine.getAllLegalMoves(state)).toContain(result.bestMove!.to);
  });

  it('names the winner rather than printing a five-figure score', () => {
    const base = { mate: null, bestMove: null, terminal: true };
    expect(checkersAnalysis.formatScore({ ...base, score: 100_000 })).toBe('White wins');
    expect(reversiAnalysis.formatScore({ ...base, score: -100_000 })).toBe('Black wins');
    expect(reversiAnalysis.formatScore({ ...base, score: 0 })).toBe('Draw');
  });
});
