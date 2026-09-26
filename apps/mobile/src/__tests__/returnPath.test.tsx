import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { safeReturnPath } from '@/lib/returnPath';
// App-dir screens need a relative import: moduleNameMapper only maps src/.
import SignInScreen from '../../app/(auth)/sign-in';

/**
 * Where signing in may send someone (security audit v2, GX-24).
 *
 * `gameexplorer://sign-in?next=…` is a link anyone can send. Expo Router
 * passes anything URL-shaped in `router.replace` to `Linking.openURL`, so an
 * unchecked `next` opened a page, a dialler, an SMS draft or another app of
 * the sender's choosing, straight after a real sign-in.
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('react-native-reanimated', () => require('./helpers/reanimatedMock').mockReanimated());

const mockReplace = jest.fn();
let mockParams: { next?: string | string[] } = {};
jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace, back: jest.fn(), push: jest.fn(), canGoBack: () => true }),
  useLocalSearchParams: () => mockParams,
}));

const mockSignIn = jest.fn();
jest.mock('@gameexplorer/client', () => ({
  signInWithIdentifier: (...args: unknown[]) => mockSignIn(...args),
}));
// The OAuth buttons are their own concern (oauthCallback.test.ts); here they
// only need to report a finished sign-in.
jest.mock('@/components/auth/OAuthButtons', () => {
  const { Pressable, Text } = jest.requireActual('react-native');
  return {
    OrDivider: () => null,
    OAuthButtons: ({ onSuccess }: { onSuccess: (r: { needsUsername: boolean }) => void }) => (
      <Pressable accessibilityRole="button" onPress={() => onSuccess({ needsUsername: false })}>
        <Text>Continue with Google</Text>
      </Pressable>
    ),
  };
});

describe('safeReturnPath', () => {
  it.each([
    'https://evil.example',
    'http://evil.example/profile',
    '//evil.example',
    '///evil.example',
    '/\\evil.example',
    '/.//evil.example',
    '/./profile',
    '/../profile',
    '/profile/../..//evil.example',
    '/ evil',
    '/\tprofile',
    '/profile\n',
    'tel:+15551234',
    'sms:+15551234',
    'mailto:a@b.example',
    'market://details?id=x',
    'itms-apps://apps.apple.com/app/1',
    'otherapp://payload',
    'profile',
    '../profile',
    '',
    '/sign-in',
    '/(auth)/sign-in?next=/profile',
    '/sign-up',
    '/choose-username',
  ])('refuses %j', (raw) => {
    expect(safeReturnPath(raw)).toBeNull();
  });

  it('refuses anything that is not one string', () => {
    for (const raw of [undefined, null, 42, ['/profile', '/settings'], { pathname: '/profile' }]) {
      expect(safeReturnPath(raw)).toBeNull();
    }
  });

  it.each([
    '/profile',
    '/settings',
    '/(tabs)/profile',
    '/play/chess?online=1&invite=11111111-2222-4333-8444-555555555555',
    '/spectate/abc-123?white=Ann&black=Bob',
    '/lesson/chess/intro-1',
    '/',
  ])('keeps the in-app path %j', (raw) => {
    expect(safeReturnPath(raw)).toBe(raw);
  });
});

describe('SignInScreen sends a finished sign-in only to an in-app path', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSignIn.mockResolvedValue({ error: null });
  });

  const signInWithPassword = async () => {
    fireEvent.changeText(screen.getByLabelText('Username or email'), 'player@example.com');
    fireEvent.changeText(screen.getByLabelText('Password'), 'correct horse');
    await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Sign in' })));
  };

  it.each(['https://evil.example', '//evil.example', 'tel:+15551234', 'market://details?id=x'])(
    'a hostile next %j lands on the profile instead',
    async (next) => {
      mockParams = { next };
      render(<SignInScreen />);
      await signInWithPassword();

      expect(mockReplace).toHaveBeenCalledTimes(1);
      expect(mockReplace).toHaveBeenCalledWith('/profile');
    },
  );

  it('the same holds for an OAuth sign-in', async () => {
    mockParams = { next: 'https://evil.example' };
    render(<SignInScreen />);
    await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Continue with Google' })));

    expect(mockReplace).toHaveBeenCalledWith('/profile');
  });

  it('an in-app next is still honoured', async () => {
    mockParams = { next: '/settings' };
    render(<SignInScreen />);
    await signInWithPassword();

    expect(mockReplace).toHaveBeenCalledWith('/settings');
  });
});
