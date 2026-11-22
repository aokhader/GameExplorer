// The clock a player sees running is the clock of the side to move, in every
// online game, after every message the server sends.
//
// Players saw the opponent's clock run on their own turn. Two causes:
//
//   Reversi, every game. The server always started white's clock, but black
//   opens, and every auto-pass switched the clock as if the sides alternated.
//   Fixed by 84fd9cf (the clock follows the position); pinned again below
//   across whole games, passes included.
//
//   Any game, now and then. Moves and clock syncs for one game ran
//   concurrently. A sync could read the clock just before a move switched it
//   and broadcast that stale snapshot just after the move, so both clients ran
//   the wrong clock until the next sync. And the same move sent twice was
//   applied twice: two broadcasts, and a second charge to the clock. Before
//   84fd9cf that second charge toggled the clock back to the mover for the rest
//   of the game; since, it hands the opponent a free increment. Fixed by
//   running each game's moves and syncs one at a time (services/gameLock.ts).
//
// Safety: in-memory Redis and Supabase fakes, as in the other socket suites.
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

import { ChessEngine, CheckersEngine, ReversiEngine } from '@gameexplorer/shared';
import type { ClockSnapshot, GameType, MovePayload, PlayerColor } from '@gameexplorer/shared';
import { initializeWebSocket, shutdownWebSocket, tickClocks } from '../websocket';
import { resetSocketLimitState, SOCKET_LIMITS, type Budget } from '../websocket/limits';
import { gameSessionService, TIME_CONTROL_CONFIGS } from '../services/gameSession.service';
import { clockService } from '../services/clock.service';
import { redis } from '../config/redis';

const fakeRedis = redis as unknown as {
  flushall(): Promise<string>;
  hgetall(key: string): Promise<Record<string, string>>;
};

let httpServer: HTTPServer;
let port: number;
const clients: ClientSocket[] = [];
const saved: { allEvents?: Budget; makeMove?: Budget } = {};

beforeAll(async () => {
  // A scripted game moves far faster than a person, so the budgets are lifted
  // here; WS5-12 has its own suite.
  saved.allEvents = SOCKET_LIMITS.allEvents;
  saved.makeMove = SOCKET_LIMITS.perEvent.make_move;
  SOCKET_LIMITS.allEvents = { max: 100_000, windowMs: 1_000 };
  SOCKET_LIMITS.perEvent.make_move = { max: 100_000, windowMs: 1_000 };

  httpServer = createServer();
  initializeWebSocket(httpServer);
  await new Promise<void>(resolve => httpServer.listen(0, resolve));
  port = (httpServer.address() as AddressInfo).port;
});

afterAll(async () => {
  await shutdownWebSocket();
  SOCKET_LIMITS.allEvents = saved.allEvents!;
  SOCKET_LIMITS.perEvent.make_move = saved.makeMove;
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

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

/**
 * What a client knows, updated exactly as packages/client's useSocket updates
 * the game store: `game_started` and `move_made` replace position and clocks,
 * `clock_sync` replaces the clocks. After each message, the side whose clock
 * the client counts down must be the side the position gives the move to.
 */
function watch(socket: ClientSocket, name: string) {
  const view = {
    state: null as null | { currentTurn: PlayerColor; [k: string]: unknown },
    clocks: null as ClockSnapshot | null,
    ended: false,
    messages: 0,
    wrong: [] as string[],
  };
  const check = (event: string) => {
    view.messages++;
    if (view.ended || !view.state || !view.clocks) return;
    if (view.clocks.active_color !== view.state.currentTurn) {
      view.wrong.push(`${name} after ${event} #${view.messages}: ${view.clocks.active_color}'s clock runs on ${view.state.currentTurn}'s turn`);
    }
  };
  socket.on('game_started', (d: any) => { view.state = d.initialState; view.clocks = d.clocks; check('game_started'); });
  socket.on('move_made',    (d: any) => { view.state = d.newState; view.clocks = d.clocks; check('move_made'); });
  socket.on('clock_sync',   (d: any) => { view.clocks = d.clocks; check('clock_sync'); });
  socket.on('game_ended',   () => { view.ended = true; });
  return view;
}

async function startGame(whiteId: string, blackId: string, gameType: GameType) {
  const w = client(whiteId);
  const b = client(blackId);
  await Promise.all([once(w, 'connect'), once(b, 'connect')]);
  const views = [watch(w, 'white'), watch(b, 'black')] as const;
  const gameId = await gameSessionService.createGame(
    whiteId, blackId, `name-${whiteId}`, `name-${blackId}`, 1200, 1200, gameType, 'blitz', false,
  );
  const started = [once(w, 'game_started'), once(b, 'game_started')];
  w.emit('join_game', { gameId });
  b.emit('join_game', { gameId });
  await Promise.all(started);
  return { w, b, gameId, views };
}

function rng(seed: number) {
  return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
}

function isOver(gameType: GameType, s: any): boolean {
  return gameType === 'chess' ? !!(s.isCheckmate || s.isStalemate || s.isDraw) : !!s.isGameOver;
}

function legalMoves(gameType: GameType, s: any): MovePayload[] {
  if (gameType === 'chess') return ChessEngine.getAllLegalMoves(s).map(m => ({ type: 'chess', ...m, promotion: 'queen' }));
  if (gameType === 'checkers') return CheckersEngine.getAllLegalMoves(s).map(m => ({ type: 'checkers', from: m.from, to: m.to }));
  return ReversiEngine.getAllLegalMoves(s).map(position => ({ type: 'reversi', position }));
}

// ── Whole games ───────────────────────────────────────────────────────────────

describe('the running clock follows the side to move, all game long', () => {
  // Reversi seeds 6 and 22 each play two auto-passes (at plies 57 and 58).
  const GAMES: Array<[GameType, number]> = [['chess', 7], ['checkers', 3], ['reversi', 6], ['reversi', 22]];

  it.each(GAMES)('%s (seed %i), with a clock sync after every move', async (gameType, seed) => {
    const { w, b, gameId, views } = await startGame(`fg-w-${gameType}-${seed}`, `fg-b-${gameType}-${seed}`, gameType);
    const pick = rng(seed);
    let plies = 0;
    let passes = 0;

    while (plies < 90) {
      const state = views[0].state as any;
      if (isOver(gameType, state)) break;
      const moves = legalMoves(gameType, state);
      expect(moves.length, `no legal ${gameType} move at ply ${plies}`).toBeGreaterThan(0);
      const move = moves[Math.floor(pick() * moves.length)];
      const mover = state.currentTurn === 'white' ? w : b;

      const seen = [once(w, 'move_made'), once(b, 'move_made')];
      mover.emit('make_move', { gameId, move });
      const [made] = await Promise.all(seen);
      plies++;

      // The server agrees with what it sent.
      if (!isOver(gameType, made.newState)) {
        const clock = await fakeRedis.hgetall(`clock:${gameId}`);
        expect(clock.active_color, `server clock after ply ${plies}`).toBe(made.newState.currentTurn);
        if (gameType === 'reversi' && made.newState.currentTurn === state.currentTurn) passes++;

        const synced = [once(w, 'clock_sync'), once(b, 'clock_sync')];
        await tickClocks();
        await Promise.all(synced);
      }
    }

    expect(plies).toBeGreaterThan(10);
    expect([...views[0].wrong, ...views[1].wrong]).toEqual([]);
    // The seed was picked for its passes; one that stops producing them would
    // quietly stop testing the case reversi got wrong.
    if (gameType === 'reversi') expect(passes, 'auto-passes in this game').toBeGreaterThan(0);
  }, 30_000);
});

// ── The same move twice ───────────────────────────────────────────────────────

describe('a move sent twice is played once', () => {
  it('the second copy is refused, broadcast to nobody, and charges no clock', async () => {
    const { w, b, gameId } = await startGame('dup-w', 'dup-b', 'chess');
    const initial = TIME_CONTROL_CONFIGS.blitz.initialMs;
    const increment = TIME_CONTROL_CONFIGS.blitz.incrementMs;

    // The second handler to reach the clock is held back a little, as a busy
    // event loop would hold it, so it reads the clock after the first wrote it.
    const original = clockService.deductAndSwitch.bind(clockService);
    let calls = 0;
    vi.spyOn(clockService, 'deductAndSwitch').mockImplementation(async (...args) => {
      if (calls++ === 1) await sleep(30);
      return original(...args);
    });

    const madeForBlack: any[] = [];
    b.on('move_made', d => madeForBlack.push(d));
    const errorsForWhite: any[] = [];
    w.on('error', e => errorsForWhite.push(e));

    const move = { type: 'chess', from: 'e2', to: 'e4' } as const;
    w.emit('make_move', { gameId, move });
    w.emit('make_move', { gameId, move });
    await sleep(300);

    expect(madeForBlack).toHaveLength(1);
    expect(errorsForWhite).toEqual([{ code: 'ILLEGAL_MOVE', message: 'Not your turn' }]);

    const clock = await fakeRedis.hgetall(`clock:${gameId}`);
    expect(clock.active_color).toBe('black');
    expect(Number(clock.black_ms)).toBe(initial); // no increment for a move black never made
    expect(Number(clock.white_ms)).toBeLessThanOrEqual(initial + increment);
    const state = JSON.parse((await fakeRedis.hgetall(`game:${gameId}`)).state);
    expect(state.moveHistory).toHaveLength(1);
  });
});

// ── A sync that read the clock before a move ──────────────────────────────────

describe('a clock sync never lands after a move it predates', () => {
  it('a sync that read white\'s clock before 1.e4 does not reach the clients after 1.e4', async () => {
    const { w, gameId, views } = await startGame('sync-w', 'sync-b', 'chess');

    // The sync's read is slow to come back, as a Redis reply can be.
    const original = clockService.getSnapshot.bind(clockService);
    vi.spyOn(clockService, 'getSnapshot').mockImplementation(async (id) => {
      const snapshot = await original(id);
      await sleep(150);
      return snapshot;
    });

    const tick = tickClocks();      // reads white to move, then waits
    await sleep(20);
    const made = [once(w, 'move_made')];
    w.emit('make_move', { gameId, move: { type: 'chess', from: 'e2', to: 'e4' } });
    await Promise.all([tick, ...made]);
    await sleep(100);

    expect(views[0].state?.currentTurn).toBe('black');
    expect(views[0].clocks?.active_color).toBe('black');
    expect(views[1].clocks?.active_color).toBe('black');
    expect([...views[0].wrong, ...views[1].wrong]).toEqual([]);
  });
});
