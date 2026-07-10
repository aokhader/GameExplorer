import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { supabase } from '@gameexplorer/db';
import { ensureProfile } from './profile';

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
 *      every screen updates. (Implicit-flow fragment tokens are still handled as a
 *      fallback for robustness.)
 *
 * Returns an error string on failure, or null on success / user cancel.
 */
export async function signInWithOAuthNative(
  provider: 'google' | 'facebook',
): Promise<{ error: string | null; cancelled: boolean }> {
  // NOTE: no leading slash on the path — `createURL('auth/callback')` yields
  // `gameexplorer://auth/callback` (host `auth`), a valid deep link Supabase
  // accepts in its Redirect URLs allowlist. A leading slash produces the
  // empty-host `gameexplorer:///auth/callback`, which Supabase rejects.
  const redirectTo = Linking.createURL('auth/callback');

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo, skipBrowserRedirect: true },
  });

  if (error) return { error: error.message, cancelled: false };
  if (!data?.url) return { error: 'Could not start sign-in.', cancelled: false };

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);

  if (result.type !== 'success') {
    // 'cancel' / 'dismiss' — the user backed out; not an error to surface.
    return { error: null, cancelled: true };
  }

  return finishOAuth(result.url);
}

/** Extract tokens/code from the returned deep link and establish the session. */
async function finishOAuth(url: string): Promise<{ error: string | null; cancelled: boolean }> {
  const parsed = Linking.parse(url);
  const params = parsed.queryParams ?? {};

  // Implicit flow: tokens arrive in the URL fragment, which Linking.parse folds
  // into queryParams for custom schemes. Fall back to manual fragment parsing.
  const fragment = url.includes('#') ? url.slice(url.indexOf('#') + 1) : '';
  const frag = new URLSearchParams(fragment);

  const accessToken = str(params.access_token) ?? frag.get('access_token');
  const refreshToken = str(params.refresh_token) ?? frag.get('refresh_token');
  const code = str(params.code) ?? frag.get('code');
  const oauthError = str(params.error_description) ?? frag.get('error_description');

  if (oauthError) return { error: oauthError, cancelled: false };

  if (accessToken && refreshToken) {
    const { error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    if (error) return { error: error.message, cancelled: false };
    await ensureProfile();
    return { error: null, cancelled: false };
  }

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return { error: error.message, cancelled: false };
    await ensureProfile();
    return { error: null, cancelled: false };
  }

  return { error: 'Sign-in did not return a session.', cancelled: false };
}

function str(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : (v ?? undefined);
}
