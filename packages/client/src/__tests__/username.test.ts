import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiFetch = vi.hoisted(() => vi.fn());
vi.mock('../apiFetch', () => ({ apiFetch }));

/** What the fake Supabase client answers for getUser + the profiles read. */
const db = vi.hoisted(() => ({
  user: { id: 'user-1' } as { id: string } | null,
  authError: null as { message: string } | null,
  row: null as Record<string, unknown> | null,
  rowError: null as { message: string } | null,
  throws: false,
}));
vi.mock('@gameexplorer/db', () => ({
  supabase: {
    auth: {
      getUser: async () => {
        if (db.throws) throw new Error('network down');
        return { data: { user: db.user }, error: db.authError };
      },
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: db.row, error: db.rowError }),
        }),
      }),
    }),
  },
}));

import {
  canSubmitUsername,
  checkUsernameAvailability,
  claimUsername,
  getProfileState,
  usernameFieldState,
  type UsernameFieldStatus,
} from '../username';

const state = (status: UsernameFieldStatus) => ({ status, reason: null, hint: '' });

describe('canSubmitUsername', () => {
  it('allows available AND unknown — an API outage must never block sign-up', () => {
    expect(canSubmitUsername(state('available'))).toBe(true);
    expect(canSubmitUsername(state('unknown'))).toBe(true);
  });

  it('blocks everything else', () => {
    for (const status of ['empty', 'invalid', 'checking', 'unavailable'] as const) {
      expect(canSubmitUsername(state(status))).toBe(false);
    }
  });
});

describe('usernameFieldState', () => {
  it('is empty, with the rule as a hint, before anything is typed', () => {
    expect(usernameFieldState('  ', null)).toEqual({ status: 'empty', reason: null, hint: expect.any(String) });
  });

  it('keeps too-short a hint while typing, but still blocks', () => {
    const s = usernameFieldState('bo', null);
    expect(s).toMatchObject({ status: 'invalid', reason: 'too-short' });
    expect(s.error).toBeUndefined();
    expect(canSubmitUsername(s)).toBe(false);
  });

  it('shows a character or reserved error at once, before any server answer', () => {
    expect(usernameFieldState('bob smith', null)).toMatchObject({ status: 'invalid', reason: 'invalid-chars', error: expect.any(String) });
    expect(usernameFieldState('Admin', null)).toMatchObject({ status: 'invalid', reason: 'reserved', error: expect.any(String) });
  });

  it('trims what was typed before judging it', () => {
    expect(usernameFieldState('  bob  ', { username: 'bob', result: 'available' }).status).toBe('available');
  });

  it('is checking until there is an answer for exactly this name', () => {
    expect(usernameFieldState('bobby', null).status).toBe('checking');
  });

  it('ignores a stale answer for a different name, however it arrived', () => {
    // "bob" answered taken after the user had already typed on to "bobby".
    const s = usernameFieldState('bobby', { username: 'bob', result: 'taken' });
    expect(s.status).toBe('checking');
    expect(s.error).toBeUndefined();
  });

  it('shows the server’s refusal for the current name', () => {
    expect(usernameFieldState('bob', { username: 'bob', result: 'taken' })).toMatchObject({
      status: 'unavailable',
      reason: 'taken',
      error: 'That username is taken. Try another.',
    });
  });

  it('says nothing alarming when the server could not answer', () => {
    const s = usernameFieldState('bob', { username: 'bob', result: 'unknown' });
    expect(s.status).toBe('unknown');
    expect(s.error).toBeUndefined();
    expect(canSubmitUsername(s)).toBe(true);
  });

  it('treats the user’s own current name as available, in any case', () => {
    // The server would say "taken" — because it is, by them.
    expect(usernameFieldState('Bob1', null, { currentUsername: 'bob1' }).status).toBe('available');
  });
});

describe('checkUsernameAvailability', () => {
  beforeEach(() => {
    apiFetch.mockReset();
  });

  it('asks the API with the name encoded', async () => {
    apiFetch.mockResolvedValue({ available: true, reason: 'ok' });
    expect(await checkUsernameAvailability('b_b')).toBe('available');
    expect(apiFetch.mock.calls[0][0]).toBe('/auth/username-available?username=b_b');
  });

  it('passes the refusal reasons through', async () => {
    for (const reason of ['taken', 'reserved', 'invalid-format']) {
      apiFetch.mockResolvedValueOnce({ available: false, reason });
      expect(await checkUsernameAvailability('bob')).toBe(reason);
    }
  });

  it('maps a throw — outage, 429, abort — to unknown, never taken', async () => {
    apiFetch.mockRejectedValue(new Error('Too many username checks, please try again later'));
    expect(await checkUsernameAvailability('bob')).toBe('unknown');
  });

  it('maps a malformed answer to unknown', async () => {
    apiFetch.mockResolvedValue({ available: false, reason: 'nonsense' });
    expect(await checkUsernameAvailability('bob')).toBe('unknown');
    apiFetch.mockResolvedValue({ available: 'yes' });
    expect(await checkUsernameAvailability('bob')).toBe('unknown');
  });
});

describe('claimUsername', () => {
  beforeEach(() => {
    apiFetch.mockReset();
  });

  it('posts the name and reports success', async () => {
    apiFetch.mockResolvedValue({ claimed: true, reason: 'ok' });
    expect(await claimUsername('New_Name')).toEqual({ ok: true });
    expect(apiFetch).toHaveBeenCalledWith('/auth/username', {
      method: 'POST',
      body: JSON.stringify({ username: 'New_Name' }),
    });
  });

  it('treats already-chosen as done, not as a failure', async () => {
    apiFetch.mockResolvedValue({ claimed: false, reason: 'already-chosen' });
    expect(await claimUsername('New_Name')).toEqual({ ok: true });
  });

  it('returns the refusal reason', async () => {
    apiFetch.mockResolvedValue({ claimed: false, reason: 'taken' });
    expect(await claimUsername('New_Name')).toEqual({ ok: false, reason: 'taken' });
  });

  it('returns an error instead of throwing', async () => {
    apiFetch.mockRejectedValue(new Error('Choosing a username is temporarily unavailable'));
    expect(await claimUsername('New_Name')).toEqual({
      ok: false,
      reason: 'error',
      error: 'Choosing a username is temporarily unavailable',
    });
  });
});

describe('getProfileState', () => {
  beforeEach(() => {
    db.user = { id: 'user-1' };
    db.authError = null;
    db.row = null;
    db.rowError = null;
    db.throws = false;
  });

  it('is ok once the username has been chosen', async () => {
    db.row = { username: 'aziz', username_status: 'chosen' };
    expect(await getProfileState()).toEqual({ status: 'ok' });
  });

  it('needs a username when the trigger built or suffixed it, and pre-fills that name', async () => {
    db.row = { username: 'joseobrien', username_status: 'derived' };
    expect(await getProfileState()).toEqual({ status: 'needs-username', username: 'joseobrien' });

    db.row = { username: 'bob1', username_status: 'deduped' };
    expect(await getProfileState()).toEqual({ status: 'needs-username', username: 'bob1' });
  });

  it('needs a username when there is no profile row at all — the chooser recovers it', async () => {
    db.row = null;
    expect(await getProfileState()).toEqual({ status: 'needs-username', username: null });
  });

  it('is unknown — never needs-username — for every failure', async () => {
    db.throws = true;
    expect(await getProfileState()).toEqual({ status: 'unknown' });

    db.throws = false;
    db.rowError = { message: 'column "username_status" does not exist' };
    expect(await getProfileState()).toEqual({ status: 'unknown' });

    db.rowError = null;
    db.authError = { message: 'expired' };
    expect(await getProfileState()).toEqual({ status: 'unknown' });

    db.authError = null;
    db.user = null;
    expect(await getProfileState()).toEqual({ status: 'unknown' });
  });

  it('does not guess when a row has no status', async () => {
    db.row = { username: 'aziz' };
    expect(await getProfileState()).toEqual({ status: 'unknown' });
  });
});
