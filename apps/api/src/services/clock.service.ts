import { redis } from '../config/redis';
import type { ClockSnapshot, PlayerColor, TimeControlConfig } from '@gameexplorer/shared';

function clockKey(gameId: string) { return `clock:${gameId}`; }

export interface ClockState {
  white_ms:      number;
  black_ms:      number;
  active_color:  PlayerColor;
  last_tick_ts:  number;
  running:       boolean;
  increment_ms:  number;
  is_move_timer: boolean;
  move_timer_ms: number;
}

export const clockService = {
  async initClock(gameId: string, config: TimeControlConfig): Promise<void> {
    await redis.hset(clockKey(gameId), {
      white_ms:      String(config.initialMs),
      black_ms:      String(config.initialMs),
      active_color:  'white',
      last_tick_ts:  String(Date.now()),
      running:       '0',
      increment_ms:  String(config.incrementMs),
      is_move_timer: config.isMoveTimer ? '1' : '0',
      move_timer_ms: String(config.moveTimerMs ?? 0),
    });
  },

  async startClock(gameId: string): Promise<void> {
    const now = Date.now();
    await redis.hset(clockKey(gameId), {
      running:      '1',
      last_tick_ts: String(now),
    });
  },

  async pauseClock(gameId: string): Promise<void> {
    const state = await this.getRaw(gameId);
    if (!state || state.running === '0') return;
    const elapsed = Date.now() - Number(state.last_tick_ts);
    const color   = state.active_color as PlayerColor;
    const field   = color === 'white' ? 'white_ms' : 'black_ms';
    const current = Number(state[color === 'white' ? 'white_ms' : 'black_ms']);
    await redis.hset(clockKey(gameId), {
      [field]:      String(Math.max(0, current - elapsed)),
      running:      '0',
      last_tick_ts: String(Date.now()),
    });
  },

  /** Called after a validated move is applied. Deducts time, adds increment, switches active side. */
  async deductAndSwitch(gameId: string): Promise<{ clocks: ClockSnapshot; flagged: boolean }> {
    const state = await this.getRaw(gameId);
    if (!state) return { clocks: { white_ms: 0, black_ms: 0, active_color: 'white' }, flagged: false };

    const color      = state.active_color as PlayerColor;
    const opponent   = color === 'white' ? 'black' : 'white';
    const isMoveTimer = state.is_move_timer === '1';
    const now        = Date.now();

    let whiteMsNew = Number(state.white_ms);
    let blackMsNew = Number(state.black_ms);
    const increment = Number(state.increment_ms);

    if (state.running === '1') {
      const elapsed = now - Number(state.last_tick_ts);
      if (color === 'white') whiteMsNew -= elapsed;
      else blackMsNew -= elapsed;
    }

    const flagged = (color === 'white' ? whiteMsNew : blackMsNew) <= 0;
    if (flagged) {
      whiteMsNew = color === 'white' ? 0 : whiteMsNew;
      blackMsNew = color === 'black' ? 0 : blackMsNew;
    } else if (isMoveTimer) {
      // Reset the move timer for the player who just moved
      if (color === 'white') whiteMsNew = Number(state.move_timer_ms);
      else blackMsNew = Number(state.move_timer_ms);
    } else {
      // Add increment
      if (color === 'white') whiteMsNew += increment;
      else blackMsNew += increment;
    }

    const nextActive: PlayerColor = flagged ? color : opponent;
    await redis.hset(clockKey(gameId), {
      white_ms:     String(whiteMsNew),
      black_ms:     String(blackMsNew),
      active_color: nextActive,
      last_tick_ts: String(now),
      running:      flagged ? '0' : '1',
    });

    return {
      clocks: { white_ms: whiteMsNew, black_ms: blackMsNew, active_color: nextActive },
      flagged,
    };
  },

  async getSnapshot(gameId: string): Promise<ClockSnapshot> {
    const state = await this.getRaw(gameId);
    if (!state) return { white_ms: 0, black_ms: 0, active_color: 'white' };
    const color   = state.active_color as PlayerColor;
    let whiteMsNow = Number(state.white_ms);
    let blackMsNow = Number(state.black_ms);

    if (state.running === '1') {
      const elapsed = Date.now() - Number(state.last_tick_ts);
      if (color === 'white') whiteMsNow = Math.max(0, whiteMsNow - elapsed);
      else blackMsNow = Math.max(0, blackMsNow - elapsed);
    }

    return { white_ms: whiteMsNow, black_ms: blackMsNow, active_color: color };
  },

  async isRunning(gameId: string): Promise<boolean> {
    const running = await redis.hget(clockKey(gameId), 'running');
    return running === '1';
  },

  async getRaw(gameId: string): Promise<Record<string, string> | null> {
    const data = await redis.hgetall(clockKey(gameId));
    return Object.keys(data).length > 0 ? data : null;
  },
};
