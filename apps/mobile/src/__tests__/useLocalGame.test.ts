import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useLocalGame, type LocalGameAdapter } from '@/engine/useLocalGame';

// The loop imports the db writers at module load; no test here reaches a game
// end, so stub them out rather than dragging Supabase config into Jest.
jest.mock('@gameexplorer/db', () => ({
  getPracticeRating: jest.fn(async () => null),
  recordPracticeResult: jest.fn(async () => null),
}));

/** Minimal two-state game: each move just flips the side to move. */
interface FakeState {
  turn: 'white' | 'black';
  over: boolean;
}

const BOT_MOVE = { from: 'a1', to: 'a2' };

function makeAdapter(
  overrides: Partial<LocalGameAdapter<FakeState>> = {},
): LocalGameAdapter<FakeState> {
  return {
    gameType: 'chess',
    newGame: () => ({ turn: 'white', over: false }),
    currentTurn: (s) => s.turn,
    isGameOver: (s) => s.over,
    winner: () => null,
    validateMove: (s) => ({
      valid: true,
      resultingState: { turn: s.turn === 'white' ? 'black' : 'white', over: false },
    }),
    getBotMove: jest.fn(async () => BOT_MOVE),
    thinkTimeForElo: () => 0,
    save: jest.fn(async () => null),
    ...overrides,
  };
}

/** Player is black, so white — the bot — is to move from the opening position. */
function renderLoop(adapter: LocalGameAdapter<FakeState>) {
  return renderHook(() =>
    useLocalGame<FakeState>({
      adapter,
      mode: 'bot',
      playerColor: 'black',
      targetElo: 1200,
      rated: false,
      userId: null,
      started: true,
    }),
  );
}

describe('useLocalGame — bot turn', () => {
  it('asks the engine for exactly one move per turn', async () => {
    const adapter = makeAdapter();
    renderLoop(adapter);

    await waitFor(() => expect(adapter.getBotMove).toHaveBeenCalledTimes(1));
    // The reply hands the turn back, so nothing re-triggers the bot.
    await new Promise((r) => setTimeout(r, 50));
    expect(adapter.getBotMove).toHaveBeenCalledTimes(1);
  });

  it('plays the move it gets back', async () => {
    const adapter = makeAdapter();
    const { result } = renderLoop(adapter);

    await waitFor(() => expect(result.current.timeline).toHaveLength(2));
    expect(result.current.liveState.turn).toBe('black');
  });
});

describe('useLocalGame — bot errors', () => {
  let consoleError: jest.SpyInstance;

  beforeEach(() => {
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => consoleError.mockRestore());

  it('stays quiet when a search is aborted', async () => {
    // An abort means the game moved on — routine, not a bot crash.
    const aborted = new Error('Superseded by a newer search');
    aborted.name = 'AbortError';
    const getBotMove = jest
      .fn<Promise<typeof BOT_MOVE>, []>()
      .mockRejectedValueOnce(aborted)
      .mockResolvedValue(BOT_MOVE);
    const adapter = makeAdapter({ getBotMove });

    const { result } = renderLoop(adapter);

    // The turn is still the bot's after the abort, so the loop asks again.
    await waitFor(() => expect(result.current.timeline).toHaveLength(2));
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('still reports a genuine engine failure', async () => {
    const getBotMove = jest
      .fn<Promise<typeof BOT_MOVE>, []>()
      .mockRejectedValueOnce(new Error('Engine not ready'))
      .mockResolvedValue(BOT_MOVE);
    const adapter = makeAdapter({ getBotMove });

    const { result } = renderLoop(adapter);

    await waitFor(() => expect(result.current.timeline).toHaveLength(2));
    expect(consoleError).toHaveBeenCalledWith('Bot error:', expect.any(Error));
  });

  it('releases the turn claim on a new game, so the bot moves again', async () => {
    // The regression that matters most: a guard left set would silently freeze
    // every later game — the bot would simply never move.
    const adapter = makeAdapter();
    const { result } = renderLoop(adapter);

    await waitFor(() => expect(adapter.getBotMove).toHaveBeenCalledTimes(1));
    act(() => result.current.newGame());

    await waitFor(() => expect(adapter.getBotMove).toHaveBeenCalledTimes(2));
  });

  it('lets the bot move again after an aborted search plus a new game', async () => {
    const aborted = new Error('New game started');
    aborted.name = 'AbortError';
    const getBotMove = jest
      .fn<Promise<typeof BOT_MOVE>, []>()
      .mockRejectedValueOnce(aborted)
      .mockResolvedValue(BOT_MOVE);
    const adapter = makeAdapter({ getBotMove });

    const { result } = renderLoop(adapter);
    await waitFor(() => expect(adapter.getBotMove).toHaveBeenCalled());
    act(() => result.current.newGame());

    await waitFor(() => expect(result.current.timeline).toHaveLength(2));
  });
});

describe('useLocalGame — stopping a search nobody will read', () => {
  // The in-house bots run in slices, so a search keeps taking turns on the JS
  // thread until it finishes — seconds, for chess's depth-4 band and reversi's
  // top tiers. Each of these is a moment its answer stops mattering.

  /** A bot that never answers, keeping the signal each search was handed. */
  function hangingBot() {
    const signals: { aborted: boolean }[] = [];
    const getBotMove = jest.fn((_s: FakeState, _elo: number, signal?: { aborted: boolean }) => {
      if (signal) signals.push(signal);
      return new Promise<typeof BOT_MOVE>(() => {});
    });
    return { getBotMove, signals };
  }

  it('stops it on a new game, and gives the next search a live signal', async () => {
    const { getBotMove, signals } = hangingBot();
    const { result } = renderLoop(makeAdapter({ getBotMove }));
    await waitFor(() => expect(signals).toHaveLength(1));
    expect(signals[0].aborted).toBe(false);

    act(() => result.current.newGame());
    expect(signals[0].aborted).toBe(true);

    await waitFor(() => expect(signals).toHaveLength(2));
    expect(signals[1].aborted).toBe(false);
  });

  it('stops it on resign', async () => {
    const { getBotMove, signals } = hangingBot();
    const { result } = renderLoop(makeAdapter({ getBotMove }));
    await waitFor(() => expect(signals).toHaveLength(1));

    act(() => result.current.resign());
    expect(signals[0].aborted).toBe(true);
  });

  it('stops it when the screen closes', async () => {
    const { getBotMove, signals } = hangingBot();
    const { unmount } = renderLoop(makeAdapter({ getBotMove }));
    await waitFor(() => expect(signals).toHaveLength(1));

    unmount();
    expect(signals[0].aborted).toBe(true);
  });

  it('leaves a search alone once it has answered', async () => {
    const signals: { aborted: boolean }[] = [];
    const getBotMove = jest.fn(async (_s: FakeState, _elo: number, signal?: { aborted: boolean }) => {
      if (signal) signals.push(signal);
      return BOT_MOVE;
    });
    const { result, unmount } = renderLoop(makeAdapter({ getBotMove }));
    await waitFor(() => expect(result.current.timeline).toHaveLength(2));

    unmount();
    expect(signals[0].aborted).toBe(false);
  });
});
