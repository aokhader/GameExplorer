import { act, renderHook } from '@testing-library/react-native';
import { useLocalGame, type LocalGameAdapter } from '@/engine/useLocalGame';

jest.mock('@gameexplorer/db', () => ({
  getUserRating: jest.fn(() => Promise.resolve(null)),
  upsertUserRating: jest.fn(() => Promise.resolve(null)),
}));

/**
 * Minimal stand-in for a real game: it is never over on its own, so every test
 * ends the game with `resign()` and the save effect is the only thing under
 * test. `currentTurn` always returns white so the bot (black) never moves.
 */
type FakeState = { moves: number };

function makeAdapter(): LocalGameAdapter<FakeState> {
  return {
    gameType: 'chess',
    newGame: () => ({ moves: 0 }),
    currentTurn: () => 'white',
    isGameOver: () => false,
    winner: () => null,
    validateMove: () => ({ valid: false }),
    getBotMove: () => ({ from: 'e2', to: 'e4' }),
    thinkTimeForElo: () => 0,
    save: jest.fn(() => Promise.resolve(null)),
  };
}

function renderGame(adapter: LocalGameAdapter<FakeState>, userId: string | null) {
  return renderHook(() =>
    useLocalGame({
      adapter,
      mode: 'bot',
      playerColor: 'white',
      targetElo: 800,
      rated: false,
      userId,
      started: true,
    }),
  );
}

describe('useLocalGame — save on game end', () => {
  it('skips the save for a signed-out guest', async () => {
    const adapter = makeAdapter();
    const { result } = renderGame(adapter, null);

    await act(async () => {
      result.current.resign();
    });

    // A guest insert is rejected by the games RLS policy (42501) and the row
    // would be invisible to every client — we must not even try.
    expect(adapter.save).not.toHaveBeenCalled();
  });

  it('saves a casual game for a signed-in user', async () => {
    const adapter = makeAdapter();
    const { result } = renderGame(adapter, 'user-1');

    await act(async () => {
      result.current.resign();
    });

    expect(adapter.save).toHaveBeenCalledTimes(1);
    expect(adapter.save).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', result: 'black' }),
    );
  });

  it('never saves pass-and-play, signed in or not', async () => {
    const adapter = makeAdapter();
    const { result } = renderHook(() =>
      useLocalGame({
        adapter,
        mode: 'pass-and-play',
        playerColor: 'white',
        targetElo: 800,
        rated: false,
        userId: 'user-1',
        started: true,
      }),
    );

    await act(async () => {
      result.current.resign();
    });

    expect(adapter.save).not.toHaveBeenCalled();
  });
});
