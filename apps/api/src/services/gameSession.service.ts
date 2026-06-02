import { redis } from '../config/redis';
import { ChessEngine, CheckersEngine, ReversiEngine } from '@gameexplorer/shared';
import type {
  GameType, TimeControl, TimeControlConfig, MovePayload,
  GameResult, EndReason, PlayerColor, ClockSnapshot,
} from '@gameexplorer/shared';
import { calculateNewRating } from '@gameexplorer/shared';
import { clockService } from './clock.service';

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

export const gameSessionService = {
  async createGame(
    whiteId: string, blackId: string,
    whiteUsername: string, blackUsername: string,
    whiteRating: number, blackRating: number,
    gameType: GameType, timeControl: TimeControl,
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

  async applyMove(gameId: string, userId: string, move: MovePayload): Promise<ApplyMoveResult> {
    const session = await this.getGameSession(gameId);
    if (!session || session.status !== 'active') {
      return { valid: false, reason: 'Game not found or already ended' };
    }

    const color: PlayerColor = session.whiteId === userId ? 'white' : 'black';
    const state = JSON.parse(session.state);
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
  ): Promise<{ white: { ratingBefore: number; ratingAfter: number; ratingDelta: number }; black: { ratingBefore: number; ratingAfter: number; ratingDelta: number } }> {
    const session = await this.getGameSession(gameId);
    if (!session) return { white: { ratingBefore: 1200, ratingAfter: 1200, ratingDelta: 0 }, black: { ratingBefore: 1200, ratingAfter: 1200, ratingDelta: 0 } };

    const whiteRatingBefore = Number(session.whiteRating);
    const blackRatingBefore = Number(session.blackRating);
    const whiteOutcome = result === 'white_wins' ? 'win' : result === 'draw' ? 'draw' : 'loss';
    const blackOutcome = result === 'black_wins' ? 'win' : result === 'draw' ? 'draw' : 'loss';

    const whiteRatingAfter = calculateNewRating(whiteRatingBefore, blackRatingBefore, whiteOutcome, 0);
    const blackRatingAfter = calculateNewRating(blackRatingBefore, whiteRatingBefore, blackOutcome, 0);

    // Mark status in Redis before cleanup (so concurrent calls are safe)
    await redis.hset(gameKey(gameId), 'status', 'ended');
    await clockService.pauseClock(gameId);

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
