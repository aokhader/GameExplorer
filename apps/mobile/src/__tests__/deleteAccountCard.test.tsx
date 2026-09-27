/**
 * Deleting an account needs a sign-in from the last ten minutes (security audit
 * v2, GX-19). When the API says the session is older, the card signs the user
 * in again and then deletes. The one mistake it must never make is deleting a
 * different account than the one it was opened for.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Platform } from 'react-native';
import { DeleteAccountCard } from '@/components/settings/DeleteAccountCard';

// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('react-native-reanimated', () => require('./helpers/reanimatedMock').mockReanimated());

const mockReplace = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ replace: mockReplace }) }));

const mockSignOut = jest.fn(async () => ({ error: null }));
jest.mock('@gameexplorer/db', () => ({ supabase: { auth: { signOut: () => mockSignOut() } } }));

const mockApiFetch = jest.fn();
const mockReauthMethod = jest.fn();
const mockConfirmPassword = jest.fn();
const mockCurrentUserId = jest.fn();
jest.mock('@gameexplorer/client', () => {
  const actual = jest.requireActual('@gameexplorer/client/apiFetch');
  return {
    useAuth: () => ({ user: { id: 'me', email: 'me@example.com' }, loading: false }),
    apiFetch: (...args: unknown[]) => mockApiFetch(...args),
    needsReauth: (err: unknown) => err instanceof actual.ApiError && (err as { code?: string }).code === 'REAUTH_REQUIRED',
    currentReauthMethod: () => mockReauthMethod(),
    confirmPassword: (...args: unknown[]) => mockConfirmPassword(...args),
    currentUserId: () => mockCurrentUserId(),
    ApiError: actual.ApiError,
  };
});

const mockGoogle = jest.fn();
const mockApple = jest.fn();
jest.mock('@/lib/oauth', () => ({
  signInWithOAuthNative: (...args: unknown[]) => mockGoogle(...args),
  signInWithAppleNative: () => mockApple(),
}));

const { ApiError } = jest.requireActual('@gameexplorer/client/apiFetch');
const tooOld = () => new ApiError('For your security, sign out and sign in again…', 403, 'REAUTH_REQUIRED');

beforeEach(() => {
  jest.clearAllMocks();
  Platform.OS = 'ios';
});

async function confirmDelete() {
  render(<DeleteAccountCard />);
  fireEvent.press(screen.getByText('Delete account…'));
  fireEvent.changeText(screen.getByPlaceholderText('DELETE'), 'DELETE');
  await act(async () => { fireEvent.press(screen.getByText('Permanently delete')); });
}

it('names the account it is about to delete', () => {
  render(<DeleteAccountCard />);
  fireEvent.press(screen.getByText('Delete account…'));
  expect(screen.getByText(/deletes the account me@example\.com/)).toBeTruthy();
});

it('deletes straight away after a recent sign-in', async () => {
  mockApiFetch.mockResolvedValueOnce({ ok: true });
  await confirmDelete();
  expect(mockApiFetch).toHaveBeenCalledWith('/users/me', { method: 'DELETE' });
  expect(mockSignOut).toHaveBeenCalled();
  expect(mockReplace).toHaveBeenCalledWith('/');
});

it('asks a password account for its password, then deletes', async () => {
  mockApiFetch.mockRejectedValueOnce(tooOld()).mockResolvedValueOnce({ ok: true });
  mockReauthMethod.mockResolvedValue({ kind: 'password', email: 'me@example.com' });
  mockConfirmPassword.mockResolvedValue({ error: null });
  await confirmDelete();

  await waitFor(() => expect(screen.getByText(/enter your password to delete me@example\.com/)).toBeTruthy());
  expect(mockSignOut).not.toHaveBeenCalled();
  fireEvent.changeText(screen.getByPlaceholderText('Password'), 'hunter2');
  await act(async () => { fireEvent.press(screen.getByText('Confirm and delete')); });

  expect(mockConfirmPassword).toHaveBeenCalledWith('me@example.com', 'hunter2');
  expect(mockApiFetch).toHaveBeenCalledTimes(2);
  expect(mockReplace).toHaveBeenCalledWith('/');
});

it('deletes nothing when the password is wrong', async () => {
  mockApiFetch.mockRejectedValueOnce(tooOld());
  mockReauthMethod.mockResolvedValue({ kind: 'password', email: 'me@example.com' });
  mockConfirmPassword.mockResolvedValue({ error: 'That password is not right.' });
  await confirmDelete();

  await waitFor(() => screen.getByPlaceholderText('Password'));
  fireEvent.changeText(screen.getByPlaceholderText('Password'), 'wrong');
  await act(async () => { fireEvent.press(screen.getByText('Confirm and delete')); });

  expect(screen.getByText('That password is not right.')).toBeTruthy();
  expect(mockApiFetch).toHaveBeenCalledTimes(1);
});

it('runs the provider again for a Google account, then deletes', async () => {
  mockApiFetch.mockRejectedValueOnce(tooOld()).mockResolvedValueOnce({ ok: true });
  mockReauthMethod.mockResolvedValue({ kind: 'provider', provider: 'google' });
  mockGoogle.mockResolvedValue({ error: null, cancelled: false, needsUsername: false });
  mockCurrentUserId.mockResolvedValue('me');
  await confirmDelete();

  await act(async () => { fireEvent.press(await screen.findByText('Sign in with Google')); });
  expect(mockGoogle).toHaveBeenCalledWith('google');
  expect(mockApiFetch).toHaveBeenCalledTimes(2);
});

it('never deletes when the provider signed in a different account', async () => {
  mockApiFetch.mockRejectedValueOnce(tooOld());
  mockReauthMethod.mockResolvedValue({ kind: 'provider', provider: 'google' });
  mockGoogle.mockResolvedValue({ error: null, cancelled: false, needsUsername: false });
  mockCurrentUserId.mockResolvedValue('someone-else');
  await confirmDelete();

  await act(async () => { fireEvent.press(await screen.findByText('Sign in with Google')); });
  expect(screen.getByText('That signed in to a different account, so nothing was deleted.')).toBeTruthy();
  expect(mockApiFetch).toHaveBeenCalledTimes(1);
});

it('deletes nothing when the provider sign-in is cancelled', async () => {
  mockApiFetch.mockRejectedValueOnce(tooOld());
  mockReauthMethod.mockResolvedValue({ kind: 'provider', provider: 'apple' });
  mockApple.mockResolvedValue({ error: null, cancelled: true, needsUsername: false });
  // Still the same account, so only the cancel itself stands in the way.
  mockCurrentUserId.mockResolvedValue('me');
  await confirmDelete();

  await act(async () => { fireEvent.press(await screen.findByText('Sign in with Apple')); });
  expect(mockApiFetch).toHaveBeenCalledTimes(1);
  expect(screen.getByText('Sign in with Apple')).toBeTruthy();
});

it('tells an Apple account on Android to sign out and back in', async () => {
  Platform.OS = 'android';
  mockApiFetch.mockRejectedValueOnce(tooOld());
  mockReauthMethod.mockResolvedValue({ kind: 'provider', provider: 'apple' });
  await confirmDelete();

  expect(await screen.findByText(/sign out and sign in again, then delete your account within ten minutes/)).toBeTruthy();
  expect(screen.queryByText('Sign in with Apple')).toBeNull();
});
