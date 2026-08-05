'use client';

import React from 'react';
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
  /** What the player just played, while it is being shown as wrong. */
  wrongMove?: PuzzleMove | null;
}

/** Amber, matching the hint ring the mobile boards and training mode use. */
const HINT_COLOR = 'rgba(251, 191, 36, 0.9)';
const WRONG_COLOR = 'rgba(248, 113, 113, 0.9)';

/**
 * The right board for the puzzle's game.
 *
 * **No board component needed changing for this.** All three already take
 * everything a puzzle wants: chess and checkers draw `arrows`, reversi has
 * `hintPos`. Interactivity needs no new prop either — the boards gate input on
 * `currentTurn`, so during the opponent's scripted reply they are inert, and
 * anything that slips through is answered with `'ignored'` by the runtime.
 */
export function PuzzleBoard({
  game,
  state,
  playerColor,
  onMove,
  hint,
  wrongMove,
}: PuzzleBoardProps) {
  if (game === 'chess') {
    const arrows = [
      ...(wrongMove ? [{ from: wrongMove.from, to: wrongMove.to, color: WRONG_COLOR }] : []),
      ...(hint ? [{ from: hint.from, to: hint.to, color: HINT_COLOR }] : []),
    ];
    return (
      <ChessBoard
        gameState={state as ChessGameState}
        playerColor={playerColor}
        arrows={arrows}
        onMove={(from: Position, to: Position, promotionPiece?: PieceType) =>
          onMove({ from, to, promotion: promotionPiece })
        }
      />
    );
  }

  if (game === 'checkers') {
    const arrows = [
      ...(wrongMove ? [{ from: wrongMove.from, to: wrongMove.to, color: WRONG_COLOR }] : []),
      ...(hint ? [{ from: hint.from, to: hint.to, color: HINT_COLOR }] : []),
    ];
    return (
      <CheckersBoard
        gameState={state as CheckersGameState}
        playerColor={playerColor}
        arrows={arrows}
        onMove={(from: string, to: string) => onMove({ from, to })}
      />
    );
  }

  return (
    <ReversiBoard
      gameState={state as ReversiGameState}
      playerColor={playerColor}
      // Reversi placements have no origin square, so an arrow has nothing to
      // point from — the ring on the target square is the whole hint.
      hintPos={hint?.to ?? null}
      highlightPos={wrongMove?.to ?? null}
      onMove={(position: string) => onMove({ from: position, to: position })}
    />
  );
}
