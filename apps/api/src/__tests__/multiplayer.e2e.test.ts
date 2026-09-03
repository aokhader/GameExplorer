// End-to-end multiplayer tests over a REAL Socket.io server.
//
// What's real: the websocket server + auth middleware + game/matchmaking
// handlers + matchmaking/clock polling loops + game session, clock, invite and
// persistence services + the shared game engines. Two (or three) socket.io
// clients connect over actual TCP sockets and play.
//
// What's faked (infrastructure boundaries only):
//  - Redis        → in-memory fake (helpers/redis-fake.ts)
//  - Supabase     → in-memory query-builder fake (helpers/supabase-fake.ts),
//                   so the real persistence.service logic still runs
//  - JWT verify   → tokens of the form `valid:<userId>` authenticate as that
//                   user; anything else is rejected (the middleware code that
//                   maps verification results to socket auth still runs)
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { createServer, type Server as HTTPServer } from 'http';
import type { AddressInfo } from 'net';
import { io as ioc, type Socket as ClientSocket } from 'socket.io-client';

vi.mock('../config/redis', async () => {
  const { createRedisFakeModule } = await import('./helpers/redis-fake');
  return createRedisFakeModule();
});

vi.mock('../config/supabase', async () => {
  const { createSupabaseFakeModule } = await import('./helpers/supabase-fake');
  return createSupabaseFakeModule();
});

vi.mock('../utils/verifyToken', () => ({
  verifySupabaseToken: async (token: string) => {
    if (!token.startsWith('valid:')) throw new Error('invalid token');
    return { sub: token.slice('valid:'.length) };
  },
}));

import { initializeWebSocket, shutdownWebSocket } from '../websocket';
import { gameSessionService } from '../services/gameSession.service';
import { redis } from '../config/redis';
import * as supabaseModule from '../config/supabase';
import type { GameType } from '@finesse/shared';

const supa = supabaseModule as unknown as {
  __tables: { user_ratings: Record<string, unknown>[]; games: Record<string, unknown>[] };
  __reset(): void;
};

// ── Server + client plumbing ──────────────────────────────────────────────────

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
  await shutdownWebSocket(); // also closes the attached http server
});

beforeEach(async () => {
  await (redis as unknown as { flushall(): Promise<string> }).flushall();
  supa.__reset();
});

afterEach(() => {
  for (const c of clients) c.disconnect();
  clients.length = 0;
});

function client(userId: string, rawToken?: string | null): ClientSocket {
  const auth = rawToken === null ? {} : { token: rawToken ?? `valid:${userId}` };
  const s = ioc(`http://127.0.0.1:${port}`, {
    auth,
    transports:   ['websocket'],
    reconnection: false,
    forceNew:     true,
  });
  clients.push(s);
  return s;
}

/** Resolves with the next `event` payload, or rejects after `timeoutMs`. */
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

/** Resolves if `event` does NOT fire within `ms`; rejects if it does. */
function expectNoEvent(socket: ClientSocket, event: string, ms: number): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    socket.once(event, () => { clearTimeout(t); reject(new Error(`unexpected "${event}"`)); });
  });
}

/**
 * Creates an active rated game directly via the session service (skipping the
 * matchmaking wait) and has both players join over their sockets. White = `aId`.
 */
async function startGame(aId: string, bId: string, gameType: GameType = 'chess') {
  const a = client(aId);
  const b = client(bId);
  await Promise.all([connected(a), connected(b)]);

  const gameId = await gameSessionService.createGame(
    aId, bId, `name-${aId}`, `name-${bId}`, 1200, 1200, gameType, 'blitz', true,
  );

  const pa = once(a, 'game_started');
  const pb = once(b, 'game_started');
  a.emit('join_game', { gameId });
  b.emit('join_game', { gameId });
  await Promise.all([pa, pb]);

  return { a, b, gameId };
}

// ── Auth ──────────────────────────────────────────────────────────────────────

describe('socket authentication', () => {
  it('rejects a connection without a token', async () => {
    const s = client('nobody', null);
    const err = await once<Error>(s, 'connect_error');
    expect(err.message).toBe('Authentication required');
  });

  it('rejects a connection with an invalid token', async () => {
    const s = client('nobody', 'garbage');
    const err = await once<Error>(s, 'connect_error');
    expect(err.message).toBe('Invalid or expired token');
  });
});

// ── Matchmaking ───────────────────────────────────────────────────────────────

describe('matchmaking', () => {
  it('pairs two queued players and starts a game with server-side ratings', async () => {
    // Ratings live server-side; the client-supplied rating below (9999) must be ignored.
    const now = new Date().toISOString();
    supa.__tables.user_ratings.push(
      { user_id: 'mm-a', game_type: 'chess', rating: 1210, games_played: 10, wins: 5, losses: 5, draws: 0, peak_rating: 1300, updated_at: now },
      { user_id: 'mm-b', game_type: 'chess', rating: 1190, games_played: 10, wins: 5, losses: 5, draws: 0, peak_rating: 1250, updated_at: now },
    );

    const a = client('mm-a');
    const b = client('mm-b');
    await Promise.all([connected(a), connected(b)]);

    const matchA = once<any>(a, 'match_found');
    const matchB = once<any>(b, 'match_found');
    const startA = once<any>(a, 'game_started');
    const startB = once<any>(b, 'game_started');

    const queuedA = once(a, 'queue_joined');
    a.emit('join_queue', { gameType: 'chess', timeControl: 'blitz', rated: true, username: 'Alice', rating: 9999 });
    await queuedA;
    b.emit('join_queue', { gameType: 'chess', timeControl: 'blitz', rated: true, username: 'Bob', rating: 9999 });

    const [ma, mb] = await Promise.all([matchA, matchB]);
    expect(ma.gameId).toBe(mb.gameId);
    expect([ma.color, mb.color].sort()).toEqual(['black', 'white']);
    // Opponent ratings come from the (fake) database, not the forged client value.
    expect(ma.opponent.rating).toBe(1190);
    expect(mb.opponent.rating).toBe(1210);

    const [sa, sb] = await Promise.all([startA, startB]);
    expect(sa.gameType).toBe('chess');
    expect(sa.initialState).toBeTruthy();
    expect(sa.clocks.white_ms).toBe(180_000); // blitz
    expect([sa.myColor, sb.myColor].sort()).toEqual(['black', 'white']);
  }, 15000);

  it('rejects joining the queue while already in a game', async () => {
    const { a } = await startGame('busy-a', 'busy-b');
    const err = once<any>(a, 'error');
    a.emit('join_queue', { gameType: 'chess', timeControl: 'blitz', rated: true, username: 'A', rating: 1200 });
    expect((await err).code).toBe('ALREADY_IN_GAME');
  });

  it('does not pair users who have blocked each other', async () => {
    const now = new Date().toISOString();
    const rating = (id: string) => ({ user_id: id, game_type: 'chess', rating: 1200, games_played: 10, wins: 5, losses: 5, draws: 0, peak_rating: 1200, updated_at: now });
    supa.__tables.user_ratings.push(rating('blk-a'), rating('blk-b'), rating('blk-c'));
    // blk-a has blocked blk-b (block is treated as mutual in matchmaking).
    (supa.__tables as Record<string, unknown[]>).user_blocks = [{ blocker_id: 'blk-a', blocked_id: 'blk-b' }];

    const a = client('blk-a');
    const b = client('blk-b');
    await Promise.all([connected(a), connected(b)]);

    // A and B have identical ratings but must NOT be matched to each other.
    const noMatchA = expectNoEvent(a, 'match_found', 1500);
    const qa = once(a, 'queue_joined');
    a.emit('join_queue', { gameType: 'chess', timeControl: 'blitz', rated: true, username: 'A', rating: 1200 });
    await qa;
    const qb = once(b, 'queue_joined');
    b.emit('join_queue', { gameType: 'chess', timeControl: 'blitz', rated: true, username: 'B', rating: 1200 });
    await qb;
    await noMatchA;

    // An unblocked third player matches normally with one of them.
    const c = client('blk-c');
    await connected(c);
    const matchC = once<any>(c, 'match_found');
    c.emit('join_queue', { gameType: 'chess', timeControl: 'blitz', rated: true, username: 'C', rating: 1200 });
    const mc = await matchC;
    expect(['blk-a', 'blk-b']).toContain(mc.opponent.userId);
  }, 15000);
});

// ── Moves ─────────────────────────────────────────────────────────────────────

describe('moves', () => {
  it('broadcasts a legal move to both players with updated state and clocks', async () => {
    const { a, b, gameId } = await startGame('mv-a', 'mv-b');

    const seenByA = once<any>(a, 'move_made');
    const seenByB = once<any>(b, 'move_made');
    a.emit('make_move', { gameId, move: { type: 'chess', from: 'e2', to: 'e4' } });

    const [evA, evB] = await Promise.all([seenByA, seenByB]);
    for (const ev of [evA, evB]) {
      expect(ev.gameId).toBe(gameId);
      expect(ev.move).toMatchObject({ from: 'e2', to: 'e4' });
      expect((ev.newState as any).currentTurn).toBe('black');
      expect(ev.clocks.active_color).toBe('black');
    }
  });

  it('rejects an illegal move', async () => {
    const { a, gameId } = await startGame('il-a', 'il-b');
    const err = once<any>(a, 'error');
    a.emit('make_move', { gameId, move: { type: 'chess', from: 'e2', to: 'e5' } });
    expect((await err).code).toBe('ILLEGAL_MOVE');
  });

  it('rejects a move by the player whose turn it is not', async () => {
    const { b, gameId } = await startGame('tn-a', 'tn-b');
    const err = once<any>(b, 'error');
    b.emit('make_move', { gameId, move: { type: 'chess', from: 'e7', to: 'e5' } });
    const e = await err;
    expect(e.code).toBe('ILLEGAL_MOVE');
    expect(e.message).toBe('Not your turn');
  });

  it("rejects a participant moving the opponent's piece (cross-play)", async () => {
    // The real exploit: it is white's turn, but black submits a legal *white*
    // move. The engine alone accepts it (white piece, white turn) — the server
    // must reject it because black is not the side to move.
    const { a, b, gameId } = await startGame('xp-a', 'xp-b');
    const err = once<any>(b, 'error');
    const noMove = expectNoEvent(a, 'move_made', 800);
    b.emit('make_move', { gameId, move: { type: 'chess', from: 'e2', to: 'e4' } });
    expect((await err).message).toBe('Not your turn');
    await noMove;
  });

  it('rejects make_move from a non-participant', async () => {
    const { a, gameId } = await startGame('pp-a', 'pp-b');
    const intruder = client('pp-intruder');
    await connected(intruder);
    const err = once<any>(intruder, 'error');
    const noMove = expectNoEvent(a, 'move_made', 800);
    intruder.emit('make_move', { gameId, move: { type: 'chess', from: 'e2', to: 'e4' } });
    expect((await err).message).toBe('Not a participant');
    await noMove;
  });

  it('rejects a malformed move payload without reaching the engine', async () => {
    const { a, gameId } = await startGame('mf-a', 'mf-b');
    const err = once<any>(a, 'error');
    a.emit('make_move', { gameId, move: { type: 'chess', from: 'z9', to: 'e4' } as any });
    expect((await err).message).toBe('Malformed move');
  });
});

// ── Full game to checkmate + server-side persistence ─────────────────────────

describe('checkmate ends the game and persists results server-side', () => {
  it("plays Fool's Mate over the wire", async () => {
    const { a, b, gameId } = await startGame('cm-white', 'cm-black');

    // Helper: make a move and wait until the opponent has seen it.
    async function move(from: ClientSocket, seenBy: ClientSocket, mv: { from: string; to: string }) {
      const seen = once(seenBy, 'move_made');
      from.emit('make_move', { gameId, move: { type: 'chess', ...mv } });
      await seen;
    }

    await move(a, b, { from: 'f2', to: 'f3' });
    await move(b, a, { from: 'e7', to: 'e5' });
    await move(a, b, { from: 'g2', to: 'g4' });

    const endedA = once<any>(a, 'game_ended');
    const endedB = once<any>(b, 'game_ended');
    b.emit('make_move', { gameId, move: { type: 'chess', from: 'd8', to: 'h4' } });

    const [ea, eb] = await Promise.all([endedA, endedB]);
    for (const ev of [ea, eb]) {
      expect(ev.result).toBe('black_wins');
      expect(ev.reason).toBe('checkmate');
      expect(ev.white.ratingDelta).toBeLessThan(0);
      expect(ev.black.ratingDelta).toBeGreaterThan(0);
    }

    // Server-authoritative persistence: ratings + a game row PER player.
    const ratings = supa.__tables.user_ratings;
    expect(ratings).toHaveLength(2);
    const white = ratings.find(r => r.user_id === 'cm-white') as any;
    const black = ratings.find(r => r.user_id === 'cm-black') as any;
    expect(white.losses).toBe(1);
    expect(black.wins).toBe(1);
    expect(black.rating).toBeGreaterThan(white.rating);

    const games = supa.__tables.games;
    expect(games).toHaveLength(2);
    for (const row of games as any[]) {
      expect(row.game_type).toBe('chess');
      expect(row.result).toBe('black');
      expect(row.end_reason).toBe('checkmate');
      expect(row.mode).toBe('rated');
      expect(row.moves).toHaveLength(4);
      expect(row.rating_before).toBe(1200);
    }

    // Redis session torn down.
    expect(await gameSessionService.getGameSession(gameId)).toBeNull();
  });
});

// ── Resign / draw / abort ─────────────────────────────────────────────────────

describe('game termination', () => {
  it('resign ends the game in favour of the opponent', async () => {
    const { a, b, gameId } = await startGame('rs-a', 'rs-b');
    const endedA = once<any>(a, 'game_ended');
    b.emit('resign', { gameId }); // black resigns
    const ev = await endedA;
    expect(ev.result).toBe('white_wins');
    expect(ev.reason).toBe('resign');
    expect(supa.__tables.games).toHaveLength(2);
  });

  it('draw can be declined and then agreed', async () => {
    const { a, b, gameId } = await startGame('dr-a', 'dr-b');

    const offered = once<any>(b, 'draw_offered');
    a.emit('offer_draw', { gameId });
    await offered;

    const declined = once<any>(a, 'draw_declined');
    b.emit('decline_draw', { gameId });
    await declined;

    const offered2 = once<any>(b, 'draw_offered');
    a.emit('offer_draw', { gameId });
    await offered2;

    const endedA = once<any>(a, 'game_ended');
    const endedB = once<any>(b, 'game_ended');
    b.emit('accept_draw', { gameId });
    const [ea] = await Promise.all([endedA, endedB]);
    expect(ea.result).toBe('draw');
    expect(ea.reason).toBe('draw_agreement');
    // Equal ratings drawing: no change.
    expect(ea.white.ratingDelta).toBe(0);
    expect(ea.black.ratingDelta).toBe(0);
  });

  it('abort before the move limit ends the game with nothing persisted', async () => {
    const { a, b, gameId } = await startGame('ab-a', 'ab-b');
    const abortedA = once<any>(a, 'game_aborted');
    const abortedB = once<any>(b, 'game_aborted');
    a.emit('abort_game', { gameId });
    await Promise.all([abortedA, abortedB]);

    expect(supa.__tables.games).toHaveLength(0);
    expect(supa.__tables.user_ratings).toHaveLength(0);
    expect(await gameSessionService.getGameSession(gameId)).toBeNull();
  });
});

// ── Chat ──────────────────────────────────────────────────────────────────────

describe('chat', () => {
  it('relays chat to both players and strips angle brackets', async () => {
    const { a, b, gameId } = await startGame('ch-a', 'ch-b');
    const msgA = once<any>(a, 'chat_message');
    const msgB = once<any>(b, 'chat_message');
    a.emit('send_chat', { gameId, text: 'gg <script>alert(1)</script>' });

    const [ma, mb] = await Promise.all([msgA, msgB]);
    for (const m of [ma, mb]) {
      expect(m.userId).toBe('ch-a');
      expect(m.username).toBe('name-ch-a');
      expect(m.text).not.toContain('<');
      expect(m.text).not.toContain('>');
      expect(m.text).toContain('gg');
    }
  });
});

// ── Spectating ────────────────────────────────────────────────────────────────

describe('spectating', () => {
  it('lets a third user watch and receive live moves', async () => {
    const { a, gameId } = await startGame('sp-a', 'sp-b');

    const spec = client('sp-watcher');
    await connected(spec);

    const started = once<any>(spec, 'game_started');
    spec.emit('spectate', { gameId });
    const sv = await started;
    expect(sv.gameId).toBe(gameId);
    expect(sv.gameType).toBe('chess');
    expect(sv.initialState).toBeTruthy();

    const seen = once<any>(spec, 'move_made');
    a.emit('make_move', { gameId, move: { type: 'chess', from: 'e2', to: 'e4' } });
    expect((await seen).move).toMatchObject({ from: 'e2', to: 'e4' });
  });

  it('blocks a non-participant from joining as a player', async () => {
    const { gameId } = await startGame('np-a', 'np-b');
    const intruder = client('np-intruder');
    await connected(intruder);

    const err = once<any>(intruder, 'error');
    intruder.emit('join_game', { gameId });
    expect((await err).code).toBe('GAME_NOT_FOUND');
  });
});

// ── Disconnect / reconnect ────────────────────────────────────────────────────

describe('reconnection', () => {
  it('notifies the opponent on disconnect and restores the game on reconnect', async () => {
    const { a, b, gameId } = await startGame('rc-a', 'rc-b');

    const dropSeen = once<any>(a, 'opponent_disconnected');
    b.disconnect();
    const drop = await dropSeen;
    expect(drop.gameId).toBe(gameId);
    expect(drop.graceMs).toBe(60_000);

    // Same user reconnects on a fresh socket: the server restores the game
    // automatically (no join_game needed) and tells the opponent.
    const backSeen = once<any>(a, 'opponent_reconnected');
    const b2 = client('rc-b');
    const restored = await once<any>(b2, 'game_started');
    expect(restored.gameId).toBe(gameId);
    expect(restored.myColor).toBe('black');
    expect(restored.opponent.userId).toBe('rc-a');
    expect((await backSeen).gameId).toBe(gameId);
  });
});

// ── Invites ("Play a Friend") ─────────────────────────────────────────────────

describe('invite flow', () => {
  it('creates a link, starts a casual game on accept, and persists it unrated', async () => {
    const host = client('inv-host');
    await connected(host);

    const linkSeen = once<any>(host, 'invite_link_created');
    host.emit('create_invite_link', { gameType: 'reversi', timeControl: 'rapid', username: 'Hosty' });
    const { inviteId, url } = await linkSeen;
    // toContain alone would pass on a malformed base — a joined CORS_ORIGIN list
    // still ends in the right path — so assert the whole URL is well-formed.
    expect(url).not.toContain(',');
    const parsed = new URL(url);
    expect(parsed.pathname).toBe('/reversi/play');
    expect(parsed.searchParams.get('invite')).toBe(inviteId);

    const guest = client('inv-guest');
    await connected(guest);

    const hostStart  = once<any>(host, 'game_started');
    const guestStart = once<any>(guest, 'game_started');
    guest.emit('accept_invite', { inviteId, username: 'Guesty' });

    const [hs, gs] = await Promise.all([hostStart, guestStart]);
    expect(hs.gameType).toBe('reversi');
    expect(hs.myColor).toBe('white');
    expect(hs.opponent.username).toBe('Guesty');
    expect(gs.myColor).toBe('black');
    expect(gs.opponent.username).toBe('Hosty');
    expect(gs.gameId).toBe(hs.gameId);

    // Guest (black) opens; reversi: black moves first.
    const seen = once<any>(host, 'move_made');
    guest.emit('make_move', { gameId: gs.gameId, move: { type: 'reversi', position: 'd3' } });
    await seen;

    // Host resigns — invite games are casual: zero rating movement, no rating rows.
    const ended = once<any>(guest, 'game_ended');
    host.emit('resign', { gameId: gs.gameId });
    const ev = await ended;
    expect(ev.result).toBe('black_wins');
    expect(ev.white.ratingDelta).toBe(0);
    expect(ev.black.ratingDelta).toBe(0);

    expect(supa.__tables.user_ratings).toHaveLength(0);
    const games = supa.__tables.games as any[];
    expect(games).toHaveLength(2);
    for (const row of games) {
      expect(row.mode).toBe('casual');
      expect(row.game_type).toBe('reversi');
    }
  });
});
