import { fireEvent, render, screen } from '@testing-library/react-native';
import { ChessEngine, type ChessGameState } from '@gameexplorer/shared';
import { MoveBand } from '@/game/MoveBand';

/** Play moves from the start, keeping the state before each — a game timeline. */
function timelineOf(...moves: string[]): ChessGameState[] {
  const timeline = [ChessEngine.newGame()];
  for (const move of moves) {
    const result = ChessEngine.validateMove(
      timeline[timeline.length - 1],
      move.slice(0, 2),
      move.slice(2, 4),
    );
    // (Jest's expect takes no message argument — the move string is in the name.)
    expect(result.valid).toBe(true);
    timeline.push(result.resultingState!);
  }
  return timeline;
}

// 1. e4 e5 2. Nf3 Nc6
const OPENING = ['e2e4', 'e7e5', 'g1f3', 'b8c6'];

describe('MoveBand', () => {
  it('prompts for a first move on an empty game', () => {
    render(
      <MoveBand timeline={timelineOf()} viewIndex={0} onSeek={jest.fn()} accent="chess" />,
    );
    expect(screen.getByText(/No moves yet/)).toBeOnTheScreen();
  });

  it('prints the moves in algebraic notation with move numbers', () => {
    render(
      <MoveBand timeline={timelineOf(...OPENING)} viewIndex={4} onSeek={jest.fn()} accent="chess" />,
    );
    for (const san of ['e4', 'e5', 'Nf3', 'Nc6']) {
      expect(screen.getByText(san)).toBeOnTheScreen();
    }
    // Numbering is per full move, so two plies share one label.
    expect(screen.getByText('1.')).toBeOnTheScreen();
    expect(screen.getByText('2.')).toBeOnTheScreen();
  });

  it('jumps the board to a tapped move', () => {
    const onSeek = jest.fn();
    render(
      <MoveBand timeline={timelineOf(...OPENING)} viewIndex={4} onSeek={onSeek} accent="chess" />,
    );
    // Nf3 is the third ply → timeline index 3.
    fireEvent.press(screen.getByRole('button', { name: 'Move 3, Nf3' }));
    expect(onSeek).toHaveBeenCalledWith(3);
  });

  it('marks only the move currently on the board', () => {
    render(
      <MoveBand timeline={timelineOf(...OPENING)} viewIndex={2} onSeek={jest.fn()} accent="chess" />,
    );
    expect(screen.getByRole('button', { name: 'Move 2, e5' })).toBeSelected();
    expect(screen.getByRole('button', { name: 'Move 3, Nf3' })).not.toBeSelected();
  });

  it('marks nothing at the starting position', () => {
    render(
      <MoveBand timeline={timelineOf(...OPENING)} viewIndex={0} onSeek={jest.fn()} accent="chess" />,
    );
    expect(screen.getByRole('button', { name: 'Move 1, e4' })).not.toBeSelected();
  });
});
