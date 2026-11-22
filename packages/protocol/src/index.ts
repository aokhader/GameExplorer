// @gameexplorer/protocol: one definition of online play, for the Worker, its
// Durable Objects and both clients.
//
// The root holds what every party needs and nothing heavy: the wire format,
// the close codes, the time controls and the clock math. It must stay free of
// zod and the game engines, because the clients import it. The rest is behind
// subpaths:
//   - `@gameexplorer/protocol/schemas`  — zod schemas for every client payload;
//   - `@gameexplorer/protocol/adapters` — the online game adapters (zod + engines).
//
// Kept out of the `@gameexplorer/shared` barrel for the same reason: Metro does
// not tree-shake that barrel, so zod would load on every phone boot.
// `boundary.test.ts` enforces all of this.
export * from './frames';
export { TIME_CONTROL_CONFIGS } from './timeControls';
export { clock } from './clock';
export type { ClockState, DeductResult } from './clock';
export type {
  ClockSnapshot,
  EndReason,
  GameResult,
  GameType,
  PlayerColor,
  TimeControl,
  TimeControlConfig,
} from './sharedTypes';
