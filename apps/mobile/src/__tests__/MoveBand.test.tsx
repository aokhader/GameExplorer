import { fireEvent, render, screen } from '@testing-library/react-native';
import { MoveBand } from '@/game/MoveBand';

// 1. e4 e5 2. Nf3 Nc6 — the band takes formatted strings, so the tests don't
// need an engine; each game's notation is covered in packages/shared.
const OPENING = ['e4', 'e5', 'Nf3', 'Nc6'];

describe('MoveBand', () => {
  it('prompts for a first move on an empty game', () => {
    render(<MoveBand moves={[]} viewIndex={0} onSeek={jest.fn()} accent="chess" />);
    expect(screen.getByText(/No moves yet/)).toBeOnTheScreen();
  });

  it('prints the moves with paired move numbers', () => {
    render(<MoveBand moves={OPENING} viewIndex={4} onSeek={jest.fn()} accent="chess" />);
    for (const move of OPENING) {
      expect(screen.getByText(move)).toBeOnTheScreen();
    }
    // Numbering is per full move, so two plies share one label.
    expect(screen.getByText('1.')).toBeOnTheScreen();
    expect(screen.getByText('2.')).toBeOnTheScreen();
  });

  it('jumps the board to a tapped move', () => {
    const onSeek = jest.fn();
    render(<MoveBand moves={OPENING} viewIndex={4} onSeek={onSeek} accent="chess" />);
    // Nf3 is the third ply → timeline index 3.
    fireEvent.press(screen.getByRole('button', { name: 'Move 3, Nf3' }));
    expect(onSeek).toHaveBeenCalledWith(3);
  });

  it('marks only the move currently on the board', () => {
    render(<MoveBand moves={OPENING} viewIndex={2} onSeek={jest.fn()} accent="chess" />);
    expect(screen.getByRole('button', { name: 'Move 2, e5' })).toBeSelected();
    expect(screen.getByRole('button', { name: 'Move 3, Nf3' })).not.toBeSelected();
  });

  it('marks nothing at the starting position', () => {
    render(<MoveBand moves={OPENING} viewIndex={0} onSeek={jest.fn()} accent="chess" />);
    expect(screen.getByRole('button', { name: 'Move 1, e4' })).not.toBeSelected();
  });

  it('renders checkers PDN unchanged', () => {
    render(
      <MoveBand moves={['21-17', '9-13', '22x15']} viewIndex={3} onSeek={jest.fn()} accent="checkers" />,
    );
    expect(screen.getByText('22x15')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Move 3, 22x15' })).toBeSelected();
  });

  it('numbers reversi pairs, keeping passes aligned', () => {
    // Reversi records a pass as its own move entry, so moveHistory stays strictly
    // alternating (black first) and pair numbers land correctly. Here black
    // passes at ply 3: the "—" is white's pair-mate, and "2." still prefixes it.
    render(
      <MoveBand moves={['f5', 'd6', '—', 'c3']} viewIndex={4} onSeek={jest.fn()} accent="reversi" />,
    );
    expect(screen.getByText('1.')).toBeOnTheScreen();
    expect(screen.getByText('2.')).toBeOnTheScreen();
    expect(screen.getByText('f5')).toBeOnTheScreen();
    // The skipped turn still occupies a slot, so indices stay aligned.
    expect(screen.getByRole('button', { name: 'Move 3, —' })).toBeOnTheScreen();
  });
});
