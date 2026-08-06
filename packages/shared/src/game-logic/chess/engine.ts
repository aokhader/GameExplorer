// packages/shared/src/game-logic/chess/engine.ts
// Main chess game engine - validates and executes moves

import type {
  Board,
  ChessGameState,
  Color,
  Move,
  Position,
  MoveValidationResult,
  Piece,
  PieceType,
} from '../../types/chess.types';
import {
  getPieceAt,
  setPieceAt,
  cloneGameState,
  getOpponentColor,
  createInitialGameState,
  positionToCoordinates,
  coordinatesToPosition,
} from './utils';
import { getPossibleMoves, isKingInCheck } from './moves';

/**
 * Plies without a capture or pawn move that draw the game.
 *
 * The fifty-move rule counts 50 moves BY EACH PLAYER, and `halfMoveClock`
 * counts plies — so the threshold is 100, not 50.
 */
export const FIFTY_MOVE_PLIES = 100;

/**
 * Check if a pawn move results in promotion
 */
function isPawnPromotion(piece: Piece, to: Position): boolean {
  if (piece.type !== 'pawn') return false;
  const toCoords = positionToCoordinates(to);
  return (piece.color === 'white' && toCoords.row === 7) ||
         (piece.color === 'black' && toCoords.row === 0);
}

/**
 * Would playing `from`→`to` leave `color`'s own king attacked?
 *
 * This is the innermost loop of the entire engine — every legality scan asks it
 * once per pseudo-legal move — so it does the least work that answers the
 * question. Only the one or two ranks the move touches are copied, and the
 * piece objects are shared rather than spread, which is safe because nothing
 * downstream mutates a piece in place.
 *
 * The clone-based `simulateMove` it replaces copied the whole game state, then
 * the whole board twice more via `setPieceAt`, to answer the same boolean.
 */
function leavesKingInCheck(
  board: Board,
  from: Position,
  to: Position,
  enPassantTarget: Position | null,
  color: Color,
): boolean {
  const f = positionToCoordinates(from);
  const t = positionToCoordinates(to);
  const piece = board[f.row][f.col];
  if (!piece) return false;

  const next = board.slice() as Board;
  const copyRow = (r: number) => {
    if (next[r] === board[r]) next[r] = board[r].slice();
  };
  copyRow(f.row);
  copyRow(t.row);

  next[f.row][f.col] = null;
  next[t.row][t.col] = piece;

  // En passant takes a pawn standing on neither square: same rank as the
  // capturing pawn started on, same file as it lands on.
  if (piece.type === 'pawn' && to === enPassantTarget) {
    next[f.row][t.col] = null;
  }

  return isKingInCheck(next, color);
}

/**
 * Write a square in place.
 *
 * `setPieceAt` returns a fresh board, which is right for callers holding a
 * position they must not disturb — but `executeMove` has already cloned, so
 * chaining it there copied all 64 squares two to four more times per move for
 * nothing.
 */
function put(board: Board, position: Position, piece: Piece | null): void {
  const { row, col } = positionToCoordinates(position);
  board[row][col] = piece;
}

/** Both kings on the board — see `ChessEngine.withStatusFlags`. */
function hasBothKings(board: Board): boolean {
  let white = false;
  let black = false;
  for (const row of board) {
    for (const piece of row) {
      if (piece?.type !== 'king') continue;
      if (piece.color === 'white') white = true;
      else black = true;
    }
  }
  return white && black;
}

/**
 * Chess Game Engine
 * Handles all game logic, move validation, and state updates
 */
export class ChessEngine {
  /**
   * Validate and execute a move.
   * Pass promotionPiece when a pawn reaches the back rank.
   * If promotionPiece is omitted and the move is a promotion,
   * returns { valid: true, needsPromotion: true } so the UI can show a picker.
   */
  static validateMove(
    gameState: ChessGameState,
    from: Position,
    to: Position,
    skipGameEndCheck: boolean = false,
    promotionPiece?: PieceType,
  ): MoveValidationResult {
    // 1. Check if there's a piece at the starting position
    const piece = getPieceAt(gameState.board, from);
    if (!piece) {
      return { valid: false, reason: 'No piece at starting position' };
    }

    // 2. Check if it's the correct player's turn
    if (piece.color !== gameState.currentTurn) {
      return { valid: false, reason: 'Not your turn' };
    }

    // 3. Check if this is a castling move
    const isCastling = this.isCastlingMove(gameState, from, to);

    if (isCastling) {
      const castlingValidation = this.validateCastling(gameState, from, to);
      if (!castlingValidation.valid) {
        return castlingValidation;
      }
    } else {
      // 4. Check if the move is in the list of possible moves
      const possibleMoves = getPossibleMoves(gameState.board, from, true, gameState.enPassantTarget);
      if (!possibleMoves.includes(to)) {
        return { valid: false, reason: 'Illegal move for this piece' };
      }

      // 5. Check whether the move leaves our own king in check
      if (leavesKingInCheck(gameState.board, from, to, gameState.enPassantTarget, piece.color)) {
        return { valid: false, reason: 'Move would leave king in check' };
      }

      // 6. If this is a promotion move and no piece was provided, signal the UI
      if (isPawnPromotion(piece, to) && !promotionPiece) {
        return { valid: true, needsPromotion: true };
      }
    }

    // 7. Move is valid — execute it
    const resultingState = this.executeMove(
      gameState,
      from,
      to,
      skipGameEndCheck,
      promotionPiece,
    );

    return { valid: true, resultingState };
  }

  /**
   * Check if a move is a castling move
   */
  private static isCastlingMove(
    gameState: ChessGameState,
    from: Position,
    to: Position,
  ): boolean {
    const piece = getPieceAt(gameState.board, from);
    if (!piece || piece.type !== 'king') return false;

    const fromCoords = positionToCoordinates(from);
    const toCoords = positionToCoordinates(to);

    return (
      Math.abs(toCoords.col - fromCoords.col) === 2 &&
      Math.abs(toCoords.row - fromCoords.row) === 0
    );
  }

  /**
   * Validate castling move according to chess rules
   */
  private static validateCastling(
    gameState: ChessGameState,
    from: Position,
    to: Position,
  ): MoveValidationResult {
    const piece = getPieceAt(gameState.board, from);
    if (!piece || piece.type !== 'king') {
      return { valid: false, reason: 'Not a king' };
    }

    const color = piece.color;
    const fromCoords = positionToCoordinates(from);
    const toCoords = positionToCoordinates(to);
    const row = fromCoords.row;
    const isKingside = toCoords.col > fromCoords.col;

    if (isKingside) {
      if (color === 'white' && !gameState.castlingRights.whiteKingSide)
        return { valid: false, reason: 'White has lost kingside castling rights' };
      if (color === 'black' && !gameState.castlingRights.blackKingSide)
        return { valid: false, reason: 'Black has lost kingside castling rights' };
    } else {
      if (color === 'white' && !gameState.castlingRights.whiteQueenSide)
        return { valid: false, reason: 'White has lost queenside castling rights' };
      if (color === 'black' && !gameState.castlingRights.blackQueenSide)
        return { valid: false, reason: 'Black has lost queenside castling rights' };
    }

    const expectedRow = color === 'white' ? 0 : 7;
    if (fromCoords.row !== expectedRow || fromCoords.col !== 4)
      return { valid: false, reason: 'King not on starting square' };

    if (isKingInCheck(gameState.board, color))
      return { valid: false, reason: 'Cannot castle while in check' };

    const rookCol = isKingside ? 7 : 0;
    const step = isKingside ? 1 : -1;
    const kingDestCol = isKingside ? 6 : 2;

    for (let col = fromCoords.col + step; col !== rookCol; col += step) {
      const checkPos = coordinatesToPosition({ row, col });
      if (getPieceAt(gameState.board, checkPos))
        return { valid: false, reason: 'Pieces between king and rook' };
    }

    const rookPos = coordinatesToPosition({ row, col: rookCol });
    const rook = getPieceAt(gameState.board, rookPos);
    if (!rook || rook.type !== 'rook' || rook.color !== color)
      return { valid: false, reason: 'No rook at expected position' };

    for (let col = fromCoords.col; col !== kingDestCol + step; col += step) {
      const testPos = coordinatesToPosition({ row, col });
      const testBoard = setPieceAt(
        setPieceAt(gameState.board, from, null),
        testPos,
        { type: 'king', color },
      );
      if (isKingInCheck(testBoard, color))
        return { valid: false, reason: 'King would pass through or land in check' };
    }

    return { valid: true };
  }

  /**
   * Execute a validated move (does not re-check validity).
   * promotionPiece defaults to 'queen' if not provided and move is a promotion.
   */
  static executeMove(
    gameState: ChessGameState,
    from: Position,
    to: Position,
    skipGameEndCheck: boolean = false,
    promotionPiece?: PieceType,
  ): ChessGameState {
    const newState = cloneGameState(gameState);
    const piece = getPieceAt(newState.board, from);
    const capturedPiece = getPieceAt(newState.board, to);

    if (!piece) throw new Error('No piece at starting position');

    const isCastling = this.isCastlingMove(gameState, from, to);

    if (isCastling && piece.type === 'king') {
      const fromCoords = positionToCoordinates(from);
      const toCoords = positionToCoordinates(to);
      const row = fromCoords.row;
      const isKingside = toCoords.col > fromCoords.col;

      const board = newState.board;
      put(board, from, null);
      put(board, to, piece);

      const rookFrom = coordinatesToPosition({ row, col: isKingside ? 7 : 0 });
      const rookTo = coordinatesToPosition({ row, col: isKingside ? 5 : 3 });
      const rook = getPieceAt(board, rookFrom);
      if (rook) {
        put(board, rookFrom, null);
        put(board, rookTo, rook);
      }

      newState.moveHistory.push({
        from, to, piece,
        isCastling: true,
        castlingSide: isKingside ? 'kingside' : 'queenside',
      });
    } else {
      // Detect en passant
      const isEnPassant = piece.type === 'pawn' && to === gameState.enPassantTarget;

      // Determine if this is a promotion
      const isPromotion = isPawnPromotion(piece, to);
      // Default to queen if no piece specified (e.g. Stockfish moves)
      const resolvedPromotion: PieceType | undefined = isPromotion
        ? (promotionPiece ?? 'queen')
        : undefined;

      // The piece that actually lands on the target square
      const landingPiece: Piece = isPromotion
        ? { type: resolvedPromotion!, color: piece.color }
        : piece;

      const opponentColor = getOpponentColor(piece.color);
      const move: Move = {
        from,
        to,
        piece,
        capturedPiece: isEnPassant
          ? { type: 'pawn', color: opponentColor }
          : (capturedPiece || undefined),
        promotion: resolvedPromotion,
        isEnPassant: isEnPassant || undefined,
      };

      const board = newState.board;
      put(board, from, null);
      put(board, to, landingPiece);

      // En passant: remove the captured pawn (same row as attacker, same col as target)
      if (isEnPassant) {
        const fromCoords = positionToCoordinates(from);
        const toCoords = positionToCoordinates(to);
        put(board, coordinatesToPosition({ row: fromCoords.row, col: toCoords.col }), null);
      }

      newState.moveHistory.push(move);
    }

    // Update turn
    newState.currentTurn = getOpponentColor(gameState.currentTurn);

    // Update en passant target for the next move
    const fromCoords = positionToCoordinates(from);
    const toCoords = positionToCoordinates(to);
    if (piece.type === 'pawn' && Math.abs(toCoords.row - fromCoords.row) === 2) {
      // Double pawn push — the skipped square is the en passant target
      const skippedRow = (fromCoords.row + toCoords.row) / 2;
      newState.enPassantTarget = coordinatesToPosition({ row: skippedRow, col: fromCoords.col });
    } else {
      newState.enPassantTarget = null;
    }

    // Update move counters
    if (capturedPiece || piece.type === 'pawn') {
      newState.halfMoveClock = 0;
    } else {
      newState.halfMoveClock++;
    }

    if (gameState.currentTurn === 'black') {
      newState.fullMoveNumber++;
    }

    newState.castlingRights = this.updateCastlingRights(
      newState.castlingRights,
      from,
      piece,
    );

    if (!skipGameEndCheck) {
      return this.withStatusFlags(newState);
    }

    return newState;
  }

  /**
   * Recompute the four terminal-status flags (`isCheck`, `isCheckmate`,
   * `isStalemate`, `isDraw`) for a position.
   *
   * Shared by `executeMove` and `fenToState` so a position that did NOT arrive
   * via a move — one decoded from a FEN — carries the same flags a played one
   * would. Order matters here: `isDraw` reads `isStalemate`.
   *
   * A position missing either king is not legal chess, and terminal status is
   * meaningless there: `isKingInCheck` reports "not in check" when there is no
   * king to find, and a board with no pieces has no legal moves — so the naive
   * answer for the analysis page's cleared editor board would be "stalemate,
   * and a draw". Those positions get all four flags false instead.
   */
  static withStatusFlags(gameState: ChessGameState): ChessGameState {
    const next = { ...gameState };

    if (!hasBothKings(next.board)) {
      next.isCheck = false;
      next.isCheckmate = false;
      next.isStalemate = false;
      next.isDraw = false;
      return next;
    }

    next.isCheck = isKingInCheck(next.board, next.currentTurn);
    next.isCheckmate = this.isCheckmate(next);
    next.isStalemate = this.isStalemate(next);
    next.isDraw = this.isDraw(next);
    return next;
  }

  /**
   * Is `from`→`to` legal? The same decision `validateMove` makes, without
   * building the resulting position.
   *
   * `validateMove` executes the move so it can hand back `resultingState`, and
   * that is most of its cost. The two scans below ask thousands of times per
   * search whether a move is legal and throw every resulting state away, so
   * they ask this instead.
   */
  private static isLegalMove(
    gameState: ChessGameState,
    from: Position,
    to: Position,
  ): boolean {
    const piece = getPieceAt(gameState.board, from);
    if (!piece || piece.color !== gameState.currentTurn) return false;

    const possibleMoves = getPossibleMoves(gameState.board, from, true, gameState.enPassantTarget);
    if (!possibleMoves.includes(to)) return false;

    return this.isLegalCandidate(gameState, from, to, piece);
  }

  /**
   * The half of `isLegalMove` that remains once the caller already holds the
   * pseudo-legal list `to` came out of.
   *
   * Worth splitting because the scans below iterate that list: asking the full
   * question per candidate regenerated the same piece's moves once for every
   * move it had, turning each piece's scan quadratic.
   */
  private static isLegalCandidate(
    gameState: ChessGameState,
    from: Position,
    to: Position,
    piece: Piece,
  ): boolean {
    if (this.isCastlingMove(gameState, from, to)) {
      return this.validateCastling(gameState, from, to).valid;
    }
    return !leavesKingInCheck(gameState.board, from, to, gameState.enPassantTarget, piece.color);
  }

  private static updateCastlingRights(
    rights: ChessGameState['castlingRights'],
    from: Position,
    piece: Piece,
  ): ChessGameState['castlingRights'] {
    const newRights = { ...rights };

    if (piece.type === 'king') {
      if (piece.color === 'white') {
        newRights.whiteKingSide = false;
        newRights.whiteQueenSide = false;
      } else {
        newRights.blackKingSide = false;
        newRights.blackQueenSide = false;
      }
    }

    if (piece.type === 'rook') {
      if (from === 'a1') newRights.whiteQueenSide = false;
      if (from === 'h1') newRights.whiteKingSide = false;
      if (from === 'a8') newRights.blackQueenSide = false;
      if (from === 'h8') newRights.blackKingSide = false;
    }

    return newRights;
  }

  private static isCheckmate(gameState: ChessGameState): boolean {
    if (!isKingInCheck(gameState.board, gameState.currentTurn)) return false;
    return !this.hasLegalMoves(gameState);
  }

  private static isStalemate(gameState: ChessGameState): boolean {
    if (isKingInCheck(gameState.board, gameState.currentTurn)) return false;
    return !this.hasLegalMoves(gameState);
  }

  private static hasLegalMoves(gameState: ChessGameState): boolean {
    const currentColor = gameState.currentTurn;

    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const piece = gameState.board[row][col];
        if (piece && piece.color === currentColor) {
          const from = String.fromCharCode('a'.charCodeAt(0) + col) + (row + 1);
          const possibleMoves = getPossibleMoves(gameState.board, from, true, gameState.enPassantTarget);

          for (const to of possibleMoves) {
            if (this.isLegalCandidate(gameState, from, to, piece)) return true;
          }
        }
      }
    }

    return false;
  }

  /**
   * Draws this engine detects. Insufficient material and threefold repetition
   * are not modelled — the multiplayer server reports this as `fifty_move`.
   */
  private static isDraw(gameState: ChessGameState): boolean {
    if (gameState.halfMoveClock >= FIFTY_MOVE_PLIES) return true;
    if (gameState.isStalemate) return true;
    return false;
  }

  static getAllLegalMoves(
    gameState: ChessGameState,
  ): { from: Position; to: Position }[] {
    const legalMoves: { from: Position; to: Position }[] = [];
    const currentColor = gameState.currentTurn;

    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const piece = gameState.board[row][col];
        if (piece && piece.color === currentColor) {
          const from = String.fromCharCode('a'.charCodeAt(0) + col) + (row + 1);
          const possibleMoves = getPossibleMoves(gameState.board, from, true, gameState.enPassantTarget);

          for (const to of possibleMoves) {
            // Promotions count once here, as the move itself — which piece the
            // pawn becomes is the caller's business, and `validateMove`'s
            // `needsPromotion` signal exists for a UI picker that has no say in
            // a search.
            if (this.isLegalCandidate(gameState, from, to, piece)) {
              legalMoves.push({ from, to });
            }
          }
        }
      }
    }

    return legalMoves;
  }

  static newGame(): ChessGameState {
    return createInitialGameState();
  }
}