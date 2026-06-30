'use client';

import React, { useState, useEffect, useRef } from 'react';
import { ChessEngine, ChessGameState, Position, Piece, PieceType } from '@gameexplorer/shared';
import { ChessPiece, BOARD_COLORS } from '@gameexplorer/ui';
import { BoardFrame } from '@/components/board/BoardFrame';
import { useGameSfx } from '@/hooks/useGameSfx';
import { useSettings } from '@/components/providers/SettingsProvider';

// Drive ChessBoard.css from the shared token so BOARD_COLORS is the single source
// of truth across web + mobile. The CSS references these vars (with the hex as a
// fallback); changing the token here recolors the board everywhere.
const BOARD_CSS_VARS = {
  '--gx-board-light': BOARD_COLORS.lightSquare,
  '--gx-board-dark': BOARD_COLORS.darkSquare,
  '--gx-board-selected': BOARD_COLORS.selectedSquare,
  '--gx-board-lastmove-light': BOARD_COLORS.lastMoveLight,
  '--gx-board-lastmove-dark': BOARD_COLORS.lastMoveDark,
} as React.CSSProperties;

export interface BoardArrow {
  from: Position;
  to: Position;
  color?: string;
}

interface ChessBoardProps {
  gameState: ChessGameState;
  onMove: (from: Position, to: Position, promotionPiece?: PieceType) => void;
  playerColor?: 'white' | 'black';
  showCoordinates?: boolean;
  compact?: boolean;
  /** Draw arrows as an SVG overlay (e.g. for best-move highlights) */
  arrows?: BoardArrow[];
  /** When true, clicks call onSquareClick instead of the normal move logic */
  editMode?: boolean;
  onSquareClick?: (position: Position) => void;
  /** Allow selecting and previewing moves for pieces of any color, regardless of whose turn it is */
  allowSelectAnyColor?: boolean;
  /**
   * Precomputed legal-move destinations keyed by from-square.
   * When provided the board does a pure O(1) map lookup on piece selection
   * instead of running getAllLegalMoves() on the main thread.
   */
  legalMovesMap?: Map<Position, Position[]>;
}

interface PendingPromotion {
  from: Position;
  to: Position;
}

// Promotion picker — shown as an overlay on the board when a pawn reaches the back rank
function PromotionPicker({
  color,
  onSelect,
}: {
  color: 'white' | 'black';
  onSelect: (piece: PieceType) => void;
}) {
  const pieces: PieceType[] = ['queen', 'rook', 'bishop', 'knight'];

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 rounded-lg">
      <div className="bg-surface-alt border border-border rounded-xl shadow-2xl p-4">
        <p className="text-sm font-semibold text-fg text-center mb-3">
          Promote pawn to:
        </p>
        <div className="flex gap-2">
          {pieces.map((type) => (
            <button
              key={type}
              onClick={() => onSelect(type)}
              className="w-14 h-14 flex items-center justify-center rounded-lg bg-surface-muted hover:bg-accent-muted hover:scale-110 transition-all shadow-sm"
              title={type.charAt(0).toUpperCase() + type.slice(1)}
            >
              <ChessPiece type={type} color={color} size={48} />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Compute SVG center coords (0-800 space, one square = 100 units) for a board position */
function posToSvgCenter(pos: Position, isFlipped: boolean): { x: number; y: number } {
  const col = pos.charCodeAt(0) - 'a'.charCodeAt(0);
  const row = parseInt(pos[1]) - 1;
  const screenCol = isFlipped ? 7 - col : col;
  const screenRow = isFlipped ? row : 7 - row;
  return { x: screenCol * 100 + 50, y: screenRow * 100 + 50 };
}

function ArrowOverlay({ arrows, isFlipped }: { arrows: BoardArrow[]; isFlipped: boolean }) {
  return (
    <svg
      className="absolute inset-0 w-full h-full pointer-events-none z-20"
      viewBox="0 0 800 800"
      xmlns="http://www.w3.org/2000/svg"
    >
      {arrows.map((arrow, i) => {
        const from = posToSvgCenter(arrow.from, isFlipped);
        const to = posToSvgCenter(arrow.to, isFlipped);
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len < 1) return null;

        const nx = dx / len;
        const ny = dy / len;
        const px = -ny;
        const py = nx;

        const headSize = 28;
        const bodyWidth = 14;

        // Body: start a bit past source center, end just before arrowhead
        const startX = from.x + nx * 28;
        const startY = from.y + ny * 28;
        const endX = to.x - nx * headSize;
        const endY = to.y - ny * headSize;

        // Body rectangle corners
        const x1 = startX + px * bodyWidth / 2;
        const y1 = startY + py * bodyWidth / 2;
        const x2 = startX - px * bodyWidth / 2;
        const y2 = startY - py * bodyWidth / 2;
        const x3 = endX - px * bodyWidth / 2;
        const y3 = endY - py * bodyWidth / 2;
        const x4 = endX + px * bodyWidth / 2;
        const y4 = endY + py * bodyWidth / 2;

        // Arrowhead triangle
        const hx1 = to.x;
        const hy1 = to.y;
        const hx2 = endX + px * headSize * 0.9;
        const hy2 = endY + py * headSize * 0.9;
        const hx3 = endX - px * headSize * 0.9;
        const hy3 = endY - py * headSize * 0.9;

        const color = arrow.color ?? 'rgba(255, 170, 0, 0.82)';
        const points = `${x1},${y1} ${x2},${y2} ${x3},${y3} ${hx3},${hy3} ${hx1},${hy1} ${hx2},${hy2} ${x4},${y4}`;

        return <polygon key={i} points={points} fill={color} />;
      })}
    </svg>
  );
}

export function ChessBoard({
  gameState,
  onMove,
  playerColor = 'white',
  showCoordinates = true,
  compact = false,
  arrows,
  editMode = false,
  onSquareClick,
  allowSelectAnyColor = false,
  legalMovesMap,
}: ChessBoardProps) {
  // ── Optimistic state ───────────────────────────────────────────────────────
  // Applied immediately on move confirmation via executeMove(skipGameEndCheck=true).
  // The board renders from this instantly; the parent validates asynchronously
  // in the background and sends back the confirmed gameState, at which point we
  // discard the optimistic copy. This eliminates the parent round-trip delay.
  const [optimisticState, setOptimisticState] = useState<ChessGameState | null>(null);
  const effectiveState = optimisticState ?? gameState;

  // Discard optimistic state once the parent confirms (new gameState prop).
  useEffect(() => { setOptimisticState(null); }, [gameState]);

  const [selectedSquare, setSelectedSquare] = useState<Position | null>(null);
  const [validMoves, setValidMoves] = useState<Position[]>([]);
  // Piece currently being pointer-dragged (drives ghost visibility & source opacity).
  // Position updates go directly to the DOM via ghostRef — no per-frame re-renders.
  const [dragging, setDragging] = useState<{ piece: Piece; from: Position; halfSize: number } | null>(null);
  // Derived synchronously — no state, no extra render cycle.
  const lastMoveEntry = effectiveState.moveHistory.at(-1) ?? null;
  const lastMove = lastMoveEntry
    ? { from: lastMoveEntry.from, to: lastMoveEntry.to }
    : null;
  // lastMoveTo only drives the 300 ms pop animation; one frame of lag is fine.
  const [lastMoveTo, setLastMoveTo] = useState<Position | null>(null);
  const [pendingPromotion, setPendingPromotion] = useState<PendingPromotion | null>(null);
  // Square that briefly shakes after an illegal drop (visceral "no" feedback).
  const [shakeSquare, setShakeSquare] = useState<Position | null>(null);
  // Destination square of the latest capture — drives a quick impact flash.
  const [captureFlash, setCaptureFlash] = useState<Position | null>(null);

  const sfx = useGameSfx();
  const { settings } = useSettings();
  // The page can force coordinates off; the user setting can also hide them.
  const coordsOn = showCoordinates && settings.showCoordinates;

  // Whose-turn signifier + check highlight. Computed each render (cheap).
  const gameOver =
    effectiveState.isCheckmate || effectiveState.isStalemate || effectiveState.isDraw;
  const myTurn =
    !editMode && !allowSelectAnyColor && !gameOver &&
    effectiveState.currentTurn === playerColor;
  const kingInCheckPos = effectiveState.isCheck
    ? findKing(effectiveState.board, effectiveState.currentTurn)
    : null;

  const boardRef  = useRef<HTMLDivElement>(null);
  const ghostRef  = useRef<HTMLDivElement>(null);
  // Always-current ref so pointer handlers don't close over stale state.
  const draggingRef  = useRef(dragging);
  draggingRef.current = dragging;
  const dragMovesRef = useRef<Position[]>([]);
  const isFlipped = playerColor === 'black';

  // Trigger the arrival pop-animation + sound whenever the move list grows.
  // Covers both the player's optimistic move and the opponent/bot's move.
  useEffect(() => {
    const latest = effectiveState.moveHistory.at(-1);
    if (!latest) return;
    setLastMoveTo(latest.to);
    // Per-move feedback. Checkmate's terminal chime is owned by the page /
    // result screen, so we stay quiet on mate to avoid doubling up.
    if (!effectiveState.isCheckmate) {
      if (effectiveState.isCheck) sfx.play('check');
      else if (latest.capturedPiece) sfx.play('capture');
      else sfx.play('move');
    }
    if (latest.capturedPiece) setCaptureFlash(latest.to);
    const t = setTimeout(() => {
      setLastMoveTo(null);
      setCaptureFlash(null);
    }, 320);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveState.moveHistory.length]);

  // Reset selection when edit mode changes
  useEffect(() => {
    setSelectedSquare(null);
    setValidMoves([]);
  }, [editMode]);

  const handleSquareClick = (position: Position) => {
    if (editMode) {
      onSquareClick?.(position);
      return;
    }

    if (pendingPromotion) return;

    const piece = effectiveState.board[getRow(position)][getCol(position)];
    const canSelect = allowSelectAnyColor ? !!piece : !!(piece && piece.color === effectiveState.currentTurn);

    if (selectedSquare) {
      if (validMoves.includes(position)) {
        attemptMove(selectedSquare, position);
        setSelectedSquare(null);
        setValidMoves([]);
      } else if (canSelect) {
        selectPiece(position);
      } else {
        setSelectedSquare(null);
        setValidMoves([]);
      }
    } else {
      if (canSelect) {
        selectPiece(position);
      }
    }
  };

  /**
   * Apply a move immediately via executeMove(skipGameEndCheck=true) — this is
   * O(1) compared to the O(N²) full validateMove + isCheckmate path.
   * The board renders the new position instantly (optimistic update).
   * onMove notifies the parent, which runs full validation in the background.
   */
  const attemptMove = (from: Position, to: Position, promotionPiece?: PieceType) => {
    if (allowSelectAnyColor) {
      setSelectedSquare(null);
      setValidMoves([]);
      return;
    }

    // Check pawn promotion with a simple coordinate test — no engine call needed.
    const piece = effectiveState.board[getRow(from)][getCol(from)];
    if (piece?.type === 'pawn' && !promotionPiece) {
      const toRow = parseInt(to[1]) - 1;
      const isPromotion = (piece.color === 'white' && toRow === 7) ||
                          (piece.color === 'black' && toRow === 0);
      if (isPromotion) {
        setPendingPromotion({ from, to });
        return;
      }
    }

    // Apply move optimistically for zero-latency visual feedback.
    // skipGameEndCheck=true skips the expensive getAllLegalMoves scan for
    // checkmate/stalemate — the parent handles that via full validateMove.
    const optimistic = ChessEngine.executeMove(effectiveState, from, to, true, promotionPiece);
    setOptimisticState(optimistic);
    onMove(from, to, promotionPiece);
  };

  const handlePromotionSelect = (piece: PieceType) => {
    if (!pendingPromotion) return;
    attemptMove(pendingPromotion.from, pendingPromotion.to, piece);
    setPendingPromotion(null);
  };

  /**
   * Select a piece and show its legal destinations.
   * If the parent passed a precomputed legalMovesMap this is an O(1) lookup.
   * Otherwise we fall back to running getAllLegalMoves (needed for allowSelectAnyColor
   * mode where external maps are not provided).
   */
  const selectPiece = (position: Position) => {
    setSelectedSquare(position);

    let moves: Position[];
    if (legalMovesMap && !allowSelectAnyColor) {
      // O(1) — precomputed by parent, no engine call here
      moves = legalMovesMap.get(position) ?? [];
    } else {
      const piece = effectiveState.board[getRow(position)][getCol(position)];
      const stateForMoves = (allowSelectAnyColor && piece && piece.color !== effectiveState.currentTurn)
        ? { ...effectiveState, currentTurn: piece.color }
        : effectiveState;
      moves = ChessEngine.getAllLegalMoves(stateForMoves)
        .filter(m => m.from === position)
        .map(m => m.to as Position);
    }

    setValidMoves(moves);
    dragMovesRef.current = moves;
  };

  // ── Pointer-based drag (no HTML5 drag API → no browser-imposed delay) ────────

  /** Convert a viewport point to the board Position under it, or null if off-board. */
  const getSquareAtPoint = (clientX: number, clientY: number): Position | null => {
    const board = boardRef.current;
    if (!board) return null;
    const rect = board.getBoundingClientRect();
    if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) return null;
    const gridCol = Math.floor((clientX - rect.left) / (rect.width  / 8));
    const gridRow = Math.floor((clientY - rect.top)  / (rect.height / 8));
    const displayRow = isFlipped ? gridRow     : 7 - gridRow;
    const displayCol = isFlipped ? 7 - gridCol : gridCol;
    return getPositionFromCoords(displayRow, displayCol);
  };

  const handlePiecePointerDown = (position: Position, piece: Piece) => (e: React.PointerEvent) => {
    if (editMode || allowSelectAnyColor || piece.color !== effectiveState.currentTurn) return;
    if (e.button !== 0) return; // left-click only
    e.preventDefault();

    // Route all subsequent pointer events to the board even when off-board.
    boardRef.current?.setPointerCapture(e.pointerId);

    selectPiece(position);

    const { width } = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const halfSize = width / 2;

    // Position ghost immediately (imperative, no re-render).
    if (ghostRef.current) {
      ghostRef.current.style.width  = `${width}px`;
      ghostRef.current.style.height = `${width}px`;
      ghostRef.current.style.left   = `${e.clientX - halfSize}px`;
      ghostRef.current.style.top    = `${e.clientY - halfSize}px`;
    }

    const d = { piece, from: position, halfSize };
    draggingRef.current = d;
    setDragging(d);
  };

  const handleBoardPointerMove = (e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    e.preventDefault();
    // Move ghost imperatively — avoids a React re-render on every frame.
    if (ghostRef.current) {
      ghostRef.current.style.left = `${e.clientX - draggingRef.current.halfSize}px`;
      ghostRef.current.style.top  = `${e.clientY - draggingRef.current.halfSize}px`;
    }
  };

  const handleBoardPointerUp = (e: React.PointerEvent) => {
    const drag = draggingRef.current;
    if (!drag) return;
    e.preventDefault();

    const target = getSquareAtPoint(e.clientX, e.clientY);
    if (target && target !== drag.from && !editMode && dragMovesRef.current.includes(target)) {
      attemptMove(drag.from, target);
      setSelectedSquare(null);
      setValidMoves([]);
    } else if (target !== drag.from) {
      // Dropped on invalid square or off-board — clear selection.
      // If it landed on a real (but illegal) square, shake + buzz as feedback.
      if (target) {
        setShakeSquare(drag.from);
        sfx.play('illegal');
        setTimeout(() => setShakeSquare(null), 350);
      }
      setSelectedSquare(null);
      setValidMoves([]);
      dragMovesRef.current = [];
    }
    // Dropped back on source square → keep selection so click-to-move still works.

    draggingRef.current = null;
    setDragging(null);
  };

  const handleBoardPointerCancel = () => {
    // OS cancelled the gesture (e.g. incoming call on mobile).
    draggingRef.current = null;
    setDragging(null);
    setSelectedSquare(null);
    setValidMoves([]);
    dragMovesRef.current = [];
  };

  const renderBoard = () => {
    const squares = [];

    for (let row = 7; row >= 0; row--) {
      for (let col = 0; col < 8; col++) {
        const displayRow = isFlipped ? 7 - row : row;
        const displayCol = isFlipped ? 7 - col : col;
        const position = getPositionFromCoords(displayRow, displayCol);
        const piece = effectiveState.board[displayRow][displayCol];
        const isLight = (displayRow + displayCol) % 2 === 0;
        const isSelected = selectedSquare === position;
        const isValidMove = validMoves.includes(position);
        const isDragging = dragging?.from === position;
        const isLastMoveSquare = lastMove && (lastMove.from === position || lastMove.to === position);
        const justArrived = lastMoveTo === position;
        const isCheckKing = kingInCheckPos === position;
        const isShaking = shakeSquare === position;

        squares.push(
          <div
            key={position}
            className={`
              square
              ${isLight ? 'light' : 'dark'}
              ${isSelected ? 'selected' : ''}
              ${isValidMove ? 'valid-move' : ''}
              ${isDragging ? 'dragging' : ''}
              ${isLastMoveSquare ? 'last-move' : ''}
            `}
            onClick={() => handleSquareClick(position)}
          >
            {coordsOn && col === (isFlipped ? 7 : 0) && (
              <div className="rank-label">{displayRow + 1}</div>
            )}
            {coordsOn && row === (isFlipped ? 7 : 0) && (
              <div className="file-label">{String.fromCharCode(97 + displayCol)}</div>
            )}

            {isValidMove && (!editMode || allowSelectAnyColor) && (
              <div className={`move-indicator ${piece ? 'capture' : 'empty'}`} />
            )}

            {isCheckKing && <div className="check-ring" />}
            {captureFlash === position && <div className="capture-flash" />}

            {piece && (
              <div
                className={`piece${justArrived ? ' just-arrived' : ''}${isShaking ? ' shake' : ''}`}
                onPointerDown={
                  !editMode && piece.color === effectiveState.currentTurn
                    ? handlePiecePointerDown(position, piece)
                    : undefined
                }
              >
                <ChessPiece type={piece.type} color={piece.color} size="100%" />
              </div>
            )}
          </div>
        );
      }
    }

    return squares;
  };

  return (
    <div className="chess-board-wrapper" style={BOARD_CSS_VARS}>
      <BoardFrame maxPx={compact ? 520 : 600} vhCap={compact ? 70 : 80}>
        <div className="relative w-full h-full">
        <div
          className={`chess-board${myTurn ? ' my-turn' : ''}`}
          ref={boardRef}
          style={{ touchAction: 'none' }}
          onPointerMove={handleBoardPointerMove}
          onPointerUp={handleBoardPointerUp}
          onPointerCancel={handleBoardPointerCancel}
        >
          {renderBoard()}
        </div>

        {/* Drag ghost — positioned imperatively on every pointermove so React
            never re-renders the board just to move a floating piece. */}
        <div
          ref={ghostRef}
          style={{
            display:        dragging ? 'flex' : 'none',
            position:       'fixed',
            alignItems:     'center',
            justifyContent: 'center',
            pointerEvents:  'none',
            zIndex:         9999,
            cursor:         'grabbing',
            // left / top / width / height set imperatively in pointer handlers
          }}
        >
          {dragging && (
            <ChessPiece
              type={dragging.piece.type}
              color={dragging.piece.color}
              size="100%"
            />
          )}
        </div>

        {arrows && arrows.length > 0 && (
          <ArrowOverlay arrows={arrows} isFlipped={isFlipped} />
        )}
        {pendingPromotion && (
          <PromotionPicker
            color={playerColor}
            onSelect={handlePromotionSelect}
          />
        )}
        </div>
      </BoardFrame>
    </div>
  );
}

function getRow(position: Position): number {
  return parseInt(position[1]) - 1;
}

function getCol(position: Position): number {
  return position.charCodeAt(0) - 'a'.charCodeAt(0);
}

function getPositionFromCoords(row: number, col: number): Position {
  return (String.fromCharCode(97 + col) + (row + 1)) as Position;
}

/** Find the square of the given color's king, or null. O(64), called only on check. */
function findKing(board: ChessGameState['board'], color: 'white' | 'black'): Position | null {
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const p = board[row][col];
      if (p && p.type === 'king' && p.color === color) {
        return getPositionFromCoords(row, col);
      }
    }
  }
  return null;
}
