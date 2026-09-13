import { CHESS_HINT_SEARCH_MS, ChessEngine, type Position } from '@gameexplorer/shared';
import { chessAdapter } from '@/engine/chessAdapter';

// The engine service is a singleton around a native module. These tests are
// about which engine the adapter asks, and at what strength, so the service is
// replaced with a switchboard. `mock`-prefixed so jest.mock's hoisting may
// close over it.
const mockEngine = {
  available: true,
  whenEngineReady: jest.fn(),
  getEngineEvaluation: jest.fn(),
  getEngineBestMove: jest.fn(),
};

jest.mock('@/engine/chessEngineNative', () => ({
  isEngineAvailable: () => mockEngine.available,
  whenEngineReady: (...args: unknown[]) => mockEngine.whenEngineReady(...args),
  getEngineEvaluation: (...args: unknown[]) => mockEngine.getEngineEvaluation(...args),
  getEngineBestMove: (...args: unknown[]) => mockEngine.getEngineBestMove(...args),
  engineNewGame: () => {},
  cancelEngineSearch: () => {},
}));

// Only `save` needs it, and no test here saves; the real module builds a
// Supabase client at import time.
jest.mock('@gameexplorer/db', () => ({ saveGame: jest.fn() }));

const ENGINE_ANSWER = { cp: 20, mate: null, depth: 16, bestMove: { from: 'g1', to: 'f3' } };

function resetEngine() {
  mockEngine.available = true;
  mockEngine.whenEngineReady.mockReset().mockResolvedValue(undefined);
  mockEngine.getEngineEvaluation.mockReset().mockResolvedValue(ENGINE_ANSWER);
  mockEngine.getEngineBestMove.mockReset();
}

/**
 * A hint is the best move in the position, from the strongest engine the app
 * has, whatever the player's rating. It first played through the bot's ladder
 * at the player's rating plus 200, so below 1400 the in-house engine could hand
 * a paying player a random move. After that it still fell back to the in-house
 * engine while Arasan was starting up.
 */
describe('chessAdapter — hints', () => {
  beforeEach(resetEngine);

  it.each([400, 600, 900, 1200, 1500, 2000, 2800])(
    'asks Arasan at full strength for a player rated %i',
    async (elo) => {
      const state = ChessEngine.newGame();

      await expect(chessAdapter.getHintMove!(state, elo)).resolves.toEqual({
        from: 'g1',
        to: 'f3',
      });
      // The evaluation path searches with strength limiting off. The bot path
      // would have weakened the answer to a rating.
      expect(mockEngine.getEngineEvaluation).toHaveBeenCalledWith(state, CHESS_HINT_SEARCH_MS);
      expect(mockEngine.getEngineBestMove).not.toHaveBeenCalled();
    },
  );

  it('waits for an engine that is still starting, then asks it', async () => {
    let finishHandshake!: () => void;
    mockEngine.whenEngineReady.mockReturnValue(
      new Promise<void>((resolve) => {
        finishHandshake = resolve;
      }),
    );

    const hint = chessAdapter.getHintMove!(ChessEngine.newGame(), 800);
    await Promise.resolve();
    expect(mockEngine.getEngineEvaluation).not.toHaveBeenCalled();

    finishHandshake();
    await expect(hint).resolves.toEqual({ from: 'g1', to: 'f3' });
    expect(mockEngine.getEngineEvaluation).toHaveBeenCalledTimes(1);
  });

  it('gives no hint rather than a weaker one when Arasan cannot run', async () => {
    mockEngine.available = false;
    mockEngine.whenEngineReady.mockRejectedValue(new Error('Engine unavailable'));

    // A fallback to the in-house engine would resolve here with some move.
    await expect(chessAdapter.getHintMove!(ChessEngine.newGame(), 400)).rejects.toThrow(
      /unavailable/,
    );
    expect(mockEngine.getEngineEvaluation).not.toHaveBeenCalled();
  });

  it('refuses to invent a move when the engine has none', async () => {
    mockEngine.getEngineEvaluation.mockResolvedValue({
      cp: null,
      mate: 0,
      depth: 1,
      bestMove: null,
    });

    await expect(chessAdapter.getHintMove!(ChessEngine.newGame(), 1500)).rejects.toThrow(
      /no move/,
    );
  });
});

describe('chessAdapter — bot moves still follow the ladder', () => {
  beforeEach(resetEngine);

  it('hands a rating at or above the seam to Arasan', async () => {
    mockEngine.getEngineBestMove.mockResolvedValue({ from: 'e2', to: 'e4' });
    const state = ChessEngine.newGame();

    await chessAdapter.getBotMove(state, 1500);

    expect(mockEngine.getEngineBestMove).toHaveBeenCalledWith(state, 1500);
  });

  it('keeps a rating below the seam on the in-house engine', async () => {
    const start = ChessEngine.newGame();
    const move = await chessAdapter.getBotMove(start, 1200);

    expect(mockEngine.getEngineBestMove).not.toHaveBeenCalled();
    expect(
      ChessEngine.validateMove(start, move.from as Position, move.to as Position, false).valid,
    ).toBe(true);
  });
});
