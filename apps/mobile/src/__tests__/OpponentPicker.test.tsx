import { fireEvent, render, screen } from '@testing-library/react-native';
import { GAME_ACCENTS } from '@finesse/ui';
import { OpponentPicker, FlipBoardCard } from '@/game/OpponentPicker';
import { SettingsProvider } from '@/providers/SettingsProvider';

const accent = GAME_ACCENTS.chess.base;
const tint = GAME_ACCENTS.chess.tintBg;

describe('OpponentPicker', () => {
  it('renders all five modes and marks the current one selected', () => {
    render(<OpponentPicker value="bot" onChange={() => {}} accent={accent} tint={tint} />);
    expect(screen.getByRole('button', { name: /vs Bot/ })).toBeSelected();
    expect(screen.getByRole('button', { name: /Online/ })).not.toBeSelected();
    expect(screen.getByRole('button', { name: /Training/ })).not.toBeSelected();
    expect(screen.getByRole('button', { name: /Pass & Play/ })).not.toBeSelected();
    expect(screen.getByRole('button', { name: /Puzzles/ })).not.toBeSelected();
  });

  /**
   * Online is the second of the two modes that are not `LocalGameMode`s: the
   * server owns the game loop, so `useLocalGame` must never be handed this
   * value. The screens enforce that; this pins the tile that produces it.
   */
  it('selects online, which is a mode here but not a local game mode', () => {
    const onChange = jest.fn();
    render(<OpponentPicker value="bot" onChange={onChange} accent={accent} tint={tint} />);
    fireEvent.press(screen.getByRole('button', { name: /Online/ }));
    expect(onChange).toHaveBeenCalledWith('online');
  });

  it('selects puzzles, which is a mode here but not a game mode', () => {
    const onChange = jest.fn();
    render(<OpponentPicker value="bot" onChange={onChange} accent={accent} tint={tint} />);
    fireEvent.press(screen.getByRole('button', { name: /Puzzles/ }));
    expect(onChange).toHaveBeenCalledWith('puzzles');
  });

  it('shows puzzles as the selected tile when it is the value', () => {
    render(<OpponentPicker value="puzzles" onChange={() => {}} accent={accent} tint={tint} />);
    expect(screen.getByRole('button', { name: /Puzzles/ })).toBeSelected();
    expect(screen.getByRole('button', { name: /vs Bot/ })).not.toBeSelected();
  });

  it('reports the tapped mode', () => {
    const onChange = jest.fn();
    render(<OpponentPicker value="bot" onChange={onChange} accent={accent} tint={tint} />);
    fireEvent.press(screen.getByRole('button', { name: /Pass & Play/ }));
    expect(onChange).toHaveBeenCalledWith('pass-and-play');
  });

  it('selects training', () => {
    const onChange = jest.fn();
    render(<OpponentPicker value="bot" onChange={onChange} accent={accent} tint={tint} />);
    fireEvent.press(screen.getByRole('button', { name: /Training/ }));
    expect(onChange).toHaveBeenCalledWith('training');
  });
});

describe('FlipBoardCard', () => {
  it('toggles the persisted flip setting', async () => {
    render(
      <SettingsProvider>
        <FlipBoardCard />
      </SettingsProvider>,
    );
    // Defaults ON; pressing flips the value through the settings context.
    const toggle = await screen.findByRole('switch');
    expect(toggle).toBeChecked();
    fireEvent.press(toggle);
    expect(await screen.findByRole('switch')).not.toBeChecked();
  });
});
