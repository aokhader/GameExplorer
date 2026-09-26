/**
 * What the app does with the URL an OAuth round trip comes back on
 * (security audit v2, GX-13).
 *
 * On Android the auth session takes the first `gameexplorer://auth/callback…`
 * the phone delivers while the sign-in tab is open, whoever sent it. The app
 * used to install any `access_token` + `refresh_token` it found there, which
 * signed the user into the sender's account. The client is PKCE-only, so the
 * only thing a real callback carries is a `code`.
 */
import { finishOAuth } from '@/lib/oauth';

const mockSetSession = jest.fn();
const mockExchange = jest.fn();

jest.mock('@gameexplorer/db', () => ({
  supabase: {
    auth: {
      setSession: (...args: unknown[]) => mockSetSession(...args),
      exchangeCodeForSession: (...args: unknown[]) => mockExchange(...args),
    },
  },
}));
jest.mock('@gameexplorer/client', () => ({
  getProfileState: () => Promise.resolve({ status: 'ready' }),
}));
// The real `Linking.parse`, which reads the app's scheme from expo-constants:
// a bare build, as the shipped app is.
jest.mock('expo-constants', () => ({
  __esModule: true,
  ExecutionEnvironment: { Bare: 'bare', Standalone: 'standalone', StoreClient: 'storeClient' },
  default: { executionEnvironment: 'bare', expoConfig: { scheme: 'gameexplorer' } },
}));
jest.mock('expo-web-browser', () => ({ openAuthSessionAsync: jest.fn() }));
jest.mock('expo-apple-authentication', () => ({ signInAsync: jest.fn(), AppleAuthenticationScope: {} }));

const CALLBACK = 'gameexplorer://auth/callback';

beforeEach(() => {
  mockSetSession.mockReset().mockResolvedValue({ error: null });
  mockExchange.mockReset().mockResolvedValue({ error: null });
});

describe('finishOAuth — tokens in the callback are refused (GX-13)', () => {
  it.each([
    ['in the fragment, as the implicit flow sends them', `${CALLBACK}#access_token=ATTACKER&refresh_token=ATTACKER_R`],
    ['in the query', `${CALLBACK}?access_token=ATTACKER&refresh_token=ATTACKER_R`],
    ['split between query and fragment', `${CALLBACK}?access_token=ATTACKER#refresh_token=ATTACKER_R`],
    ['only one of the two', `${CALLBACK}#refresh_token=ATTACKER_R`],
    ['alongside a code', `${CALLBACK}?code=abc#access_token=ATTACKER&refresh_token=ATTACKER_R`],
  ])('%s', async (_label, url) => {
    const result = await finishOAuth(url);

    expect(result.error).toBeTruthy();
    expect(result.cancelled).toBe(false);
    expect(mockSetSession).not.toHaveBeenCalled();
    expect(mockExchange).not.toHaveBeenCalled();
  });
});

describe('finishOAuth — the real PKCE callback still signs in', () => {
  it('exchanges the code', async () => {
    const result = await finishOAuth(`${CALLBACK}?code=pkce-code-123`);

    expect(mockExchange).toHaveBeenCalledWith('pkce-code-123');
    expect(result).toEqual({ error: null, cancelled: false, needsUsername: false });
  });

  it("reports the provider's error", async () => {
    const result = await finishOAuth(`${CALLBACK}?error=access_denied&error_description=User%20said%20no`);

    expect(result.error).toBe('User said no');
    expect(mockExchange).not.toHaveBeenCalled();
  });

  it('fails a callback with neither a code nor an error', async () => {
    const result = await finishOAuth(CALLBACK);

    expect(result.error).toBeTruthy();
    expect(mockExchange).not.toHaveBeenCalled();
  });
});
