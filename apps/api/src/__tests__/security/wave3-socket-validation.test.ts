// Security audit v2, Wave 3 — the socket half of the validation layer.
//
// Each describe block is the inverted form of a case in the WS5 proof-of-concept
// suite, which passed against the unvalidated handlers. The findings:
//
//   GX-06  create_invite_link stored any `timeControl`. Whoever accepted the
//          link ran createGame, which wrote BOTH players' `active_game:` pointers
//          and then threw on the unknown time control: both were "already in a
//          game" for 24 hours, with no clock and no event telling them why.
//   WS5-07 join_queue interpolated `gameType` and `timeControl` into Redis key
//          names, so one socket could create any number of queues for the
//          500 ms matchmaking loop to scan; and a closed tab stayed queued.
//   WS5-16 engine.io's default 1 MB frame let each of those payloads arrive at
//          nearly a megabyte.
//   WS5-21 the umbrella: there was no validation layer. Every listener now goes
//          through onEvent (middleware/validation.ts) and its schema.
//   WS5-22 a client-sent `username` was shown to opponents whenever the profile
//          lookup came back empty — unbounded, and whatever the client chose.
//
// Safety: redis, supabase and the JWT verifier are the same in-memory fakes the
// other socket suites use. Nothing here can reach production.
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { createServer, type Server as HTTPServer } from 'http';
import type { AddressInfo } from 'net';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
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

import { initializeWebSocket, shutdownWebSocket, getIO, MAX_SOCKET_MESSAGE_BYTES } from '../../websocket';
import { resetSocketLimitState, SOCKET_LIMITS } from '../../websocket/limits';
import { gameSessionService } from '../../services/gameSession.service';
import { clockService } from '../../services/clock.service';
import { SocketSchemas, type SocketEvent } from '../../schemas';
import { redis } from '../../config/redis';
import type { ErrorCode, GameType, TimeControl } from '@gameexplorer/shared';

const fakeRedis = redis as unknown as {
  flushall(): Promise<string>;
  keys(pattern: string): Promise<string[]>;
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ...rest: unknown[]): Promise<string>;
  hset(key: string, value: Record<string, string>): Promise<number>;
};

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
  resetSocketLimitState(); // the per-user and per-address budgets
  uncaught.length = 0;
  rejections.length = 0;
});

afterEach(() => {
  vi.restoreAllMocks();
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

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

async function waitFor(check: () => boolean | Promise<boolean>, what: string, ms = 3000): Promise<void> {
  const until = Date.now() + ms;
  while (!(await check())) {
    if (Date.now() > until) throw new Error(`timed out waiting for ${what}`);
    await sleep(25);
  }
}

/** Every `error` event a socket receives, in order. */
function errorsOf(socket: ClientSocket): Array<{ code: ErrorCode; message: string }> {
  const got: Array<{ code: ErrorCode; message: string }> = [];
  socket.on('error', (e) => got.push(e));
  return got;
}

const stateKeys = async () => [
  ...await fakeRedis.keys('game:*'),
  ...await fakeRedis.keys('active_game:*'),
  ...await fakeRedis.keys('clock:*'),
  ...await fakeRedis.keys('matchmaking:*'),
  ...await fakeRedis.keys('queue_meta:*'),
  ...await fakeRedis.keys('invite:*'),
];

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

const UNKNOWN_GAME = '00000000-0000-4000-8000-000000000000';

// ─────────────────────────────────────────────────────────────────────────────

describe('WS5-21 · every socket event goes through its schema', () => {
  // The code each event answers a refused payload with. Only the three
  // overrides differ from BAD_REQUEST; see onEvent's `rejected` option.
  const expectedCode = (event: SocketEvent): ErrorCode =>
    event === 'make_move' ? 'ILLEGAL_MOVE'
    : event === 'create_invite_link' || event === 'accept_invite' ? 'INVITE_EXPIRED'
    : 'BAD_REQUEST';

  const gameIdNearMisses = [
    { gameId: 'junk' }, { gameId: 'A'.repeat(10_000) }, { gameId: { $ne: null } },
    { gameId: ['a'] }, { gameId: UNKNOWN_GAME.toUpperCase().replace(/-/g, '') },
  ];

  // Shapes that are close to right, per event — the ones a naive check misses.
  const nearMisses: Record<SocketEvent, unknown[]> = {
    join_queue: [
      { gameType: 'go', timeControl: 'blitz', rated: true },            // not an online game
      { gameType: 'chess', timeControl: 'x', rated: true },             // the GX-06 value
      { gameType: 'chess', timeControl: 'blitz', rated: 'yes' },
      { gameType: 'chess:x', timeControl: 'blitz', rated: true },       // a key separator
    ],
    leave_queue: [{ gameType: 'chess', timeControl: 'hyperbullet', rated: false }],
    join_game: gameIdNearMisses, resign: gameIdNearMisses, abort_game: gameIdNearMisses,
    offer_draw: gameIdNearMisses, accept_draw: gameIdNearMisses, decline_draw: gameIdNearMisses,
    spectate: gameIdNearMisses, leave_spectate: gameIdNearMisses,
    make_move: [
      { gameId: UNKNOWN_GAME, move: { type: 'chess', from: 'z9', to: 'e4' } },
      { gameId: UNKNOWN_GAME, move: { type: 'chess', from: 'e2', to: 'e4', promotion: 'king' } },
      { gameId: UNKNOWN_GAME, move: { type: 'pass' } },
      { gameId: UNKNOWN_GAME, move: 'e2e4' },
      { gameId: 'junk', move: { type: 'reversi', position: 'd3' } },
    ],
    send_chat: [{ gameId: UNKNOWN_GAME, text: 12345 }, { gameId: UNKNOWN_GAME, text: '' }, { gameId: UNKNOWN_GAME, text: 'x'.repeat(1001) }],
    send_emote: [{ gameId: UNKNOWN_GAME, emote: '<script>' }, { gameId: UNKNOWN_GAME, emote: '👍👍' }],
    create_invite_link: [
      { gameType: 'chess', timeControl: 'x' },
      { gameType: 'chess/../../evil', timeControl: 'blitz' },           // lands in a URL path
    ],
    accept_invite: [{ inviteId: 'ABCDEF12' }, { inviteId: '1234567' }, { inviteId: { $ne: null } }],
  };

  const events = Object.keys(SocketSchemas) as SocketEvent[];

  // This block is about shapes, and it sends each event faster than a person
  // could — so the per-event budgets are lifted for it, leaving only the
  // shared one. They have their own tests in wave3-games-and-limits.test.ts.
  const savedBudgets = { ...SOCKET_LIMITS.perEvent };
  beforeAll(() => { SOCKET_LIMITS.perEvent = {}; });
  afterAll(() => { SOCKET_LIMITS.perEvent = savedBudgets; });

  it('covers all fifteen events', () => {
    expect(events).toHaveLength(15);
  });

  it.each(events)('%s refuses every malformed payload, touching no state', async (event) => {
    const s = client(`fuzz-${event}`);
    await connected(s);
    const errors = errorsOf(s);

    const payloads = [undefined, null, 'x', 7, [], {}, ...nearMisses[event]];
    for (const p of payloads) s.emit(event as any, p as any);

    // One refusal per payload is proof the schema ran: before Wave 3 most of
    // these produced no reply at all, only a rejection in the server log.
    await waitFor(() => errors.length >= payloads.length, `${payloads.length} errors`);
    await sleep(100);
    expect(errors).toHaveLength(payloads.length);
    expect(new Set(errors.map(e => e.code))).toEqual(new Set([expectedCode(event)]));

    expect(await stateKeys()).toEqual([]);
    expect(uncaught).toEqual([]);
    expect(rejections).toEqual([]);
    expect(s.connected).toBe(true);
  });

  it('the server registers exactly the schema events, and handlers never call socket.on', async () => {
    const s = client('listeners');
    await connected(s);
    await waitFor(() => getIO().sockets.sockets.has(s.id!), 'server-side socket');
    const serverSocket = getIO().sockets.sockets.get(s.id!)!;

    // `disconnect` is websocket/index.ts's own, and socket.io attaches a no-op
    // `error` listener to every socket (socket.io/dist/socket.js:123).
    const registered = serverSocket.eventNames().filter(e => e !== 'disconnect' && e !== 'error').sort();
    expect(registered).toEqual([...events].sort());

    // And the only door is onEvent: a raw socket.on in a handler file would
    // bypass the schema even if its event name matched one above.
    const dir = join(__dirname, '../../websocket/handlers');
    for (const file of readdirSync(dir)) {
      const src = readFileSync(join(dir, file), 'utf8');
      expect(src, `${file} registers a listener without a schema`).not.toMatch(/socket\.on\(/);
    }
  });

  it('a chat line over 200 characters is trimmed and delivered, not dropped', async () => {
    // The schema's 1000 is a parsing ceiling; the product limit stays the
    // handler's 200-character truncation, so this keeps working as before.
    const { a, b, gameId } = await startGame('chat-a', 'chat-b');
    const got = once<any>(b, 'chat_message');
    a.emit('send_chat', { gameId, text: 'y'.repeat(300) });
    expect((await got).text).toHaveLength(200);
  });

  it('a move is broadcast as parsed, without keys the client added', async () => {
    const { a, b, gameId } = await startGame('strip-a', 'strip-b');
    const made = once<any>(b, 'move_made');
    a.emit('make_move', { gameId, move: { type: 'chess', from: 'e2', to: 'e4', padding: 'p'.repeat(5000) } } as any);
    const ev = await made;
    expect(ev.move).toEqual({ type: 'chess', from: 'e2', to: 'e4' });
  });
});

describe('GX-06 · a bad time control can no longer brick a player', () => {
  it('create_invite_link refuses an unknown time control and stores nothing', async () => {
    const host = client('gx06-host');
    await connected(host);
    const err = once<any>(host, 'error');
    host.emit('create_invite_link', { gameType: 'chess', timeControl: 'x' } as any);

    // INVITE_EXPIRED, because it is the only code the client's invite hook
    // handles — anything else would leave "Creating link…" spinning.
    expect((await err).code).toBe('INVITE_EXPIRED');
    expect(await fakeRedis.keys('invite:*')).toEqual([]);
  });

  it('an invite that somehow holds a bad time control still cannot brick whoever accepts it', async () => {
    // Written straight into Redis, as if a value had got past the socket
    // schema. createGame is the second line of defence.
    await fakeRedis.hset('invite:abcdef12', {
      fromId: 'gx06b-host', fromUsername: 'Host', fromRating: '1200', toId: '',
      gameType: 'chess', timeControl: 'x', createdAt: new Date().toISOString(),
    });

    const guest = client('gx06b-guest');
    await connected(guest);
    const err = once<any>(guest, 'error');
    guest.emit('accept_invite', { inviteId: 'abcdef12' });

    // The guest is told (before: silence), and nothing points at a dead game.
    expect((await err).code).toBe('INVITE_EXPIRED');
    expect(await fakeRedis.get('active_game:gx06b-guest')).toBeNull();
    expect(await fakeRedis.get('active_game:gx06b-host')).toBeNull();
    expect(await fakeRedis.keys('game:*')).toEqual([]);
    expect(await fakeRedis.keys('clock:*')).toEqual([]);

    // The whole point of the brick was that this failed with ALREADY_IN_GAME.
    const queued = once(guest, 'queue_joined');
    guest.emit('join_queue', { gameType: 'chess', timeControl: 'blitz', rated: false });
    await queued;
  });

  it('createGame rejects bad input before its first write', async () => {
    await expect(gameSessionService.createGame(
      'cg-w', 'cg-b', 'w', 'b', 1200, 1200, 'chess', 'x' as TimeControl, true,
    )).rejects.toThrow(/Unknown time control/);
    // The old code quietly started a reversi game for any unknown type.
    await expect(gameSessionService.createGame(
      'cg-w', 'cg-b', 'w', 'b', 1200, 1200, 'go' as GameType, 'blitz', true,
    )).rejects.toThrow(/Unknown game type/);
    expect(await stateKeys()).toEqual([]);
  });

  it('a write that fails partway is undone', async () => {
    // Black's pointer write fails (Redis full, say) after the game hash and
    // white's pointer have landed.
    const realSet = fakeRedis.set.bind(fakeRedis);
    vi.spyOn(fakeRedis, 'set').mockImplementation(async (key: string, ...rest: unknown[]) => {
      if (key === 'active_game:pw-b') throw new Error('OOM command not allowed');
      return realSet(key, ...(rest as [string]));
    });

    await expect(gameSessionService.createGame(
      'pw-w', 'pw-b', 'w', 'b', 1200, 1200, 'chess', 'blitz', true,
    )).rejects.toThrow(/OOM/);

    expect(await stateKeys()).toEqual([]);
  });

  it('a pointer left behind by a game that no longer exists is replaced, not obeyed', async () => {
    // Gating on the bare pointer, as join_queue did, turned any leftover one
    // into the same 24-hour lockout.
    await fakeRedis.set('active_game:stale-b', 'a-game-that-is-gone');

    const s = client('stale-b');
    await connected(s);
    const queued = once(s, 'queue_joined');
    s.emit('join_queue', { gameType: 'chess', timeControl: 'blitz', rated: false });
    await queued;

    const gameId = await gameSessionService.createGame(
      'stale-w', 'stale-b', 'w', 'b', 1200, 1200, 'chess', 'blitz', true,
    );
    expect(await fakeRedis.get('active_game:stale-b')).toBe(gameId);
  });

  it('a clock that fails to start leaves no pointer at all', async () => {
    vi.spyOn(clockService, 'initClock').mockRejectedValueOnce(new Error('clock down'));
    await expect(gameSessionService.createGame(
      'ck-w', 'ck-b', 'w', 'b', 1200, 1200, 'chess', 'blitz', true,
    )).rejects.toThrow(/clock down/);
    expect(await stateKeys()).toEqual([]);
  });
});

describe('WS5-07 · matchmaking queues are bounded and cleaned up', () => {
  it('fifty invented game types create no queues', async () => {
    const s = client('q-junk');
    await connected(s);
    const errors = errorsOf(s);
    for (let i = 0; i < 50; i++) {
      s.emit('join_queue', { gameType: `junk-${i}`, timeControl: `junk-${i}`, rated: true } as any);
    }
    await waitFor(() => errors.length >= 50, '50 refusals');
    expect(await fakeRedis.keys('matchmaking:*')).toEqual([]);
    expect(await fakeRedis.keys('queue_meta:*')).toEqual([]);
  });

  it('a player whose last socket closes leaves every queue', async () => {
    const s = client('q-leaver');
    await connected(s);
    for (const timeControl of ['blitz', 'rapid'] as const) {
      // Re-queueing without cancelling: the meta hash only remembers the last.
      const joined = once(s, 'queue_joined');
      s.emit('join_queue', { gameType: 'chess', timeControl, rated: false });
      await joined;
    }
    expect(await fakeRedis.keys('matchmaking:*')).toHaveLength(2);

    s.disconnect();
    await waitFor(async () => (await fakeRedis.keys('matchmaking:*')).length === 0, 'queues to empty');
    expect(await fakeRedis.keys('queue_meta:*')).toEqual([]);
  });

  it('a player who still has another tab open stays queued', async () => {
    const tab1 = client('q-twotabs');
    const tab2 = client('q-twotabs');
    await Promise.all([connected(tab1), connected(tab2)]);
    const joined = once(tab1, 'queue_joined');
    tab1.emit('join_queue', { gameType: 'reversi', timeControl: 'movetime', rated: true });
    await joined;

    tab2.disconnect();
    await sleep(400);
    expect(await fakeRedis.keys('matchmaking:*')).toEqual(['matchmaking:reversi:movetime:1']);
  });
});

describe('WS5-22 · opponents see the profile name, never a client-chosen one', () => {
  it('with no profile row, a queued player is "Anonymous", not what they sent', async () => {
    const a = client('name-a');
    const b = client('name-b');
    await Promise.all([connected(a), connected(b)]);

    const matchA = once<any>(a, 'match_found');
    const matchB = once<any>(b, 'match_found');
    // The protocol type still carries these fields; the schema strips them.
    a.emit('join_queue', { gameType: 'checkers', timeControl: 'rapid', rated: false, username: 'Admin', rating: 3000 } as any);
    b.emit('join_queue', { gameType: 'checkers', timeControl: 'rapid', rated: false, username: 'x'.repeat(5000), rating: 3000 } as any);

    const [ma, mb] = await Promise.all([matchA, matchB]);
    expect(ma.opponent.username).toBe('Anonymous');
    expect(mb.opponent.username).toBe('Anonymous');
    expect(ma.opponent.rating).toBe(1200);
  });
});

describe('WS5-16 · frames are capped well below engine.io\'s 1 MB default', () => {
  it('a frame over the cap closes that connection before any handler runs', async () => {
    const s = client('big-frame');
    await connected(s);
    const closed = once<string>(s, 'disconnect', 5000);
    s.emit('decline_draw', { gameId: 'A'.repeat(MAX_SOCKET_MESSAGE_BYTES * 2) });
    await closed;
    expect(await stateKeys()).toEqual([]);
  });

  it('a frame under the cap is still answered by the schema, not dropped', async () => {
    const s = client('mid-frame');
    await connected(s);
    const err = once<any>(s, 'error');
    s.emit('decline_draw', { gameId: 'A'.repeat(MAX_SOCKET_MESSAGE_BYTES / 2) });
    expect((await err).code).toBe('BAD_REQUEST');
    expect(s.connected).toBe(true);
  });
});
