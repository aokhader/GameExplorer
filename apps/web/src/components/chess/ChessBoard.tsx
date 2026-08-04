'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  ChessEngine,
  ChessGameState,
  Position,
  Piece,
  PieceType,
  getChessPremoveDestinations,
  isChessPremoveLegal,
  isChessPremovePromotion,
  type ChessPremove,
} from '@gameexplorer/shared';
import { ChessPiece } from '@gameexplorer/ui';
import { BoardFrame } from '@/components/board/BoardFrame';
import { useGameSfx } from '@/hooks/useGameSfx';
import { useSettings } from '@/components/providers/SettingsProvider';

// The board palette lives in the `--gx-board-*` vars that ChessBoard.css reads.
// They are declared per-theme in globals.css (Arcade Glow in `:root`, pairing
// with BOARD_COLORS in @gameexplorer/ui, which mobile reads directly) rather than
// set inline here — an inline var would outrank the active theme's block.

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
  /**
   * Let the player queue a move during the opponent's turn, played the moment
   * the turn comes back (dropped if the position made it illegal). Only for
   * screens with one human and an asynchronous opponent — online games and bot
   * games. Leave off for pass-and-play, analysis and spectating, where
   * `playerColor` is board orientation rather than "the side I own".
   */
  allowPremoves?: boolean;
}

interface PendingPromotion {
  from: Position;
  to: Position;
  /** Choosing for a queued premove rather than a move being played now. */
  isPremove?: boolean;
}

/**
 * Beat between the opponent's move landing and a queued premove firing. Reads
 * as instant while leaving the arriving move a frame to paint — and it lets the
 * parent's own post-move state (e.g. the bot page clearing "thinking") settle
 * before the premove is offered to it.
 */
const PREMOVE_FIRE_DELAY_MS = 90;

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

// Memoized: live-game pages re-render ~10×/s for their clock displays; with
// stable props (store gameState reference + useCallback'd onMove) the whole
// 64-square tree skips those renders. Settings changes still propagate —
// context subscriptions bypass memo.
export const ChessBoard = React.memo(function ChessBoard({
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
  allowPremoves = false,
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
  // Move queued during the opponent's turn, waiting for the turn to come back.
  const [premove, setPremoveState] = useState<ChessPremove | null>(null);
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
  // Premove mode: the opponent is on the clock, so a piece pick queues a move
  // instead of playing one. `effectiveState` is used deliberately — right after
  // our own optimistic move the turn has already flipped, which is exactly when
  // a player wants to line the next one up.
  const premoveMode =
    allowPremoves && !editMode && !allowSelectAnyColor && !gameOver &&
    effectiveState.currentTurn !== playerColor;

  const boardRef  = useRef<HTMLDivElement>(null);
  const ghostRef  = useRef<HTMLDivElement>(null);
  // Always-current ref so pointer handlers don't close over stale state.
  const draggingRef  = useRef(dragging);
  draggingRef.current = dragging;
  const dragMovesRef = useRef<Position[]>([]);
  const isFlipped = playerColor === 'black';
  // Read at fire time, not closure time: the premove lands a tick after the
  // parent re-rendered with the opponent's move, and its handler may only
  // accept the move in that newer render (the bot page clears `isThinking`
  // there). Same reason `premoveRef` exists — the fire timer must see the
  // queue as it is when it runs.
  const onMoveRef = useRef(onMove);
  onMoveRef.current = onMove;
  // Render-synced position, for the same reason: by the time the fire timer
  // runs, the optimistic copy from our previous move has been discarded and
  // this ref holds the position the premove must actually be applied to.
  const effectiveStateRef = useRef(effectiveState);
  effectiveStateRef.current = effectiveState;
  const premoveRef = useRef<ChessPremove | null>(premove);
  const setPremove = (p: ChessPremove | null) => {
    premoveRef.current = p;
    setPremoveState(p);
  };

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

  // A selection made under one turn means something different under the next
  // (premove candidates vs legal moves), so it never carries over.
  useEffect(() => {
    setSelectedSquare(null);
    setValidMoves([]);
    dragMovesRef.current = [];
  }, [gameState.currentTurn]);

  const handleSquareClick = (position: Position) => {
    if (editMode) {
      onSquareClick?.(position);
      return;
    }

    if (pendingPromotion) return;

    const piece = effectiveState.board[getRow(position)][getCol(position)];
    // In premove mode the selectable pieces are the player's own, not the side
    // to move — the whole point is acting out of turn.
    const canSelect = allowSelectAnyColor
      ? !!piece
      : premoveMode
        ? !!(piece && piece.color === playerColor)
        : !!(piece && piece.color === effectiveState.currentTurn);

    if (selectedSquare) {
      if (validMoves.includes(position)) {
        if (premoveMode) queuePremove(selectedSquare, position);
        else attemptMove(selectedSquare, position);
        setSelectedSquare(null);
        setValidMoves([]);
      } else if (canSelect) {
        selectPiece(position);
      } else {
        setSelectedSquare(null);
        setValidMoves([]);
        // A click that neither aims nor re-picks is how a queued premove is
        // taken back (right-click on the board does it too).
        if (premoveRef.current) setPremove(null);
      }
    } else {
      if (canSelect) {
        selectPiece(position);
      } else if (premoveRef.current) {
        setPremove(null);
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

    // Ref, not the render value: a premove fires from a timer, one render after
    // the one that scheduled it.
    const state = effectiveStateRef.current;

    // Check pawn promotion with a simple coordinate test — no engine call needed.
    const piece = state.board[getRow(from)][getCol(from)];
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
    const optimistic = ChessEngine.executeMove(state, from, to, true, promotionPiece);
    setOptimisticState(optimistic);
    onMoveRef.current(from, to, promotionPiece);
  };

  /**
   * Queue a move for the moment the turn comes back. A promotion is settled now
   * rather than on arrival — the picker mid-flight would cost the player the
   * time the premove was meant to save.
   */
  const queuePremove = (from: Position, to: Position, promotionPiece?: PieceType) => {
    if (!promotionPiece && isChessPremovePromotion(effectiveState, from, to)) {
      setPendingPromotion({ from, to, isPremove: true });
      return;
    }
    setPremove({ from, to, promotion: promotionPiece });
    sfx.play('select');
  };

  const handlePromotionSelect = (piece: PieceType) => {
    if (!pendingPromotion) return;
    if (pendingPromotion.isPremove) queuePremove(pendingPromotion.from, pendingPromotion.to, piece);
    else attemptMove(pendingPromotion.from, pendingPromotion.to, piece);
    setPendingPromotion(null);
  };

  // ── Premove firing ─────────────────────────────────────────────────────────
  // Runs off the confirmed `gameState`, never the optimistic copy: the queue is
  // only ever released by a position the parent actually stands behind.
  useEffect(() => {
    const queued = premoveRef.current;
    if (!queued) return;

    if (!allowPremoves) { setPremove(null); return; }
    // Still the opponent's move — keep waiting.
    if (gameState.currentTurn !== playerColor) return;

    const t = setTimeout(() => {
      const pm = premoveRef.current;
      if (!pm) return;
      setPremove(null);
      if (isChessPremoveLegal(gameState, pm)) {
        attemptMove(pm.from, pm.to, pm.promotion);
      } else {
        // The opponent's move made it impossible — say so and hand the turn
        // back rather than silently swallowing the player's intent.
        sfx.play('illegal');
        setShakeSquare(pm.from);
        setTimeout(() => setShakeSquare(null), 350);
      }
    }, PREMOVE_FIRE_DELAY_MS);
    return () => clearTimeout(t);
  // attemptMove/sfx are re-created every render; the position and who owns it
  // are what should re-arm this.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState, playerColor, allowPremoves]);

  // Drop a stale queue when the board stops being a premove surface at all
  // (game over, mode switch, board handed to another player).
  useEffect(() => {
    if (!premoveRef.current) return;
    if (!allowPremoves || editMode || allowSelectAnyColor || gameOver) setPremove(null);
  }, [allowPremoves, editMode, allowSelectAnyColor, gameOver]);

  /**
   * Select a piece and show its legal destinations.
   * If the parent passed a precomputed legalMovesMap this is an O(1) lookup.
   * Otherwise we fall back to running getAllLegalMoves (needed for allowSelectAnyColor
   * mode where external maps are not provided).
   */
  const selectPiece = (position: Position) => {
    setSelectedSquare(position);

    let moves: Position[];
    if (premoveMode) {
      // Not legal moves — candidate squares for a position that doesn't exist
      // yet. See the premove module in @gameexplorer/shared.
      moves = getChessPremoveDestinations(effectiveState, position);
    } else if (legalMovesMap && !allowSelectAnyColor) {
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

  /** Pieces this board will let the pointer pick up right now. */
  const canGrab = (piece: Piece): boolean => {
    if (editMode || allowSelectAnyColor) return false;
    return premoveMode ? piece.color === playerColor : piece.color === effectiveState.currentTurn;
  };

  const handlePiecePointerDown = (position: Position, piece: Piece) => (e: React.PointerEvent) => {
    if (!canGrab(piece)) return;
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
      if (premoveMode) queuePremove(drag.from, target);
      else attemptMove(drag.from, target);
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
        const isPremoveSquare = !!premove && (premove.from === position || premove.to === position);

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
              ${isPremoveSquare ? 'premove' : ''}
            `}
            onClick={() => handleSquareClick(position)}
          >
            {coordsOn && col === (isFlipped ? 7 : 0) && (
              <div className="rank-label">{displayRow + 1}</div>
            )}
            {coordsOn && row === (isFlipped ? 7 : 0) && (
              <div className="file-label">{String.fromCharCode(97 + displayCol)}</div>
            )}

            {isValidMove && premoveMode && <div className="premove-indicator" />}
            {isValidMove && !premoveMode && (!editMode || allowSelectAnyColor) && (
              <div className={`move-indicator ${piece ? 'capture' : 'empty'}`} />
            )}

            {isCheckKing && <div className="check-ring" />}
            {captureFlash === position && <div className="capture-flash" />}

            {piece && (
              <div
                className={`piece${justArrived ? ' just-arrived' : ''}${isShaking ? ' shake' : ''}`}
                onPointerDown={canGrab(piece) ? handlePiecePointerDown(position, piece) : undefined}
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
    <div className="chess-board-wrapper">
      <BoardFrame maxPx={compact ? 520 : 680} vhCap={compact ? 70 : 80}>
        <div className="relative w-full h-full">
        <div
          className={`chess-board${myTurn ? ' my-turn' : ''}`}
          ref={boardRef}
          style={{ touchAction: 'none' }}
          onPointerMove={handleBoardPointerMove}
          onPointerUp={handleBoardPointerUp}
          onPointerCancel={handleBoardPointerCancel}
          // Right-click anywhere takes back a queued premove — the shortcut
          // players expect, and the only one that works mid-drag.
          onContextMenu={(e) => {
            if (!premoveRef.current) return;
            e.preventDefault();
            setPremove(null);
          }}
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
});

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
