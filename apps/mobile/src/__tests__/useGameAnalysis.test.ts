import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useGameAnalysis } from '@/analysis/useGameAnalysis';
import type { AnalysisAdapter, PositionEval } from '@/analysis/types';

/**
 * A game reduced to the two things review actually reads: whose turn it is, and
 * what the engine says. `score` is White-positive, exactly as a real adapter
 * normalises it.
 */
interface FakeState {
  turn: 'white' | 'black';
  score: number;
  best: { from: string; to: string } | null;
  played: { from: string; to: string } | null;
}

function state(
  turn: 'white' | 'black',
  score: number,
  best: [string, string] | null = ['e2', 'e4'],
  played: [string, string] | null = null,
): FakeState {
  return {
    turn,
    score,
    best: best ? { from: best[0], to: best[1] } : null,
    played: played ? { from: played[0], to: played[1] } : null,
  };
}

function makeAdapter(overrides: Partial<AnalysisAdapter<FakeState>> = {}): AnalysisAdapter<FakeState> {
  return {
    evaluate: jest.fn(
      async (s: FakeState): Promise<PositionEval> => ({
        score: s.score,
        mate: null,
        bestMove: s.best,
        terminal: false,
      }),
    ),
    lastMove: (s) => s.played,
    formatScore: ({ score }) => String(score),
    whiteShare: () => 0.5,
    thresholds: { inaccuracy: 50, mistake: 100, blunder: 200 },
    scanBudgetMs: 0,
    liveBudgetMs: 0,
    ...overrides,
  };
}

function renderAnalysis(
  timeline: FakeState[],
  adapter: AnalysisAdapter<FakeState>,
  opts: { viewIndex?: number; enabled?: boolean } = {},
) {
  return renderHook(() =>
    useGameAnalysis<FakeState>({
      adapter,
      timeline,
      viewIndex: opts.viewIndex ?? 0,
      currentTurn: (s) => s.turn,
      enabled: opts.enabled ?? true,
    }),
  );
}

describe('useGameAnalysis — scanning', () => {
  it('scores every position and reports itself complete', async () => {
    const timeline = [
      state('white', 0),
      state('black', -20, ['a1', 'a2'], ['e2', 'e4']),
      state('white', 10, ['b1', 'c3'], ['e7', 'e5']),
    ];
    const adapter = makeAdapter();
    const { result } = renderAnalysis(timeline, adapter);

    await act(async () => {
      await result.current.scan();
    });

    expect(adapter.evaluate).toHaveBeenCalledTimes(3);
    expect(result.current.progress).toEqual({ done: 3, total: 3 });
    expect(result.current.complete).toBe(true);
    expect(result.current.scanning).toBe(false);
  });

  it('stops when asked, leaving the rest unscored', async () => {
    let release: (() => void) | null = null;
    const adapter = makeAdapter({
      evaluate: jest.fn(async (s: FakeState) => {
        // The second position blocks until the test lets it through.
        if (s.score === 99) {
          await new Promise<void>((resolve) => {
            release = resolve;
          });
        }
        return { score: s.score, mate: null, bestMove: s.best, terminal: false };
      }),
    });
    const timeline = [state('white', 0), state('black', 99, null, ['e2', 'e4']), state('white', 5)];
    const { result } = renderAnalysis(timeline, adapter);

    act(() => {
      result.current.scan();
    });
    await waitFor(() => expect(release).not.toBeNull());

    act(() => result.current.stopScan());
    await act(async () => {
      release!();
    });

    expect(result.current.scanning).toBe(false);
    expect(result.current.complete).toBe(false);
    // The third position was never reached.
    expect(adapter.evaluate).toHaveBeenCalledTimes(2);
  });

  it('keeps the engine idle until review is open', async () => {
    const adapter = makeAdapter();
    renderAnalysis([state('white', 0), state('black', -20, null, ['e2', 'e4'])], adapter, {
      enabled: false,
    });

    await new Promise((r) => setTimeout(r, 250));
    expect(adapter.evaluate).not.toHaveBeenCalled();
  });

  it('searches the position on screen on its own', async () => {
    const adapter = makeAdapter();
    const timeline = [state('white', 0), state('black', -20, null, ['e2', 'e4'])];
    const { result } = renderAnalysis(timeline, adapter, { viewIndex: 1 });

    await waitFor(() => expect(result.current.current).not.toBeNull());
    expect(result.current.current!.score).toBe(-20);
  });
});

describe('useGameAnalysis — grading', () => {
  /** Scan a timeline and hand back the grades. */
  async function gradesFor(timeline: FakeState[], adapter = makeAdapter()) {
    const { result } = renderAnalysis(timeline, adapter);
    await act(async () => {
      await result.current.scan();
    });
    return result.current;
  }

  it("grades White's move by how much score White gave away", async () => {
    // 0 → -300 with White to move: White dropped three pawns' worth.
    const { grades } = await gradesFor([
      state('white', 0, ['d2', 'd4']),
      state('black', -300, null, ['g1', 'h3']),
    ]);

    expect(grades[0]).toMatchObject({ grade: 'blunder', loss: 300 });
    expect(grades[0]!.better).toEqual({ from: 'd2', to: 'd4' });
  });

  it("mirrors the sign for Black, whose good move makes the score go down", async () => {
    // The scores are White-positive throughout, so Black improving its position
    // moves the number toward negative. Grading Black off the raw difference
    // would call every good black move a blunder — this is that regression.
    const { grades } = await gradesFor([
      state('white', 0),
      state('black', 0, ['a7', 'a6']),
      state('white', -300, null, ['d8', 'h4']),
    ]);

    expect(grades[1]!.grade).toBe('good');
    expect(grades[1]!.loss).toBe(0);
  });

  it('charges Black for a move that helps White', async () => {
    const { grades } = await gradesFor([
      state('white', 0),
      state('black', 0, ['a7', 'a6']),
      state('white', 250, null, ['b8', 'a6']),
    ]);

    expect(grades[1]).toMatchObject({ grade: 'blunder', loss: 250 });
  });

  it('calls a move that matches the engine the best move, whatever the swing', async () => {
    // Even a losing position's only move is still the best available one.
    const { grades } = await gradesFor([
      state('white', 0, ['e2', 'e4']),
      state('black', -400, null, ['e2', 'e4']),
    ]);

    expect(grades[0]!.grade).toBe('best');
    expect(grades[0]!.better).toBeNull();
  });

  it('separates inaccuracies from mistakes at the configured thresholds', async () => {
    const run = async (after: number) => {
      const { grades } = await gradesFor([
        state('white', 0, ['d2', 'd4']),
        state('black', after, null, ['a2', 'a3']),
      ]);
      return grades[0]!.grade;
    };

    expect(await run(-49)).toBe('good');
    expect(await run(-50)).toBe('inaccuracy');
    expect(await run(-100)).toBe('mistake');
    expect(await run(-200)).toBe('blunder');
  });

  it('leaves a move with no decision behind it ungraded', async () => {
    // A reversi pass: the adapter reports no move, so there is nothing to blame
    // the player for.
    const { grades } = await gradesFor([
      state('white', 0),
      state('black', -500, null, null),
    ]);

    expect(grades[0]).toBeNull();
  });

  it('grades nothing until the positions either side have been scored', () => {
    const { result } = renderAnalysis(
      [state('white', 0), state('black', -300, null, ['e2', 'e4'])],
      makeAdapter(),
      { enabled: false },
    );
    expect(result.current.grades).toEqual([null]);
    expect(result.current.complete).toBe(false);
  });

  it('tallies each side separately', async () => {
    const { summary } = await gradesFor([
      state('white', 0, ['d2', 'd4']),
      state('black', -300, ['a7', 'a6'], ['g1', 'h3']), // white blunders
      state('white', -300, ['e2', 'e4'], ['a7', 'a6']), // black plays the best move
    ]);

    expect(summary.white.blunder).toBe(1);
    expect(summary.black.best).toBe(1);
    expect(summary.black.blunder).toBe(0);
  });
});

describe('useGameAnalysis — failures', () => {
  it('surfaces an engine error instead of hanging the scan', async () => {
    const adapter = makeAdapter({
      evaluate: jest.fn(async () => {
        throw new Error('Engine not ready');
      }),
    });
    const { result } = renderAnalysis([state('white', 0), state('black', 0, null, ['e2', 'e4'])], adapter);

    await act(async () => {
      await result.current.scan();
    });

    expect(result.current.error).toBe('Engine not ready');
    expect(result.current.scanning).toBe(false);
  });

  it('stays quiet when a search is aborted', async () => {
    // Aborts are routine — the screen moved on, nobody is waiting.
    const aborted = new Error('Superseded by a newer search');
    aborted.name = 'AbortError';
    const adapter = makeAdapter({
      evaluate: jest.fn(async () => {
        throw aborted;
      }),
    });
    const { result } = renderAnalysis([state('white', 0), state('black', 0, null, ['e2', 'e4'])], adapter);

    await act(async () => {
      await result.current.scan();
    });

    expect(result.current.error).toBeNull();
  });
});
