export type CheckersPieceType = 'man' | 'king';
export type CheckersColor = 'white' | 'black';

export interface CheckersPiece {
  type: CheckersPieceType;
  color: CheckersColor;
}

export type CheckersBoard = (CheckersPiece | null)[][];

/**
 * A single move in checkers. Captures may include multiple pieces (multi-jump chain).
 * `path` lists every landing square in order (including `to`), so multi-jump
 * intermediate squares are visible in the history.
 */
export interface CheckersMove {
  from: string;
  to: string;
  path: string[];      // all landing squares in jump order (final element === to)
  captures: string[];  // positions of every captured piece
  isKingPromotion?: boolean;
}

export interface CheckersGameState {
  board: CheckersBoard;
  currentTurn: CheckersColor;
  moveHistory: CheckersMove[];
  isGameOver: boolean;
  winner: CheckersColor | null; // null = draw or game still in progress
  movesSinceCapture: number;    // for 40-move draw rule
}

export interface CheckersMoveResult {
  valid: boolean;
  reason?: string;
  resultingState?: CheckersGameState;
}
