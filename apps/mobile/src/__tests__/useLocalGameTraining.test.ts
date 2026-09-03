import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { UserRating } from '@finesse/db';
import { HINT_PENALTY, HINT_VISIBLE_MS } from '@/engine/trainingRules';
import { useLocalGame, type LocalGameAdapter, type LocalGameMode } from '@/engine/useLocalGame';

const mockGetUserRating = jest.fn<Promise<UserRating>, [string, string]>();
const mockUpsertUserRating = jest.fn<Promise<UserRating | null>, unknown[]>();

jest.mock('@finesse/db', () => ({
  getUserRating: (...args: [string, string]) => mockGetUserRating(...args),
  upsertUserRating: (...args: unknown[]) => mockUpsertUserRating(...args),
}));

const USER_ID = 'user-1';
const HINT_MOVE = { from: 'e2', to: 'e4' };

/**
 * Minimal game: every move flips the side to move, and `finish` makes the next
 * move end the game with white the winner — enough to reach the save + rating
 * path without dragging a real engine in.
 */
interface FakeState {
  turn: 'white' | 'black';
  over: boolean;
}

function ratingRow(rating: number, gamesPlayed = 50): UserRating {
  return {
    user_id: USER_ID,
    game_type: 'chess',
    rating,
    games_played: gamesPlayed,
    wins: 20,
    losses: 20,
    draws: 10,
    peak_rating: rating,
    updated_at: '2026-01-01T00:00:00.000Z',
  };
}

function makeAdapter(
  overrides: Partial<LocalGameAdapter<FakeState>> & { finish?: boolean } = {},
): LocalGameAdapter<FakeState> {
  const { finish = false, ...rest } = overrides;
  return {
    gameType: 'chess',
    newGame: () => ({ turn: 'white', over: false }),
    currentTurn: (s) => s.turn,
    isGameOver: (s) => s.over,
    winner: (s) => (s.over ? 'white' : null),
    validateMove: (s) => ({
      valid: true,
      resultingState: { turn: s.turn === 'white' ? 'black' : 'white', over: finish },
    }),
    getBotMove: jest.fn(async () => ({ from: 'a7', to: 'a6' })),
    getHintMove: jest.fn(async () => HINT_MOVE),
    hintElo: (botElo) => botElo + 200,
    thinkTimeForElo: () => 0,
    save: jest.fn(async () => null),
    ...rest,
  };
}

/**
 * A bot that never answers. Tests that hand the turn over mid-game care about
 * what the hint did, not about the reply — and a reply landing after the test
 * body finishes is just an act() warning.
 */
const silentBot = () => new Promise<never>(() => {});

/** White is the player, so the opening position is the player's turn to hint on. */
function renderTraining(
  adapter: LocalGameAdapter<FakeState>,
  opts: { mode?: LocalGameMode; eloBounds?: { min: number; max: number } } = {},
) {
  return renderHook(() =>
    useLocalGame<FakeState>({
      adapter,
      mode: opts.mode ?? 'training',
      playerColor: 'white',
      targetElo: 1200,
      rated: true,
      userId: USER_ID,
      eloBounds: opts.eloBounds,
      started: true,
    }),
  );
}

beforeEach(() => {
  mockGetUserRating.mockReset().mockResolvedValue(ratingRow(1500));
  mockUpsertUserRating.mockReset().mockResolvedValue(null);
});

describe('useLocalGame — training bot strength', () => {
  it('matches the bot to the player rating instead of the picked tier', async () => {
    const { result } = renderTraining(makeAdapter());
    // targetElo is 1200; training must ignore it in favour of the 1500 rating.
    await waitFor(() => expect(result.current.botElo).toBe(1500));
  });

  it('clamps the matched bot to what the engine can play', async () => {
    mockGetUserRating.mockResolvedValue(ratingRow(2600));
    const { result } = renderTraining(makeAdapter(), { eloBounds: { min: 400, max: 2000 } });
    await waitFor(() => expect(result.current.botElo).toBe(2000));
  });

  it('leaves the picked tier alone in the ordinary bot mode', async () => {
    const { result } = renderTraining(makeAdapter(), { mode: 'bot' });
    await waitFor(() => expect(result.current.userRating).not.toBeNull());
    expect(result.current.botElo).toBe(1200);
  });
});

describe('useLocalGame — training hints', () => {
  it('reveals the move and bills one hint', async () => {
    const adapter = makeAdapter();
    const { result } = renderTraining(adapter);
    await waitFor(() => expect(result.current.userRating).not.toBeNull());

    await act(async () => {
      await result.current.requestHint();
    });

    expect(result.current.hintMove).toEqual(HINT_MOVE);
    expect(result.current.hintsUsed).toBe(1);
    // Asked a notch above the matched bot, per the adapter's hintElo.
    expect(adapter.getHintMove).toHaveBeenCalledWith(expect.anything(), 1700);
  });

  it('stops showing the move after the reveal window', async () => {
    jest.useFakeTimers();
    try {
      const { result } = renderTraining(makeAdapter());
      await act(async () => {
        await Promise.resolve();
      });
      await act(async () => {
        await result.current.requestHint();
      });
      expect(result.current.hintMove).toEqual(HINT_MOVE);

      act(() => {
        jest.advanceTimersByTime(HINT_VISIBLE_MS + 10);
      });
      // The count stands — only the board cue expires.
      expect(result.current.hintMove).toBeNull();
      expect(result.current.hintsUsed).toBe(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it('takes the hint off the board once the player moves', async () => {
    const { result } = renderTraining(makeAdapter({ getBotMove: silentBot }));
    await waitFor(() => expect(result.current.userRating).not.toBeNull());
    await act(async () => {
      await result.current.requestHint();
    });

    act(() => result.current.handleMove('e2', 'e4'));
    expect(result.current.hintMove).toBeNull();
    expect(result.current.hintsUsed).toBe(1);
  });

  it('refuses — and does not bill — a hint on the opponent turn', async () => {
    const adapter = makeAdapter({ getBotMove: silentBot });
    const { result } = renderTraining(adapter);
    await waitFor(() => expect(result.current.userRating).not.toBeNull());

    // Hand the turn over; the bot now owns the position.
    act(() => result.current.handleMove('e2', 'e4'));
    await act(async () => {
      await result.current.requestHint();
    });

    expect(adapter.getHintMove).not.toHaveBeenCalled();
    expect(result.current.hintsUsed).toBe(0);
  });

  it('bills one hint for two rapid taps', async () => {
    // Both taps close over hintsUsed === 0; without the synchronous claim the
    // player would pay twice for one answer.
    const adapter = makeAdapter();
    const { result } = renderTraining(adapter);
    await waitFor(() => expect(result.current.userRating).not.toBeNull());

    await act(async () => {
      await Promise.all([result.current.requestHint(), result.current.requestHint()]);
    });

    expect(adapter.getHintMove).toHaveBeenCalledTimes(1);
    expect(result.current.hintsUsed).toBe(1);
  });

  it('refuses a hint when the player has to pass', async () => {
    // Reversi's one turn rule: the loop is about to auto-pass, so there is no
    // move to advise on — and nothing to charge for.
    const adapter = makeAdapter({
      mustPass: () => true,
      executePass: (s) => ({ turn: s.turn === 'white' ? 'black' : 'white', over: false }),
      getBotMove: silentBot,
    });
    const { result } = renderTraining(adapter);
    await waitFor(() => expect(result.current.userRating).not.toBeNull());

    await act(async () => {
      await result.current.requestHint();
    });

    expect(adapter.getHintMove).not.toHaveBeenCalled();
    expect(result.current.hintsUsed).toBe(0);
  });

  it('offers no hints outside training', async () => {
    const adapter = makeAdapter();
    const { result } = renderTraining(adapter, { mode: 'bot' });
    await waitFor(() => expect(result.current.userRating).not.toBeNull());

    await act(async () => {
      await result.current.requestHint();
    });

    expect(adapter.getHintMove).not.toHaveBeenCalled();
    expect(result.current.hintsUsed).toBe(0);
  });

  it('starts the next game with a clean slate', async () => {
    const { result } = renderTraining(makeAdapter());
    await waitFor(() => expect(result.current.userRating).not.toBeNull());
    await act(async () => {
      await result.current.requestHint();
    });

    act(() => result.current.newGame());
    expect(result.current.hintsUsed).toBe(0);
    expect(result.current.hintMove).toBeNull();
  });
});

describe('useLocalGame — training rating', () => {
  /** Play one winning move, optionally taking a hint first, and report the delta. */
  async function playToEnd(hints: number): Promise<number> {
    const { result } = renderTraining(makeAdapter({ finish: true }));
    await waitFor(() => expect(result.current.userRating).not.toBeNull());

    for (let i = 0; i < hints; i++) {
      await act(async () => {
        await result.current.requestHint();
      });
      // A second hint has to be a fresh request, not the same one re-shown.
      expect(result.current.hintsUsed).toBe(i + 1);
    }

    act(() => result.current.handleMove('e2', 'e4'));
    await waitFor(() => expect(result.current.ratingResult).not.toBeNull());
    return result.current.ratingResult!.delta;
  }

  it('charges each hint against the rating it earned', async () => {
    const clean = await playToEnd(0);
    const hinted = await playToEnd(2);

    expect(clean).toBeGreaterThan(0); // sanity: the win was worth something
    expect(hinted).toBe(clean - 2 * HINT_PENALTY);
  });

  it('reports the hints alongside the rating change', async () => {
    const { result } = renderTraining(makeAdapter({ finish: true }));
    await waitFor(() => expect(result.current.userRating).not.toBeNull());
    await act(async () => {
      await result.current.requestHint();
    });
    act(() => result.current.handleMove('e2', 'e4'));

    await waitFor(() => expect(result.current.ratingResult).not.toBeNull());
    expect(result.current.ratingResult!.hintsUsed).toBe(1);
  });

  it('saves the game against the matched bot, not the picked tier', async () => {
    const adapter = makeAdapter({ finish: true });
    const { result } = renderTraining(adapter);
    await waitFor(() => expect(result.current.userRating).not.toBeNull());

    act(() => result.current.handleMove('e2', 'e4'));

    await waitFor(() => expect(adapter.save).toHaveBeenCalled());
    expect(adapter.save).toHaveBeenCalledWith(
      expect.objectContaining({ difficulty: 'elo-1500', result: 'white' }),
    );
  });
});
