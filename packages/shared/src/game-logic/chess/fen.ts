import type { ChessGameState, Board, Piece } from '../../types/chess.types';
import { ChessEngine } from './engine';

const PIECE_TO_FEN: Record<string, string> = {
  'white-pawn': 'P', 'white-knight': 'N', 'white-bishop': 'B',
  'white-rook': 'R', 'white-queen': 'Q', 'white-king': 'K',
  'black-pawn': 'p', 'black-knight': 'n', 'black-bishop': 'b',
  'black-rook': 'r', 'black-queen': 'q', 'black-king': 'k',
};

const FEN_TO_PIECE: Record<string, Piece> = {
  P: { type: 'pawn', color: 'white' }, N: { type: 'knight', color: 'white' },
  B: { type: 'bishop', color: 'white' }, R: { type: 'rook', color: 'white' },
  Q: { type: 'queen', color: 'white' }, K: { type: 'king', color: 'white' },
  p: { type: 'pawn', color: 'black' }, n: { type: 'knight', color: 'black' },
  b: { type: 'bishop', color: 'black' }, r: { type: 'rook', color: 'black' },
  q: { type: 'queen', color: 'black' }, k: { type: 'king', color: 'black' },
};

export function stateToFen(state: ChessGameState): string {
  const rows: string[] = [];
  for (let row = 7; row >= 0; row--) {
    let rowStr = '';
    let emptyCount = 0;
    for (let col = 0; col < 8; col++) {
      const piece = state.board[row][col];
      if (piece) {
        if (emptyCount > 0) { rowStr += emptyCount; emptyCount = 0; }
        rowStr += PIECE_TO_FEN[`${piece.color}-${piece.type}`];
      } else {
        emptyCount++;
      }
    }
    if (emptyCount > 0) rowStr += emptyCount;
    rows.push(rowStr);
  }

  const activeColor = state.currentTurn === 'white' ? 'w' : 'b';

  let castling = '';
  if (state.castlingRights.whiteKingSide) castling += 'K';
  if (state.castlingRights.whiteQueenSide) castling += 'Q';
  if (state.castlingRights.blackKingSide) castling += 'k';
  if (state.castlingRights.blackQueenSide) castling += 'q';
  if (!castling) castling = '-';

  const enPassant = state.enPassantTarget ?? '-';

  return `${rows.join('/')} ${activeColor} ${castling} ${enPassant} ${state.halfMoveClock} ${state.fullMoveNumber}`;
}

/**
 * Decode a FEN into a game state.
 *
 * The terminal-status flags are computed from the position rather than assumed
 * false: a FEN is routinely a position that is already in check, mate, or
 * stalemate (puzzle start positions especially), and callers read those flags
 * to decide whether the board is playable. `moveHistory` is necessarily empty —
 * a FEN carries no history — so anything needing the moves that led here must
 * replay them itself.
 */
export function fenToState(fen: string): ChessGameState {
  const parts = fen.trim().split(/\s+/);
  if (parts.length < 4) throw new Error('Invalid FEN: too few fields');

  const [position, activeColor, castling, enPassant, halfMove = '0', fullMove = '1'] = parts;

  const board: Board = Array(8).fill(null).map(() => Array(8).fill(null));
  const ranks = position.split('/');
  if (ranks.length !== 8) throw new Error('Invalid FEN: wrong number of ranks');

  for (let rankIdx = 0; rankIdx < 8; rankIdx++) {
    const row = 7 - rankIdx;
    let col = 0;
    for (const char of ranks[rankIdx]) {
      if (char >= '1' && char <= '8') {
        col += parseInt(char);
      } else {
        const piece = FEN_TO_PIECE[char];
        if (!piece) throw new Error(`Invalid FEN: unknown piece '${char}'`);
        board[row][col] = { ...piece };
        col++;
      }
    }
  }

  return ChessEngine.withStatusFlags({
    board,
    currentTurn: activeColor === 'w' ? 'white' : 'black',
    moveHistory: [],
    castlingRights: {
      whiteKingSide: castling.includes('K'),
      whiteQueenSide: castling.includes('Q'),
      blackKingSide: castling.includes('k'),
      blackQueenSide: castling.includes('q'),
    },
    enPassantTarget: enPassant === '-' ? null : enPassant,
    halfMoveClock: parseInt(halfMove) || 0,
    fullMoveNumber: parseInt(fullMove) || 1,
    isCheck: false,
    isCheckmate: false,
    isStalemate: false,
    isDraw: false,
  });
}
