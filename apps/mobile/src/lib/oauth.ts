import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import * as AppleAuthentication from 'expo-apple-authentication';
import { supabase } from '@gameexplorer/db';
import { getProfileState } from '@gameexplorer/client';

/**
 * What every sign-in path returns. `needsUsername` is true when the user's
 * name was built for them rather than chosen (always the case on a first OAuth
 * sign-in), and the caller should send them to choose-username before `next`.
 */
export interface OAuthResult {
  error: string | null;
  cancelled: boolean;
  needsUsername: boolean;
}

const failed = (error: string): OAuthResult => ({ error, cancelled: false, needsUsername: false });
const cancelled: OAuthResult = { error: null, cancelled: true, needsUsername: false };

/**
 * The session is established; ask whether the username still needs choosing.
 * An `unknown` answer means "don't ask" — the prompt must never stand between
 * someone and a sign-in that worked.
 */
async function signedIn(): Promise<OAuthResult> {
  const state = await getProfileState();
  return { error: null, cancelled: false, needsUsername: state.status === 'needs-username' };
}

/**
 * Native OAuth sign-in (Google / Facebook) for Supabase.
 *
 * The web flow lets the browser redirect and Supabase's `detectSessionInUrl`
 * pick up the session. Native can't do that (`detectSessionInUrl: false`, no
 * page URL), so we drive the round-trip by hand:
 *
 *   1. Ask Supabase for the provider consent URL (`skipBrowserRedirect` — we open
 *      it ourselves, not via a full-page navigation).
 *   2. Open it in an auth session tab and wait for the `gameexplorer://auth/callback`
 *      deep link to come back.
 *   3. The mobile client uses the PKCE flow (see client.native.ts), so the return
 *      URL carries an authorization `?code=` as a query param — which Android
 *      delivers reliably, unlike the implicit flow's `#access_token` fragment
 *      (frequently dropped on custom-scheme redirects). We hand the code to
 *      `exchangeCodeForSession`, which establishes + persists the session and fires
 *      `onAuthStateChange` — the same event the shared `useAuth` listens on, so
 *      every screen updates. A return URL carrying tokens instead is refused: see
 *      `finishOAuth`.
 *
 * Returns an error string on failure, or null on success / user cancel.
 */
export async function signInWithOAuthNative(
  provider: 'google' | 'facebook',
): Promise<OAuthResult> {
  // NOTE: no leading slash on the path — `createURL('auth/callback')` yields
  // `gameexplorer://auth/callback` (host `auth`), a valid deep link Supabase
  // accepts in its Redirect URLs allowlist. A leading slash produces the
  // empty-host `gameexplorer:///auth/callback`, which Supabase rejects.
  const redirectTo = Linking.createURL('auth/callback');

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo, skipBrowserRedirect: true },
  });

  if (error) return failed(error.message);
  if (!data?.url) return failed('Could not start sign-in.');

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);

  if (result.type !== 'success') {
    // 'cancel' / 'dismiss' — the user backed out; not an error to surface.
    return cancelled;
  }

  return finishOAuth(result.url);
}

/**
 * Native Sign in with Apple (iOS). Apple requires the native credential flow
 * (its own button + `signInAsync`), not the WebBrowser round-trip used for
 * Google/Facebook. We exchange the returned identity token with Supabase via
 * `signInWithIdToken`, which fires the same `onAuthStateChange` every screen
 * listens on. Required by App Store Guideline 4.8 whenever social logins are
 * offered.
 *
 * Note: Apple returns the user's name only on the FIRST authorization and the
 * email may be a private relay. The database trigger derives a username from
 * whatever metadata is present, and a derived name is what sends the user to
 * choose-username — so a relay address never silently becomes their handle.
 */
export async function signInWithAppleNative(): Promise<OAuthResult> {
  try {
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    });

    if (!credential.identityToken) {
      return failed('Apple did not return an identity token.');
    }

    const { error } = await supabase.auth.signInWithIdToken({
      provider: 'apple',
      token: credential.identityToken,
    });
    if (error) return failed(error.message);

    return await signedIn();
  } catch (e) {
    // The user tapped Cancel on the Apple sheet — not an error to surface.
    if (e && typeof e === 'object' && 'code' in e && (e as { code?: string }).code === 'ERR_REQUEST_CANCELED') {
      return cancelled;
    }
    return failed(e instanceof Error ? e.message : 'Apple sign-in failed.');
  }
}

/**
 * Establish the session from the returned deep link, which must carry a PKCE
 * `code` and nothing else that could sign someone in.
 *
 * **A URL carrying tokens is refused, never used** (security audit v2, GX-13).
 * This client is PKCE-only, so Supabase never puts tokens in the redirect; any
 * that arrive were put there by someone else. On Android the auth session is a
 * polyfill that takes the first `gameexplorer://auth/callback…` link the phone
 * delivers while the sign-in tab is open, from any app or web page. Honouring
 * `#access_token=…&refresh_token=…` there signed the user into whichever account
 * those tokens belonged to — the attacker's — and everything they did next
 * landed in it. A forged `?code=` fails on its own, because the exchange needs
 * the verifier this device generated.
 */
export async function finishOAuth(url: string): Promise<OAuthResult> {
  const parsed = Linking.parse(url);
  const params = parsed.queryParams ?? {};

  // Linking.parse reads only the query, so the fragment is read by hand: a
  // token is refused wherever in the URL it was put.
  const fragment = url.includes('#') ? url.slice(url.indexOf('#') + 1) : '';
  const frag = new URLSearchParams(fragment);
  const has = (name: string) => str(params[name]) != null || frag.has(name);

  const oauthError = str(params.error_description) ?? frag.get('error_description');
  if (oauthError) return failed(oauthError);

  if (has('access_token') || has('refresh_token')) {
    return failed('Unexpected sign-in response. Please try again.');
  }

  const code = str(params.code) ?? frag.get('code');
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return failed(error.message);
    return signedIn();
  }

  return failed('Sign-in did not return a session.');
}

function str(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : (v ?? undefined);
}
