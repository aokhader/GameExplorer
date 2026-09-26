// Security audit v2, Wave 3 — the REST half of the validation layer.
//
//   WS5-08  Express 4 does not await async handlers. A non-UUID `targetUserId`
//           or a non-numeric `:id` made Prisma throw inside one, so no response
//           was ever sent and the request hung until the client gave up.
//   WS5-09  An object sent as `targetUserId` reached a Prisma `where` whole, and
//           Prisma reads an object in a scalar position as a filter operator:
//           `{"contains": "a1b2"}` ran as a substring search over user ids.
//   WS5-31  `POST /api/games/invite` was unused, unvalidated, and stored every
//           inviter as "Player" rated 1200. Removed.
//   WS5-08, the other half. Validation stops *input* from making a handler
//           throw, but a database error still could, and the request still
//           hung. Every controller is now mounted through asyncHandler.
//   WS5-23  errorHandler sent `err.message` in production, in a shape the
//           clients rendered as "[object Object]", and answered a bad JSON
//           body with a 500.
//
// The routers are mounted on a bare Express app with the database, Supabase,
// Redis and the token verifier all faked, and requests go over real HTTP.
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import express from 'express';
import type { Server } from 'http';
import type { AddressInfo } from 'net';

const mocks = vi.hoisted(() => ({
  findFirst:  vi.fn(),
  count:      vi.fn(),
  create:     vi.fn(),
  update:     vi.fn(),
  deleteMany: vi.fn(),
  block:      vi.fn(),
  unblock:    vi.fn(),
  report:     vi.fn(),
}));

vi.mock('../../config/database', () => ({
  prisma: {
    friendship: {
      findFirst: mocks.findFirst, count: mocks.count, create: mocks.create,
      update: mocks.update, deleteMany: mocks.deleteMany, findMany: vi.fn(async () => []),
    },
  },
}));
vi.mock('../../services/block.service', () => ({
  blockService: {
    isBlockedBetween: vi.fn(async () => false),
    countBlocked:     vi.fn(async () => 0),
    listBlocked:      vi.fn(async () => []),
    block:            mocks.block,
    unblock:          mocks.unblock,
    report:           mocks.report,
  },
}));
vi.mock('../../services/account.service', () => ({ accountService: { deleteAccount: vi.fn() } }));
vi.mock('../../websocket', () => ({ getIO: () => ({ to: () => ({ emit: () => {} }) }) }));
vi.mock('../../config/redis', async () => {
  const { createRedisFakeModule } = await import('../helpers/redis-fake');
  return createRedisFakeModule();
});
vi.mock('../../config/supabase', async () => {
  const { createSupabaseFakeModule } = await import('../helpers/supabase-fake');
  return createSupabaseFakeModule();
});
vi.mock('../../utils/verifyToken', () => ({
  verifySupabaseToken: async (token: string) => {
    if (!token.startsWith('valid:')) throw new Error('invalid token');
    return { sub: token.slice('valid:'.length) };
  },
}));
// The limiters are covered elsewhere; here they would only make the request
// count part of the test.
// auth.routes is imported only to check that its handlers are wrapped.
vi.mock('../../services/username.service', () => ({ usernameService: {} }));
vi.mock('../../services/auth.service', () => ({ authService: {} }));
vi.mock('../../middleware/rateLimiter', () => {
  const pass = (_req: unknown, _res: unknown, next: () => void) => next();
  return { strictLimiter: pass, apiLimiter: pass, authLimiter: pass, usernameCheckLimiter: pass };
});

import userRoutes from '../../routes/user.routes';
import gameRoutes from '../../routes/game.routes';
import authRoutes from '../../routes/auth.routes';
import { errorHandler } from '../../middleware/errorHandler';
import { isAsyncHandled } from '../../middleware/asyncHandler';
import type { Router } from 'express';

const ME    = '11111111-1111-4111-8111-111111111111';
const THEM  = '22222222-2222-4222-8222-222222222222';
const GAME  = '33333333-3333-4333-8333-333333333333';

let server: Server;
let base: string;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use('/users', userRoutes);
  app.use('/games', gameRoutes);
  app.use(errorHandler);
  server = app.listen(0);
  await new Promise<void>(r => server.once('listening', () => r()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>(r => server.close(() => r()));
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findFirst.mockResolvedValue(null);
  mocks.count.mockResolvedValue(0);
  mocks.create.mockResolvedValue({ id: 1, status: 'pending' });
  mocks.update.mockResolvedValue({ id: 5, status: 'accepted' });
  mocks.deleteMany.mockResolvedValue({ count: 1 });
});

/** Every call is bounded: before the fix, the malformed ones never answered. */
async function call(method: string, path: string, body?: unknown) {
  const res = await fetch(base + path, {
    method,
    headers: { authorization: `Bearer valid:${ME}`, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(3000),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

const prismaCalls = () =>
  mocks.findFirst.mock.calls.length + mocks.count.mock.calls.length + mocks.create.mock.calls.length
  + mocks.update.mock.calls.length + mocks.deleteMany.mock.calls.length;

describe('WS5-08/09 · malformed input is a 400, and never reaches Prisma', () => {
  it.each([
    ['a non-UUID string',          { targetUserId: 'x' }],
    ['a number',                   { targetUserId: 123 }],
    ['a Prisma filter operator',   { targetUserId: { contains: 'a1b2' } }],
    ['a missing field',            {}],
  ])('POST /users/friends/request with %s', async (_label, body) => {
    const r = await call('POST', '/users/friends/request', body);
    expect(r.status).toBe(400);
    expect(prismaCalls()).toBe(0);
  });

  it.each([
    ['PUT',    '/users/friends/abc/respond', { action: 'accept' }],
    ['PUT',    '/users/friends/0/respond',   { action: 'accept' }],
    ['PUT',    '/users/friends/1.5/respond', { action: 'accept' }],
    ['PUT',    '/users/friends/5/respond',   { action: 'maybe' }],
    ['DELETE', '/users/friends/abc',         undefined],
    ['DELETE', '/users/friends/-3',          undefined],
  ])('%s %s', async (method, path, body) => {
    const r = await call(method, path, body);
    expect(r.status).toBe(400);
    expect(prismaCalls()).toBe(0);
  });

  it.each([
    ['POST',   '/users/blocks',              { targetUserId: 'nope' }],
    ['POST',   '/users/blocks',              { targetUserId: THEM, targetUsername: 'n'.repeat(65) }],
    ['DELETE', '/users/blocks/not-a-uuid',   undefined],
    ['POST',   '/users/reports',             { targetUserId: THEM, reason: 'bogus' }],
    ['POST',   '/users/reports',             { targetUserId: THEM, reason: 'spam', gameId: 'junk' }],
    ['POST',   '/users/reports',             { targetUserId: { $ne: null }, reason: 'spam' }],
    ['GET',    '/games/not-a-uuid',          undefined],
  ])('%s %s %j', async (method, path, body) => {
    const r = await call(method, path, body);
    expect(r.status).toBe(400);
    expect(mocks.block).not.toHaveBeenCalled();
    expect(mocks.unblock).not.toHaveBeenCalled();
    expect(mocks.report).not.toHaveBeenCalled();
  });
});

describe('the requests the clients really send still work', () => {
  it('a friend request, a response and a removal', async () => {
    expect((await call('POST', '/users/friends/request', { targetUserId: THEM })).status).toBe(200);
    expect(mocks.create).toHaveBeenCalledWith({ data: { userId: ME, friendId: THEM, status: 'pending' } });

    mocks.findFirst.mockResolvedValue({ id: 5, userId: THEM, friendId: ME, status: 'pending' });
    expect((await call('PUT', '/users/friends/5/respond', { action: 'accept' })).status).toBe(200);
    // The path's "5" arrives as a number, which is what the Int column needs.
    expect(mocks.update).toHaveBeenCalledWith({ where: { id: 5 }, data: { status: 'accepted' } });

    expect((await call('DELETE', '/users/friends/5')).status).toBe(200);
    expect(mocks.deleteMany.mock.calls[0][0].where.id).toBe(5);
  });

  it('block and report exactly as web and mobile send them, nulls included', async () => {
    // OpponentMenu (web) sends gameId: null when there is none.
    expect((await call('POST', '/users/blocks', { targetUserId: THEM, targetUsername: 'Rival' })).status).toBe(200);
    expect(mocks.block).toHaveBeenCalledWith(ME, THEM, 'Rival');

    const r = await call('POST', '/users/reports', {
      targetUserId: THEM, reason: 'harassment', context: 'c'.repeat(1500), gameId: null,
    });
    expect(r.status).toBe(200);
    // Over-long context is trimmed to the stored 1000, as before, not refused.
    expect(mocks.report).toHaveBeenCalledWith({
      reporterId: ME, reportedId: THEM, reason: 'harassment', context: 'c'.repeat(1000), gameId: undefined,
    });

    await call('POST', '/users/reports', { targetUserId: THEM, reason: 'spam', gameId: GAME, extra: { nested: true } });
    expect(mocks.report).toHaveBeenLastCalledWith(expect.objectContaining({ gameId: GAME }));

    expect((await call('DELETE', `/users/blocks/${THEM}`)).status).toBe(200);
    expect(mocks.unblock).toHaveBeenCalledWith(ME, THEM);
  });

  it('a well-formed game id that does not exist is still a 404', async () => {
    expect((await call('GET', `/games/${GAME}`)).status).toBe(404);
  });
});

describe('WS5-31 · the unused invite route is gone', () => {
  it('POST /games/invite no longer exists', async () => {
    const r = await call('POST', '/games/invite', { gameType: 'chess', timeControl: 'x' });
    expect(r.status).toBe(404);
  });
});

describe('WS5-08/23 · a failing controller answers at once, and says nothing it shouldn\'t', () => {
  it('a database error is a 500 with a generic message, not a hung request', async () => {
    // Before asyncHandler this never answered: call() would hit its 3 s abort.
    mocks.findFirst.mockRejectedValue(new Error('column friendships.secret_detail does not exist'));
    const r = await call('POST', '/users/friends/request', { targetUserId: THEM });
    expect(r.status).toBe(500);
    // A string, because apiFetch reads `error` as one; the old object showed
    // up in the app as "[object Object]".
    expect(r.body).toEqual({ error: 'Internal server error' });
  });

  it('a body the JSON parser rejects is the client\'s 400, not a 500', async () => {
    const res = await fetch(base + '/users/friends/request', {
      method: 'POST',
      headers: { authorization: `Bearer valid:${ME}`, 'content-type': 'application/json' },
      body: '{"targetUserId": ',
      signal: AbortSignal.timeout(3000),
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Invalid request' });
  });

  it('every controller route is mounted through asyncHandler', () => {
    type Layer = { route?: { path: string; methods: Record<string, boolean>; stack: { handle: unknown }[] } };
    const unwrapped: string[] = [];
    for (const [name, router] of [['auth', authRoutes], ['games', gameRoutes], ['users', userRoutes]] as const) {
      for (const layer of (router as unknown as Router).stack as unknown as Layer[]) {
        if (!layer.route) continue;
        const handlers = layer.route.stack.map(l => l.handle);
        // The last handler is the controller; everything before it is middleware.
        if (!isAsyncHandled(handlers[handlers.length - 1])) {
          unwrapped.push(`${Object.keys(layer.route.methods)[0].toUpperCase()} /${name}${layer.route.path}`);
        }
      }
    }
    expect(unwrapped).toEqual([]);
  });
});
