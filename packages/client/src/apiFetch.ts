/**
 * Authenticated fetch against the Express API — shared by web and mobile.
 *
 * Pulls the current Supabase access token (the same JWT the socket uses) and
 * sends it as a Bearer header, matching the server's `requireAuth` middleware.
 * Throws on non-2xx with the server's `error` message when present.
 *
 * The base URL comes from `getApiUrl()` (set once at startup via `setApiUrl`),
 * NOT from any framework env global — that is what lets this run unchanged on
 * Next (web) and Expo (React Native). Both apps call `setApiUrl()` at boot.
 */
import { getApiUrl } from './config';

export async function apiFetch<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  // Dynamic import keeps @supabase/* out of the initial bundle of screens that
  // only *might* call the API; the module is cached after the first call.
  const { supabase } = await import('@gameexplorer/db');
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;

  const res = await fetch(`${getApiUrl()}/api${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}
