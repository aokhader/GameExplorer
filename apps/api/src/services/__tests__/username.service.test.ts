// Username availability + claim. Like auth.service.test.ts, most of what is
// pinned here is what the service REFUSES to do: query the database for a name
// it can already reject, send an unescaped pattern, report "available" when it
// could not actually look, or let a chosen name be claimed twice.
//
// The Supabase fake is hand-rolled on purpose. helpers/supabase-fake.ts has no
// `.ilike()` and four other suites depend on its exact shape.
import { describe, it, expect, beforeEach, vi } from 'vitest';

type Op = [string, ...unknown[]];
type Result = { data: unknown; error: { code?: string; message: string } | null };

const state = vi.hoisted(() => ({
  adminAvailable: true,
  /** Every query built, as the list of calls made on it. */
  queries: [] as Op[][],
  lookup: { data: [], error: null } as Result,
  current: { data: null, error: null } as Result,
  write: { data: [{ id: 'user-1' }], error: null } as Result,
  throwOnQuery: false,
}));

vi.mock('../../config/supabase', () => {
  function builder() {
    const ops: Op[] = [];
    state.queries.push(ops);
    const record =
      (name: string) =>
      (...args: unknown[]) => {
        ops.push([name, ...args]);
        return b;
      };
    const b: Record<string, unknown> = {
      select: record('select'),
      ilike: record('ilike'),
      limit: record('limit'),
      eq: record('eq'),
      neq: record('neq'),
      update: record('update'),
      insert: record('insert'),
      maybeSingle: record('maybeSingle'),
      then(resolve: (r: Result) => unknown, reject: (e: unknown) => unknown) {
        if (state.throwOnQuery) return Promise.reject(new Error('fetch failed')).then(resolve, reject);
        const names = ops.map(([name]) => name);
        const result =
          names.includes('update') || names.includes('insert')
            ? state.write
            : names.includes('maybeSingle')
              ? state.current
              : state.lookup;
        return Promise.resolve(result).then(resolve, reject);
      },
    };
    return b;
  }
  return {
    get supabaseAdmin() {
      return state.adminAvailable ? { from: () => builder() } : null;
    },
    supabaseAnon: null,
  };
});

import { usernameService, isProfaneUsername } from '../username.service';

const op = (query: Op[], name: string) => query.find(([n]) => n === name);

beforeEach(() => {
  state.adminAvailable = true;
  state.queries = [];
  state.lookup = { data: [], error: null };
  state.current = { data: { username_status: 'derived' }, error: null };
  state.write = { data: [{ id: 'user-1' }], error: null };
  state.throwOnQuery = false;
});

describe('usernameService.checkAvailability', () => {
  it('reports a free name as available', async () => {
    expect(await usernameService.checkAvailability('fresh_name')).toEqual({
      ok: true,
      available: true,
      reason: 'ok',
    });
  });

  it('reports an existing name, in any case, as taken', async () => {
    state.lookup = { data: [{ id: 'someone' }], error: null };
    expect(await usernameService.checkAvailability('BOB')).toEqual({
      ok: true,
      available: false,
      reason: 'taken',
    });
  });

  it('refuses a reserved name without touching the database', async () => {
    expect(await usernameService.checkAvailability('Admin')).toEqual({
      ok: true,
      available: false,
      reason: 'reserved',
    });
    expect(state.queries).toEqual([]);
  });

  it('refuses a profane name as reserved, without touching the database', async () => {
    expect(await usernameService.checkAvailability('f_u_c_k')).toMatchObject({ reason: 'reserved' });
    expect(state.queries).toEqual([]);
  });

  it('refuses b*b as invalid before it can become a pattern', async () => {
    expect(await usernameService.checkAvailability('b*b')).toEqual({
      ok: true,
      available: false,
      reason: 'invalid-format',
    });
    expect(state.queries).toEqual([]);
  });

  it('collapses every local format reason to invalid-format on the wire', async () => {
    for (const name of ['ab', 'a'.repeat(21), 'bob smith', 'abc\n']) {
      expect(await usernameService.checkAvailability(name)).toMatchObject({ reason: 'invalid-format' });
    }
    expect(state.queries).toEqual([]);
  });

  it('escapes the legal _ so b_b is looked up as exactly b\\_b, and bounds the match', async () => {
    const result = await usernameService.checkAvailability('b_b');

    expect(result).toMatchObject({ available: true });
    const [query] = state.queries;
    expect(op(query, 'ilike')).toEqual(['ilike', 'username', 'b\\_b']);
    expect(op(query, 'limit')).toEqual(['limit', 2]);
  });

  it('reports unavailable — never available — when the lookup errors', async () => {
    state.lookup = { data: null, error: { message: 'boom' } };
    expect(await usernameService.checkAvailability('fresh_name')).toEqual({
      ok: false,
      reason: 'unavailable',
    });
  });

  it('reports unavailable when the client throws', async () => {
    state.throwOnQuery = true;
    expect(await usernameService.checkAvailability('fresh_name')).toEqual({
      ok: false,
      reason: 'unavailable',
    });
  });

  it('reports unavailable when the secret key is not configured', async () => {
    state.adminAvailable = false;
    expect(await usernameService.checkAvailability('fresh_name')).toEqual({
      ok: false,
      reason: 'unavailable',
    });
  });
});

describe('usernameService.claim', () => {
  it('replaces a derived name and marks it chosen, only where it is not already chosen', async () => {
    expect(await usernameService.claim('user-1', 'New_Name')).toEqual({ ok: true, claimed: true });

    const write = state.queries.find((q) => op(q, 'update'));
    expect(write).toBeDefined();
    expect(op(write!, 'update')).toEqual(['update', { username: 'New_Name', username_status: 'chosen' }]);
    expect(op(write!, 'eq')).toEqual(['eq', 'id', 'user-1']);
    // The filter that makes claim-once atomic.
    expect(op(write!, 'neq')).toEqual(['neq', 'username_status', 'chosen']);
  });

  it('refuses a user whose name is already chosen, without writing', async () => {
    state.current = { data: { username_status: 'chosen' }, error: null };

    expect(await usernameService.claim('user-1', 'New_Name')).toEqual({
      ok: true,
      claimed: false,
      reason: 'already-chosen',
    });
    expect(state.queries.some((q) => op(q, 'update') || op(q, 'insert'))).toBe(false);
  });

  it('reports already-chosen when a concurrent claim won the row', async () => {
    state.write = { data: [], error: null };
    expect(await usernameService.claim('user-1', 'New_Name')).toMatchObject({
      claimed: false,
      reason: 'already-chosen',
    });
  });

  it('creates the profile for a user the trigger left without one', async () => {
    state.current = { data: null, error: null };

    expect(await usernameService.claim('user-1', 'New_Name')).toEqual({ ok: true, claimed: true });
    const write = state.queries.find((q) => op(q, 'insert'));
    expect(op(write!, 'insert')).toEqual([
      'insert',
      { id: 'user-1', username: 'New_Name', username_status: 'chosen' },
    ]);
  });

  it('maps the database refusing the name to the same reasons the check uses', async () => {
    state.write = {
      data: null,
      error: { code: '23505', message: 'duplicate key value violates unique constraint "profiles_username_lower_key"' },
    };
    expect(await usernameService.claim('user-1', 'New_Name')).toMatchObject({ reason: 'taken' });

    state.write = {
      data: null,
      error: { code: '23514', message: 'new row for relation "profiles" violates check constraint "profiles_username_reserved"' },
    };
    expect(await usernameService.claim('user-1', 'New_Name')).toMatchObject({ reason: 'reserved' });

    state.write = {
      data: null,
      error: { code: '23514', message: 'new row for relation "profiles" violates check constraint "profiles_username_format"' },
    };
    expect(await usernameService.claim('user-1', 'New_Name')).toMatchObject({ reason: 'invalid-format' });
  });

  it('treats a primary-key clash on the recovery insert as already chosen, not taken', async () => {
    state.current = { data: null, error: null };
    state.write = {
      data: null,
      error: { code: '23505', message: 'duplicate key value violates unique constraint "profiles_pkey"' },
    };
    expect(await usernameService.claim('user-1', 'New_Name')).toMatchObject({ reason: 'already-chosen' });
  });

  it('refuses reserved, profane and malformed names without touching the database', async () => {
    expect(await usernameService.claim('user-1', 'moderator')).toMatchObject({ reason: 'reserved' });
    expect(await usernameService.claim('user-1', 'sh1t')).toMatchObject({ reason: 'reserved' });
    expect(await usernameService.claim('user-1', 'a b')).toMatchObject({ reason: 'invalid-format' });
    expect(state.queries).toEqual([]);
  });

  it('reports unavailable for an unexpected database error or a missing key', async () => {
    state.write = { data: null, error: { code: '42703', message: 'column "username_status" does not exist' } };
    expect(await usernameService.claim('user-1', 'New_Name')).toEqual({ ok: false, reason: 'unavailable' });

    state.current = { data: null, error: { message: 'boom' } };
    expect(await usernameService.claim('user-1', 'New_Name')).toEqual({ ok: false, reason: 'unavailable' });

    state.adminAvailable = false;
    expect(await usernameService.claim('user-1', 'New_Name')).toEqual({ ok: false, reason: 'unavailable' });
  });
});

describe('isProfaneUsername', () => {
  it('catches plain, leet and underscore-split spellings', () => {
    expect(isProfaneUsername('fuckface')).toBe(true);
    expect(isProfaneUsername('b1tch')).toBe(true);
    expect(isProfaneUsername('s_h_i_t')).toBe(true);
  });

  it('passes ordinary names that merely contain the letters', () => {
    for (const name of ['Scunthorpe', 'assassin', 'cocktail', 'Cumberbatch', 'classicplayer', 'therapist']) {
      expect(isProfaneUsername(name)).toBe(false);
    }
  });
});
