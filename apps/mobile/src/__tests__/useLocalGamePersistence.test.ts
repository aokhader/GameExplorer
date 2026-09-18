/**
 * The loop's resumable slot (`project-docs/ux-fix-ideas.md` §2.4).
 *
 * The owner's rule these pin: an unfinished rated game stays open until it is
 * finished or resigned. So a slot is written as the game is played, survives the
 * game being abandoned, and is cleared only once the result is actually written —
 * a rated result that failed to write leaves the game owed, not lost.
 */
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useLocalGame, type LocalGameAdapter } from '@/engine/useLocalGame';
import type { LocalStore } from '@gameexplorer/client/storage';
import {
  parseUnfinishedGame,
  unfinishedGameKey,
  type UnfinishedGame,
} from '@gameexplorer/client/game/unfinishedGame';

const mockDb = {
  getUserRating: jest.fn(),
  upsertUserRating: jest.fn(),
};
jest.mock('@gameexplorer/db', () => ({
  getUserRating: (...args: unknown[]) => mockDb.getUserRating(...args),
  upsertUserRating: (...args: unknown[]) => mockDb.upsertUserRating(...args),
}));

/** Each move flips the turn; moving to `mate` ends the game with the mover winning. */
interface FakeState {
  turn: 'white' | 'black';
  moves: number;
  winner: 'white' | 'black' | null;
}

function makeAdapter(overrides: Partial<LocalGameAdapter<FakeState>> = {}): LocalGameAdapter<FakeState> {
  return {
    gameType: 'chess',
    newGame: () => ({ turn: 'white', moves: 0, winner: null }),
    currentTurn: (s) => s.turn,
    isGameOver: (s) => s.winner !== null,
    winner: (s) => s.winner,
    validateMove: (s, _from, to) => ({
      valid: true,
      resultingState: {
        turn: s.turn === 'white' ? 'black' : 'white',
        moves: s.moves + 1,
        winner: to === 'mate' ? s.turn : null,
      },
    }),
    getBotMove: jest.fn(async () => ({ from: 'a7', to: 'a6' })),
    thinkTimeForElo: () => 0,
    save: jest.fn(async () => null),
    ...overrides,
  };
}

function memoryStore(): LocalStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    get: async (k) => data.get(k) ?? null,
    set: async (k, v) => void data.set(k, v),
    remove: async (k) => void data.delete(k),
  };
}

const rating = (value: number) => ({
  user_id: 'u1',
  game_type: 'chess',
  rating: value,
  games_played: 5,
  wins: 0,
  losses: 0,
  draws: 0,
  peak_rating: value,
  updated_at: '',
});

interface Props {
  started: boolean;
  rated: boolean;
  userId: string | null;
  mode: 'bot' | 'pass-and-play' | 'training';
}

function renderLoop(
  store: LocalStore,
  adapter: LocalGameAdapter<FakeState>,
  initial: Partial<Props> = {},
) {
  return renderHook(
    (props: Props) =>
      useLocalGame<FakeState>({
        adapter,
        mode: props.mode,
        playerColor: 'white',
        targetElo: 1500,
        rated: props.rated,
        userId: props.userId,
        started: props.started,
        persistence: { store, game: 'chess', setup: { elo: 1500, color: 'white' } },
      }),
    {
      initialProps: {
        started: true,
        rated: false,
        userId: null,
        mode: 'pass-and-play',
        ...initial,
      } as Props,
    },
  );
}

const slot = (store: ReturnType<typeof memoryStore>, userId: string | null = null) =>
  parseUnfinishedGame(store.data.get(unfinishedGameKey('chess', userId)));

beforeEach(() => {
  jest.clearAllMocks();
  mockDb.getUserRating.mockResolvedValue(rating(1400));
  mockDb.upsertUserRating.mockImplementation(async (_u: string, after: number) => rating(after));
});

describe('useLocalGame — resumable slot', () => {
  it('writes nothing until a move has been played', async () => {
    const store = memoryStore();
    renderLoop(store, makeAdapter());
    await new Promise((r) => setTimeout(r, 20));
    expect(store.data.size).toBe(0);
  });

  it('saves the moves, the setup and the mode after each move', async () => {
    const store = memoryStore();
    const { result } = renderLoop(store, makeAdapter());

    act(() => result.current.handleMove('e2', 'e4'));
    act(() => result.current.handleMove('e7', 'e5'));

    await waitFor(() => expect(slot(store)?.actions).toHaveLength(2));
    expect(slot(store)).toMatchObject({
      game: 'chess',
      mode: 'pass-and-play',
      userId: null,
      rated: false,
      setup: { elo: 1500, color: 'white' },
      actions: [
        { from: 'e2', to: 'e4' },
        { from: 'e7', to: 'e5' },
      ],
    });
    expect(result.current.actions).toHaveLength(2);
  });

  it('keeps the slot when the game is abandoned for a new one', async () => {
    const store = memoryStore();
    const { result, rerender } = renderLoop(store, makeAdapter());

    act(() => result.current.handleMove('e2', 'e4'));
    await waitFor(() => expect(slot(store)).not.toBeNull());

    act(() => result.current.newGame());
    rerender({ started: false, rated: false, userId: null, mode: 'pass-and-play' });
    await new Promise((r) => setTimeout(r, 20));
    expect(slot(store)?.actions).toHaveLength(1);
  });

  it('clears the slot when a casual game ends', async () => {
    const store = memoryStore();
    const { result } = renderLoop(store, makeAdapter());

    act(() => result.current.handleMove('e2', 'e4'));
    await waitFor(() => expect(slot(store)).not.toBeNull());
    act(() => result.current.resign());

    await waitFor(() => expect(store.data.size).toBe(0));
  });

  it('resumes a saved game: its moves, its hints, and its rated status', async () => {
    const store = memoryStore();
    const adapter = makeAdapter();
    const saved: UnfinishedGame = {
      v: 1,
      game: 'chess',
      mode: 'bot',
      userId: 'u1',
      rated: true,
      playerColor: 'white',
      botElo: 1500,
      setup: {},
      actions: [
        { from: 'e2', to: 'e4' },
        { from: 'e7', to: 'e5' },
      ],
      hintsUsed: 2,
      startedAt: 111,
      savedAt: 222,
    };
    // The toggle says casual now (offline, say); the game was rated when it began.
    const { result, rerender } = renderLoop(store, adapter, {
      started: false,
      rated: false,
      userId: 'u1',
      mode: 'bot',
    });

    let ok = false;
    act(() => {
      ok = result.current.restore(saved);
    });
    rerender({ started: true, rated: false, userId: 'u1', mode: 'bot' });

    expect(ok).toBe(true);
    expect(result.current.timeline).toHaveLength(3);
    expect(result.current.viewIndex).toBe(2);
    expect(result.current.hintsUsed).toBe(2);
    expect(result.current.rated).toBe(true);

    act(() => result.current.handleMove('d2', 'd4'));
    await waitFor(() => expect(slot(store, 'u1')?.actions).toHaveLength(3));
    expect(slot(store, 'u1')).toMatchObject({ rated: true, startedAt: 111, hintsUsed: 2 });
  });

  it('refuses a snapshot that has already ended, or does not replay', () => {
    const store = memoryStore();
    const adapter = makeAdapter({
      validateMove: (s, from) =>
        from === 'bad' ? { valid: false } : { valid: true, resultingState: { ...s, moves: s.moves + 1 } },
    });
    const { result } = renderLoop(store, adapter, { started: false });
    const base = {
      v: 1 as const,
      game: 'chess' as const,
      mode: 'bot' as const,
      userId: 'u1',
      rated: true,
      playerColor: 'white' as const,
      botElo: 1500,
      setup: {},
      hintsUsed: 0,
      startedAt: 1,
      savedAt: 2,
    };

    act(() => {
      expect(result.current.restore({ ...base, actions: [{ from: 'e2', to: 'e4' }], end: 'resign' })).toBe(false);
      expect(result.current.restore({ ...base, actions: [{ from: 'bad', to: 'x' }] })).toBe(false);
    });
    expect(result.current.timeline).toHaveLength(1);
  });

  it('keeps a rated game rated when the toggle changes mid-game', async () => {
    const store = memoryStore();
    const adapter = makeAdapter();
    const { result, rerender } = renderLoop(store, adapter, { rated: true, userId: 'u1', mode: 'bot' });
    await waitFor(() => expect(result.current.ratingLoading).toBe(false));

    // White (the player) moves; the connection drops before the end.
    act(() => result.current.handleMove('e2', 'e4'));
    rerender({ started: true, rated: false, userId: 'u1', mode: 'bot' });
    await waitFor(() => expect(result.current.timeline.length).toBeGreaterThanOrEqual(3));
    act(() => result.current.resign());

    await waitFor(() => expect(result.current.ratingResult).not.toBeNull());
    expect(mockDb.upsertUserRating).toHaveBeenCalledWith('u1', expect.any(Number), 'loss', 'chess');
    await waitFor(() => expect(store.data.size).toBe(0));
  });

  it('leaves a rated game owed, marked with its ending, when the write fails', async () => {
    const store = memoryStore();
    const adapter = makeAdapter();
    mockDb.upsertUserRating.mockRejectedValueOnce(new Error('offline'));
    const quiet = jest.spyOn(console, 'error').mockImplementation(() => {});
    const { result } = renderLoop(store, adapter, { rated: true, userId: 'u1', mode: 'bot' });
    await waitFor(() => expect(result.current.ratingLoading).toBe(false));

    act(() => result.current.handleMove('e2', 'e4'));
    await waitFor(() => expect(slot(store, 'u1')).not.toBeNull());
    act(() => result.current.resign());

    await waitFor(() => expect(result.current.saveError).toBe(true));
    expect(slot(store, 'u1')?.end).toBe('resign');

    // Retry from the result card succeeds, and only then does the slot go.
    act(() => result.current.retrySave());
    await waitFor(() => expect(result.current.ratingResult).not.toBeNull());
    await waitFor(() => expect(store.data.size).toBe(0));
    quiet.mockRestore();
  });

  it("holds a resumed training game's bot turn until the player's rating has loaded", async () => {
    const store = memoryStore();
    let resolveRating: (r: ReturnType<typeof rating>) => void = () => {};
    mockDb.getUserRating.mockReturnValue(new Promise((r) => (resolveRating = r)));
    const adapter = makeAdapter();

    const { result, rerender } = renderLoop(store, adapter, {
      started: false,
      rated: true,
      userId: 'u1',
      mode: 'training',
    });
    // One move played: it is black's — the bot's — turn.
    act(() => {
      result.current.restore({
        v: 1,
        game: 'chess',
        mode: 'training',
        userId: 'u1',
        rated: true,
        playerColor: 'white',
        botElo: 1650,
        setup: {},
        actions: [{ from: 'e2', to: 'e4' }],
        hintsUsed: 0,
        startedAt: 1,
        savedAt: 2,
      });
    });
    rerender({ started: true, rated: true, userId: 'u1', mode: 'training' });

    await new Promise((r) => setTimeout(r, 30));
    expect(adapter.getBotMove).not.toHaveBeenCalled();
    // Meanwhile the strength shown is the saved one, not a flat 1200.
    expect(result.current.botElo).toBe(1650);

    await act(async () => resolveRating(rating(1720)));
    await waitFor(() => expect(adapter.getBotMove).toHaveBeenCalledTimes(1));
    expect(adapter.getBotMove).toHaveBeenCalledWith(expect.anything(), 1720);
  });
});
