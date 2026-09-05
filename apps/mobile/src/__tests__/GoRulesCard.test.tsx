import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { GoScoring } from '@gameexplorer/shared';
import {
  GO_BOARD_SIZES,
  GO_KOMI_PRESETS,
  GO_RATED_SIZE,
  GO_SCORING_OPTIONS,
} from '@gameexplorer/client/game/goSetup';
import { GoRulesCard } from '@/game/GoRulesCard';

/**
 * The setup card that chooses the three rules a Go game is played under.
 *
 * What is actually worth pinning here is not that the buttons fire — it is that
 * every option the shared table offers reaches the screen with a description
 * attached. "Area" and "territory" are jargon, and the card's whole job is to
 * make them mean something before the player commits.
 */

// The card reads live theme tokens; nothing here animates, but the screen it
// lives on brings reanimated with it and the shared mock keeps that quiet.
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('react-native-reanimated', () => require('./helpers/reanimatedMock').mockReanimated());

/** Drives the card the way the setup screen does, so selection is observable. */
function Harness({ showRatedNote = false }: { showRatedNote?: boolean }) {
  const [size, setSize] = useState(GO_RATED_SIZE);
  const [komi, setKomi] = useState(7.5);
  const [scoring, setScoring] = useState<GoScoring>('area');
  return (
    <GoRulesCard
      size={size}
      onSizeChange={setSize}
      komi={komi}
      onKomiChange={setKomi}
      scoring={scoring}
      onScoringChange={setScoring}
      showRatedNote={showRatedNote}
    />
  );
}

describe('GoRulesCard', () => {
  it('offers every board size, komi preset and ruleset', () => {
    render(<Harness />);
    for (const boardSize of GO_BOARD_SIZES) {
      expect(
        screen.getByRole('button', { name: new RegExp(`^${boardSize.label} board`) }),
      ).toBeTruthy();
    }
    for (const preset of GO_KOMI_PRESETS) {
      expect(screen.getByRole('button', { name: new RegExp(`^Komi ${preset.label}`) })).toBeTruthy();
    }
    for (const option of GO_SCORING_OPTIONS) {
      expect(
        screen.getByRole('button', { name: new RegExp(`^${option.label} scoring`) }),
      ).toBeTruthy();
    }
  });

  it('explains the ruleset the player has chosen, and changes the explanation', () => {
    render(<Harness />);
    expect(screen.getByText(GO_SCORING_OPTIONS[0].description)).toBeTruthy();

    fireEvent.press(screen.getByRole('button', { name: /^Territory scoring/ }));
    expect(screen.getByText(GO_SCORING_OPTIONS[1].description)).toBeTruthy();
  });

  it('explains the komi the player has chosen', () => {
    render(<Harness />);
    const standard = GO_KOMI_PRESETS.find((k) => k.value === 7.5)!;
    expect(screen.getByText(standard.description)).toBeTruthy();

    fireEvent.press(screen.getByRole('button', { name: /^Komi None/ }));
    expect(screen.getByText(GO_KOMI_PRESETS[0].description)).toBeTruthy();
  });

  it('marks the current choice as selected for assistive tech', () => {
    render(<Harness />);
    expect(screen.getByRole('button', { name: /^Komi 7\.5/ })).toBeSelected();
    expect(screen.getByRole('button', { name: /^Area scoring/ })).toBeSelected();

    fireEvent.press(screen.getByRole('button', { name: /^Komi 0\.5/ }));
    expect(screen.getByRole('button', { name: /^Komi 0\.5/ })).toBeSelected();
    expect(screen.getByRole('button', { name: /^Komi 7\.5/ })).not.toBeSelected();
  });

  it('warns that a non-standard komi makes the game casual', () => {
    render(<Harness showRatedNote />);
    expect(screen.queryByText(/casual/)).toBeNull();

    fireEvent.press(screen.getByRole('button', { name: /^Komi 6\.5/ }));
    expect(screen.getByText(/casual/)).toBeTruthy();
  });

  it('warns that a bigger board makes the game casual, and says why', () => {
    render(<Harness showRatedNote />);
    fireEvent.press(screen.getByRole('button', { name: /^13×13 board/ }));
    // Not just "casual" — the reason matters, because "the bot is weaker on a
    // bigger board" is a real limitation and hiding it would be a small lie.
    expect(screen.getByText(/weaker on a bigger board/)).toBeTruthy();
  });

  it('says nothing about rating where nothing was going to be rated', () => {
    render(<Harness />);
    fireEvent.press(screen.getByRole('button', { name: /^Komi None/ }));
    expect(screen.queryByText(/casual/)).toBeNull();
  });

  it('does not claim the scoring rule affects rating — it does not', () => {
    render(<Harness showRatedNote />);
    fireEvent.press(screen.getByRole('button', { name: /^Territory scoring/ }));
    expect(screen.queryByText(/casual/)).toBeNull();
  });
});
