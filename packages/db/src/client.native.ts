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

// Expo inlines EXPO_PUBLIC_* at build time. Kept as an eager read so the singleton
// shape matches web (module-level `supabase`).
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY as string;

let _client: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (!_client) {
    _client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    });
  }
  return _client;
}

export const supabase = getSupabaseClient();
