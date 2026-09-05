import { ChessEngine } from '../game-logic/chess/engine';
import { CheckersEngine } from '../game-logic/checkers/engine';
import { ReversiEngine } from '../game-logic/reversi/engine';
import { GoEngine } from '../game-logic/go/engine';
import type { ChessGameState, PieceType } from '../types/chess.types';
import type { CheckersGameState } from '../game-logic/checkers/types';
import type { ReversiGameState } from '../game-logic/reversi/types';
import type { GoGameState, GoScoring } from '../game-logic/go/types';

/**
 * Rebuild every position of a finished game from its move list.
 *
 * Review grades a move by comparing the position before it with the position
 * after, so it needs the whole timeline — but a *stored* game is only a list of
 * moves, and a game being played on web keeps just its current state. Replaying
 * is what turns either into the `S[]` the analysis loop wants.
 *
 * All three replayers are total: they stop at the first move the engine rejects
 * and return what they have. A truncated timeline reviews the part of the game
 * that is real, which is strictly better than throwing away a whole game because
 * its tail is malformed — and rows written by older versions of the app do exist.
 *
 * The move shapes are structural rather than imported from `@gameexplorer/db`:
 * shared cannot depend on db, and both the stored rows and the in-memory
 * histories satisfy these.
 */

/** `timeline[0]` is always the starting position, so N moves yield N+1 entries. */
export function replayChessMoves(
  moves: readonly { from: string; to: string; promotion?: PieceType }[],
): ChessGameState[] {
  const timeline: ChessGameState[] = [ChessEngine.newGame()];
  for (const move of moves) {
    const result = ChessEngine.validateMove(
      timeline[timeline.length - 1],
      move.from,
      move.to,
      // Never skip the game-end check: the terminal flags are what review reads
      // to score the final position from the rules instead of the engine.
      false,
      move.promotion,
    );
    if (!result.valid || !result.resultingState) break;
    timeline.push(result.resultingState);
  }
  return timeline;
}

export function replayCheckersMoves(
  moves: readonly { from: string; to: string }[],
): CheckersGameState[] {
  const timeline: CheckersGameState[] = [CheckersEngine.newGame()];
  for (const move of moves) {
    const result = CheckersEngine.validateMove(
      timeline[timeline.length - 1],
      move.from,
      move.to,
    );
    if (!result.valid || !result.resultingState) break;
    timeline.push(result.resultingState);
  }
  return timeline;
}

export function replayReversiMoves(
  moves: readonly { position: string | null }[],
): ReversiGameState[] {
  const timeline: ReversiGameState[] = [ReversiEngine.newGame()];
  for (const move of moves) {
    const previous = timeline[timeline.length - 1];
    // A null position is a pass — a forced non-decision, and the one "move" that
    // has no square to validate.
    if (move.position === null) {
      timeline.push(ReversiEngine.executePass(previous));
      continue;
    }
    const result = ReversiEngine.validateMove(previous, move.position);
    if (!result.valid || !result.resultingState) break;
    timeline.push(result.resultingState);
  }
  return timeline;
}

/**
 * Rebuild a Go game.
 *
 * Unlike the other three, this one needs the **ruleset** as well as the moves:
 * board size, komi and the scoring method are not derivable from a move list,
 * and replaying a 13x13 game on a 9x9 board would reject the first move played
 * outside the corner. They are parameters with the shipped defaults, so a row
 * saved before the ruleset was stored still reviews as the 9x9 game it was.
 */
export function replayGoMoves(
  moves: readonly { position: string | null }[],
  rules: { size?: number; komi?: number; scoring?: GoScoring } = {},
): GoGameState[] {
  const timeline: GoGameState[] = [GoEngine.newGame(rules)];
  for (const move of moves) {
    const previous = timeline[timeline.length - 1];
    // A pass is a real move in Go, and two in a row open the dead-stone review
    // rather than ending the game - so the phase can change without a stone.
    if (move.position === null) {
      timeline.push(GoEngine.executePass(previous));
      continue;
    }
    const result = GoEngine.validateMove(previous, move.position);
    if (!result.valid || !result.resultingState) break;
    timeline.push(result.resultingState);
  }
  return timeline;
}
