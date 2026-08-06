'use client';

import React, { useCallback } from 'react';
import type {
  ChessGameState,
  CheckersGameState,
  PuzzleGame,
  PuzzleMove,
  ReversiGameState,
} from '@gameexplorer/shared';
import type { PieceType, Position } from '@gameexplorer/shared';
import { ChessBoard } from '@/components/chess/ChessBoard';
import { CheckersBoard } from '@/components/checkers/CheckersBoard';
import { ReversiBoard } from '@/components/reversi/ReversiBoard';
// `ChessBoard.tsx` does NOT import its own stylesheet — every route that renders
// it imports this instead (see chess/bot, chess/play, chess/training, …), and a
// route that forgets gets a board with `display: block`, i.e. 64 squares stacked
// in one 3840px-tall column. Imported here rather than in the three page files
// because this component is the single place a puzzle board is rendered, so it
// cannot drift out of sync with them. Checkers and reversi are Tailwind-only and
// need no equivalent.
import '@/components/chess/ChessBoard.css';

export interface PuzzleBoardProps {
  game: PuzzleGame;
  /** The run's state — typed opaquely here and narrowed per game below. */
  state: unknown;
  playerColor: 'white' | 'black';
  onMove: (move: PuzzleMove) => void;
  /** The solution move, once the player has asked for it. */
  hint?: PuzzleMove | null;
  /**
   * The opponent's answer to a wrong move — the move that refutes it.
   *
   * Note this is THEIR move, not the player's. Marking the player's own move in
   * red said only "that was wrong", which the status banner already said; the
   * board is the one place that can show *why*, and by the time this is set the
   * position on screen is the one where their answer lands.
   */
  refutation?: PuzzleMove | null;
  /** History or refutation branch is on screen — no input allowed. */
  interactive?: boolean;
}

/** Amber, matching the hint ring the mobile boards and training mode use. */
const HINT_COLOR = 'rgba(251, 191, 36, 0.9)';
const REFUTATION_COLOR = 'rgba(248, 113, 113, 0.9)';

/**
 * The right board for the puzzle's game.
 *
 * **No board component needed changing for this.** All three already take
 * everything a puzzle wants: chess and checkers draw `arrows`, reversi has
 * `hintPos`. The refutation reuses the same two channels, because it is drawn
 * on the position where the opponent's answer actually happens — the branch is
 * played out on the board rather than described beside it.
 */
export function PuzzleBoard({
  game,
  state,
  playerColor,
  onMove,
  hint,
  refutation,
  interactive = true,
}: PuzzleBoardProps) {
  // The boards gate input on `currentTurn` and the runtime answers stray moves
  // with `'ignored'`, but neither helps while a refutation is on screen: it is
  // the player's turn again in that branch, so without this the board would
  // happily accept a move in a position that is not the puzzle.
  //
  // `interactive` is also handed to the boards themselves. Swallowing the
  // callback alone left pieces draggable on a dead board, which reads as the
  // move having been rejected rather than never offered.
  //
  // Each board's adapter is memoized on `onMove`, which `usePuzzle` already
  // keeps stable. Inline arrows here were rebuilt every render and defeated the
  // `React.memo` on all three boards on every state change the hook made.
  const onChessMove = useCallback(
    (from: Position, to: Position, promotionPiece?: PieceType) =>
      onMove({ from, to, promotion: promotionPiece }),
    [onMove],
  );
  const onCheckersMove = useCallback(
    (from: string, to: string) => onMove({ from, to }),
    [onMove],
  );
  const onReversiMove = useCallback(
    (position: string) => onMove({ from: position, to: position }),
    [onMove],
  );

  if (game === 'chess') {
    const arrows = [
      ...(refutation
        ? [{ from: refutation.from, to: refutation.to, color: REFUTATION_COLOR }]
        : []),
      ...(hint ? [{ from: hint.from, to: hint.to, color: HINT_COLOR }] : []),
    ];
    return (
      <ChessBoard
        gameState={state as ChessGameState}
        playerColor={playerColor}
        arrows={arrows}
        interactive={interactive}
        onMove={onChessMove}
      />
    );
  }

  if (game === 'checkers') {
    const arrows = [
      ...(refutation
        ? [{ from: refutation.from, to: refutation.to, color: REFUTATION_COLOR }]
        : []),
      ...(hint ? [{ from: hint.from, to: hint.to, color: HINT_COLOR }] : []),
    ];
    return (
      <CheckersBoard
        gameState={state as CheckersGameState}
        playerColor={playerColor}
        arrows={arrows}
        onMove={onCheckersMove}
        interactive={interactive}
      />
    );
  }

  return (
    <ReversiBoard
      gameState={state as ReversiGameState}
      playerColor={playerColor}
      // Reversi placements have no origin square, so an arrow has nothing to
      // point from — the ring on the target square is the whole marker.
      hintPos={hint?.to ?? null}
      highlightPos={refutation?.to ?? null}
      onMove={onReversiMove}
      interactive={interactive}
    />
  );
}
