import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
// App-dir screens need a relative import: moduleNameMapper only maps src/.
import ChooseUsernameScreen from '../../app/(auth)/choose-username';

/**
 * The post-OAuth username chooser. What is pinned:
 *   - the derived name is pre-filled, so keeping it is one tap
 *   - an already-chosen user is sent straight on, never shown the form
 *   - a refusal from the server stays on screen and says why
 *   - with no `next`, it returns to whatever pushed it (the save-progress prompt)
 *
 * The availability hook and the network calls are faked: their own decisions
 * are tested in packages/client (username.test.ts).
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('react-native-reanimated', () => require('./helpers/reanimatedMock').mockReanimated());

const mockReplace = jest.fn();
const mockBack = jest.fn();
let mockParams: { next?: string } = {};
jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace, back: mockBack, push: jest.fn(), canGoBack: () => true }),
  useLocalSearchParams: () => mockParams,
}));

const mockGetProfileState = jest.fn();
const mockClaim = jest.fn();
jest.mock('@gameexplorer/client', () => ({
  getProfileState: () => mockGetProfileState(),
  claimUsername: (name: string) => mockClaim(name),
  // The pre-filled name is the user's own, which the real hook reports as available.
  useUsernameAvailability: () => ({
    state: { status: 'available', reason: 'ok', hint: 'Available' },
    recheck: jest.fn(),
  }),
  canSubmitUsername: (s: { status: string }) => s.status === 'available' || s.status === 'unknown',
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = { next: '/profile' };
  mockGetProfileState.mockResolvedValue({ status: 'needs-username', username: 'joseobrien' });
  mockClaim.mockResolvedValue({ ok: true });
});

const continueButton = () => screen.getByRole('button', { name: 'Continue' });

describe('ChooseUsernameScreen', () => {
  it('pre-fills the derived name, and keeping it is one tap', async () => {
    render(<ChooseUsernameScreen />);
    await waitFor(() => expect(screen.getByLabelText('Username').props.value).toBe('joseobrien'));

    await act(async () => fireEvent.press(continueButton()));

    expect(mockClaim).toHaveBeenCalledWith('joseobrien');
    expect(mockReplace).toHaveBeenCalledWith('/profile');
  });

  it('claims what the user typed instead, trimmed', async () => {
    render(<ChooseUsernameScreen />);
    await waitFor(() => expect(screen.getByLabelText('Username').props.value).toBe('joseobrien'));

    fireEvent.changeText(screen.getByLabelText('Username'), '  queen_gambit ');
    await act(async () => fireEvent.press(continueButton()));

    expect(mockClaim).toHaveBeenCalledWith('queen_gambit');
  });

  it('sends an already-chosen user straight on without asking', async () => {
    mockGetProfileState.mockResolvedValue({ status: 'ok' });
    render(<ChooseUsernameScreen />);

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/profile'));
    expect(mockClaim).not.toHaveBeenCalled();
  });

  it('keeps the user here and says why when the server refuses the name', async () => {
    mockClaim.mockResolvedValue({ ok: false, reason: 'taken' });
    render(<ChooseUsernameScreen />);
    await waitFor(() => expect(screen.getByLabelText('Username').props.value).toBe('joseobrien'));

    await act(async () => fireEvent.press(continueButton()));

    expect(screen.getByText('That username is taken. Try another.')).toBeOnTheScreen();
    expect(mockReplace).not.toHaveBeenCalled();
    // The same name cannot be resubmitted; editing it clears the refusal.
    expect(continueButton()).toBeDisabled();
    fireEvent.changeText(screen.getByLabelText('Username'), 'joseobrien2');
    expect(continueButton()).toBeEnabled();
  });

  it('shows a failed request without navigating', async () => {
    mockClaim.mockResolvedValue({ ok: false, reason: 'error', error: 'Network request failed' });
    render(<ChooseUsernameScreen />);
    await waitFor(() => expect(screen.getByLabelText('Username').props.value).toBe('joseobrien'));

    await act(async () => fireEvent.press(continueButton()));

    expect(screen.getByText('Network request failed')).toBeOnTheScreen();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('goes back to what pushed it when there is no next', async () => {
    mockParams = {};
    render(<ChooseUsernameScreen />);
    await waitFor(() => expect(screen.getByLabelText('Username').props.value).toBe('joseobrien'));

    await act(async () => fireEvent.press(continueButton()));

    expect(mockBack).toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('ignores a next that is not an in-app path — the screen is deep-linkable', async () => {
    for (const next of ['https://evil.example', '//evil.example']) {
      jest.clearAllMocks();
      mockParams = { next };
      const { unmount } = render(<ChooseUsernameScreen />);
      await waitFor(() => expect(screen.getByLabelText('Username').props.value).toBe('joseobrien'));

      await act(async () => fireEvent.press(continueButton()));

      expect(mockReplace).not.toHaveBeenCalled();
      expect(mockBack).toHaveBeenCalled();
      unmount();
    }
  });

  it('still lets the user choose when their profile could not be read', async () => {
    mockGetProfileState.mockResolvedValue({ status: 'unknown' });
    render(<ChooseUsernameScreen />);

    await waitFor(() => expect(screen.getByLabelText('Username')).toBeEnabled());
    expect(screen.getByLabelText('Username').props.value).toBe('');
  });
});
