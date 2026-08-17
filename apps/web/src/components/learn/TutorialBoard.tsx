import type { CSSProperties } from 'react';
import type { DiagramArrow, DiagramHighlight, TutorialDiagram } from '@gameexplorer/shared';
import {
  ChessPiece,
  CheckersPiece,
  ReversiDisc,
  GoStone,
  BOARD_COLORS,
  CHECKERS_BOARD_COLORS,
  REVERSI_BOARD_COLORS,
  GO_BOARD_COLORS,
  GO_STAR_POINTS_9,
} from '@gameexplorer/ui';

/**
 * Static, server-renderable board diagram for the "How to play" pages.
 * Pure presentation: no hooks, no gestures, no engines — just the shared
 * piece SVGs and board tokens laid out on a CSS grid. Mirrors the square
 * conventions of the interactive boards (white at bottom, (row+col) even =
 * light square).
 */

/** SVG center coords in the interactive boards' 0-800 space (one square = 100 units). */
function posToSvgCenter(pos: string): { x: number; y: number } {
  const col = pos.charCodeAt(0) - 'a'.charCodeAt(0);
  const row = parseInt(pos[1], 10) - 1;
  return { x: col * 100 + 50, y: (7 - row) * 100 + 50 };
}

// Same polygon geometry as ArrowOverlay in ChessBoard.tsx, minus the flip
// branch — tutorial diagrams are always white-at-bottom.
function ArrowOverlay({ arrows }: { arrows: DiagramArrow[] }) {
  return (
    <svg
      className="absolute inset-0 w-full h-full pointer-events-none z-20"
      viewBox="0 0 800 800"
      xmlns="http://www.w3.org/2000/svg"
    >
      {arrows.map((arrow, i) => {
        const from = posToSvgCenter(arrow.from);
        const to = posToSvgCenter(arrow.to);
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

        const startX = from.x + nx * 28;
        const startY = from.y + ny * 28;
        const endX = to.x - nx * headSize;
        const endY = to.y - ny * headSize;

        const x1 = startX + (px * bodyWidth) / 2;
        const y1 = startY + (py * bodyWidth) / 2;
        const x2 = startX - (px * bodyWidth) / 2;
        const y2 = startY - (py * bodyWidth) / 2;
        const x3 = endX - (px * bodyWidth) / 2;
        const y3 = endY - (py * bodyWidth) / 2;
        const x4 = endX + (px * bodyWidth) / 2;
        const y4 = endY + (py * bodyWidth) / 2;

        const hx1 = to.x;
        const hy1 = to.y;
        const hx2 = endX + px * headSize * 0.9;
        const hy2 = endY + py * headSize * 0.9;
        const hx3 = endX - px * headSize * 0.9;
        const hy3 = endY - py * headSize * 0.9;

        const points = `${x1},${y1} ${x2},${y2} ${x3},${y3} ${hx3},${hy3} ${hx1},${hy1} ${hx2},${hy2} ${x4},${y4}`;

        return <polygon key={i} points={points} fill="rgba(255, 170, 0, 0.82)" />;
      })}
    </svg>
  );
}

interface SquarePalette {
  light: string;
  dark: string;
  lastMoveLight: string;
  lastMoveDark: string;
  move: string;
  capture: string;
}

/**
 * Diagram squares track the live boards: each slot reads the `--gx-*-board-*`
 * variable globals.css declares per theme, falling back to the shared token.
 */
const CHESS_PALETTE: SquarePalette = {
  light: `var(--gx-board-light, ${BOARD_COLORS.lightSquare})`,
  dark: `var(--gx-board-dark, ${BOARD_COLORS.darkSquare})`,
  lastMoveLight: `var(--gx-board-lastmove-light, ${BOARD_COLORS.lastMoveLight})`,
  lastMoveDark: `var(--gx-board-lastmove-dark, ${BOARD_COLORS.lastMoveDark})`,
  move: `var(--gx-board-move, ${BOARD_COLORS.moveIndicator})`,
  capture: `var(--gx-board-move-capture, ${BOARD_COLORS.moveIndicatorCapture})`,
};

const CHECKERS_PALETTE: SquarePalette = {
  light: `var(--gx-checkers-board-light, ${CHECKERS_BOARD_COLORS.lightSquare})`,
  dark: `var(--gx-checkers-board-dark, ${CHECKERS_BOARD_COLORS.darkSquare})`,
  lastMoveLight: `var(--gx-checkers-board-lastmove-light, ${CHECKERS_BOARD_COLORS.lastMoveLight})`,
  lastMoveDark: `var(--gx-checkers-board-lastmove-dark, ${CHECKERS_BOARD_COLORS.lastMoveDark})`,
  move: `var(--gx-checkers-board-move, ${CHECKERS_BOARD_COLORS.moveIndicator})`,
  capture: `var(--gx-checkers-board-capture, ${CHECKERS_BOARD_COLORS.captureIndicator})`,
};

/** Reversi's legal-move dot and flip ring — one hue, themed with the felt. */
const REVERSI_RING = `var(--gx-reversi-board-lastmove-ring, ${REVERSI_BOARD_COLORS.lastMoveRing})`;

function pieceFor(diagram: TutorialDiagram, square: string) {
  if (diagram.game === 'chess') {
    const p = diagram.pieces.find(pc => pc.square === square);
    return p ? <ChessPiece type={p.piece} color={p.color} size="100%" /> : null;
  }
  if (diagram.game === 'checkers') {
    const p = diagram.pieces.find(pc => pc.square === square);
    return p ? <CheckersPiece type={p.piece} color={p.color} size="100%" /> : null;
  }
  const p = diagram.pieces.find(pc => pc.square === square);
  return p ? <ReversiDisc color={p.color} size="100%" /> : null;
}

/**
 * Go's diagrams take their own renderer rather than a branch inside the 8×8
 * grid below. Nothing about that grid applies: a Go board has no cells to
 * colour, no light/dark alternation, and the stones sit on the LINES' crossings
 * — so the layout is one SVG of ruled lines with stones positioned over it.
 * Static and hook-free like the rest of this file, so it server-renders.
 */
function GoTutorialBoard({ diagram }: { diagram: Extract<TutorialDiagram, { game: 'go' }> }) {
  const { size } = diagram;
  const cell = 100 / size;
  const at = (index: number) => (index + 0.5) * cell;

  const highlights = new Map<string, DiagramHighlight['kind'][]>();
  for (const h of diagram.highlights ?? []) {
    highlights.set(h.square, [...(highlights.get(h.square) ?? []), h.kind]);
  }

  const lines = [];
  for (let i = 0; i < size; i++) {
    const edge = i === 0 || i === size - 1;
    const stroke = edge
      ? `var(--gx-go-board-line-strong, ${GO_BOARD_COLORS.lineStrong})`
      : `var(--gx-go-board-line, ${GO_BOARD_COLORS.line})`;
    const p = at(i);
    lines.push(
      <line key={`h${i}`} x1={at(0)} y1={p} x2={at(size - 1)} y2={p} stroke={stroke} strokeWidth={edge ? 0.45 : 0.28} />,
      <line key={`v${i}`} x1={p} y1={at(0)} x2={p} y2={at(size - 1)} stroke={stroke} strokeWidth={edge ? 0.45 : 0.28} />,
    );
  }

  const marks = [];
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      const pos = `${String.fromCharCode(97 + col)}${row + 1}`;
      const stone = diagram.pieces.find(p => p.square === pos);
      const kinds = highlights.get(pos) ?? [];
      if (!stone && kinds.length === 0) continue;

      const style: CSSProperties = {
        position: 'absolute',
        left: `${at(col)}%`,
        top: `${at(size - 1 - row)}%`,
        width: `${cell}%`,
        height: `${cell}%`,
        transform: 'translate(-50%, -50%)',
      };

      marks.push(
        <div key={pos} style={style} className="flex items-center justify-center">
          {stone && (
            <div className="h-[94%] w-[94%]">
              <GoStone color={stone.color} size="100%" />
            </div>
          )}
          {!stone && kinds.includes('move') && (
            <div
              className="h-[30%] w-[30%] rounded-full"
              style={{ backgroundColor: `var(--gx-go-board-ghost, ${GO_BOARD_COLORS.ghost})` }}
            />
          )}
          {(kinds.includes('capture') || kinds.includes('target')) && (
            <div
              className="absolute inset-[6%] rounded-full border-2"
              style={{ borderColor: `var(--gx-go-board-last-move, ${GO_BOARD_COLORS.lastMoveRing})` }}
            />
          )}
        </div>,
      );
    }
  }

  const coordColor = `var(--gx-go-board-coordinate, ${GO_BOARD_COLORS.coordinate})`;

  return (
    <figure className="mx-auto my-6 w-full max-w-[340px]">
      <div
        role="img"
        aria-label={diagram.caption}
        className="relative overflow-hidden rounded-xl"
        style={{
          aspectRatio: '1 / 1',
          background: `var(--gx-go-board-surface, ${GO_BOARD_COLORS.surface})`,
          border: `2px solid var(--gx-go-board-border, ${GO_BOARD_COLORS.boardBorder})`,
        }}
      >
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full" aria-hidden="true">
          {lines}
          {size === 9 &&
            GO_STAR_POINTS_9.map(([row, col]) => (
              <circle
                key={`star-${row}-${col}`}
                cx={at(col)}
                cy={at(size - 1 - row)}
                r={0.7}
                fill={`var(--gx-go-board-hoshi, ${GO_BOARD_COLORS.hoshi})`}
              />
            ))}
        </svg>

        {diagram.coordinates &&
          Array.from({ length: size }, (_, i) => (
            <span key={`coord-${i}`}>
              <span
                className="absolute -translate-x-1/2 text-[9px] font-semibold leading-none select-none"
                style={{ left: `${at(i)}%`, bottom: '1%', color: coordColor }}
              >
                {GO_FILE_LETTERS[i]}
              </span>
              <span
                className="absolute -translate-y-1/2 text-[9px] font-semibold leading-none select-none"
                style={{ top: `${at(size - 1 - i)}%`, left: '1%', color: coordColor }}
              >
                {i + 1}
              </span>
            </span>
          ))}

        {marks}
      </div>
      <figcaption className="mt-3 text-center text-sm text-fg-muted leading-relaxed">
        {diagram.caption}
      </figcaption>
    </figure>
  );
}

/** Go's display files skip I — see the notation module. */
const GO_FILE_LETTERS = 'ABCDEFGHJKLMNOPQRST';

export function TutorialBoard({ diagram }: { diagram: TutorialDiagram }) {
  if (diagram.game === 'go') return <GoTutorialBoard diagram={diagram} />;

  const isReversi = diagram.game === 'reversi';
  const palette = diagram.game === 'chess' ? CHESS_PALETTE : CHECKERS_PALETTE;
  const highlightsBySquare = new Map<string, DiagramHighlight['kind'][]>();
  for (const h of diagram.highlights ?? []) {
    highlightsBySquare.set(h.square, [...(highlightsBySquare.get(h.square) ?? []), h.kind]);
  }

  const squares = [];
  for (let screenRow = 0; screenRow < 8; screenRow++) {
    for (let col = 0; col < 8; col++) {
      const row = 7 - screenRow;
      const pos = `${String.fromCharCode(97 + col)}${row + 1}`;
      const isLight = (row + col) % 2 === 0;
      const kinds = highlightsBySquare.get(pos) ?? [];
      const piece = pieceFor(diagram, pos);

      let bg: string;
      if (isReversi) {
        bg = `var(--gx-reversi-board-cell, ${REVERSI_BOARD_COLORS.cell})`;
      } else if (kinds.includes('origin') || kinds.includes('target')) {
        bg = isLight ? palette.lastMoveLight : palette.lastMoveDark;
      } else {
        bg = isLight ? palette.light : palette.dark;
      }

      const showRank = diagram.coordinates && col === 0;
      const showFile = diagram.coordinates && screenRow === 7;
      const labelColor = isReversi
        ? 'rgba(255,255,255,0.5)'
        : isLight
          ? palette.dark
          : palette.light;

      squares.push(
        <div
          key={pos}
          className="relative"
          style={{ backgroundColor: bg, aspectRatio: '1 / 1' } as CSSProperties}
        >
          {showRank && (
            <span
              className="absolute top-0.5 left-1 text-[10px] font-semibold leading-none select-none z-10"
              style={{ color: labelColor, opacity: 0.75 }}
            >
              {row + 1}
            </span>
          )}
          {showFile && (
            <span
              className="absolute bottom-0.5 right-1 text-[10px] font-semibold leading-none select-none z-10"
              style={{ color: labelColor, opacity: 0.75 }}
            >
              {String.fromCharCode(97 + col)}
            </span>
          )}

          {/* Legal-move dot */}
          {kinds.includes('move') && !piece && (
            <div
              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[30%] h-[30%] rounded-full z-10"
              style={{ backgroundColor: isReversi ? REVERSI_RING : palette.move }}
            />
          )}

          {/* Capture ring */}
          {kinds.includes('capture') && (
            <div
              className="absolute inset-[8%] rounded-full border-4 z-10"
              style={{ borderColor: isReversi ? 'var(--c-danger)' : palette.capture }}
            />
          )}

          {/* Reversi flip ring — a disc about to change color */}
          {isReversi && (kinds.includes('origin') || kinds.includes('target')) && (
            <div
              className="absolute inset-[6%] rounded-full border-4 z-10"
              style={{ borderColor: REVERSI_RING }}
            />
          )}

          {piece && <div className="absolute inset-[8%]">{piece}</div>}
        </div>,
      );
    }
  }

  return (
    <figure className="mx-auto my-6 w-full max-w-[340px]">
      <div
        role="img"
        aria-label={diagram.caption}
        className="relative grid grid-cols-8 rounded-xl overflow-hidden"
        style={
          isReversi
            ? { gap: 1, padding: 4, backgroundColor: `var(--gx-reversi-board-frame, ${REVERSI_BOARD_COLORS.boardBorder})` }
            : undefined
        }
      >
        {squares}
        {diagram.arrows && diagram.arrows.length > 0 && <ArrowOverlay arrows={diagram.arrows} />}
      </div>
      <figcaption className="mt-3 text-center text-sm text-fg-muted leading-relaxed">
        {diagram.caption}
      </figcaption>
    </figure>
  );
}
