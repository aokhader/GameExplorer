import { CheckersEngine, ReversiEngine } from '@gameexplorer/shared';
import { checkersAdapter } from '@/engine/checkersAdapter';
import { reversiAdapter } from '@/engine/reversiAdapter';

// The adapters import the db writers at module load; nothing here saves.
jest.mock('@gameexplorer/db', () => ({}));

/**
 * Checkers and reversi bots (and hints) run the in-house search in slices, so
 * the board keeps answering while they think. What the adapters owe the loop:
 * a legal move, and a search that stops when the loop's signal is set.
 */
describe('checkers and reversi bots run sliced', () => {
  it('checkers answers with a legal move, bot and hint alike', async () => {
    const start = CheckersEngine.newGame();
    for (const move of [
      await checkersAdapter.getBotMove(start, 2000),
      await checkersAdapter.getHintMove!(start, 2000),
    ]) {
      expect(CheckersEngine.validateMove(start, move.from, move.to).valid).toBe(true);
    }
  });

  it('reversi answers with a legal square, bot and hint alike', async () => {
    const start = ReversiEngine.newGame();
    for (const move of [
      await reversiAdapter.getBotMove(start, 2000),
      await reversiAdapter.getHintMove!(start, 2000),
    ]) {
      expect(move.from).toBe(move.to);
      expect(ReversiEngine.getAllLegalMoves(start)).toContain(move.from);
    }
  });

  it('both stop when the loop no longer wants the answer', async () => {
    const stopped = { aborted: true };
    await expect(
      checkersAdapter.getBotMove(CheckersEngine.newGame(), 2000, stopped),
    ).rejects.toMatchObject({ name: 'AbortError' });
    await expect(
      reversiAdapter.getHintMove!(ReversiEngine.newGame(), 2000, stopped),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });
});
