import { redis, scanKeys } from '../config/redis';
import { ChessEngine, CheckersEngine, ReversiEngine } from '@finesse/shared';
import type {
  GameType, TimeControl, TimeControlConfig, MovePayload,
  GameResult, EndReason, PlayerColor, ClockSnapshot,
} from '@finesse/shared';
import { calculateNewRating } from '@finesse/shared';
import { clockService } from './clock.service';
import { persistenceService } from './persistence.service';
import { logger } from '../utils/logger';

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

const SQUARE_RE = /^[a-h][1-8]$/;
const PROMOTION_PIECES = new Set(['queen', 'rook', 'bishop', 'knight']);

/** Structural + range validation for a client-supplied move, before the engine. */
function isValidMovePayload(move: MovePayload): boolean {
  if (!move || typeof move !== 'object') return false;
  switch (move.type) {
    case 'chess':
      return SQUARE_RE.test(move.from) && SQUARE_RE.test(move.to)
        && (move.promotion === undefined || PROMOTION_PIECES.has(move.promotion));
    case 'checkers':
      return SQUARE_RE.test(move.from) && SQUARE_RE.test(move.to);
    case 'reversi':
      return SQUARE_RE.test(move.position);
    default:
      return false;
  }
}

export const gameSessionService = {
  async createGame(
    whiteId: string, blackId: string,
    whiteUsername: string, blackUsername: string,
    whiteRating: number, blackRating: number,
    gameType: GameType, timeControl: TimeControl,
    rated: boolean,
  ): Promise<string> {
    const gameId  = crypto.randomUUID();
    const config  = TIME_CONTROL_CONFIGS[timeControl];
    const initial =
      gameType === 'chess'    ? ChessEngine.newGame()    :
      gameType === 'checkers' ? CheckersEngine.newGame() :
      ReversiEngine.newGame();

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

    await redis.set(activeKey(whiteId), gameId, 'EX', GAME_TTL);
    await redis.set(activeKey(blackId), gameId, 'EX', GAME_TTL);

    await clockService.initClock(gameId, config);

    return gameId;
  },

  async getGameSession(gameId: string): Promise<GameSession | null> {
    const data = await redis.hgetall(gameKey(gameId));
    if (!data?.status) return null;
    return data as unknown as GameSession;
  },

  async getActiveGameId(userId: string): Promise<string | null> {
    return redis.get(activeKey(userId));
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
    await redis.del(activeKey(session.whiteId));
    await redis.del(activeKey(session.blackId));
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
      const r = ChessEngine.validateMove(state, move.from, move.to, false, move.promotion as import('@finesse/shared').PieceType | undefined);
      if (!r.valid) return { valid: false, reason: r.reason };
      newState = r.resultingState!;
      const s = newState as import('@finesse/shared').ChessGameState;
      if (s.isCheckmate) { gameOver = true; result = color === 'white' ? 'white_wins' : 'black_wins'; endReason = 'checkmate'; }
      else if (s.isStalemate || s.isDraw)  { gameOver = true; result = 'draw'; endReason = s.isStalemate ? 'stalemate' : 'fifty_move'; }

    } else if (move.type === 'checkers') {
      const r = CheckersEngine.validateMove(state, move.from, move.to);
      if (!r.valid) return { valid: false, reason: r.reason };
      newState = r.resultingState!;
      const s = newState as import('@finesse/shared').CheckersGameState;
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

    // Clean up Redis
    await redis.del(gameKey(gameId));
    await redis.del(`clock:${gameId}`);
    await redis.del(activeKey(session.whiteId));
    await redis.del(activeKey(session.blackId));

    return {
      white: { ratingBefore: whiteRatingBefore, ratingAfter: whiteRatingAfter, ratingDelta: whiteRatingAfter - whiteRatingBefore },
      black: { ratingBefore: blackRatingBefore, ratingAfter: blackRatingAfter, ratingDelta: blackRatingAfter - blackRatingBefore },
    };
  },
};
