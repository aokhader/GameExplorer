export * from './types';
// The board's colouring, not just checkers' rule about where you may play: the
// chess board and both tutorial diagram boards read the same squares as dark.
// One definition, so a renderer can never disagree with the engine about which
// squares hold pieces.
export { isDarkSquare } from './utils';
export { CheckersEngine } from './engine';
export { getCheckersPremoveDestinations, isCheckersPremoveLegal } from './premove';
export type { CheckersPremove } from './premove';
export { getBestCheckersMove, analyzeCheckersPosition } from './weakEngine';
export type { CheckersBotMove, CheckersPositionEval } from './weakEngine';
export * from './pdn';
export * from './fen';
