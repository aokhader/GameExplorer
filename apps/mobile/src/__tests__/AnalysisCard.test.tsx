import { fireEvent, render, screen } from '@testing-library/react-native';
import { AnalysisCard } from '@/game/AnalysisCard';

/**
 * The setup screens' way into analysis.
 *
 * What is worth pinning is the **route**, not the styling: these two paths moved
 * once already (`/analysis` → `/analysis/chess`, `/review/sgf` →
 * `/analysis/go`), the pushes are cast past the router's generated types, and a
 * wrong one costs nothing at build time and shows the Unmatched Route screen on
 * a phone.
 */

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn(), canGoBack: () => false }),
}));

describe('AnalysisCard', () => {
  beforeEach(() => mockPush.mockClear());

  it('sends chess to the position editor', () => {
    render(<AnalysisCard game="chess" />);
    fireEvent.press(screen.getByText('Analysis board'));
    expect(mockPush).toHaveBeenCalledWith('/analysis/chess');
  });

  it('sends Go to the SGF review, which is a different screen for a reason', () => {
    render(<AnalysisCard game="go" />);
    fireEvent.press(screen.getByText('Game analysis'));
    expect(mockPush).toHaveBeenCalledWith('/analysis/go');
  });

  it('says what the screen does before you get there', () => {
    render(<AnalysisCard game="go" />);
    // "Analysis" alone tells a player nothing about what to bring with them.
    expect(screen.getByText(/SGF/)).toBeOnTheScreen();
  });
});
