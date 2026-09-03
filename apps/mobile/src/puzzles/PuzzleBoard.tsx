import React from 'react';
import type {
  CheckersGameState,
  ChessGameState,
  PuzzleGame,
  PuzzleMove,
  ReversiGameState,
} from '@finesse/shared';
import { ChessBoard } from '@/board/ChessBoard';
import { CheckersBoard } from '@/board/CheckersBoard';
import { ReversiBoard } from '@/board/ReversiBoard';

export interface PuzzleBoardProps {
  game: PuzzleGame;
  /** The position to draw — typed opaquely here and narrowed per game below. */
  state: unknown;
  playerColor: 'white' | 'black';
  /** False during the reply beat, on a refutation, and while reading history. */
  interactive: boolean;
  onMove: (move: PuzzleMove) => void;
  /** The solution move, once the player has asked for it. */
  hint?: PuzzleMove | null;
  /** The opponent's answer to a wrong move, drawn on the branch it happens in. */
  refutation?: PuzzleMove | null;
}

/**
 * The right board for the puzzle's game.
 *
 * **No board component needed changing for this**, exactly as on web: all three
 * already take `hintMove` / `hintPos` (the amber training rings) and
 * `interactive`, and their rules come from the shared engines, so a puzzle
 * position is just a position.
 *
 * Two deliberate differences from the web sibling:
 *
 * - **The refutation is not drawn in red.** Web has an `arrows` channel and
 *   colours the opponent's answer with it; these boards draw no arrows, and
 *   their one marker is the amber ring that means "play this". Reusing it for
 *   the opponent's move would invert its meaning. It needs no marker anyway:
 *   the branch is played out on the board, so chess and checkers already
 *   highlight the answer as their last move, and reversi is handed the square
 *   through `highlightPos` — the same ring it uses for the last disc placed.
 * - **Inert unless it is the player's move.** `applyPlayerMove` already answers
 *   stray input with `'ignored'`, but on a phone the board is most of the screen
 *   and a dead tap reads as a broken app. Switching `interactive` off during the
 *   reply beat, on a refutation, while stepping back through the line and once
 *   solved means the board says no the way the rest of the app does — with the
 *   boards' own illegal-move cue.
 */
export function PuzzleBoard({
  game,
  state,
  playerColor,
  interactive,
  onMove,
  hint,
  refutation,
}: PuzzleBoardProps) {
  if (game === 'chess') {
    return (
      <ChessBoard
        gameState={state as ChessGameState}
        playerColor={playerColor}
        interactive={interactive}
        hintMove={hint ? { from: hint.from, to: hint.to } : null}
        onMove={(from, to, promotion) => onMove({ from, to, promotion })}
      />
    );
  }

  if (game === 'checkers') {
    return (
      <CheckersBoard
        gameState={state as CheckersGameState}
        playerColor={playerColor}
        interactive={interactive}
        hintMove={hint ? { from: hint.from, to: hint.to } : null}
        onMove={(from, to) => onMove({ from, to })}
      />
    );
  }

  return (
    <ReversiBoard
      gameState={state as ReversiGameState}
      playerColor={playerColor}
      interactive={interactive}
      // Reversi placements have no origin square, so `to` is the whole move.
      hintPos={hint?.to ?? null}
      highlightPos={refutation?.to ?? null}
      onMove={(position) => onMove({ from: position, to: position })}
    />
  );
}
