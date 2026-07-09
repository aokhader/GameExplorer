import { describe, it, expect, vi } from 'vitest';
import { createSupabaseFakeModule } from '../../__tests__/helpers/supabase-fake';

// account.service reads `supabaseAdmin` and `prisma` as module-level bindings, so
// each scenario loads a fresh copy of the service (vi.resetModules + doMock +
// dynamic import) wired to a scenario-specific fake. This lets us also toggle a
// null admin, forced delete failures, and a "user not found" deleteUser result.
type Fake = ReturnType<typeof createSupabaseFakeModule>;

async function setup(opts: {
  adminNull?: boolean;
  failDeleteOn?: string;
  deleteUserError?: { status?: number; message: string } | null;
} = {}) {
  vi.resetModules();
  const fake = createSupabaseFakeModule();
  if (opts.failDeleteOn) fake.__failDeleteOn(opts.failDeleteOn);
  if (opts.deleteUserError !== undefined) fake.__setDeleteUserError(opts.deleteUserError);

  const deleteMany = vi.fn(async () => ({ count: 0 }));
  vi.doMock('../../config/supabase', () => ({
    supabaseAdmin: opts.adminNull ? null : fake.supabaseAdmin,
  }));
  vi.doMock('../../config/database', () => ({ prisma: { friendship: { deleteMany } } }));

  const { accountService } = await import('../account.service');
  return { accountService, fake, deleteMany };
}

/** Seed one row the user owns in each table so we can assert they're all gone. */
function seedUser(fake: Fake, userId: string) {
  fake.__tables.user_blocks.push({ blocker_id: userId, blocked_id: 'other' });
  fake.__tables.user_blocks.push({ blocker_id: 'other', blocked_id: userId });
  fake.__tables.user_reports.push({ reporter_id: userId, reported_id: 'other' });
  fake.__tables.user_reports.push({ reporter_id: 'other', reported_id: userId });
  fake.__tables.games.push({ user_id: userId, game_type: 'chess' });
  fake.__tables.user_ratings.push({ user_id: userId, game_type: 'chess' });
  fake.__tables.profiles.push({ id: userId, username: 'doomed' });
}

describe('accountService.deleteAccount', () => {
  it('deletes every owned row, calls deleteUser LAST, and returns ok', async () => {
    const { accountService, fake, deleteMany } = await setup();
    seedUser(fake, 'u1');
    // A row belonging to someone else must survive.
    fake.__tables.games.push({ user_id: 'other', game_type: 'reversi' });

    const res = await accountService.deleteAccount('u1');

    expect(res).toEqual({ ok: true });
    expect(deleteMany).toHaveBeenCalledOnce();
    // All of u1's rows gone; the stranger's row remains.
    expect(fake.__tables.user_blocks).toHaveLength(0);
    expect(fake.__tables.user_reports).toHaveLength(0);
    expect(fake.__tables.user_ratings).toHaveLength(0);
    expect(fake.__tables.profiles).toHaveLength(0);
    expect(fake.__tables.games).toEqual([{ user_id: 'other', game_type: 'reversi' }]);
    // Ordering: the auth user is deleted only after every table delete.
    expect(fake.__ops.at(-1)).toBe('auth.deleteUser');
    expect(fake.__ops.filter(o => o === 'auth.deleteUser')).toHaveLength(1);
    expect(fake.__ops.indexOf('delete:profiles')).toBeLessThan(fake.__ops.indexOf('auth.deleteUser'));
  });

  it('returns unavailable (no deletes) when the admin client is not configured', async () => {
    const { accountService, fake, deleteMany } = await setup({ adminNull: true });
    const res = await accountService.deleteAccount('u1');
    expect(res).toEqual({ ok: false, reason: 'unavailable' });
    expect(deleteMany).not.toHaveBeenCalled();
    expect(fake.__ops).toHaveLength(0);
  });

  it('aborts before deleteUser when a table delete errors', async () => {
    const { accountService, fake } = await setup({ failDeleteOn: 'games' });
    seedUser(fake, 'u1');

    const res = await accountService.deleteAccount('u1');

    expect(res).toEqual({ ok: false, reason: 'failed' });
    // The auth user is never touched, so the account stays recoverable/retriable.
    expect(fake.__ops).not.toContain('auth.deleteUser');
    // Rows deleted before the failing step are gone; games (which failed) untouched.
    expect(fake.__tables.user_blocks).toHaveLength(0);
    expect(fake.__tables.games).toHaveLength(1);
  });

  it('treats an already-deleted auth user (404) as success', async () => {
    const { accountService, fake } = await setup({
      deleteUserError: { status: 404, message: 'User not found' },
    });
    seedUser(fake, 'u1');

    const res = await accountService.deleteAccount('u1');

    expect(res).toEqual({ ok: true });
    expect(fake.__ops).toContain('auth.deleteUser');
  });
});
