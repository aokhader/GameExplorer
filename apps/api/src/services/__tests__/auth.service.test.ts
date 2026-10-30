// Username sign-in. The behaviour under test is mostly about what the endpoint
// REFUSES to do: resolve an ambiguous username, treat a LIKE wildcard as a
// name, or distinguish "no such user" from "wrong password" in its result.
import { describe, it, expect, beforeEach, vi } from 'vitest';

const state = vi.hoisted(() => ({
  /** Rows the profiles lookup returns. */
  profiles: [] as { id: string }[],
  profilesError: null as { message: string } | null,
  /** email keyed by user id, for auth.admin.getUserById. */
  emails: {} as Record<string, string>,
  /** Passwords that are correct, keyed by email. */
  passwords: {} as Record<string, string>,
  /** The pattern the last `ilike` fallback lookup was given. */
  lastIlikePattern: null as string | null,
  /** The name the last profile_ids_for_username call was given. */
  lastRpcName: null as string | null,
  /** profile_ids_for_username has not been created yet. */
  rpcMissing: false,
  /** Whether a password grant was attempted at all. */
  signInCalls: [] as { email: string; password: string }[],
  anonAvailable: true,
}));

const filter = vi.hoisted(() => ({ check: vi.fn(), note: vi.fn(), add: vi.fn() }));
vi.mock('../usernameFilter.service', () => ({ usernameFilter: filter }));

vi.mock('../../config/supabase', () => ({
  supabaseAdmin: {
    rpc: (_fn: string, args: { p_name: string }) => {
      state.lastRpcName = args.p_name;
      return Promise.resolve(
        state.rpcMissing
          ? { data: null, error: { code: 'PGRST202', message: 'Could not find the function' } }
          : { data: state.profiles, error: state.profilesError },
      );
    },
    from: () => ({
      select: () => ({
        ilike: (_col: string, pattern: string) => {
          state.lastIlikePattern = pattern;
          return {
            limit: () => ({ data: state.profiles, error: state.profilesError }),
          };
        },
      }),
    }),
    auth: {
      admin: {
        getUserById: (id: string) => {
          const email = state.emails[id];
          return Promise.resolve(
            email
              ? { data: { user: { email } }, error: null }
              : { data: { user: null }, error: { message: 'not found' } },
          );
        },
      },
    },
  },
  get supabaseAnon() {
    if (!state.anonAvailable) return null;
    return {
      auth: {
        signInWithPassword: ({ email, password }: { email: string; password: string }) => {
          state.signInCalls.push({ email, password });
          return Promise.resolve(
            state.passwords[email] === password
              ? {
                  data: { session: { access_token: 'at', refresh_token: 'rt' } },
                  error: null,
                }
              : { data: { session: null }, error: { message: 'Invalid login credentials' } },
          );
        },
      },
    };
  },
}));

import { authService } from '../auth.service';
import { resetUsernameLookup } from '../usernameLookup';

describe('authService.loginWithIdentifier', () => {
  beforeEach(() => {
    state.profiles = [];
    state.profilesError = null;
    state.emails = {};
    state.passwords = {};
    state.lastIlikePattern = null;
    state.lastRpcName = null;
    state.rpcMissing = false;
    state.signInCalls = [];
    state.anonAvailable = true;
    resetUsernameLookup();
    filter.check.mockReset();
  });

  it('signs in by username, resolving it to the account email', async () => {
    state.profiles = [{ id: 'user-1' }];
    state.emails['user-1'] = 'aziz@example.com';
    state.passwords['aziz@example.com'] = 'hunter2';

    const result = await authService.loginWithIdentifier('aziz', 'hunter2');

    expect(result).toEqual({
      ok: true,
      session: { access_token: 'at', refresh_token: 'rt' },
    });
    expect(state.signInCalls).toEqual([{ email: 'aziz@example.com', password: 'hunter2' }]);
  });

  it('treats an identifier containing @ as an email and skips the lookup', async () => {
    state.passwords['aziz@example.com'] = 'hunter2';

    const result = await authService.loginWithIdentifier('aziz@example.com', 'hunter2');

    expect(result.ok).toBe(true);
    // No username lookup happened at all.
    expect(state.lastRpcName).toBeNull();
    expect(state.lastIlikePattern).toBeNull();
  });

  it('resolves the username through the index-backed function, as typed', async () => {
    await authService.loginWithIdentifier('Aziz', 'hunter2');
    expect(state.lastRpcName).toBe('Aziz');
    expect(state.lastIlikePattern).toBeNull();
  });

  it('never consults the username Bloom filter, so a missing account takes as long to refuse', async () => {
    filter.check.mockReturnValue('definitely-free');
    await authService.loginWithIdentifier('nobody', 'hunter2');
    expect(filter.check).not.toHaveBeenCalled();
    expect(state.lastRpcName).toBe('nobody');
  });

  it('refuses an ambiguous username instead of picking a row', async () => {
    // What a "Bob" / "bob" pair looks like before the unique index exists.
    state.profiles = [{ id: 'user-1' }, { id: 'user-2' }];
    state.emails['user-1'] = 'bob@example.com';
    state.passwords['bob@example.com'] = 'hunter2';

    const result = await authService.loginWithIdentifier('bob', 'hunter2');

    expect(result).toEqual({ ok: false, reason: 'invalid' });
    // Critically: it must not fall through to a password grant for either row.
    expect(state.signInCalls).toEqual([]);
  });

  it('never looks up a name the format CHECK would refuse, so % cannot reach the LIKE', async () => {
    const result = await authService.loginWithIdentifier('%', 'hunter2');

    expect(result).toEqual({ ok: false, reason: 'invalid' });
    expect(state.lastRpcName).toBeNull();
    expect(state.lastIlikePattern).toBeNull();
    expect(state.signInCalls).toEqual([]);
  });

  it('escapes the legal _ so a_b cannot match axb, while the function is missing', async () => {
    state.rpcMissing = true;
    await authService.loginWithIdentifier('a_b', 'hunter2');
    expect(state.lastIlikePattern).toBe('a\\_b');
  });

  it('still resolves a reserved name — an existing holder is grandfathered', async () => {
    state.profiles = [{ id: 'user-1' }];
    state.emails['user-1'] = 'old@example.com';
    state.passwords['old@example.com'] = 'hunter2';

    const result = await authService.loginWithIdentifier('support', 'hunter2');

    expect(result.ok).toBe(true);
  });

  it('returns the same generic failure for an unknown username as a wrong password', async () => {
    const unknown = await authService.loginWithIdentifier('nobody', 'hunter2');

    state.profiles = [{ id: 'user-1' }];
    state.emails['user-1'] = 'aziz@example.com';
    state.passwords['aziz@example.com'] = 'correct-password';
    const wrongPassword = await authService.loginWithIdentifier('aziz', 'guess');

    expect(unknown).toEqual({ ok: false, reason: 'invalid' });
    expect(wrongPassword).toEqual(unknown);
  });

  it('reports unavailable (not invalid) when the anon key is missing', async () => {
    state.anonAvailable = false;

    const result = await authService.loginWithIdentifier('aziz@example.com', 'hunter2');

    expect(result).toEqual({ ok: false, reason: 'unavailable' });
  });

  it('does not sign in when the profile has no matching auth user', async () => {
    state.profiles = [{ id: 'orphan' }]; // profile row with no auth.users row

    const result = await authService.loginWithIdentifier('orphan', 'hunter2');

    expect(result).toEqual({ ok: false, reason: 'invalid' });
    expect(state.signInCalls).toEqual([]);
  });
});
