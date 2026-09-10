'use client';

import React, { useCallback } from 'react';
import type {
  ChessGameState,
  CheckersGameState,
  GoColor,
  GoGameState,
  PuzzleGame,
  PuzzleMove,
  ReversiGameState,
} from '@gameexplorer/shared';
import type { LessonMark, PieceType, Position } from '@gameexplorer/shared';
import { ChessBoard } from '@/components/chess/ChessBoard';
import { CheckersBoard } from '@/components/checkers/CheckersBoard';
import { ReversiBoard } from '@/components/reversi/ReversiBoard';
import { GoBoard } from '@/components/go/GoBoard';
// `ChessBoard.tsx` does NOT import its own stylesheet — every route that renders
// it imports this instead (see chess/bot, chess/play, chess/training, …), and a
// route that forgets gets a board with `display: block`, i.e. 64 squares stacked
// in one 3840px-tall column. Imported here rather than in the three page files
// because this component is the single place a puzzle board is rendered, so it
// cannot drift out of sync with them. Checkers and reversi are Tailwind-only and
// need no equivalent.
import '@/components/chess/ChessBoard.css';

export interface InteractiveBoardProps {
  /**
   * Which game's board to draw. `PuzzleGame` and `LessonGame` are the same
   * union — the four games with a `PuzzleRules` binding — so one prop serves
   * both modes.
   */
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
  /**
   * Coached annotations for a lesson step: liberty counts, the square to play
   * on, the square not to.
   *
   * Handed straight through to the board, which draws them through its own
   * square-overlay layer. Puzzles never pass this.
   */
  marks?: LessonMark[];
  /**
   * How many moves the mode has rejected without moving the board.
   *
   * Only chess needs it — it is the one board that draws a move optimistically
   * — but it is declared here so a lesson screen does not have to know that.
   */
  rejectedMoves?: number;
}

/** Amber, matching the hint ring the mobile boards and training mode use. */
const HINT_COLOR = 'rgba(251, 191, 36, 0.9)';
const REFUTATION_COLOR = 'rgba(248, 113, 113, 0.9)';

/**
 * The right board for the game, wired for a mode that plays moves on it.
 *
 * Shared by puzzles and lessons rather than forked, because the per-game
 * dispatch below is exactly the kind of hand-maintained list this repo has
 * watched go stale six times — a fifth game would be added to one copy and not
 * the other, and nothing would fail to compile.
 *
 * The puzzle half needed no board changes at all: chess and checkers draw
 * `arrows`, reversi and Go have `hintPos`, and the refutation reuses those same
 * channels because it is drawn on the position where the opponent's answer
 * actually happens. The lesson half is what added `highlightSquares` to all
 * four boards — a mark vocabulary is only worth having if `danger` means the
 * same thing on a chess square and a Go intersection.
 */
export function InteractiveBoard({
  game,
  state,
  playerColor,
  onMove,
  hint,
  refutation,
  interactive = true,
  marks,
  rejectedMoves,
}: InteractiveBoardProps) {
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
        highlightSquares={marks}
        rejectedMoves={rejectedMoves}
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
        highlightSquares={marks}
        onMove={onCheckersMove}
        interactive={interactive}
      />
    );
  }

  if (game === 'go') {
    return (
      <GoBoard
        gameState={state as GoGameState}
        playerColor={playerColor as GoColor}
        // A placement has no origin square, so an arrow has nothing to point
        // from — the ring on the target point is the whole marker, exactly as
        // in reversi.
        hintPos={hint?.to ?? null}
        highlightPos={refutation?.to ?? null}
        highlightSquares={marks}
        onMove={onReversiMove}
        interactive={interactive}
      />
    );
  }

  return (
    <ReversiBoard
      gameState={state as ReversiGameState}
      playerColor={playerColor}
      hintPos={hint?.to ?? null}
      highlightPos={refutation?.to ?? null}
      highlightSquares={marks}
      onMove={onReversiMove}
      interactive={interactive}
    />
  );
}
