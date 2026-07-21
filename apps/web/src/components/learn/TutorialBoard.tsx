import type { CSSProperties } from 'react';
import type { DiagramArrow, DiagramHighlight, TutorialDiagram } from '@gameexplorer/shared';
import {
  ChessPiece,
  CheckersPiece,
  ReversiDisc,
  BOARD_COLORS,
  CHECKERS_BOARD_COLORS,
  REVERSI_BOARD_COLORS,
  COLORS,
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

const CHESS_PALETTE: SquarePalette = {
  light: BOARD_COLORS.lightSquare,
  dark: BOARD_COLORS.darkSquare,
  lastMoveLight: BOARD_COLORS.lastMoveLight,
  lastMoveDark: BOARD_COLORS.lastMoveDark,
  move: BOARD_COLORS.moveIndicator,
  capture: BOARD_COLORS.moveIndicatorCapture,
};

const CHECKERS_PALETTE: SquarePalette = {
  light: CHECKERS_BOARD_COLORS.lightSquare,
  dark: CHECKERS_BOARD_COLORS.darkSquare,
  lastMoveLight: CHECKERS_BOARD_COLORS.lastMoveLight,
  lastMoveDark: CHECKERS_BOARD_COLORS.lastMoveDark,
  move: CHECKERS_BOARD_COLORS.moveIndicator,
  capture: CHECKERS_BOARD_COLORS.captureIndicator,
};

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

export function TutorialBoard({ diagram }: { diagram: TutorialDiagram }) {
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
        bg = REVERSI_BOARD_COLORS.cell;
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
              style={{ backgroundColor: isReversi ? REVERSI_BOARD_COLORS.lastMoveRing : palette.move }}
            />
          )}

          {/* Capture ring */}
          {kinds.includes('capture') && (
            <div
              className="absolute inset-[8%] rounded-full border-4 z-10"
              style={{ borderColor: isReversi ? COLORS.danger : palette.capture }}
            />
          )}

          {/* Reversi flip ring — a disc about to change color */}
          {isReversi && (kinds.includes('origin') || kinds.includes('target')) && (
            <div
              className="absolute inset-[6%] rounded-full border-4 z-10"
              style={{ borderColor: REVERSI_BOARD_COLORS.lastMoveRing }}
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
            ? { gap: 1, padding: 4, backgroundColor: REVERSI_BOARD_COLORS.boardBorder }
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
