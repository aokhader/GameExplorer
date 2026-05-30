export type ReversiColor = 'black' | 'white';

export interface ReversiDisc {
  color: ReversiColor;
}

export type ReversiBoard = (ReversiDisc | null)[][];

/**
 * A single move. `position` is the square where the disc was placed;
 * null means the player had no legal moves and passed their turn.
 * `flipped` lists every disc that was turned over.
 */
export interface ReversiMove {
  position: string | null;
  flipped: string[];
  color: ReversiColor;
}

export interface ReversiGameState {
  board: ReversiBoard;
  currentTurn: ReversiColor;
  moveHistory: ReversiMove[];
  isGameOver: boolean;
  winner: ReversiColor | null; // null = tie or game in progress
  consecutivePasses: number;   // game ends when this reaches 2
}

export interface ReversiMoveResult {
  valid: boolean;
  reason?: string;
  resultingState?: ReversiGameState;
}
