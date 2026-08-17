import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { GameResultScreen } from '@/game/GameResultScreen';
import { BackToHomeButton } from '@/game/resultDismiss';

// The card only animates itself into place — no gestures — so the flattened
// stand-in applies. `require` rather than the imported helper: jest hoists mock
// factories above every import, so the binding wouldn't exist yet.
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('react-native-reanimated', () => require('./helpers/reanimatedMock').mockReanimated());

const mockReplace = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ replace: mockReplace }) }));

// Trimmed to what this file is about: the sign-up ask reaches for `useAuth` (and
// through it Supabase), and the chime for the native audio module.
jest.mock('@/game/SaveProgressPrompt', () => ({ SaveProgressPrompt: () => null }));
jest.mock('@/providers/SettingsProvider', () => ({ useSettings: () => ({ reducedMotion: true }) }));
jest.mock('@/audio/useGameSfx.native', () => ({ useGameSfx: () => ({ play: jest.fn() }) }));

beforeEach(() => mockReplace.mockClear());

/**
 * The contract here is an *ordering* one, and it is the fix for a real crash:
 * leaving the screen while the result Modal is still visible made Fabric try to
 * reparent a view the modal host still owned, which blew up as
 * `addViewAt: … View already has a parent` — typically on the next tab press,
 * seconds after the navigation itself looked fine.
 *
 * `open` is derived from game state and stays true through all of this, so
 * "the card is gone" cannot be asserted via the prop; it has to be observed in
 * the tree, which is what these tests do.
 */
describe('GameResultScreen — leaving the card', () => {
  const renderCard = (props: Partial<Parameters<typeof GameResultScreen>[0]> = {}) =>
    render(<GameResultScreen open result="win" actions={<BackToHomeButton />} {...props} />);

  it('unmounts the card before Back to Home navigates', async () => {
    renderCard();
    expect(screen.getByText('You Won!')).toBeTruthy();

    fireEvent.press(screen.getByRole('button', { name: 'Back to Home' }));

    // Same commit as the press: card gone, router untouched.
    expect(screen.queryByText('You Won!')).toBeNull();
    expect(mockReplace).not.toHaveBeenCalled();

    // …and the navigation lands on a later frame.
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/'));
  });

  it('unmounts the card before Review swaps the screen out', async () => {
    const onReview = jest.fn();
    renderCard({ result: 'loss', onReview });

    fireEvent.press(screen.getByRole('button', { name: 'Review this game' }));

    expect(screen.queryByText('Good Game')).toBeNull();
    expect(onReview).not.toHaveBeenCalled();
    await waitFor(() => expect(onReview).toHaveBeenCalled());
  });

  it('re-arms once the game state closes the card, so the next game shows it', async () => {
    const { rerender } = renderCard();
    fireEvent.press(screen.getByRole('button', { name: 'Back to Home' }));
    await waitFor(() => expect(mockReplace).toHaveBeenCalled());

    // Review is the case that gets here without unmounting the screen: the card
    // closed but the player came back to it.
    rerender(<GameResultScreen open={false} result="win" actions={<BackToHomeButton />} />);
    rerender(<GameResultScreen open result="win" actions={<BackToHomeButton />} />);
    expect(screen.getByText('You Won!')).toBeTruthy();
  });

  it('navigates straight away outside a result card', () => {
    // `BackToHomeButton` is also the plain-screen back-out (the puzzles empty
    // state), where there is no modal to close first.
    render(<BackToHomeButton />);
    fireEvent.press(screen.getByRole('button', { name: 'Back to Home' }));
    expect(mockReplace).toHaveBeenCalledWith('/');
  });
});
