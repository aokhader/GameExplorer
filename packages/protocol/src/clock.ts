// Game clocks as pure functions of (state, now).
//
// A port of the Render server's clockService
// (`apps/api/src/services/clock.service.ts`) with Redis and `Date.now()` taken
// out: every function takes the current time and returns a new state, so a
// room can compute deadlines per event and tests need no fake timers. Nothing
// here schedules anything; the room turns `flagDeadline` into an alarm.
//
// The clock follows the position, never a fixed order. Start it on
// `adapter.sideToMove(initial)` and switch it to `adapter.sideToMove(next)`.
// Reversi breaks both of the old assumptions: black opens, and when the
// opponent has no move the turn comes straight back to the mover.
import type { ClockSnapshot, PlayerColor, TimeControlConfig } from './sharedTypes';

export interface ClockState {
  white_ms:      number;
  black_ms:      number;
  /** Whose clock runs, or ran last. */
  active_color:  PlayerColor;
  /** When `active_color`'s time was last charged. */
  last_tick_ts:  number;
  running:       boolean;
  increment_ms:  number;
  is_move_timer: boolean;
  move_timer_ms: number;
}

export interface DeductResult {
  state:   ClockState;
  clocks:  ClockSnapshot;
  /** The mover's time ran out before the move. The clock stops on them. */
  flagged: boolean;
}

/**
 * Time since the last tick. Never negative: a clock read before its own last
 * tick must not hand the player time back.
 */
function elapsedSince(state: ClockState, now: number): number {
  return Math.max(0, now - state.last_tick_ts);
}

function remainingOf(state: ClockState, color: PlayerColor): number {
  return color === 'white' ? state.white_ms : state.black_ms;
}

function withRemaining(state: ClockState, color: PlayerColor, ms: number): ClockState {
  return color === 'white' ? { ...state, white_ms: ms } : { ...state, black_ms: ms };
}

/**
 * A stopped clock with both players on the full allowance. `firstToMove` is
 * the side the opening position gives the move to; it has no default, because
 * the old default (white) was wrong for reversi.
 */
export function init(config: TimeControlConfig, firstToMove: PlayerColor, now: number): ClockState {
  return {
    white_ms:      config.initialMs,
    black_ms:      config.initialMs,
    active_color:  firstToMove,
    last_tick_ts:  now,
    running:       false,
    increment_ms:  config.incrementMs,
    is_move_timer: config.isMoveTimer,
    move_timer_ms: config.moveTimerMs ?? 0,
  };
}

/**
 * Starts the side to move's clock. Starting a running clock changes nothing:
 * resetting its tick would hand the player the time they had already used.
 */
export function start(state: ClockState, now: number): ClockState {
  if (state.running) return state;
  return { ...state, running: true, last_tick_ts: now };
}

/** Stops the clock, charging the side to move for the time since the last tick. */
export function pause(state: ClockState, now: number): ClockState {
  if (!state.running) return state;
  const color = state.active_color;
  const left = Math.max(0, remainingOf(state, color) - elapsedSince(state, now));
  return { ...withRemaining(state, color, left), running: false, last_tick_ts: now };
}

/**
 * Called after a legal move. Charges the mover's thinking time, adds their
 * increment (or resets their per-move budget), and hands the clock to
 * `nextToMove`: the side the new position gives the move to. That is usually
 * the opponent, but after a reversi auto-pass it is the mover again. `null`
 * means the position gives the move to nobody, and the clock stops.
 *
 * A mover whose time had already run out is flagged: their clock reads 0, the
 * clock stops, and it stays on them whatever `nextToMove` says.
 */
export function deductAndSwitch(state: ClockState, nextToMove: PlayerColor | null, now: number): DeductResult {
  const color = state.active_color;
  let left = remainingOf(state, color);
  if (state.running) left -= elapsedSince(state, now);

  const flagged = left <= 0;
  if (flagged) {
    left = 0;
  } else if (state.is_move_timer) {
    left = state.move_timer_ms;
  } else {
    left += state.increment_ms;
  }

  const next: ClockState = {
    ...withRemaining(state, color, left),
    active_color: flagged || nextToMove === null ? color : nextToMove,
    last_tick_ts: now,
    running:      !flagged && nextToMove !== null,
  };
  return { state: next, clocks: snapshot(next, now), flagged };
}

/** Both clocks as of `now`, for the wire. A running clock never reads below 0. */
export function snapshot(state: ClockState, now: number): ClockSnapshot {
  let white = state.white_ms;
  let black = state.black_ms;
  if (state.running) {
    const elapsed = elapsedSince(state, now);
    if (state.active_color === 'white') white = Math.max(0, white - elapsed);
    else black = Math.max(0, black - elapsed);
  }
  return { white_ms: white, black_ms: black, active_color: state.active_color };
}

/**
 * When the side to move runs out of time, or null while the clock is stopped.
 * The player is flagged at this instant: `now >= flagDeadline(state)`. A room
 * checks a client's `claim_flag` against it and sets its watchdog alarm by it.
 */
export function flagDeadline(state: ClockState): number | null {
  if (!state.running) return null;
  return state.last_tick_ts + remainingOf(state, state.active_color);
}

/** The clock functions as one object, which is how the package root exports them. */
export const clock = { init, start, pause, deductAndSwitch, snapshot, flagDeadline } as const;
