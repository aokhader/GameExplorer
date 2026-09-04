export * from './types';
export { GoEngine } from './engine';
export {
  getGroup,
  countLiberties,
  neighborPositions,
  playStone,
  getPlayablePositions,
  isSingleSpaceEye,
} from './moves';
export type { GoGroup } from './moves';
// `@gameexplorer/shared` is one flat barrel, so anything whose plain name is
// already taken (chess owns positionToCoordinates / coordinatesToPosition /
// isValidPosition) or is too generic to sit at the top level is exported under
// a Go-prefixed alias. The module keeps the short names internally.
export {
  boardKey as goBoardKey,
  coordinatesToPosition as goCoordinatesToPosition,
  createEmptyBoard as createEmptyGoBoard,
  getStoneAt,
  isValidPosition as isValidGoPosition,
  positionToCoordinates as goPositionToCoordinates,
} from './utils';
export type { NewGoGameOptions } from './utils';
export {
  getBestGoMove,
  analyzeGoPosition,
  goEloToConfig,
  GO_ANALYSIS_ITERATIONS,
} from './bot';
export type { GoBotMove, GoBotOptions, GoPositionEval } from './bot';
export * from './notation';
export {
  passAliveChains,
  isPassAlive,
} from './benson';
export {
  detectDeadStones,
  toggleDeadChain,
  MAX_REGION_POINTS,
  DEAD_STONE_NODE_LIMIT,
} from './deadStones';
export {
  solveTsumego,
  tryTsumego,
  TSUMEGO_PASS,
} from './tsumego';
export type { TsumegoSpec, TsumegoResult, TsumegoOptions } from './tsumego';
export {
  stateToGoBoardString,
  goBoardStringToState,
  GO_EMPTY_POSITION,
} from './boardString';
// `ownershipMap` and `scoreBoard` are too generic for the flat barrel — the same
// alias rule the utils re-exports above follow.
export {
  ownershipMap as goOwnershipMap,
  scoreBoard as goScoreBoard,
  boardWithoutStones as goBoardWithoutStones,
} from './scoring';
export type { GoPrisoners } from './scoring';
