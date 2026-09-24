// Security audit v2, Wave 1 — regression suite.
//
// Each test here is the inverted form of a proof-of-concept that PASSED against
// the vulnerable code. If one of these fails, the corresponding hole is open
// again. The findings:
//
//   GX-02  accept_draw had no participant and no status guard, so any signed-in
//          stranger could end someone else's RATED game as a draw. Game ids are
//          public — GET /api/games/live hands them to every signed-in user — so
//          a losing player could offer a draw and accept it from an alt account,
//          converting a loss into a draw at will.
//   GX-01  decline_draw had no checks at all. Because clearDrawOffer is a bare
//          HSET and HSET creates a missing key, it was also an unauthenticated
//          arbitrary-Redis-key write with no TTL: ~110 messages fill the 100 MB
//          colocated `noeviction` instance, after which every Redis-backed rate
//          limiter fails open.
//   GX-03  leave_spectate was the only non-async listener and destructured its
//          payload in the parameter list, so one 22-byte frame threw
//          synchronously out of socket.io's nextTick and exited the process.
//          Redis is colocated with persistence off, so that restart destroyed
//          every live game on the service.
//
// Safety: redis, supabase and the JWT verifier are all in-memory fakes (the same
// three mocks multiplayer.e2e.test.ts uses). No network, no .env read, no
// service-role key, nothing that can reach production.
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
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

vi.mock('../../utils/verifyToken', () => ({
  verifySupabaseToken: async (token: string) => {
    if (!token.startsWith('valid:')) throw new Error('invalid token');
    return { sub: token.slice('valid:'.length) };
  },
}));

import { initializeWebSocket, shutdownWebSocket } from '../../websocket';
import { gameSessionService } from '../../services/gameSession.service';
import { redis } from '../../config/redis';
import * as supabaseModule from '../../config/supabase';
import type { GameType } from '@gameexplorer/shared';

const supa = supabaseModule as unknown as {
  __tables: { user_ratings: Record<string, unknown>[]; games: Record<string, unknown>[] };
  __reset(): void;
};

const fakeRedis = redis as unknown as {
  flushall(): Promise<string>;
  hset(key: string, field: string, value: string): Promise<number>;
  keys(pattern: string): Promise<string[]>;
};

// Records synchronous throws out of socket.io listeners. In production these are
// caught by the handler index.ts installs (also part of Wave 1) — but the point
// of GX-03 is that no listener should be throwing in the first place, so this
// suite asserts the bucket stays empty.
const uncaught: unknown[] = [];
const rejections: unknown[] = [];
const onUncaught = (err: unknown) => { uncaught.push(err); };
const onRejection = (reason: unknown) => { rejections.push(reason); };

let httpServer: HTTPServer;
let port: number;
const clients: ClientSocket[] = [];

beforeAll(async () => {
  process.on('uncaughtException', onUncaught);
  process.on('unhandledRejection', onRejection);
  httpServer = createServer();
  initializeWebSocket(httpServer);
  await new Promise<void>(resolve => httpServer.listen(0, resolve));
  port = (httpServer.address() as AddressInfo).port;
});

afterAll(async () => {
  await shutdownWebSocket();
  process.off('uncaughtException', onUncaught);
  process.off('unhandledRejection', onRejection);
});

beforeEach(async () => {
  await fakeRedis.flushall();
  supa.__reset();
  uncaught.length = 0;
  rejections.length = 0;
});

afterEach(() => {
  for (const c of clients) c.disconnect();
  clients.length = 0;
});

function client(userId: string): ClientSocket {
  const s = ioc(`http://127.0.0.1:${port}`, {
    auth: { token: `valid:${userId}` },
    transports: ['websocket'],
    reconnection: false,
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

function expectNoEvent(socket: ClientSocket, event: string, ms: number): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    socket.once(event, () => { clearTimeout(t); reject(new Error(`unexpected "${event}"`)); });
  });
}

/**
 * The two seed ratings are unequal on purpose: an equal pair draws for ±0, which
 * would hide a stolen rating rather than expose it.
 */
async function startRatedGame(
  aId: string,
  bId: string,
  opts: { whiteRating?: number; blackRating?: number; gameType?: GameType } = {},
) {
  const { whiteRating = 1000, blackRating = 1400, gameType = 'chess' } = opts;
  const a = client(aId);
  const b = client(bId);
  await Promise.all([connected(a), connected(b)]);

  const gameId = await gameSessionService.createGame(
    aId, bId, `name-${aId}`, `name-${bId}`, whiteRating, blackRating, gameType, 'blitz', true,
  );

  const pa = once(a, 'game_started');
  const pb = once(b, 'game_started');
  a.emit('join_game', { gameId });
  b.emit('join_game', { gameId });
  await Promise.all([pa, pb]);

  return { a, b, gameId };
}

// ─────────────────────────────────────────────────────────────────────────────

describe('GX-02 · accept_draw authorization', () => {
  it('an outsider cannot end a rated game as a draw, and the pending offer survives', async () => {
    const { a, b, gameId } = await startRatedGame('drw-white', 'drw-black');

    // The attacker's second account: not a participant, never joined the room,
    // and needs nothing but the game id.
    const attacker = client('drw-alt');
    await connected(attacker);

    const offered = once(b, 'draw_offered');
    a.emit('offer_draw', { gameId });
    await offered;

    attacker.emit('accept_draw', { gameId });

    // Nothing happens, and — importantly — nothing is written. An outsider must
    // not be able to end the game OR to silently consume the offer.
    await expectNoEvent(b, 'game_ended', 1500);
    expect(supa.__tables.games).toHaveLength(0);
    expect(supa.__tables.user_ratings).toHaveLength(0);

    // The real opponent's acceptance still works afterwards.
    const ended = once<any>(b, 'game_ended');
    b.emit('accept_draw', { gameId });
    expect((await ended).result).toBe('draw');
  });

  it('a player cannot accept their own offer', async () => {
    const { a, b, gameId } = await startRatedGame('self-white', 'self-black');

    const offered = once(b, 'draw_offered');
    a.emit('offer_draw', { gameId });
    await offered;

    a.emit('accept_draw', { gameId });
    await expectNoEvent(b, 'game_ended', 1200);
    expect(supa.__tables.games).toHaveLength(0);
  });

  it('accept_draw is refused on a game that is no longer active', async () => {
    // Constructed state: in production endGame marks the session ended and then
    // deletes the hash, and abortGame does the same without taking the endlock —
    // that second path is the genuinely reachable one.
    const { b, gameId } = await startRatedGame('end-white', 'end-black');

    await fakeRedis.hset(`game:${gameId}`, 'drawOfferedBy', 'end-white');
    await fakeRedis.hset(`game:${gameId}`, 'status', 'ended');

    b.emit('accept_draw', { gameId });

    await expectNoEvent(b, 'game_ended', 1500);
    expect(supa.__tables.games).toHaveLength(0);
  });

  it('the legitimate flow still works — the opponent may accept', async () => {
    const { a, b, gameId } = await startRatedGame('ok-white', 'ok-black');

    const offered = once(b, 'draw_offered');
    a.emit('offer_draw', { gameId });
    await offered;

    const endedA = once<any>(a, 'game_ended');
    b.emit('accept_draw', { gameId });

    const ev = await endedA;
    expect(ev.result).toBe('draw');
    expect(ev.reason).toBe('draw_agreement');
    // 1000 drawing a 1400 is a real rating move, which is what made the forgery
    // worth doing in the first place.
    expect(ev.white.ratingDelta).toBeGreaterThan(0);
    expect(ev.black.ratingDelta).toBeLessThan(0);
  });
});

describe('GX-01 · decline_draw authorization and the Redis write primitive', () => {
  it('an outsider cannot clear a pending offer or inject draw_declined', async () => {
    const { a, b, gameId } = await startRatedGame('dec-white', 'dec-black');
    const attacker = client('dec-outsider');
    await connected(attacker);

    const offered = once(b, 'draw_offered');
    a.emit('offer_draw', { gameId });
    await offered;

    attacker.emit('decline_draw', { gameId });

    // The offerer sees nothing — note socket.to(room) does NOT require the
    // sender to be a room member, so this was previously an injection into a
    // room the attacker had never joined.
    await expectNoEvent(a, 'draw_declined', 1200);

    // And the offer is intact, so the real opponent can still answer it.
    const ended = once<any>(b, 'game_ended');
    b.emit('accept_draw', { gameId });
    expect((await ended).result).toBe('draw');
  });

  it('decline_draw on arbitrary game ids creates no Redis keys', async () => {
    const s = client('junk-1');
    await connected(s);

    const before = (await fakeRedis.keys('game:*')).length;
    for (let i = 0; i < 200; i++) s.emit('decline_draw', { gameId: `junk-${i}` });
    await new Promise(r => setTimeout(r, 1500));
    const after = (await fakeRedis.keys('game:*')).length;

    // The session lookup now returns null for a non-existent id, so the bare
    // HSET in clearDrawOffer is never reached and no key is created.
    expect(after - before).toBe(0);
  });

  it('the legitimate decline still reaches the offerer and clears the offer', async () => {
    const { a, b, gameId } = await startRatedGame('okdec-white', 'okdec-black');

    const offered = once(b, 'draw_offered');
    a.emit('offer_draw', { gameId });
    await offered;

    const declined = once(a, 'draw_declined');
    b.emit('decline_draw', { gameId });
    await declined;

    // Offer consumed: a second acceptance by the decliner is a no-op.
    b.emit('accept_draw', { gameId });
    await expectNoEvent(a, 'game_ended', 1200);
  });
});

describe('GX-03 · malformed socket payloads never throw out of a listener', () => {
  it('leave_spectate with a missing or null payload is ignored', async () => {
    const s = client('crash-1');
    await connected(s);

    s.emit('leave_spectate');                      // one packet: 42["leave_spectate"]
    s.emit('leave_spectate', null as any);
    s.emit('leave_spectate', {} as any);
    s.emit('leave_spectate', { gameId: 42 } as any);
    s.emit('leave_spectate', { gameId: '' } as any);

    await new Promise(r => setTimeout(r, 800));
    expect(uncaught, `fatal throw: ${String(uncaught[0])}`).toHaveLength(0);
  });

  it('the whole socket surface survives malformed payloads and keeps serving', async () => {
    const s = client('crash-2');
    await connected(s);

    s.emit('make_move');
    s.emit('join_game');
    s.emit('resign', null as any);
    s.emit('abort_game', undefined as any);
    s.emit('offer_draw');
    s.emit('accept_draw');
    s.emit('decline_draw');
    s.emit('spectate', { gameId: { nested: true } } as any);
    s.emit('spectate', { gameId: ['a', 'b'] } as any);
    s.emit('send_chat', { gameId: 'nope', text: 12345 } as any);
    s.emit('send_emote', { gameId: 'nope', emote: '<script>' } as any);
    s.emit('join_queue');
    s.emit('join_queue', { gameType: 42, timeControl: null, rated: 'yes' } as any);
    s.emit('leave_queue');
    s.emit('create_invite_link');
    s.emit('accept_invite');
    s.emit('accept_invite', { inviteId: { $ne: null } } as any);

    await new Promise(r => setTimeout(r, 1500));
    expect(uncaught, `fatal throw: ${String(uncaught[0])}`).toHaveLength(0);

    // Rejections out of the async handlers are the (survivable) status quo and
    // are Wave 3's job — the zod layer. Recorded, not asserted.
    // eslint-disable-next-line no-console
    console.log(`[Wave 1] survivable rejections from malformed payloads: ${rejections.length}`);

    const err = once<any>(s, 'error');
    s.emit('spectate', { gameId: 'does-not-exist' });
    expect((await err).code).toBe('GAME_NOT_FOUND');
  });

  it('a real leave_spectate still leaves both rooms', async () => {
    const { gameId } = await startRatedGame('spec-white', 'spec-black');

    const spectator = client('spec-viewer');
    await connected(spectator);
    const started = once(spectator, 'game_started');
    spectator.emit('spectate', { gameId });
    await started;

    spectator.emit('leave_spectate', { gameId });
    await new Promise(r => setTimeout(r, 300));

    // Having left, the spectator no longer receives the room's broadcasts.
    const silent = expectNoEvent(spectator, 'draw_offered', 1000);
    const a = clients.find(c => c.connected && c !== spectator)!;
    a.emit('offer_draw', { gameId });
    await silent;
  });
});
