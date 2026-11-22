// The one door from this package into packages/shared's protocol types.
//
// Imported by relative path to the source module, never through the
// `@gameexplorer/shared` barrel. The barrel drags in the puzzle and lesson
// data, which Metro does not tree-shake and which fails the Workers typecheck
// (edge migration Phase 0, Q2). A relative path also needs no alias in any
// consumer: Next, Metro, Vitest and wrangler all resolve it as written.
//
// socket.types.ts has no imports of its own, so this pulls in nothing else.
export { EMOTES, ABORT_MOVE_LIMIT } from '../../shared/src/types/socket.types';
export type {
  ClockSnapshot,
  Emote,
  EndReason,
  GameResult,
  GameType,
  MovePayload,
  PlayerColor,
  TimeControl,
  TimeControlConfig,
} from '../../shared/src/types/socket.types';
