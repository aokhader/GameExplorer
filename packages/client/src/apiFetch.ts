/**
 * Authenticated fetch against the Express API — shared by web and mobile.
 *
 * Pulls the current Supabase access token (the same JWT the socket uses) and
 * sends it as a Bearer header, matching the server's `requireAuth` middleware.
 * Throws an `ApiError` on non-2xx, with the server's `error` message and `code`
 * when present.
 *
 * The base URL comes from `getApiUrl()` (set once at startup via `setApiUrl`),
 * NOT from any framework env global — that is what lets this run unchanged on
 * Next (web) and Expo (React Native). Both apps call `setApiUrl()` at boot.
 */
import { getApiUrl } from './config';

/** A non-2xx answer from the API, carrying the server's `code` when it sent one. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string | undefined;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

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
    const body = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
    throw new ApiError(body.error ?? `Request failed (${res.status})`, res.status, body.code);
  }
  return res.json() as Promise<T>;
}
