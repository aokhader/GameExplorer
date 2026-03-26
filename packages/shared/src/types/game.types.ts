export type GameType = 'chess' | 'checkers' | 'reversi';

export type GameMode = 'online' | 'bot' | 'local';

export type BotDifficulty = 'easy' | 'medium' | 'hard';

export type GameStatus = 'waiting' | 'active' | 'completed' | 'abandoned';

export type GameResult = 'white_wins' | 'black_wins' | 'draw';

export interface Move {
  from: string;
  to: string;
  piece?: string;
  captured?: string;
  promotion?: string;
}

export interface GameState {
  id: string;
  gameType: GameType;
  whitePlayer: string;
  blackPlayer: string;
  currentTurn: 'white' | 'black';
  board: any; // Game-specific board state
  moves: Move[];
  status: GameStatus;
  result?: GameResult;
  startedAt: Date;
  endedAt?: Date;
}