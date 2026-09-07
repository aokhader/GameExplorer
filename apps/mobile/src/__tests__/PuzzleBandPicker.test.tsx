import { fireEvent, render, screen } from '@testing-library/react-native';
import { PUZZLE_BANDS, bandById } from '@gameexplorer/shared';
import { PuzzleBandPicker } from '@/puzzles/PuzzleBandPicker';
import { SettingsProvider } from '@/providers/SettingsProvider';

/**
 * The difficulty picker on a phone.
 *
 * What matters here is that a band tile reads as *progress*, not inventory —
 * "3/8", not "8" — because that is the difference between the mode telling a
 * player how far through a set they are and telling them how much exists. The
 * screen-reader label carries the same fact spelled out, since "3 / 8" read
 * aloud is ambiguous.
 */

function renderPicker(over: Partial<React.ComponentProps<typeof PuzzleBandPicker>> = {}) {
  const bands = PUZZLE_BANDS.chess;
  const props = {
    game: 'chess' as const,
    band: bandById('chess', 'club')!,
    counts: { beginner: 10, novice: 8, club: 8, intermediate: 0, advanced: 5, master: 0 },
    solved: { beginner: 10, novice: 3, club: 0, intermediate: 0, advanced: 1, master: 0 },
    onSelect: jest.fn(),
    ...over,
  };
  render(
    <SettingsProvider>
      <PuzzleBandPicker {...props} />
    </SettingsProvider>,
  );
  return { props, bands };
}

describe('PuzzleBandPicker', () => {
  it('offers every band for the game', () => {
    const { bands } = renderPicker();
    for (const band of bands) {
      expect(screen.getByTestId(`puzzle-band-${band.id}`)).toBeOnTheScreen();
    }
    expect(bands).toHaveLength(6);
  });

  it('shows progress through each band, not how many exist', () => {
    renderPicker();
    expect(screen.getByTestId('puzzle-band-novice-progress')).toHaveTextContent('900 · 3/8');
    expect(screen.getByTestId('puzzle-band-club-progress')).toHaveTextContent('1200 · 0/8');
  });

  it('marks an empty band with a dash rather than a zero', () => {
    // "0" reads as "you have solved none of them"; the dash says "there are
    // none yet", which is the honest thing for a band the corpus has not
    // reached.
    renderPicker();
    expect(screen.getByTestId('puzzle-band-master-progress')).toHaveTextContent('2800 · —');
  });

  it('ticks a band that is fully solved', () => {
    renderPicker();
    // Regex, not a string: RNTL's `toHaveTextContent` matches a string exactly,
    // and the tile's full text is "Beginner ✓600 · 10/10".
    expect(screen.getByTestId('puzzle-band-beginner')).toHaveTextContent(/Beginner ✓/);
    expect(screen.getByTestId('puzzle-band-club')).not.toHaveTextContent(/✓/);
  });

  it('does not tick an empty band — nothing was achieved', () => {
    renderPicker();
    expect(screen.getByTestId('puzzle-band-master')).not.toHaveTextContent(/✓/);
  });

  it('reports the selected band to assistive tech', () => {
    renderPicker();
    // `toHaveAccessibilityState` is not in this RNTL build, so read the prop.
    expect(screen.getByTestId('puzzle-band-club').props.accessibilityState).toMatchObject({
      selected: true,
    });
    expect(screen.getByTestId('puzzle-band-novice').props.accessibilityState).toMatchObject({
      selected: false,
    });
  });

  it('spells the counts out in the label, where "3/8" would be ambiguous', () => {
    renderPicker();
    expect(
      screen.getByLabelText('Novice, around 900 rating, 3 of 8 solved'),
    ).toBeOnTheScreen();
    expect(
      screen.getByLabelText('Master, around 2800 rating, no puzzles yet'),
    ).toBeOnTheScreen();
  });

  it('reports a chosen band', () => {
    const { props } = renderPicker();
    fireEvent.press(screen.getByTestId('puzzle-band-advanced'));
    expect(props.onSelect).toHaveBeenCalledWith('advanced');
  });

  it('lets an empty band be chosen, so the screen can explain why it is empty', () => {
    // Disabling it would leave the player guessing; the screen has copy for it.
    const { props } = renderPicker();
    fireEvent.press(screen.getByTestId('puzzle-band-master'));
    expect(props.onSelect).toHaveBeenCalledWith('master');
  });

  it('shows the player’s rating when there is one, and nothing when there is not', () => {
    renderPicker({ rating: 1240 });
    expect(screen.getByText('your rating: 1240')).toBeOnTheScreen();

    screen.unmount();
    renderPicker({ rating: null });
    expect(screen.queryByText(/your rating/)).toBeNull();
  });

  it('uses each game’s own ladder, not chess’s', () => {
    // Go tops out at 2000 where chess reaches 2800; a shared ladder would make
    // the label a lie on three of the four games.
    renderPicker({
      game: 'go',
      band: bandById('go', 'club')!,
      counts: { beginner: 1, casual: 1, club: 1, strong: 1, expert: 1, master: 1 },
      solved: { beginner: 0, casual: 0, club: 0, strong: 0, expert: 0, master: 0 },
    });
    expect(screen.getByTestId('puzzle-band-master-progress')).toHaveTextContent('2000 · 0/1');
  });
});
