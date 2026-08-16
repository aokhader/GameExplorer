/**
 * The analysis contract moved to `@gameexplorer/shared` so that web's review
 * panel and mobile's review screen grade a game with one implementation — the
 * White-positive normalisation and the terminal-position scoring were both
 * device-caught bugs, and a second copy is a second place to reintroduce them.
 *
 * Re-exported from here because this module's call sites predate the move.
 */
export type {
  AnalysisAdapter,
  EngineMove,
  GradeThresholds,
  MoveGrade,
  PositionEval,
} from '@gameexplorer/shared';
export { gradeForLoss, logisticShare } from '@gameexplorer/shared';
