'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  CHECKERS_DIFF,
  CheckersEngine,
  getCheckersPremoveDestinations,
  isCheckersPremoveLegal,
} from '@gameexplorer/shared';
import type { CheckersGameState, CheckersPremove } from '@gameexplorer/shared';
// Deep import: the `@gameexplorer/client` barrel builds a Supabase client at
// import time, which a board has no business needing.
import { motionKey, useBoardMotion } from '@gameexplorer/client/hooks/useBoardMotion';
import { CheckersPiece, CHECKERS_BOARD_COLORS } from '@gameexplorer/ui';
import { BoardFrame } from '@/components/board/BoardFrame';
import { PieceSlot } from '@/components/board/PieceSlot';
import { useBoardDrag } from '@/hooks/useBoardDrag';
import { useGameSfx } from '@/hooks/useGameSfx';
import { useSettings } from '@/components/providers/SettingsProvider';

/**
 * Square palette, read from the `--gx-checkers-board-*` variables that globals.css
 * declares per theme, with the shared token as the fallback so the board is still
 * correct on its own. (Mobile reads CHECKERS_BOARD_COLORS directly — it has no
 * themes.) These are inline styles rather than classes because the square color
 * is picked per-square from game state.
 */
const SQUARE: Record<
  | 'light' | 'dark' | 'frame' | 'selected' | 'lastMoveLight' | 'lastMoveDark' | 'move' | 'capture'
  | 'premove' | 'premoveHint',
  string
> = {
  light:        `var(--gx-checkers-board-light, ${CHECKERS_BOARD_COLORS.lightSquare})`,
  dark:         `var(--gx-checkers-board-dark, ${CHECKERS_BOARD_COLORS.darkSquare})`,
  frame:        `var(--gx-checkers-board-frame, var(--c-border-strong))`,
  selected:     `var(--gx-checkers-board-selected, ${CHECKERS_BOARD_COLORS.selectedSquare})`,
  lastMoveLight: `var(--gx-checkers-board-lastmove-light, ${CHECKERS_BOARD_COLORS.lastMoveLight})`,
  lastMoveDark:  `var(--gx-checkers-board-lastmove-dark, ${CHECKERS_BOARD_COLORS.lastMoveDark})`,
  move:         `var(--gx-checkers-board-move, ${CHECKERS_BOARD_COLORS.moveIndicator})`,
  capture:      `var(--gx-checkers-board-capture, ${CHECKERS_BOARD_COLORS.captureIndicator})`,
  // Queued premove — a different hue from the last-move highlight on purpose:
  // "what I've asked for" must not read as "what just happened".
  premove:      'var(--gx-checkers-board-premove, rgba(139, 92, 246, 0.55))',
  premoveHint:  'var(--gx-checkers-board-premove-hint, rgba(139, 92, 246, 0.75))',
};

/**
 * Beat between the opponent's move landing and a queued premove firing — long
 * enough for the arriving move to paint and for the parent's own post-move
 * state to settle, short enough to still read as instant. Mirrors the chess board.
 */
const PREMOVE_FIRE_DELAY_MS = 90;

export interface BoardArrow {
  from: string;
  to: string;
  color?: string;
}

interface CheckersBoardProps {
  gameState: CheckersGameState;
  onMove: (from: string, to: string) => void;
  playerColor?: 'white' | 'black';
  /**
   * Which side is at the BOTTOM. Purely visual — defaults to `playerColor`.
   * Separate because `playerColor` also gates what you may pick up, so flipping
   * the view through it would hand you the opponent's pieces too.
   */
  orientation?: 'white' | 'black';
  showCoordinates?: boolean;
  arrows?: BoardArrow[];
  /**
   * Let the player queue a move during the opponent's turn, played the moment
   * the turn comes back (dropped if the position made it illegal — in checkers
   * usually because a capture became mandatory). Online and bot games only:
   * elsewhere `playerColor` is board orientation, not "the side I own".
   */
  allowPremoves?: boolean;
  /**
   * Board is inert — no selection, no drag, no click-to-move.
   *
   * Real inertness, not a no-op `onMove`: the puzzle screens used to fake this
   * by swallowing the callback, which left pieces draggable on a board that
   * would silently discard the move.
   */
  interactive?: boolean;
}

function isDark(row: number, col: number): boolean {
  return (row + col) % 2 === 1;
}

function posFromCoords(row: number, col: number): string {
  return String.fromCharCode(97 + col) + (row + 1);
}

function rowOf(pos: string): number { return parseInt(pos[1]) - 1; }
function colOf(pos: string): number { return pos.charCodeAt(0) - 97; }

function posToSvgCenter(pos: string, isFlipped: boolean): { x: number; y: number } {
  const col = colOf(pos);
  const row = rowOf(pos);
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
        const to   = posToSvgCenter(arrow.to,   isFlipped);
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len < 1) return null;
        const nx = dx / len, ny = dy / len;
        const px = -ny,     py = nx;
        const headSize = 26, bodyWidth = 13;
        const startX = from.x + nx * 28, startY = from.y + ny * 28;
        const endX   = to.x - nx * headSize, endY = to.y - ny * headSize;
        const x1 = startX + px * bodyWidth / 2, y1 = startY + py * bodyWidth / 2;
        const x2 = startX - px * bodyWidth / 2, y2 = startY - py * bodyWidth / 2;
        const x3 = endX   - px * bodyWidth / 2, y3 = endY   - py * bodyWidth / 2;
        const x4 = endX   + px * bodyWidth / 2, y4 = endY   + py * bodyWidth / 2;
        const hx1 = to.x, hy1 = to.y;
        const hx2 = endX + px * headSize * 0.9, hy2 = endY + py * headSize * 0.9;
        const hx3 = endX - px * headSize * 0.9, hy3 = endY - py * headSize * 0.9;
        const color = arrow.color ?? 'rgba(255,170,0,0.82)';
        const points = `${x1},${y1} ${x2},${y2} ${x3},${y3} ${hx3},${hy3} ${hx1},${hy1} ${hx2},${hy2} ${x4},${y4}`;
        return <polygon key={i} points={points} fill={color} />;
      })}
    </svg>
  );
}

// Memoized — see ChessBoard: skips the play screens' 100 ms clock re-renders
// when gameState/onMove are stable.
export const CheckersBoard = React.memo(function CheckersBoard({
  gameState,
  onMove,
  playerColor = 'white',
  orientation,
  showCoordinates = true,
  arrows,
  allowPremoves = false,
  interactive = true,
}: CheckersBoardProps) {
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null);
  const [validMoves, setValidMoves]         = useState<string[]>([]);
  const [lastMove, setLastMove]             = useState<{ from: string; to: string } | null>(null);
  const [lastMoveTo, setLastMoveTo]         = useState<string | null>(null);
  // Move queued during the opponent's turn, waiting for the turn to come back.
  const [premove, setPremoveState]          = useState<CheckersPremove | null>(null);
  const sfx = useGameSfx();
  const { settings, reducedMotion } = useSettings();
  const coordsOn = showCoordinates && settings.showCoordinates;

  const boardRef = useRef<HTMLDivElement>(null);
  const ghostRef = useRef<HTMLDivElement>(null);

  // Orientation only — the ownership tests below keep using `playerColor`, so
  // flipping the view never changes what you can move.
  const isFlipped = (orientation ?? playerColor) === 'black';
  // Premove mode: the opponent is on the clock, so picking a piece queues a
  // move instead of playing one.
  const premoveMode =
    allowPremoves && !gameState.isGameOver && gameState.currentTurn !== playerColor;

  // Read at fire time rather than closure time: a premove fires from a timer,
  // a render after the opponent's move landed, and the parent's handler may
  // only accept it in that newer render (the bot page clears "thinking" there).
  const onMoveRef = useRef(onMove);
  onMoveRef.current = onMove;
  const premoveRef = useRef<CheckersPremove | null>(premove);
  const setPremove = (p: CheckersPremove | null) => {
    premoveRef.current = p;
    setPremoveState(p);
  };

  useEffect(() => {
    if (gameState.moveHistory.length > 0) {
      const latest = gameState.moveHistory[gameState.moveHistory.length - 1];
      setLastMove({ from: latest.from, to: latest.to });
      setLastMoveTo(latest.to);
      // A 2-rank jump is a capture; a single diagonal step is a plain move.
      const isJump = Math.abs(rowOf(latest.to) - rowOf(latest.from)) >= 2;
      sfx.play(isJump ? 'jump' : 'move');
      const t = setTimeout(() => setLastMoveTo(null), 300);
      return () => clearTimeout(t);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState.moveHistory.length]);

  // Reset selection whenever the game state changes (e.g. after bot moves)
  useEffect(() => {
    setSelectedSquare(null);
    setValidMoves([]);
  }, [gameState.currentTurn]);

  // Full move generation is expensive, and computing it during render put it on
  // the paint path of the very frame that shows the move which caused it.
  // Nothing in render needs it — the legal-move dots come from `validMoves`
  // state — so it is deferred to the first pick-up and cached against the
  // position, which is a lazy `useMemo` in all but name.
  const legalCache = useRef<{ state: CheckersGameState; moves: ReturnType<
    typeof CheckersEngine.getAllLegalMoves
  > } | null>(null);
  const getLegalMoves = () => {
    if (legalCache.current?.state !== gameState) {
      legalCache.current = { state: gameState, moves: CheckersEngine.getAllLegalMoves(gameState) };
    }
    return legalCache.current.moves;
  };
  // Whose-turn signifier — the board lifts with an ember glow on the player's move.
  const isMyTurn = !gameState.isGameOver && gameState.currentTurn === playerColor;

  // What travelled to get here. A multi-jump is one long slide with a fade per
  // victim, which is what makes a chain read as a chain rather than as pieces
  // blinking out of existence.
  const motion = useBoardMotion(gameState.board, {
    ...CHECKERS_DIFF,
    historyLength: gameState.moveHistory.length,
    isFlipped,
    enabled: !reducedMotion,
  });

  /**
   * Where a piece on `pos` may be aimed. In premove mode these are candidates
   * for a position that doesn't exist yet, not legal moves — see the premove
   * module in @gameexplorer/shared.
   */
  const destinationsFor = (pos: string): string[] =>
    premoveMode
      ? getCheckersPremoveDestinations(gameState, pos)
      : getLegalMoves().filter(m => m.from === pos).map(m => m.to);

  const selectSquare = (pos: string) => {
    setSelectedSquare(pos);
    setValidMoves(destinationsFor(pos));
  };

  /** Pieces the board will let the player pick up right now. */
  const canGrab = (piece: { color: 'white' | 'black' } | null): boolean =>
    interactive &&
    !!piece &&
    (premoveMode ? piece.color === playerColor : piece.color === gameState.currentTurn);

  /** Queue a move for the moment the turn comes back. */
  const queuePremove = (from: string, to: string) => {
    setPremove({ from, to });
    sfx.play('select');
  };

  const handleSquareClick = (pos: string, row: number, col: number) => {
    if (!interactive) return;
    if (!isDark(row, col) || gameState.isGameOver) return;

    const piece = gameState.board[row][col];

    if (selectedSquare) {
      if (validMoves.includes(pos)) {
        if (premoveMode) queuePremove(selectedSquare, pos);
        else onMove(selectedSquare, pos);
        setSelectedSquare(null);
        setValidMoves([]);
      } else if (canGrab(piece)) {
        selectSquare(pos);
      } else {
        setSelectedSquare(null);
        setValidMoves([]);
        // A click that neither aims nor re-picks takes a queued premove back
        // (right-click on the board does it too).
        if (premoveRef.current) setPremove(null);
      }
    } else {
      if (canGrab(piece)) {
        selectSquare(pos);
      } else if (premoveRef.current) {
        setPremove(null);
      }
    }
  };

  /** Screen point → square. Arithmetic off the board rect, as chess does it. */
  const squareAtPoint = (clientX: number, clientY: number): string | null => {
    const rect = boardRef.current?.getBoundingClientRect();
    if (!rect) return null;
    if (clientX < rect.left || clientX > rect.right) return null;
    if (clientY < rect.top || clientY > rect.bottom) return null;
    const screenCol = Math.floor((clientX - rect.left) / (rect.width / 8));
    const screenRow = Math.floor((clientY - rect.top) / (rect.height / 8));
    const boardRow = isFlipped ? screenRow : 7 - screenRow;
    const boardCol = isFlipped ? 7 - screenCol : screenCol;
    return posFromCoords(boardRow, boardCol);
  };

  // The destinations legal for the piece being dragged, captured at pick-up.
  // `validMoves` is state and will not have flushed by the time the drop lands.
  const dragMovesRef = useRef<string[]>([]);

  const drag = useBoardDrag({
    boardRef,
    ghostRef,
    squareAt: squareAtPoint,
    // `.inset-[6%]` on the piece leaves it at 88% of the square.
    pieceRatio: 0.88,
    onPickUp: (pos) => {
      dragMovesRef.current = destinationsFor(pos);
      selectSquare(pos);
    },
    onDrop: (fromPos, toPos) => {
      const dests = dragMovesRef.current;
      dragMovesRef.current = [];

      // Released on the square it was picked up from: that is a tap, not a
      // drag. The selection made on pick-up has to stand so the next click can
      // aim at a destination — and it is the ONLY selection that happens, since
      // pointer capture retargets the click event to the board and the square's
      // own onClick never fires for a piece.
      if (!toPos || toPos === fromPos) return;

      if (dests.includes(toPos)) {
        if (premoveMode) queuePremove(fromPos, toPos);
        else onMove(fromPos, toPos);
      } else {
        sfx.play('illegal');
      }
      setSelectedSquare(null);
      setValidMoves([]);
    },
  });

  // ── Premove firing ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!premoveRef.current) return;

    if (!allowPremoves) { setPremove(null); return; }
    // Still the opponent's move — keep waiting.
    if (gameState.currentTurn !== playerColor) return;

    const t = setTimeout(() => {
      const pm = premoveRef.current;
      if (!pm) return;
      setPremove(null);
      // Mandatory capture makes this a real filter in checkers: the opponent's
      // move can turn any quiet premove into an illegal one.
      if (isCheckersPremoveLegal(gameState, pm)) onMoveRef.current(pm.from, pm.to);
      else sfx.play('illegal');
    }, PREMOVE_FIRE_DELAY_MS);
    return () => clearTimeout(t);
  // The position and who owns it are what should re-arm this; sfx is recreated
  // on every settings change.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState, playerColor, allowPremoves]);

  // Drop a stale queue when the board stops being a premove surface.
  useEffect(() => {
    if (!premoveRef.current) return;
    if (!allowPremoves || gameState.isGameOver) setPremove(null);
  }, [allowPremoves, gameState.isGameOver]);

  const squares = [];

  for (let screenRow = 0; screenRow < 8; screenRow++) {
    for (let screenCol = 0; screenCol < 8; screenCol++) {
      const boardRow = isFlipped ? screenRow : 7 - screenRow;
      const boardCol = isFlipped ? 7 - screenCol : screenCol;
      const pos   = posFromCoords(boardRow, boardCol);
      const piece = gameState.board[boardRow][boardCol];
      const dark  = isDark(boardRow, boardCol);

      const isSelected      = selectedSquare === pos;
      const isValidDest     = validMoves.includes(pos);
      const isLastMoveSquare = lastMove && (lastMove.from === pos || lastMove.to === pos);
      const isPremoveSquare = !!premove && (premove.from === pos || premove.to === pos);

      let bg = dark ? SQUARE.dark : SQUARE.light;
      if (isSelected) bg = SQUARE.selected;
      // The queued move outranks the last move: the opponent's reply frequently
      // lands on one of these two squares, and the pending intent is what the
      // player needs to see there.
      else if (isPremoveSquare) bg = SQUARE.premove;
      else if (isLastMoveSquare && dark)  bg = SQUARE.lastMoveDark;
      else if (isLastMoveSquare && !dark) bg = SQUARE.lastMoveLight;

      // For coord labels: rank on leftmost screen column, file on bottommost screen row
      const showRank = coordsOn && screenCol === 0;
      const showFile = coordsOn && screenRow === 7;
      const labelColor = dark ? SQUARE.light : SQUARE.dark;

      squares.push(
        <div
          key={pos}
          style={{ backgroundColor: bg, aspectRatio: '1 / 1' }}
          className={`relative flex items-center justify-center ${
            dark ? (canGrab(piece) ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer') : 'cursor-default'
          }`}
          onClick={() => handleSquareClick(pos, boardRow, boardCol)}
          // Pointer-down lives on the square: the piece layer above has
          // pointer-events off, and the square knows what is standing on it.
          onPointerDown={dark && canGrab(piece) ? drag.start(pos) : undefined}
        >
          {/* Rank label */}
          {showRank && (
            <span
              className="absolute top-0.5 left-1 text-[10px] font-semibold leading-none select-none pointer-events-none z-10"
              style={{ color: labelColor, opacity: 0.75 }}
            >
              {boardRow + 1}
            </span>
          )}

          {/* File label */}
          {showFile && (
            <span
              className="absolute bottom-0.5 right-1 text-[10px] font-semibold leading-none select-none pointer-events-none z-10"
              style={{ color: labelColor, opacity: 0.75 }}
            >
              {String.fromCharCode(97 + boardCol)}
            </span>
          )}

          {/* Premove candidates — dimmer than the legal-move dots, because these
              are squares the move may be aimed at, not moves known to be playable. */}
          {dark && isValidDest && premoveMode && (
            <div className="absolute w-[22%] h-[22%] rounded-full pointer-events-none z-10"
              style={{ backgroundColor: SQUARE.premoveHint, opacity: 0.55 }} />
          )}

          {/* Move indicator dot (empty dark square) */}
          {dark && isValidDest && !premoveMode && !piece && (
            <div className="absolute w-[28%] h-[28%] rounded-full pointer-events-none z-10"
              style={{ backgroundColor: SQUARE.move }} />
          )}

          {/* Capture ring (valid dest that has an enemy piece) — shouldn't normally show
              since in checkers you land on empty squares, but guard anyway */}
          {dark && isValidDest && !premoveMode && piece && (
            <div className="absolute inset-1 rounded-full border-4 pointer-events-none z-10"
              style={{ borderColor: SQUARE.capture }} />
          )}

        </div>,
      );
    }
  }

  // ── Piece layer ────────────────────────────────────────────────────────────
  // Drawn over the squares rather than inside them: a piece parented to a grid
  // cell cannot travel out of it, and a jumped piece is unmounted before it can
  // fade. Same arrangement as the chess board.
  const pieceSlots: React.ReactNode[] = [];

  // Jumped pieces first, so a piece landing on a square is drawn over the ghost
  // rather than under it.
  for (const fade of motion.fades) {
    const screenRow = isFlipped ? fade.at.row : 7 - fade.at.row;
    const screenCol = isFlipped ? 7 - fade.at.col : fade.at.col;
    pieceSlots.push(
      <PieceSlot
        key={`f-${motion.epoch}-${fade.at.row}-${fade.at.col}`}
        square={posFromCoords(fade.at.row, fade.at.col)}
        col={screenCol}
        row={screenRow}
        offset={null}
        fading
        reducedMotion={reducedMotion}
      >
        <CheckersPiece type={fade.piece.type} color={fade.piece.color} size="100%" />
      </PieceSlot>,
    );
  }

  for (let boardRow = 0; boardRow < 8; boardRow++) {
    for (let boardCol = 0; boardCol < 8; boardCol++) {
      const piece = gameState.board[boardRow][boardCol];
      if (!piece) continue;

      const pos = posFromCoords(boardRow, boardCol);
      const screenRow = isFlipped ? boardRow : 7 - boardRow;
      const screenCol = isFlipped ? 7 - boardCol : boardCol;
      const offset = motion.offsets.get(motionKey(boardRow, boardCol)) ?? null;

      pieceSlots.push(
        <PieceSlot
          // The piece is part of the key so a capture mounts a fresh slot —
          // otherwise the arriving piece inherits the captured one's settled
          // position instead of starting at its origin.
          key={`p-${pos}-${piece.color}-${piece.type}`}
          square={pos}
          col={screenCol}
          row={screenRow}
          offset={offset}
          reducedMotion={reducedMotion}
          // A piece that slid has already announced itself; popping it too
          // reads as a stutter at the end of the travel.
          pieceClassName={`transition-transform duration-200 ease-out ${
            lastMoveTo === pos && !offset ? 'scale-110' : 'scale-100'
          } ${drag.from === pos ? 'opacity-40' : ''}`}
        >
          <CheckersPiece type={piece.type} color={piece.color} size="100%" />
        </PieceSlot>,
      );
    }
  }

  return (
    <BoardFrame className="select-none">
      <div
        ref={boardRef}
        className="relative grid grid-cols-8 grid-rows-8 w-full h-full rounded-lg overflow-hidden shadow-lg transition-shadow duration-300"
        // Right-click anywhere takes back a queued premove — the shortcut
        // players expect from other boards.
        onContextMenu={(e) => {
          if (!premoveRef.current) return;
          e.preventDefault();
          setPremove(null);
        }}
        {...drag.boardHandlers}
        style={{
          border: `2px solid ${SQUARE.frame}`,
          // The browser must not claim the gesture for scroll or zoom — this is
          // what makes drag work on touch at all.
          touchAction: 'none',
          boxShadow: isMyTurn
            ? 'var(--gx-checkers-board-turn-glow, 0 12px 28px -6px rgba(0,0,0,0.5), 0 0 0 2px rgba(236,72,153,0.6), 0 0 30px -2px rgba(236,72,153,0.5))'
            : undefined,
        }}
      >
        {squares}
        {/* Pieces ride above the squares so they can travel between them. */}
        <div className="absolute inset-0 pointer-events-none z-20">{pieceSlots}</div>
        {arrows && arrows.length > 0 && (
          <ArrowOverlay arrows={arrows} isFlipped={isFlipped} />
        )}
      </div>

      {/* Floating copy under the cursor — positioned imperatively on every
          pointermove so React never re-renders the board to move it. */}
      <div
        ref={ghostRef}
        className="fixed items-center justify-center pointer-events-none"
        style={{
          display: drag.from ? 'flex' : 'none',
          zIndex: 9999,
          cursor: 'grabbing',
        }}
      >
        {drag.from && (() => {
          const p = gameState.board[rowOf(drag.from)][colOf(drag.from)];
          return p ? <CheckersPiece type={p.type} color={p.color} size="100%" /> : null;
        })()}
      </div>
    </BoardFrame>
  );
});
