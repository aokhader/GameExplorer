import { redis, scanKeys } from '../config/redis';
import { ChessEngine, CheckersEngine, ReversiEngine } from '@gameexplorer/shared';
import type {
  GameType, TimeControl, TimeControlConfig, MovePayload,
  GameResult, EndReason, PlayerColor, ClockSnapshot,
} from '@gameexplorer/shared';
import { calculateNewRating } from '@gameexplorer/shared';
import { clockService } from './clock.service';
import { persistenceService } from './persistence.service';
import { logger } from '../utils/logger';
import { MoveSchema } from '../schemas';

const GAME_TTL = 86_400; // 24h safety net

export const TIME_CONTROL_CONFIGS: Record<TimeControl, TimeControlConfig> = {
  bullet:    { id: 'bullet',    label: 'Bullet',    description: '1 min',        initialMs: 60_000,    incrementMs: 0,    isMoveTimer: false },
  blitz:     { id: 'blitz',     label: 'Blitz',     description: '3 min +2s',    initialMs: 180_000,   incrementMs: 2000, isMoveTimer: false },
  rapid:     { id: 'rapid',     label: 'Rapid',     description: '10 min',       initialMs: 600_000,   incrementMs: 0,    isMoveTimer: false },
  classical: { id: 'classical', label: 'Classical', description: '30 min',       initialMs: 1_800_000, incrementMs: 0,    isMoveTimer: false },
  movetime:  { id: 'movetime',  label: 'Normal',    description: '30s per move', initialMs: 30_000,    incrementMs: 0,    isMoveTimer: true, moveTimerMs: 30_000 },
};

export interface GameSession {
  status:          string;
  gameType:        GameType;
  whiteId:         string;
  blackId:         string;
  whiteUsername:   string;
  blackUsername:   string;
  whiteRating:     string;
  blackRating:     string;
  state:           string; // JSON
  timeControl:     TimeControl;
  rated:           string; // '1' or '0'
  drawOfferedBy:   string; // userId or ''
}

export interface ApplyMoveResult {
  valid:    boolean;
  reason?:  string;
  newState?: unknown;
  gameOver?: boolean;
  result?:   GameResult;
  endReason?: EndReason;
}

function gameKey(gameId: string)  { return `game:${gameId}`; }
function activeKey(userId: string){ return `active_game:${userId}`; }

/**
 * Structural + range validation for a client-supplied move, before the engine.
 * The socket layer already checked it against the same schema; this keeps the
 * service safe for any caller that did not.
 */
function isValidMovePayload(move: MovePayload): boolean {
  return MoveSchema.safeParse(move).success;
}

/**
 * A fresh position for `gameType`. Throws on anything else rather than
 * quietly starting a reversi game, which is what the old fall-through did.
 */
export function newGameState(gameType: GameType) {
  switch (gameType) {
    case 'chess':    return ChessEngine.newGame();
    case 'checkers': return CheckersEngine.newGame();
    case 'reversi':  return ReversiEngine.newGame();
    default: throw new Error(`Unknown game type: ${String(gameType)}`);
  }
}

/**
 * A player named in a new game already has a live one. Every path that starts
 * a game goes through createGame, so this is where "one game at a time" holds.
 */
export class AlreadyInGameError extends Error {
  constructor(readonly userId: string) {
    super(`User ${userId} is already in a game`);
    this.name = 'AlreadyInGameError';
  }
}

export const gameSessionService = {
  /**
   * Creates a game and points both players at it.
   *
   * Two rules, both learned the hard way:
   *   - Everything that can reject its input runs before the first write. The
   *     old order wrote both players' `active_game:` pointers and only then
   *     threw on an unknown time control, leaving both "already in a game" for
   *     24 hours with no clock and no way to be told why (GX-06).
   *   - A player already in a live game cannot be put in a second one. Before,
   *     accepting an invite mid-game overwrote the pointer and orphaned the
   *     first game. Pointers are claimed with SET NX, and the game hash is
   *     written first, so two games starting at the same moment cannot both
   *     take the same player: the second sees a live game, or loses the claim.
   */
  async createGame(
    whiteId: string, blackId: string,
    whiteUsername: string, blackUsername: string,
    whiteRating: number, blackRating: number,
    gameType: GameType, timeControl: TimeControl,
    rated: boolean,
  ): Promise<string> {
    const config = TIME_CONTROL_CONFIGS[timeControl];
    if (!config) throw new Error(`Unknown time control: ${String(timeControl)}`);
    const initial = newGameState(gameType);
    if (whiteId === blackId) throw new Error('A player cannot play themselves');

    for (const id of [whiteId, blackId]) {
      const current = await redis.get(activeKey(id));
      if (!current) continue;
      if (await this.isLive(current)) throw new AlreadyInGameError(id);
      // Stale: that game ended, or never finished being created. Clearing it
      // here is what keeps a leftover pointer from blocking the NX claim below.
      await this.releasePointer(id, current);
    }

    const gameId = crypto.randomUUID();
    try {
      await redis.hset(gameKey(gameId), {
        status:        'active',
        gameType,
        whiteId,
        blackId,
        whiteUsername,
        blackUsername,
        whiteRating:   String(whiteRating),
        blackRating:   String(blackRating),
        state:         JSON.stringify(initial),
        timeControl,
        rated:         rated ? '1' : '0',
        drawOfferedBy: '',
      });
      await redis.expire(gameKey(gameId), GAME_TTL);

      for (const id of [whiteId, blackId]) {
        const claimed = await redis.set(activeKey(id), gameId, 'EX', GAME_TTL, 'NX');
        if (claimed !== 'OK') throw new AlreadyInGameError(id);
      }

      await clockService.initClock(gameId, config);
    } catch (err) {
      // A claim was lost or a write failed partway (Redis full, connection
      // lost). Undo whatever landed so nobody is pointed at a half-made game.
      await Promise.allSettled([
        redis.del(gameKey(gameId)),
        redis.del(`clock:${gameId}`),
        this.releasePointer(whiteId, gameId),
        this.releasePointer(blackId, gameId),
      ]);
      throw err;
    }

    return gameId;
  },

  async getGameSession(gameId: string): Promise<GameSession | null> {
    const data = await redis.hgetall(gameKey(gameId));
    if (!data?.status) return null;
    return data as unknown as GameSession;
  },

  /** The raw pointer. It can outlive its game; use getLiveGameId to gate on it. */
  async getActiveGameId(userId: string): Promise<string | null> {
    return redis.get(activeKey(userId));
  },

  /**
   * The game `userId` is playing right now, or null. A pointer whose game has
   * ended or no longer exists does not count: gating on the bare pointer, as
   * join_queue did, let a leftover one lock a player out for its 24-hour TTL.
   */
  async getLiveGameId(userId: string): Promise<string | null> {
    const gameId = await redis.get(activeKey(userId));
    return gameId && await this.isLive(gameId) ? gameId : null;
  },

  async isLive(gameId: string): Promise<boolean> {
    return (await redis.hget(gameKey(gameId), 'status')) === 'active';
  },

  /**
   * Deletes `userId`'s pointer only if it still names `gameId`, so ending one
   * game can never unhook a player from the next. GET then DEL is not atomic;
   * the window is one local round trip, and the fake Redis the tests use has
   * no script support to do better.
   */
  async releasePointer(userId: string, gameId: string): Promise<void> {
    if (await redis.get(activeKey(userId)) === gameId) await redis.del(activeKey(userId));
  },

  /**
   * Lists currently-active games so spectators can discover something to watch.
   * Scans the `game:*` keyspace (SCAN, non-blocking) and returns a lightweight
   * summary per live game — never the full board state.
   */
  async listActiveGames(limit = 50): Promise<Array<{
    gameId:      string;
    gameType:    GameType;
    timeControl: TimeControl;
    white:       { username: string; rating: number };
    black:       { username: string; rating: number };
    moveCount:   number;
  }>> {
    const keys = await scanKeys('game:*');
    const games: Array<{
      gameId: string; gameType: GameType; timeControl: TimeControl;
      white: { username: string; rating: number };
      black: { username: string; rating: number };
      moveCount: number;
    }> = [];

    for (const key of keys) {
      if (games.length >= limit) break;
      let data: Record<string, string>;
      try {
        data = await redis.hgetall(key); // skips non-hash keys via the catch below
      } catch {
        continue; // not a game hash (e.g. a cached JSON string under game:*)
      }
      if (data?.status !== 'active') continue;

      const session = data as unknown as GameSession;
      games.push({
        gameId:      key.slice('game:'.length),
        gameType:    session.gameType,
        timeControl: session.timeControl,
        white:       { username: session.whiteUsername, rating: Number(session.whiteRating) },
        black:       { username: session.blackUsername, rating: Number(session.blackRating) },
        moveCount:   this.getMoveCount(session),
      });
    }

    return games;
  },

  /** Number of moves played so far (works for all three game states). */
  getMoveCount(session: GameSession): number {
    try {
      const state = JSON.parse(session.state) as { moveHistory?: unknown[] };
      return state.moveHistory?.length ?? 0;
    } catch {
      return 0;
    }
  },

  /**
   * Aborts a game with no result and no rating change (early-abort / no-contest).
   * Tears down all Redis state but, unlike endGame, persists nothing and does
   * not touch ratings.
   */
  async abortGame(gameId: string): Promise<void> {
    const session = await this.getGameSession(gameId);
    if (!session) return;

    await redis.hset(gameKey(gameId), 'status', 'aborted');
    await clockService.pauseClock(gameId);

    await redis.del(gameKey(gameId));
    await redis.del(`clock:${gameId}`);
    // Only if they still name this game: a player may already be in the next.
    await this.releasePointer(session.whiteId, gameId);
    await this.releasePointer(session.blackId, gameId);
  },

  async applyMove(gameId: string, userId: string, move: MovePayload): Promise<ApplyMoveResult> {
    const session = await this.getGameSession(gameId);
    if (!session || session.status !== 'active') {
      return { valid: false, reason: 'Game not found or already ended' };
    }

    // ── Authorization ────────────────────────────────────────────────────────
    // The engine only checks that a move is *legal for the side to move*. It is
    // the caller's job to check that this *user* is allowed to make it. Without
    // these two guards, a participant could play their opponent's moves, and any
    // authenticated socket could inject moves into a game it isn't part of.
    if (session.whiteId !== userId && session.blackId !== userId) {
      return { valid: false, reason: 'Not a participant' };
    }
    const color: PlayerColor = session.whiteId === userId ? 'white' : 'black';

    // ── Payload validation ───────────────────────────────────────────────────
    // Reject malformed coordinates before they reach the engines, where an
    // off-board index (e.g. "z9") would throw and surface as an unhandled
    // rejection.
    if (!isValidMovePayload(move)) {
      return { valid: false, reason: 'Malformed move' };
    }

    const state = JSON.parse(session.state);

    // Sender may only move the side whose turn it is.
    if (state.currentTurn !== color) {
      return { valid: false, reason: 'Not your turn' };
    }

    let newState: unknown;
    let gameOver = false;
    let result: GameResult | undefined;
    let endReason: EndReason | undefined;

    if (move.type === 'chess') {
      const r = ChessEngine.validateMove(state, move.from, move.to, false, move.promotion as import('@gameexplorer/shared').PieceType | undefined);
      if (!r.valid) return { valid: false, reason: r.reason };
      newState = r.resultingState!;
      const s = newState as import('@gameexplorer/shared').ChessGameState;
      if (s.isCheckmate) { gameOver = true; result = color === 'white' ? 'white_wins' : 'black_wins'; endReason = 'checkmate'; }
      else if (s.isStalemate || s.isDraw)  { gameOver = true; result = 'draw'; endReason = s.isStalemate ? 'stalemate' : 'fifty_move'; }

    } else if (move.type === 'checkers') {
      const r = CheckersEngine.validateMove(state, move.from, move.to);
      if (!r.valid) return { valid: false, reason: r.reason };
      newState = r.resultingState!;
      const s = newState as import('@gameexplorer/shared').CheckersGameState;
      if (s.isGameOver) {
        gameOver = true;
        result   = s.winner === 'white' ? 'white_wins' : s.winner === 'black' ? 'black_wins' : 'draw';
        endReason = s.winner ? 'no_moves' : 'fifty_move';
      }

    } else if (move.type === 'reversi') {
      const r = ReversiEngine.validateMove(state, move.position);
      if (!r.valid) return { valid: false, reason: r.reason };
      let s = r.resultingState!;
      // Auto-pass if the next player has no moves
      if (!s.isGameOver && ReversiEngine.mustPass(s)) {
        s = ReversiEngine.executePass(s);
      }
      newState = s;
      if (s.isGameOver) {
        gameOver = true;
        result   = s.winner === 'white' ? 'white_wins' : s.winner === 'black' ? 'black_wins' : 'draw';
        endReason = s.winner ? 'board_full' : 'board_full';
      }
    } else {
      return { valid: false, reason: 'Unknown move type' };
    }

    await redis.hset(gameKey(gameId), 'state', JSON.stringify(newState));

    return { valid: true, newState, gameOver, result, endReason };
  },

  async setDrawOffered(gameId: string, userId: string): Promise<void> {
    await redis.hset(gameKey(gameId), 'drawOfferedBy', userId);
  },

  async clearDrawOffer(gameId: string): Promise<void> {
    await redis.hset(gameKey(gameId), 'drawOfferedBy', '');
  },

  async endGame(
    gameId: string,
    result: GameResult,
    reason: EndReason,
  ): Promise<{ white: { ratingBefore: number; ratingAfter: number; ratingDelta: number }; black: { ratingBefore: number; ratingAfter: number; ratingDelta: number } } | null> {
    // Atomic end-of-game guard. Several paths can end the same game at nearly
    // the same instant (a checkmate move and the clock-flag loop, two rapid
    // resign/accept events). Only the caller that wins this SET NX proceeds to
    // compute/persist ratings and tear down state; everyone else gets null and
    // must not re-emit or double-apply the rating change.
    const acquired = await redis.set(`endlock:${gameId}`, '1', 'EX', 300, 'NX');
    if (!acquired) return null;

    const session = await this.getGameSession(gameId);
    if (!session) return null;

    const rated = session.rated !== '0'; // default rated for legacy sessions
    const whiteRatingBefore = Number(session.whiteRating);
    const blackRatingBefore = Number(session.blackRating);
    const whiteOutcome = result === 'white_wins' ? 'win' : result === 'draw' ? 'draw' : 'loss';
    const blackOutcome = result === 'black_wins' ? 'win' : result === 'draw' ? 'draw' : 'loss';

    // Games-played drives the K-factor (32 provisional, 20 established). Fetched
    // server-side so ratings actually stabilise instead of always using K=32.
    const [whiteGames, blackGames] = rated
      ? await Promise.all([
          persistenceService.getGamesPlayed(session.whiteId, session.gameType),
          persistenceService.getGamesPlayed(session.blackId, session.gameType),
        ])
      : [0, 0];

    // Unrated games end with no rating change
    const whiteRatingAfter = rated ? calculateNewRating(whiteRatingBefore, blackRatingBefore, whiteOutcome, whiteGames) : whiteRatingBefore;
    const blackRatingAfter = rated ? calculateNewRating(blackRatingBefore, whiteRatingBefore, blackOutcome, blackGames) : blackRatingBefore;

    // Mark status in Redis before cleanup (so concurrent calls are safe)
    await redis.hset(gameKey(gameId), 'status', 'ended');
    await clockService.pauseClock(gameId);

    // Server-authoritative persistence (ratings + game records for BOTH
    // players) — must not depend on either client still being connected.
    // Failures are logged but never block Redis teardown.
    try {
      await persistenceService.persistGameResult({
        session, result, reason, rated,
        white: { ratingBefore: whiteRatingBefore, ratingAfter: whiteRatingAfter },
        black: { ratingBefore: blackRatingBefore, ratingAfter: blackRatingAfter },
      });
    } catch (err) {
      logger.error(`Failed to persist game ${gameId}:`, err);
    }

    // Clean up Redis. The pointers go only if they still name this game: a
    // player is free to queue once the status says "ended", which is before
    // the slow persistence above finishes, so they may already be in the next.
    await redis.del(gameKey(gameId));
    await redis.del(`clock:${gameId}`);
    await this.releasePointer(session.whiteId, gameId);
    await this.releasePointer(session.blackId, gameId);

    return {
      white: { ratingBefore: whiteRatingBefore, ratingAfter: whiteRatingAfter, ratingDelta: whiteRatingAfter - whiteRatingBefore },
      black: { ratingBefore: blackRatingBefore, ratingAfter: blackRatingAfter, ratingDelta: blackRatingAfter - blackRatingBefore },
    };
  },
};
