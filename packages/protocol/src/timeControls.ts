import type { TimeControl, TimeControlConfig } from './sharedTypes';

/**
 * The online time controls, ported unchanged from the Render server
 * (`apps/api/src/services/gameSession.service.ts`). Typed by `TimeControl`, so
 * adding one to the protocol without a config here is a type error.
 */
export const TIME_CONTROL_CONFIGS: Record<TimeControl, TimeControlConfig> = {
  bullet:    { id: 'bullet',    label: 'Bullet',    description: '1 min',        initialMs: 60_000,    incrementMs: 0,    isMoveTimer: false },
  blitz:     { id: 'blitz',     label: 'Blitz',     description: '3 min +2s',    initialMs: 180_000,   incrementMs: 2000, isMoveTimer: false },
  rapid:     { id: 'rapid',     label: 'Rapid',     description: '10 min',       initialMs: 600_000,   incrementMs: 0,    isMoveTimer: false },
  classical: { id: 'classical', label: 'Classical', description: '30 min',       initialMs: 1_800_000, incrementMs: 0,    isMoveTimer: false },
  movetime:  { id: 'movetime',  label: 'Normal',    description: '30s per move', initialMs: 30_000,    incrementMs: 0,    isMoveTimer: true, moveTimerMs: 30_000 },
};
