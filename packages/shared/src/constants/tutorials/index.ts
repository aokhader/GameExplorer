import { CHESS_TUTORIAL } from './chess';
import { CHECKERS_TUTORIAL } from './checkers';
import { REVERSI_TUTORIAL } from './reversi';
import { LIQUIDATE_TUTORIAL } from './liquidate';
import type { GameTutorial, TutorialGame } from './types';

export * from './types';
export { CHESS_TUTORIAL, CHECKERS_TUTORIAL, REVERSI_TUTORIAL, LIQUIDATE_TUTORIAL };

/** All tutorials keyed by game — handy for dynamic routes. */
export const TUTORIALS: Record<TutorialGame, GameTutorial> = {
  chess: CHESS_TUTORIAL,
  checkers: CHECKERS_TUTORIAL,
  reversi: REVERSI_TUTORIAL,
  liquidate: LIQUIDATE_TUTORIAL,
};
