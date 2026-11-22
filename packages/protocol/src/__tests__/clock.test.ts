// The pure clock. The first describe is the Render server's clockService
// suite (apps/api/src/services/__tests__/multiplayer.services.test.ts) with
// its assertions kept; only the calls change, from Redis and Date.now() to
// state and an explicit `now`. The rest covers what the pure version adds.
import { describe, expect, it } from 'vitest';
import { deductAndSwitch, flagDeadline, init, pause, snapshot, start, type ClockState } from '../clock';
import { TIME_CONTROL_CONFIGS } from '../timeControls';
import type { TimeControlConfig } from '../sharedTypes';

const blitz: TimeControlConfig = { id: 'blitz', label: 'Blitz', description: '', initialMs: 180_000, incrementMs: 2000, isMoveTimer: false };
const moveTimer: TimeControlConfig = { id: 'movetime', label: 'Normal', description: '', initialMs: 30_000, incrementMs: 0, isMoveTimer: true, moveTimerMs: 30_000 };

const T0 = 1_700_000_000_000;
/** "The tiny elapsed time" between two Redis calls in the old tests. */
const TINY = 3;

describe('clockService, ported', () => {
  it('initializes both clocks with white to move and not running', () => {
    const clock = init(blitz, 'white', T0);
    const snap = snapshot(clock, T0 + TINY);
    expect(snap.white_ms).toBe(180_000);
    expect(snap.black_ms).toBe(180_000);
    expect(snap.active_color).toBe('white');
    expect(clock.running).toBe(false);
  });

  it('switches the active side and applies increment on a move', () => {
    const clock = start(init(blitz, 'white', T0), T0);
    const { clocks, flagged } = deductAndSwitch(clock, 'black', T0 + TINY);
    expect(flagged).toBe(false);
    expect(clocks.active_color).toBe('black');
    // White got the +2s increment minus the tiny elapsed time since start.
    expect(clocks.white_ms).toBeGreaterThan(180_000);
    expect(clocks.white_ms).toBeLessThanOrEqual(182_000);
    expect(clocks.white_ms).toBe(180_000 - TINY + 2000);
  });

  it('resets the mover’s clock to the per-move budget in move-timer mode', () => {
    const clock = start(init(moveTimer, 'white', T0), T0);
    const { clocks } = deductAndSwitch(clock, 'black', T0 + TINY);
    expect(clocks.white_ms).toBe(30_000);
    expect(clocks.active_color).toBe('black');
  });

  it('flags the active player when their time is exhausted', () => {
    const { flagged, clocks } = deductAndSwitch(init({ ...blitz, initialMs: 0 }, 'white', T0), 'black', T0 + TINY);
    expect(flagged).toBe(true);
    expect(clocks.active_color).toBe('white'); // side stays on the flagged player
  });

  // Reversi opens with black, and passes the turn straight back to the mover
  // when the opponent has no legal move. The clock follows the position, not a
  // fixed white-first, always-alternate assumption.
  it('starts on the clock of the side the position says moves first', () => {
    expect(snapshot(init(blitz, 'black', T0), T0).active_color).toBe('black');
  });

  it('keeps the mover’s clock running when the next move is theirs again', () => {
    const clock = start(init(blitz, 'black', T0), T0);
    const { clocks, flagged } = deductAndSwitch(clock, 'black', T0 + TINY);
    expect(flagged).toBe(false);
    expect(clocks.active_color).toBe('black');
    expect(clocks.white_ms).toBe(180_000); // white never had the move
    expect(clocks.black_ms).toBeGreaterThan(180_000); // black earned the +2s increment
    expect(clocks.black_ms).toBeLessThanOrEqual(182_000);
  });

  it('leaves a flagged player on move even when the next move would be theirs', () => {
    const { flagged, clocks } = deductAndSwitch(init({ ...blitz, initialMs: 0 }, 'black', T0), 'white', T0 + TINY);
    expect(flagged).toBe(true);
    expect(clocks.active_color).toBe('black');
  });
});

describe('the pure clock', () => {
  const running = (): ClockState => start(init(blitz, 'white', T0), T0);

  it('returns new states and never changes the one it was given', () => {
    const before = running();
    const copy = structuredClone(before);
    start(before, T0 + 5);
    pause(before, T0 + 5);
    deductAndSwitch(before, 'black', T0 + 5);
    snapshot(before, T0 + 5);
    expect(before).toEqual(copy);
  });

  it('charges only the side to move, and only while running', () => {
    const clock = running();
    expect(snapshot(clock, T0 + 10_000)).toEqual({ white_ms: 170_000, black_ms: 180_000, active_color: 'white' });
    const stopped = init(blitz, 'white', T0);
    expect(snapshot(stopped, T0 + 10_000)).toEqual({ white_ms: 180_000, black_ms: 180_000, active_color: 'white' });
  });

  it('never reads below zero, and never gives time back for a clock read early', () => {
    expect(snapshot(running(), T0 + 999_999).white_ms).toBe(0);
    expect(snapshot(running(), T0 - 5_000).white_ms).toBe(180_000);
    const { clocks } = deductAndSwitch(running(), 'black', T0 - 5_000);
    expect(clocks.white_ms).toBe(182_000); // the increment, and nothing more
  });

  it('starting a running clock changes nothing, so a second start gifts no time', () => {
    const clock = running();
    expect(start(clock, T0 + 30_000)).toBe(clock);
    expect(snapshot(start(clock, T0 + 30_000), T0 + 30_000).white_ms).toBe(150_000);
  });

  it('pausing charges the time used and stops the clock; pausing again changes nothing', () => {
    const paused = pause(running(), T0 + 4_000);
    expect(paused.running).toBe(false);
    expect(paused.white_ms).toBe(176_000);
    expect(snapshot(paused, T0 + 60_000).white_ms).toBe(176_000);
    expect(pause(paused, T0 + 60_000)).toBe(paused);
  });

  it('a move made before the start charges nothing but still earns the increment and starts the clock', () => {
    // As on Render: the first move starts the clock if nothing else has.
    const { state, clocks } = deductAndSwitch(init(blitz, 'white', T0), 'black', T0 + 7_000);
    expect(clocks.white_ms).toBe(182_000);
    expect(state.running).toBe(true);
    expect(state.last_tick_ts).toBe(T0 + 7_000);
  });

  it('a position that gives the move to nobody stops the clock on the mover', () => {
    const { state, clocks, flagged } = deductAndSwitch(running(), null, T0 + 1_000);
    expect(flagged).toBe(false);
    expect(clocks).toEqual({ white_ms: 181_000, black_ms: 180_000, active_color: 'white' });
    expect(state.running).toBe(false);
    expect(flagDeadline(state)).toBeNull();
  });

  it('a flagged clock reads zero and stops', () => {
    const { state, clocks } = deductAndSwitch(running(), 'black', T0 + 180_000);
    expect(clocks.white_ms).toBe(0);
    expect(state.running).toBe(false);
  });

  it('the move that lands one millisecond before the flag still counts', () => {
    const { flagged, clocks } = deductAndSwitch(running(), 'black', T0 + 179_999);
    expect(flagged).toBe(false);
    expect(clocks.white_ms).toBe(1 + 2000);
  });

  describe('flagDeadline', () => {
    it('is the instant the side to move reaches zero, and the flag falls exactly then', () => {
      const clock = running();
      const deadline = flagDeadline(clock)!;
      expect(deadline).toBe(T0 + 180_000);
      expect(deductAndSwitch(clock, 'black', deadline - 1).flagged).toBe(false);
      expect(deductAndSwitch(clock, 'black', deadline).flagged).toBe(true);
      expect(snapshot(clock, deadline).white_ms).toBe(0);
    });

    it('moves with the clock: after a move it is the opponent’s time from that move', () => {
      const { state } = deductAndSwitch(running(), 'black', T0 + 5_000);
      expect(flagDeadline(state)).toBe(T0 + 5_000 + 180_000);
    });

    it('is null while the clock is stopped', () => {
      expect(flagDeadline(init(blitz, 'white', T0))).toBeNull();
      expect(flagDeadline(pause(running(), T0 + 1))).toBeNull();
    });

    it('follows the per-move budget in move-timer mode', () => {
      const clock = start(init(moveTimer, 'white', T0), T0);
      const { state } = deductAndSwitch(clock, 'black', T0 + 20_000);
      expect(flagDeadline(state)).toBe(T0 + 20_000 + 30_000);
      const back = deductAndSwitch(state, 'white', T0 + 25_000).state;
      expect(flagDeadline(back)).toBe(T0 + 25_000 + 30_000); // white's budget was reset when they moved
    });
  });
});

describe('time controls', () => {
  it('are the Render server’s, unchanged', () => {
    expect(TIME_CONTROL_CONFIGS).toEqual({
      bullet:    { id: 'bullet',    label: 'Bullet',    description: '1 min',        initialMs: 60_000,    incrementMs: 0,    isMoveTimer: false },
      blitz:     { id: 'blitz',     label: 'Blitz',     description: '3 min +2s',    initialMs: 180_000,   incrementMs: 2000, isMoveTimer: false },
      rapid:     { id: 'rapid',     label: 'Rapid',     description: '10 min',       initialMs: 600_000,   incrementMs: 0,    isMoveTimer: false },
      classical: { id: 'classical', label: 'Classical', description: '30 min',       initialMs: 1_800_000, incrementMs: 0,    isMoveTimer: false },
      movetime:  { id: 'movetime',  label: 'Normal',    description: '30s per move', initialMs: 30_000,    incrementMs: 0,    isMoveTimer: true, moveTimerMs: 30_000 },
    });
  });

  it('each starts a clock with its own allowance', () => {
    for (const config of Object.values(TIME_CONTROL_CONFIGS)) {
      const clock = init(config, 'white', T0);
      expect(clock.white_ms).toBe(config.initialMs);
      expect(clock.is_move_timer).toBe(config.isMoveTimer);
    }
  });
});
