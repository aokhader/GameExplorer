// Security audit v2, Wave 6 — sessions and account deletion.
//
//   GX-16  A token was checked once, at the socket handshake, and never again: a
//          socket stayed trusted past its token's expiry, past a sign-out and
//          past the account being deleted. REST tokens kept working for up to an
//          hour after a deletion.
//   GX-19  Any valid token could delete the account (the type-to-confirm box is
//          the app's own), and deleting it left the account queued and in its
//          game. When that game ended the server wrote a rating and a game
//          record for an account that no longer existed (WS4-15).
//
// Tokens here are fakes: `valid:<userId>`, optionally followed by `|exp=<unix
// seconds>` and `|amr=<unix seconds>` for the claims the code reads. Safety: the
// same in-memory Redis and Supabase fakes as the other suites; nothing here can
// reach production.
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import express from 'express';
import { createServer, type Server as HTTPServer } from 'http';
import type { AddressInfo } from 'net';
import { io as ioc, type Socket as ClientSocket } from 'socket.io-client';

vi.mock('../../config/redis', async () => {
  const { createRedisFakeModule } = await import('../helpers/redis-fake');
  return createRedisFakeModule();
});
vi.mock('../../config/supabase', async () => {
  const { createSupabaseFakeModule } = await import('../helpers/supabase-fake');
  return createSupabaseFakeModule();
});
vi.mock('../../config/database', () => ({
  prisma: { friendship: { findMany: vi.fn(async () => []), deleteMany: vi.fn(async () => ({ count: 0 })) } },
}));
vi.mock('../../middleware/rateLimiter', () => {
  const pass = (_req: unknown, _res: unknown, next: () => void) => next();
  return { strictLimiter: pass, apiLimiter: pass, authLimiter: pass, usernameCheckLimiter: pass };
});
vi.mock('../../utils/verifyToken', () => ({
  verifySupabaseToken: async (token: string) => {
    const [head, ...claims] = token.split('|');
    if (!head.startsWith('valid:')) throw new Error('invalid token');
    const payload: Record<string, unknown> = { sub: head.slice('valid:'.length) };
    for (const claim of claims) {
      const [key, value] = claim.split('=');
      if (key === 'exp') payload.exp = Number(value);
      if (key === 'amr') payload.amr = [{ method: 'password', timestamp: Number(value) }];
    }
    // As jose does: an expired token does not verify.
    if (typeof payload.exp === 'number' && payload.exp * 1000 <= Date.now()) throw new Error('"exp" claim timestamp check failed');
    return payload;
  },
}));

import userRoutes from '../../routes/user.routes';
import { errorHandler } from '../../middleware/errorHandler';
import { signedInAt } from '../../middleware/auth';
import { initializeWebSocket, shutdownWebSocket } from '../../websocket';
import { resetSocketLimitState } from '../../websocket/limits';
import { SESSION_TIMING } from '../../websocket/handlers/session.handler';
import { revocationService, resetRevocations } from '../../services/revocation.service';
import { gameSessionService } from '../../services/gameSession.service';
import { matchmakingService } from '../../services/matchmaking.service';
import { inviteService } from '../../services/invite.service';
import { redis } from '../../config/redis';
import * as supabaseModule from '../../config/supabase';
import { REAUTH_REQUIRED } from '@gameexplorer/shared';

const fakeRedis = redis as unknown as { flushall(): Promise<string> };
const fakeSupabase = supabaseModule as unknown as {
  __tables: Record<string, Array<Record<string, unknown>>>;
  __ops: string[];
  __failDeleteOn(table: string): void;
  __reset(): void;
};

let httpServer: HTTPServer;
let base: string;
const clients: ClientSocket[] = [];
const savedRecheck = SESSION_TIMING.idleRecheckMs;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use('/users', userRoutes);
  app.use(errorHandler);
  httpServer = createServer(app);
  initializeWebSocket(httpServer);
  await new Promise<void>(resolve => httpServer.listen(0, resolve));
  base = `http://127.0.0.1:${(httpServer.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await shutdownWebSocket();
  await new Promise<void>(r => httpServer.close(() => r()));
});

beforeEach(async () => {
  await fakeRedis.flushall();
  fakeSupabase.__reset();
  resetSocketLimitState();
  resetRevocations();
  SESSION_TIMING.idleRecheckMs = 100;
});

afterEach(() => {
  SESSION_TIMING.idleRecheckMs = savedRecheck;
  for (const c of clients) c.disconnect();
  clients.length = 0;
});

const now = () => Math.floor(Date.now() / 1000);
const freshSignIn = (userId: string) => `valid:${userId}|amr=${now() - 30}`;
const oldSignIn = (userId: string) => `valid:${userId}|amr=${now() - 11 * 60}`;

function client(userId: string, opts: { token?: string | (() => string); reconnection?: boolean } = {}): ClientSocket {
  const token = opts.token ?? `valid:${userId}`;
  const s = ioc(base, {
    auth: typeof token === 'function' ? (cb) => cb({ token: token() }) : { token },
    transports: ['websocket'],
    reconnection: opts.reconnection ?? false,
    reconnectionDelay: 50,
    forceNew: true,
  });
  clients.push(s);
  return s;
}

function once<T = any>(socket: ClientSocket, event: string, timeoutMs = 8000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`Timed out waiting for "${event}"`)), timeoutMs);
    socket.once(event, (data: T) => { clearTimeout(t); resolve(data); });
  });
}

async function connected(socket: ClientSocket): Promise<void> {
  if (socket.connected) return;
  await once(socket, 'connect');
}

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

async function waitFor(check: () => boolean | Promise<boolean>, what: string, ms = 5000): Promise<void> {
  const until = Date.now() + ms;
  while (!(await check())) {
    if (Date.now() > until) throw new Error(`timed out waiting for ${what}`);
    await sleep(25);
  }
}

function errorsOf(socket: ClientSocket): Array<{ code: string; message: string }> {
  const got: Array<{ code: string; message: string }> = [];
  socket.on('error', (e) => got.push(e));
  return got;
}

/** Whether a fresh connection with this token is accepted. */
async function handshakeAccepted(token: string): Promise<boolean> {
  const s = ioc(base, { auth: { token }, transports: ['websocket'], reconnection: false, forceNew: true });
  clients.push(s);
  return new Promise<boolean>((resolve) => {
    s.once('connect', () => resolve(true));
    s.once('connect_error', () => resolve(false));
  });
}

function api(path: string, token: string, method = 'GET') {
  return fetch(`${base}${path}`, { method, headers: { Authorization: `Bearer ${token}` } });
}

async function startGame(aId: string, bId: string, tokens: { a?: string; b?: string } = {}) {
  const a = client(aId, { token: tokens.a });
  const b = client(bId, { token: tokens.b });
  await Promise.all([connected(a), connected(b)]);
  const gameId = await gameSessionService.createGame(aId, bId, `name-${aId}`, `name-${bId}`, 1200, 1200, 'chess', 'blitz', true);
  const pa = once(a, 'game_started');
  const pb = once(b, 'game_started');
  a.emit('join_game', { gameId });
  b.emit('join_game', { gameId });
  await Promise.all([pa, pb]);
  return { a, b, gameId };
}

// ─────────────────────────────────────────────────────────────────────────────

describe('GX-19 · deleting an account needs a recent sign-in', () => {
  it('refuses a session that signed in more than ten minutes ago, and deletes nothing', async () => {
    const res = await api('/users/me', oldSignIn('u-old'), 'DELETE');
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: REAUTH_REQUIRED });
    expect(fakeSupabase.__ops).toEqual([]);
    // The account is untouched and still usable.
    expect((await api('/users/friends', oldSignIn('u-old'))).status).toBe(200);
  });

  it('deletes after a fresh sign-in', async () => {
    const res = await api('/users/me', freshSignIn('u-fresh'), 'DELETE');
    expect(res.status).toBe(200);
    expect(fakeSupabase.__ops).toContain('auth.deleteUser');
  });

  it('reads the newest sign-in when the token lists several', () => {
    // A session that signed in with a password and later linked Google lists
    // both; the question is how recently anyone proved who they were.
    expect(signedInAt({ amr: [{ method: 'password', timestamp: 100 }, { method: 'oauth', timestamp: 900 }, { method: 'otp', timestamp: 500 }] })).toBe(900);
    expect(signedInAt({ amr: [{ method: 'password' }] })).toBeNull();
    expect(signedInAt({})).toBeNull();
  });

  it('does not lock out a token that names no sign-in time', async () => {
    // Supabase always sends one; refusing a token without it would leave that
    // user with no way to delete their account.
    const res = await api('/users/me', 'valid:u-noamr', 'DELETE');
    expect(res.status).toBe(200);
  });
});

describe('GX-16 · a deleted account is shut out at once', () => {
  it('refuses its tokens on REST and at the socket handshake', async () => {
    expect((await api('/users/me', freshSignIn('u-gone'), 'DELETE')).status).toBe(200);
    // The same token, and any other issued before the deletion.
    expect((await api('/users/friends', freshSignIn('u-gone'))).status).toBe(401);
    expect((await api('/users/friends', 'valid:u-gone')).status).toBe(401);
    expect(await handshakeAccepted('valid:u-gone')).toBe(false);
    // Nobody else is affected.
    expect((await api('/users/friends', 'valid:u-other')).status).toBe(200);
    expect(await handshakeAccepted('valid:u-other')).toBe(true);
  });

  it('lets the user back in when the deletion fails, so they can retry', async () => {
    fakeSupabase.__failDeleteOn('games');
    expect((await api('/users/me', freshSignIn('u-retry'), 'DELETE')).status).toBe(500);
    expect((await api('/users/friends', 'valid:u-retry')).status).toBe(200);
    expect(await handshakeAccepted('valid:u-retry')).toBe(true);
  });

  it('drops a socket event that races the deletion', async () => {
    const s = client('u-race');
    await connected(s);
    revocationService.revoke('u-race');
    const gone = once(s, 'disconnect');
    s.emit('join_queue', { gameType: 'chess', timeControl: 'blitz', rated: true });
    await gone;
    expect(await matchmakingService.getQueueMeta('u-race', 'chess')).toBeNull();
  });
});

describe('GX-19 · deleting an account ends its live game, queues and invites', () => {
  it('forfeits the game to the opponent, disconnects the account and leaves no record of it', async () => {
    const { a, b, gameId } = await startGame('white-del', 'black-stays');
    const ended = once<{ gameId: string; result: string; reason: string }>(b, 'game_ended');
    const kicked = once<string>(a, 'disconnect');

    expect((await api('/users/me', freshSignIn('white-del'), 'DELETE')).status).toBe(200);

    expect(await ended).toMatchObject({ gameId, result: 'black_wins', reason: 'disconnect' });
    // Disconnected by the server, so the client does not reconnect by itself.
    expect(await kicked).toBe('io server disconnect');
    expect(await gameSessionService.getLiveGameId('black-stays')).toBeNull();

    // WS4-15: the game's result was written before the deletion, so the
    // deleted account's rows went with it. The opponent keeps theirs.
    const t = fakeSupabase.__tables;
    expect(t.user_ratings.filter(r => r.user_id === 'white-del')).toEqual([]);
    expect(t.games.filter(r => r.user_id === 'white-del')).toEqual([]);
    expect(t.games.filter(r => r.user_id === 'black-stays')).toHaveLength(1);
  });

  it('takes the account out of every queue before its rows go', async () => {
    // No socket here, so nothing but the deletion itself can remove the entry.
    // A closing socket dequeues too, but only after the fact: the matchmaking
    // loop runs every half second and could pair the account in between.
    for (const gameType of ['chess', 'reversi'] as const) {
      await matchmakingService.addToQueue({
        userId: 'u-queued', username: 'queued', rating: 1200, gameType, timeControl: 'blitz', rated: true, joinedAt: Date.now(),
      });
    }

    expect((await api('/users/me', freshSignIn('u-queued'), 'DELETE')).status).toBe(200);
    expect(await matchmakingService.getQueueMeta('u-queued', 'chess')).toBeNull();
    expect(await matchmakingService.getQueueMeta('u-queued', 'reversi')).toBeNull();
  });

  it("treats the account's open invite as expired", async () => {
    const inviteId = await inviteService.createInvite('u-host', 'host', 1200, 'chess', 'blitz');
    expect((await api('/users/me', freshSignIn('u-host'), 'DELETE')).status).toBe(200);

    const guest = client('u-guest');
    await connected(guest);
    const errors = errorsOf(guest);
    guest.emit('accept_invite', { inviteId });
    await waitFor(() => errors.length > 0, 'a refusal');
    expect(errors[0].code).toBe('INVITE_EXPIRED');
    expect(await gameSessionService.getLiveGameId('u-guest')).toBeNull();
  });
});

describe('GX-16 · a socket is held to its token', () => {
  it('closes an idle socket when its token expires; a client with a fresh token is straight back', async () => {
    let issued = 0;
    // Each connection attempt asks for the current token, as socketStore does.
    const s = client('u-idle', { reconnection: true, token: () => `valid:u-idle|exp=${now() + (issued++ === 0 ? 1 : 3600)}` });
    await connected(s);
    const firstId = s.id;

    await once(s, 'disconnect', 4000);
    await once(s, 'connect', 4000);
    expect(s.id).not.toBe(firstId);
    expect(issued).toBe(2);
  });

  it('keeps a client holding only the old token out', async () => {
    const stale = `valid:u-stale|exp=${now() + 1}`;
    const s = client('u-stale', { reconnection: true, token: stale });
    await connected(s);
    const refused = once<Error>(s, 'connect_error', 5000);
    await once(s, 'disconnect', 4000);
    expect((await refused).message).toBe('Invalid or expired token');
  });

  it('a reauth moves the deadline on', async () => {
    const s = client('u-reauth', { token: `valid:u-reauth|exp=${now() + 1}` });
    await connected(s);
    s.emit('reauth', { token: `valid:u-reauth|exp=${now() + 3600}` });
    await sleep(2500);
    expect(s.connected).toBe(true);
  });

  it("refuses a reauth with someone else's token, or a bad one", async () => {
    const s = client('u-mine', { token: `valid:u-mine|exp=${now() + 1}` });
    await connected(s);
    const errors = errorsOf(s);
    s.emit('reauth', { token: `valid:u-theirs|exp=${now() + 3600}` });
    s.emit('reauth', { token: 'forged' });
    await waitFor(() => errors.length === 2, 'two refusals');
    expect(errors.map(e => e.code)).toEqual(['AUTH_REQUIRED', 'AUTH_REQUIRED']);
    await once(s, 'disconnect', 4000);
  });

  it('lets an expired socket finish its game but start nothing, then closes it', async () => {
    const { a, b, gameId } = await startGame('u-exp', 'u-opp', { a: `valid:u-exp|exp=${now() + 1}` });
    await sleep(1600);
    // Still in the game: not closed.
    expect(a.connected).toBe(true);

    const errors = errorsOf(a);
    a.emit('join_queue', { gameType: 'checkers', timeControl: 'blitz', rated: true });
    a.emit('create_invite_link', { gameType: 'chess', timeControl: 'blitz' });
    await waitFor(() => errors.length === 2, 'two refusals');
    expect(errors.map(e => e.code)).toEqual(['AUTH_REQUIRED', 'INVITE_EXPIRED']);
    expect(await matchmakingService.getQueueMeta('u-exp', 'checkers')).toBeNull();

    // Moves still count.
    const moved = once(b, 'move_made');
    a.emit('make_move', { gameId, move: { type: 'chess', from: 'e2', to: 'e4' } });
    await moved;

    const closed = once(a, 'disconnect', 4000);
    b.emit('resign', { gameId });
    expect(await closed).toBe('transport close');
  });
});
