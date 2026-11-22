// A move is played by its game's engine, never by the engine its payload names.
//
// applyMove checked that the sender was a participant, that the payload was
// well formed and that it was the sender's turn, and then picked the engine
// from `move.type`. Nothing compared that with the game's own `gameType`. All
// three engines index the board the same way (a1 = [0][0]) and read nothing
// but `.color` off a square, so a foreign move did not throw: it ran.
//
// What that did, measured by trying every well-formed foreign move in every
// position of 60 random legal games per type (Nov 2026; the cases below are
// the shortest lines found). Counts are (position, move) pairs:
//
//   game      foreign move   accepted   ended the game   sender won
//   chess     reversi        yes        174              170
//   chess     checkers       yes        never            -
//   checkers  reversi        yes        709              630
//   checkers  chess          yes        never            - (castling threw)
//   reversi   checkers       yes        33               33
//   reversi   chess          never      -                -
//
// A game-ending one reached endGame like any checkmate, so the sender's rating
// was upserted as a rated win: 1.g4 h6 2.g5 and black "places a disc" on f4
// (the reversi engine flips g5 and, finding no reversi move for either side,
// declares the board full and black ahead 17–15). The ones that did not end
// the game wrote a board the real engine was never meant to see: a pawn moved
// diagonally onto an empty square, a chess piece jumped and removed, a
// checkers king walked like a chess king.
//
// Safety: in-memory Redis and Supabase fakes, as in the other security suites.
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

import { ChessEngine, CheckersEngine, ReversiEngine } from '@gameexplorer/shared';
import type { GameType, MovePayload, PlayerColor } from '@gameexplorer/shared';
import { initializeWebSocket, shutdownWebSocket } from '../../websocket';
import { resetSocketLimitState } from '../../websocket/limits';
import { gameSessionService } from '../../services/gameSession.service';
import { redis } from '../../config/redis';

const fakeRedis = redis as unknown as {
  flushall(): Promise<string>;
  hgetall(key: string): Promise<Record<string, string>>;
};

const WHITE = 'mt-white';
const BLACK = 'mt-black';

// ── Lines, all reached by legal play of the real game ─────────────────────────

/** `e2e4` style for chess and checkers, `d3` style for reversi. */
function parse(gameType: GameType, token: string): MovePayload {
  if (gameType === 'reversi') return { type: 'reversi', position: token };
  const from = token.slice(0, 2);
  const to = token.slice(2, 4);
  return gameType === 'chess' ? { type: 'chess', from, to } : { type: 'checkers', from, to };
}

interface Case {
  name: string;
  gameType: GameType;
  line: string;
  foreign: MovePayload;
  /** What the foreign engine makes of the move on that position, without the guard. */
  without: 'sender wins' | 'accepted' | 'refused';
}

const REVERSI_LINE =
  'f5 f6 d3 g5 g7 c2 e3 d6 c4 b3 c6 e7 c3 d2 c5 c7 b8 e6 d7 e2 a2 c8 d1 b5 f7 c1 ' +
  'b6 b7 g6 h6 a7 h8 a4 d8 h7 b4 h5 e1 a3 g8 e8 g4 f3 f8 h4 a8 b1 g3 f1 f2 g2 f4';

const CASES: Case[] = [
  {
    name: 'a reversi placement into chess (1.g4 h6 2.g5, black f4)',
    gameType: 'chess', line: 'g2g4 h7h6 g4g5',
    foreign: { type: 'reversi', position: 'f4' }, without: 'sender wins',
  },
  {
    name: 'a checkers step into chess (a pawn steps diagonally, a2-b3)',
    gameType: 'chess', line: '',
    foreign: { type: 'checkers', from: 'a2', to: 'b3' }, without: 'accepted',
  },
  {
    name: 'a reversi placement into checkers (black f4 after three plies)',
    gameType: 'checkers', line: 'c3d4 f6g5 d4e5',
    foreign: { type: 'reversi', position: 'f4' }, without: 'sender wins',
  },
  {
    name: 'a chess move into checkers (a crowned king walks e1-d1)',
    gameType: 'checkers', line: 'c3b4 d6e5 d2c3 c7d6 e1d2 b6a5 g3f4 e5e1 e3f4',
    foreign: { type: 'chess', from: 'e1', to: 'd1' }, without: 'accepted',
  },
  {
    name: 'a checkers step into reversi (black b7-a6 after 52 plies)',
    gameType: 'reversi', line: REVERSI_LINE,
    foreign: { type: 'checkers', from: 'b7', to: 'a6' }, without: 'sender wins',
  },
  {
    name: 'a chess move into reversi (d5-d4)',
    gameType: 'reversi', line: '',
    foreign: { type: 'chess', from: 'd5', to: 'd4' }, without: 'refused',
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

async function stored(gameId: string) {
  return {
    game:  await fakeRedis.hgetall(`game:${gameId}`),
    clock: await fakeRedis.hgetall(`clock:${gameId}`),
  };
}

async function sideToMove(gameId: string): Promise<PlayerColor> {
  const { game } = await stored(gameId);
  return (JSON.parse(game.state) as { currentTurn: PlayerColor }).currentTurn;
}

const userFor = (color: PlayerColor) => (color === 'white' ? WHITE : BLACK);

/** A rated game, played through applyMove to the end of `line`. */
async function reach(gameType: GameType, line: string): Promise<string> {
  const gameId = await gameSessionService.createGame(
    WHITE, BLACK, 'white-name', 'black-name', 1400, 1000, gameType, 'blitz', true,
  );
  for (const token of line.split(' ').filter(Boolean)) {
    const mover = userFor(await sideToMove(gameId));
    const r = await gameSessionService.applyMove(gameId, mover, parse(gameType, token));
    expect(r.valid, `${gameType} line move ${token}: ${r.reason}`).toBe(true);
    expect(r.gameOver, `${gameType} line ended early at ${token}`).toBeFalsy();
  }
  return gameId;
}

/**
 * The foreign engine's own verdict on `move` in `state`, with the old
 * dispatch's reversi auto-pass. This is what applyMove used to return, so it
 * proves each case is one the guard, not the engine, has to refuse.
 */
function foreignVerdict(state: any, move: MovePayload, mover: PlayerColor): Case['without'] {
  let ok: boolean;
  let won = false;
  if (move.type === 'chess') {
    const r = ChessEngine.validateMove(state, move.from, move.to);
    ok = r.valid;
    won = !!r.resultingState?.isCheckmate;
  } else if (move.type === 'checkers') {
    const r = CheckersEngine.validateMove(state, move.from, move.to);
    ok = r.valid;
    won = !!r.resultingState?.isGameOver && r.resultingState.winner === mover;
  } else if (move.type === 'reversi') {
    const r = ReversiEngine.validateMove(state, move.position);
    ok = r.valid;
    won = !!r.resultingState?.isGameOver && r.resultingState.winner === mover;
  } else {
    throw new Error(`unexpected move ${JSON.stringify(move)}`);
  }
  return !ok ? 'refused' : won ? 'sender wins' : 'accepted';
}

// ── Service: applyMove ────────────────────────────────────────────────────────

describe('applyMove refuses a move of another game', () => {
  beforeEach(async () => { await fakeRedis.flushall(); });

  it.each(CASES)('$name', async ({ gameType, line, foreign, without }) => {
    const gameId = await reach(gameType, line);
    const mover = await sideToMove(gameId);
    const before = await stored(gameId);

    // The fixture still means something: without the guard, this is the outcome.
    expect(foreignVerdict(JSON.parse(before.game.state), foreign, mover)).toBe(without);

    const result = await gameSessionService.applyMove(gameId, userFor(mover), foreign);
    expect(result).toEqual({ valid: false, reason: 'Malformed move' });

    // Nothing moved: not the board, not the clock, not the game's status.
    const after = await stored(gameId);
    expect(after).toEqual(before);
    expect(after.game.status).toBe('active');
    expect(await gameSessionService.getLiveGameId(WHITE)).toBe(gameId);
    expect(await gameSessionService.getLiveGameId(BLACK)).toBe(gameId);

    // And the game goes on: the same player can still make a real move.
    const state = JSON.parse(after.game.state);
    const legal: MovePayload =
      gameType === 'chess'    ? { type: 'chess', ...ChessEngine.getAllLegalMoves(state)[0] } :
      gameType === 'checkers' ? (({ from, to }) => ({ type: 'checkers' as const, from, to }))(CheckersEngine.getAllLegalMoves(state)[0]) :
                                { type: 'reversi', position: ReversiEngine.getAllLegalMoves(state)[0] };
    const next = await gameSessionService.applyMove(gameId, userFor(mover), legal);
    expect(next.valid, next.reason).toBe(true);
  });

  it('checks the move against the game, whichever player sends it', async () => {
    // The off-turn player gets the same refusal: the type check does not wait
    // for the turn check to tell them apart.
    const gameId = await reach('chess', '');
    const result = await gameSessionService.applyMove(gameId, BLACK, { type: 'reversi', position: 'e3' });
    expect(result).toEqual({ valid: false, reason: 'Malformed move' });
  });
});

// ── Socket: the make_move path players actually use ───────────────────────────

let httpServer: HTTPServer;
let port: number;
const clients: ClientSocket[] = [];

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

describe('make_move: a foreign move cannot fake a rated win', () => {
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
    for (const c of clients) c.disconnect();
    clients.length = 0;
  });

  it('1.g4 h6 2.g5, then a reversi f4 from black: refused, the clocks untouched, the game live', async () => {
    const w = client(WHITE);
    const b = client(BLACK);
    await Promise.all([connected(w), connected(b)]);
    const gameId = await gameSessionService.createGame(
      WHITE, BLACK, 'white-name', 'black-name', 1400, 1000, 'chess', 'blitz', true,
    );
    const started = [once(w, 'game_started'), once(b, 'game_started')];
    w.emit('join_game', { gameId });
    b.emit('join_game', { gameId });
    await Promise.all(started);

    for (const [sock, token] of [[w, 'g2g4'], [b, 'h7h6'], [w, 'g4g5']] as const) {
      const seen = [once(w, 'move_made'), once(b, 'move_made')];
      sock.emit('make_move', { gameId, move: parse('chess', token) });
      await Promise.all(seen);
    }

    const before = await stored(gameId);
    const refused = once<{ code: string; message: string }>(b, 'error');
    const quietW = expectNoEvent(w, 'move_made', 400);
    const quietB = expectNoEvent(b, 'game_ended', 400);
    b.emit('make_move', { gameId, move: { type: 'reversi', position: 'f4' } });

    expect(await refused).toEqual({ code: 'ILLEGAL_MOVE', message: 'Malformed move' });
    await Promise.all([quietW, quietB]);

    const after = await stored(gameId);
    expect(after).toEqual(before); // board, clock hash and status, byte for byte
    expect(after.game.status).toBe('active');
  });
});
