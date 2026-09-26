// Security audit v2, Wave 3 — the gaps found while building the validation
// layer, and the audit items that had been left in no wave:
//
//   One game at a time. accept_invite never checked whether either player was
//          already in a game, so createGame overwrote that player's
//          `active_game:` pointer and orphaned the game they were in. Two
//          people accepting one link together could each start a game. Found
//          during Wave 3.
//   GX-07  A disconnect paused the disconnecting player's own clock, and a
//          reconnect restarted it. Dropping the socket on your own move bought
//          up to a minute of thinking time, as often as you liked; cycling 59 s
//          off and 1 s on held the opponent in a game that could not end.
//   WS5-10 No cap on sockets per account, and nothing throttled the handshake.
//   WS5-11 The three socket limiters were keyed per socket (more tabs, more
//          allowance) and failed open when Redis did.
//   WS5-12 Eleven of fifteen events had no limit at all.
//
// Safety: the same in-memory fakes as the other socket suites. Nothing here can
// reach production.
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
import { resetSocketLimitState, SOCKET_LIMITS } from '../../websocket/limits';
import { gameSessionService, AlreadyInGameError } from '../../services/gameSession.service';
import { matchmakingService } from '../../services/matchmaking.service';
import { clockService } from '../../services/clock.service';
import { redis } from '../../config/redis';
import type { ErrorCode } from '@gameexplorer/shared';

const fakeRedis = redis as unknown as {
  flushall(): Promise<string>;
  keys(pattern: string): Promise<string[]>;
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ...rest: unknown[]): Promise<string | null>;
  hgetall(key: string): Promise<Record<string, string>>;
};

let httpServer: HTTPServer;
let port: number;
const clients: ClientSocket[] = [];

beforeAll(async () => {
  httpServer = createServer();
  initializeWebSocket(httpServer);
  await new Promise<void>(resolve => httpServer.listen(0, resolve));
  port = (httpServer.address() as AddressInfo).port;
});

afterAll(async () => {
  await shutdownWebSocket();
});

beforeEach(async () => {
  await fakeRedis.flushall();
  resetSocketLimitState();
});

afterEach(() => {
  vi.restoreAllMocks();
  for (const c of clients) c.disconnect();
  clients.length = 0;
});

function client(userId: string, token = `valid:${userId}`): ClientSocket {
  const s = ioc(`http://127.0.0.1:${port}`, {
    auth: { token },
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

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

async function waitFor(check: () => boolean | Promise<boolean>, what: string, ms = 4000): Promise<void> {
  const until = Date.now() + ms;
  while (!(await check())) {
    if (Date.now() > until) throw new Error(`timed out waiting for ${what}`);
    await sleep(25);
  }
}

function errorsOf(socket: ClientSocket): Array<{ code: ErrorCode; message: string }> {
  const got: Array<{ code: ErrorCode; message: string }> = [];
  socket.on('error', (e) => got.push(e));
  return got;
}

async function startGame(aId: string, bId: string) {
  const a = client(aId);
  const b = client(bId);
  await Promise.all([connected(a), connected(b)]);
  const gameId = await gameSessionService.createGame(
    aId, bId, `name-${aId}`, `name-${bId}`, 1200, 1200, 'chess', 'blitz', true,
  );
  const pa = once(a, 'game_started');
  const pb = once(b, 'game_started');
  a.emit('join_game', { gameId });
  b.emit('join_game', { gameId });
  await Promise.all([pa, pb]);
  return { a, b, gameId };
}

async function createInvite(hostId: string): Promise<{ host: ClientSocket; inviteId: string }> {
  const host = client(hostId);
  await connected(host);
  const created = once<any>(host, 'invite_link_created');
  host.emit('create_invite_link', { gameType: 'reversi', timeControl: 'rapid' });
  return { host, inviteId: (await created).inviteId };
}

// ─────────────────────────────────────────────────────────────────────────────

describe('one game at a time', () => {
  it('accepting an invite mid-game is refused, and both the game and the invite survive', async () => {
    const { a, gameId } = await startGame('busy-a', 'busy-b');
    const { inviteId } = await createInvite('inv-host-1');

    const err = once<any>(a, 'error');
    a.emit('accept_invite', { inviteId });
    const e = await err;
    // INVITE_EXPIRED is the code the client's invite hook shows to the player.
    expect(e.code).toBe('INVITE_EXPIRED');
    expect(e.message).toMatch(/Finish your current game/);

    // Before: this pointer was overwritten and the first game orphaned.
    expect(await fakeRedis.get('active_game:busy-a')).toBe(gameId);
    expect((await gameSessionService.getGameSession(gameId))?.status).toBe('active');

    // The invite was not used up, so someone free can still take it.
    const guest = client('free-guest');
    await connected(guest);
    const started = once<any>(guest, 'game_started');
    guest.emit('accept_invite', { inviteId });
    expect((await started).gameType).toBe('reversi');
  });

  it('an invite from a player who has since started another game is refused, and kept', async () => {
    const { inviteId } = await createInvite('inv-host-2');
    const other = client('host-opponent');
    await connected(other);
    const hostGame = await gameSessionService.createGame(
      'inv-host-2', 'host-opponent', 'h', 'o', 1200, 1200, 'chess', 'blitz', true,
    );

    const guest = client('hopeful-guest');
    await connected(guest);
    const err = once<any>(guest, 'error');
    guest.emit('accept_invite', { inviteId });
    const e = await err;
    expect(e.code).toBe('INVITE_EXPIRED');
    expect(e.message).toMatch(/in another game/);

    expect(await fakeRedis.get('active_game:inv-host-2')).toBe(hostGame);
    expect(await fakeRedis.get('active_game:hopeful-guest')).toBeNull();
    expect(await fakeRedis.keys('invite:*')).toEqual([`invite:${inviteId}`]);
  });

  it('two people accepting one link at the same moment start exactly one game', async () => {
    const { inviteId } = await createInvite('inv-host-3');
    const g1 = client('race-1');
    const g2 = client('race-2');
    await Promise.all([connected(g1), connected(g2)]);

    const outcome = (s: ClientSocket) => new Promise<string>((resolve) => {
      s.once('game_started', () => resolve('started'));
      s.once('error', () => resolve('refused'));
    });
    const results = Promise.all([outcome(g1), outcome(g2)]);
    g1.emit('accept_invite', { inviteId });
    g2.emit('accept_invite', { inviteId });

    expect((await results).sort()).toEqual(['refused', 'started']);
    expect(await fakeRedis.keys('game:*')).toHaveLength(1);
  });

  it('createGame will not take a player who is already in a live game', async () => {
    const first = await gameSessionService.createGame('x-w', 'x-b', 'w', 'b', 1200, 1200, 'chess', 'blitz', true);
    const attempt = gameSessionService.createGame('y-w', 'x-b', 'w', 'b', 1200, 1200, 'chess', 'blitz', true);

    await expect(attempt).rejects.toBeInstanceOf(AlreadyInGameError);
    await expect(attempt).rejects.toMatchObject({ userId: 'x-b' });
    expect(await fakeRedis.get('active_game:x-b')).toBe(first);
    expect(await fakeRedis.get('active_game:y-w')).toBeNull();
    expect(await fakeRedis.keys('game:*')).toEqual([`game:${first}`]);
  });

  it('two games starting at the same moment cannot both take one player', async () => {
    // Both pass the "already in a game?" read together; the NX claim on the
    // shared player's pointer decides, and the loser undoes itself.
    const results = await Promise.allSettled([
      gameSessionService.createGame('p-w', 'shared', 'w', 's', 1200, 1200, 'chess', 'blitz', true),
      gameSessionService.createGame('r-w', 'shared', 'w', 's', 1200, 1200, 'chess', 'blitz', true),
    ]);
    const won = results.filter(r => r.status === 'fulfilled') as PromiseFulfilledResult<string>[];
    const lost = results.filter(r => r.status === 'rejected') as PromiseRejectedResult[];
    expect(won).toHaveLength(1);
    expect(lost[0].reason).toBeInstanceOf(AlreadyInGameError);

    expect(await fakeRedis.get('active_game:shared')).toBe(won[0].value);
    const loserWhite = results[0].status === 'rejected' ? 'p-w' : 'r-w';
    expect(await fakeRedis.get(`active_game:${loserWhite}`)).toBeNull();
    expect(await fakeRedis.keys('game:*')).toHaveLength(1);
    expect(await fakeRedis.keys('clock:*')).toHaveLength(1);
  });

  it('ending a game leaves alone a pointer that already names a newer one', async () => {
    const gameId = await gameSessionService.createGame('end-w', 'end-b', 'w', 'b', 1200, 1200, 'chess', 'blitz', false);
    await fakeRedis.set('active_game:end-w', 'a-newer-game');

    await gameSessionService.endGame(gameId, 'white_wins', 'resign');

    expect(await fakeRedis.get('active_game:end-w')).toBe('a-newer-game');
    expect(await fakeRedis.get('active_game:end-b')).toBeNull();
  });

  it('a queued player who starts a game by invite leaves the queue', async () => {
    const queued = client('q-then-invite');
    await connected(queued);
    const joined = once(queued, 'queue_joined');
    queued.emit('join_queue', { gameType: 'chess', timeControl: 'blitz', rated: false });
    await joined;

    const { inviteId } = await createInvite('inv-host-4');
    const started = once(queued, 'game_started');
    queued.emit('accept_invite', { inviteId });
    await started;

    expect(await matchmakingService.getQueueMeta('q-then-invite', 'chess')).toBeNull();
    expect(await fakeRedis.keys('matchmaking:*')).toEqual([]);
  });

  it('a queue entry left by a player now in a game cannot pull them into a second one', async () => {
    const gameId = await gameSessionService.createGame('busy', 'busy-opp', 'b', 'o', 1200, 1200, 'chess', 'blitz', false);
    // As if they had queued, then started a game some other way.
    await matchmakingService.addToQueue({
      userId: 'busy', username: 'Busy', rating: 1200, gameType: 'checkers',
      timeControl: 'rapid', rated: false, joinedAt: Date.now(),
    });

    const partner = client('innocent');
    await connected(partner);
    const joined = once(partner, 'queue_joined');
    partner.emit('join_queue', { gameType: 'checkers', timeControl: 'rapid', rated: false });
    await joined;

    // Give the 500 ms loop time to pair them, fail, and recover.
    await sleep(1500);
    expect(await fakeRedis.get('active_game:busy')).toBe(gameId);
    expect(await fakeRedis.get('active_game:innocent')).toBeNull();
    // The partner is back in the queue, and the stale entry is gone.
    expect(await matchmakingService.getQueueMeta('innocent', 'checkers')).not.toBeNull();
    expect(await matchmakingService.getQueueMeta('busy', 'checkers')).toBeNull();
  });
});

describe('GX-07 · a disconnect no longer stops your clock', () => {
  it('the time spent disconnected is charged to the player who left', async () => {
    const { a, b, gameId } = await startGame('clk-w', 'clk-b');
    const before = (await clockService.getSnapshot(gameId)).white_ms;

    const notice = once<any>(b, 'opponent_disconnected');
    a.disconnect();
    expect((await notice).graceMs).toBe(60_000);  // the forfeit rule is unchanged

    await sleep(1200);
    // Before: pauseClock had stopped it here, with white on the move.
    expect(await clockService.isRunning(gameId)).toBe(true);

    const back = client('clk-w');
    const restored = await once<any>(back, 'game_started');
    expect(restored.gameId).toBe(gameId);
    expect(restored.clocks.white_ms).toBeLessThanOrEqual(before - 1100);
  });
});

describe('WS5-10/11/12 · socket budgets and caps', () => {
  it('a budget belongs to the user, not the socket: two tabs share one', async () => {
    // join_queue allows 10 a minute. Twelve, split across two sockets.
    const tab1 = client('rl-two-tabs');
    const tab2 = client('rl-two-tabs');
    await Promise.all([connected(tab1), connected(tab2)]);
    let joined = 0;
    for (const t of [tab1, tab2]) t.on('queue_joined', () => { joined++; });
    const errors = [...[tab1, tab2].map(errorsOf)];

    for (let i = 0; i < 6; i++) {
      tab1.emit('join_queue', { gameType: 'chess', timeControl: 'blitz', rated: false });
      tab2.emit('join_queue', { gameType: 'chess', timeControl: 'blitz', rated: false });
    }
    await waitFor(() => joined + errors.flat().length >= 12, '12 replies');
    expect(joined).toBe(10);
    expect(errors.flat().map(e => e.code)).toEqual(['RATE_LIMITED', 'RATE_LIMITED']);
  });

  it('a flood of anything stops at the shared budget', async () => {
    // leave_spectate has no budget of its own; only the all-events one applies.
    const s = client('rl-flood');
    await connected(s);
    const errors = errorsOf(s);
    for (let i = 0; i < 30; i++) s.emit('leave_spectate', { gameId: 'junk' } as any);
    await waitFor(() => errors.length >= 30, '30 replies');

    const counts = errors.reduce<Record<string, number>>((m, e) => ({ ...m, [e.code]: (m[e.code] ?? 0) + 1 }), {});
    expect(counts).toEqual({ BAD_REQUEST: SOCKET_LIMITS.allEvents.max, RATE_LIMITED: 30 - SOCKET_LIMITS.allEvents.max });
  });

  it('a spent invite budget answers with the code the invite hook shows', async () => {
    const s = client('rl-invites');
    await connected(s);
    const errors = errorsOf(s);
    for (let i = 0; i < 11; i++) s.emit('accept_invite', { inviteId: `0000000${i % 10}` });
    await waitFor(() => errors.length >= 11, '11 replies');

    expect(new Set(errors.map(e => e.code))).toEqual(new Set(['INVITE_EXPIRED']));
    expect(errors.filter(e => /Too many invite attempts/.test(e.message))).toHaveLength(1);
  });

  it('the limits hold with Redis failing, and refuse rather than let through', async () => {
    // The old limiters sat in a catch that let every request through when Redis
    // threw, so filling Redis switched them off. These live in memory.
    vi.spyOn(fakeRedis, 'hgetall').mockRejectedValue(new Error('OOM command not allowed'));
    const s = client('rl-no-redis');
    await connected(s);
    const errors = errorsOf(s);
    const move = { type: 'chess', from: 'e2', to: 'e4' };
    for (let i = 0; i < 12; i++) s.emit('make_move', { gameId: '00000000-0000-4000-8000-000000000000', move });
    await waitFor(() => errors.length >= 12, '12 replies');

    const limit = SOCKET_LIMITS.perEvent.make_move!.max;
    expect(errors.filter(e => e.code === 'SERVER_ERROR')).toHaveLength(limit);
    expect(errors.filter(e => e.code === 'RATE_LIMITED')).toHaveLength(12 - limit);
  });

  it('one account can hold only so many sockets at once', async () => {
    const cap = SOCKET_LIMITS.socketsPerUser;
    const open = Array.from({ length: cap }, () => client('rl-many'));
    await Promise.all(open.map(connected));

    const extra = client('rl-many');
    const refused = await once<Error>(extra, 'connect_error');
    expect(refused.message).toMatch(/Too many open connections/);

    // Closing one frees a place.
    open[0].disconnect();
    await sleep(200);
    const again = client('rl-many');
    await connected(again);
  });

  it('handshakes are counted per address, before the token is even checked', async () => {
    const saved = SOCKET_LIMITS.handshakesPerIp;
    SOCKET_LIMITS.handshakesPerIp = { max: 3, windowMs: 60_000 };
    try {
      // A bad token still spends a handshake: the count comes first.
      const bad = client('hs-bad', 'garbage');
      expect((await once<Error>(bad, 'connect_error')).message).toBe('Invalid or expired token');
      await Promise.all([connected(client('hs-1')), connected(client('hs-2'))]);

      const fourth = client('hs-3');
      expect((await once<Error>(fourth, 'connect_error')).message).toMatch(/Too many connection attempts/);
    } finally {
      SOCKET_LIMITS.handshakesPerIp = saved;
    }
  });
});
