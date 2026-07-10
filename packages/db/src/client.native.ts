/**
 * React Native Supabase client.
 *
 * Metro resolves `client.native.ts` before `client.ts`, so the mobile app picks
 * this up automatically when anything in the monorepo imports `./client` from
 * `@gameexplorer/db`. It exports the SAME names (`getSupabaseClient`, `supabase`)
 * as the web `client.ts`, so every consumer (packages/client's `useAuth`/`useSocket`,
 * auth.ts, games.ts, …) is agnostic to how the client is built.
 *
 * Differences from web (`client.ts`):
 *   - `createClient` from `@supabase/supabase-js` instead of `createBrowserClient`
 *     from `@supabase/ssr` (there is no browser cookie store on native).
 *   - AsyncStorage is the session store so the login survives app restarts.
 *   - `detectSessionInUrl: false` — native has no URL to parse a session from
 *     (OAuth comes back via a deep link, handled explicitly by the app).
 *   - Config comes from Expo's `EXPO_PUBLIC_*` env (inlined at build time) instead
 *     of Next's `NEXT_PUBLIC_*`.
 *
 * This file is excluded from the package's `tsc` build (`**\/*.native.ts` in
 * tsconfig), so its `react-native` / async-storage imports never break the web
 * build; it is transpiled only by Metro, where those modules exist.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Expo inlines EXPO_PUBLIC_* at build time.
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY as string;

let _client: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (!_client) {
    // Fail with a clear, actionable message instead of supabase-js's cryptic
    // `supabaseUrl is required.`. Before, this threw at MODULE LOAD (the eager
    // `export const supabase = getSupabaseClient()` below), which took the whole
    // app down at boot — expo-router surfaced it only as the undebuggable
    // `Cannot read property 'ErrorBoundary' of undefined`. Now it throws lazily,
    // at the first screen that actually talks to Supabase, so the message points
    // straight at the missing config.
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      throw new Error(
        'Supabase is not configured: EXPO_PUBLIC_SUPABASE_URL and ' +
          'EXPO_PUBLIC_SUPABASE_ANON_KEY must be set at build time (via `eas env` ' +
          'for preview/production builds, or apps/mobile/.env.local for local dev). ' +
          'See apps/mobile/README.md.',
      );
    }
    _client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
        // PKCE (not the supabase-js default 'implicit') for native OAuth. Implicit
        // returns the session in the URL *fragment* (`#access_token=…`), which
        // Android frequently DROPS when delivering a custom-scheme redirect
        // (`gameexplorer://auth/callback`) — so the app would get a token-less URL
        // and never establish a session. PKCE returns `?code=…` as a query param
        // (reliably delivered); `oauth.ts`'s finishOAuth exchanges it via
        // `exchangeCodeForSession`. This also matches the web client's flow.
        flowType: 'pkce',
      },
    });
  }
  return _client;
}

/**
 * Lazy singleton. Preserves the eager `supabase` export web/consumers rely on,
 * but the real client is built on FIRST PROPERTY ACCESS rather than at import
 * time. Importing `@gameexplorer/db` (e.g. the db barrel, pulled in transitively
 * by `bootstrapConfig`'s `setOAuthRedirect` import) therefore never constructs a
 * client and never throws — the guest-browsable home hub, which never touches
 * `supabase`, boots even when env vars are absent.
 *
 * Methods are bound to the real client so supabase-js's private class state works
 * when called as `supabase.from(...)` / `supabase.rpc(...)` (a bare Proxy would
 * invoke them with `this` = the proxy and break `#private` field access).
 */
export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    const client = getSupabaseClient();
    // Use the real client as receiver so lazy getters (storage, functions, …)
    // and bound methods all run against real class state, not the proxy.
    const value = Reflect.get(client, prop, client);
    return typeof value === 'function' ? value.bind(client) : value;
  },
}) as SupabaseClient;
