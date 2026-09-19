'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  GoEngine,
  boardAnimMs,
  confirmPlacementFor,
  inGoPointDeadZone,
  placementOnRelease,
} from '@gameexplorer/shared';
import type { GoColor, GoGameState, LessonMark } from '@gameexplorer/shared';
import { GO_BOARD_COLORS, goStarPoints, GoStone } from '@gameexplorer/ui';
import { BoardFrame } from '@/components/board/BoardFrame';
import { BoardMark, markMap } from '@/components/board/BoardMark';
import { useCoarsePointer } from '@/hooks/useCoarsePointer';
import { useGameSfx } from '@/hooks/useGameSfx';
import { useSettings } from '@/components/providers/SettingsProvider';

/**
 * Board palette, read from the `--gx-go-board-*` variables globals.css declares
 * per theme with the shared token as the fallback — the contract CheckersBoard
 * and ReversiBoard use, so a theme can repaint the board from CSS alone.
 */
const WOOD = {
  surface:      `var(--gx-go-board-surface, ${GO_BOARD_COLORS.surface})`,
  surfaceEdge:  `var(--gx-go-board-surface-edge, ${GO_BOARD_COLORS.surfaceEdge})`,
  line:         `var(--gx-go-board-line, ${GO_BOARD_COLORS.line})`,
  lineStrong:   `var(--gx-go-board-line-strong, ${GO_BOARD_COLORS.lineStrong})`,
  hoshi:        `var(--gx-go-board-hoshi, ${GO_BOARD_COLORS.hoshi})`,
  border:       `var(--gx-go-board-border, ${GO_BOARD_COLORS.boardBorder})`,
  coordinate:   `var(--gx-go-board-coordinate, ${GO_BOARD_COLORS.coordinate})`,
  lastMoveOnBlack: `var(--gx-go-board-last-move-on-black, ${GO_BOARD_COLORS.lastMoveOnBlack})`,
  lastMoveOnWhite: `var(--gx-go-board-last-move-on-white, ${GO_BOARD_COLORS.lastMoveOnWhite})`,
  aimLine:      `var(--gx-go-board-aim-line, ${GO_BOARD_COLORS.aimLine})`,
  ghost:        `var(--gx-go-board-ghost, ${GO_BOARD_COLORS.ghost})`,
  hintRing:     `var(--gx-go-board-hint, ${GO_BOARD_COLORS.hintRing})`,
  territoryBlack: `var(--gx-go-board-territory-black, ${GO_BOARD_COLORS.territoryBlack})`,
  territoryWhite: `var(--gx-go-board-territory-white, ${GO_BOARD_COLORS.territoryWhite})`,
  territoryEdge:  `var(--gx-go-board-territory-edge, ${GO_BOARD_COLORS.territoryEdge})`,
} as const;

/** Column letters as Go writes them — I is skipped. */
const LETTERS = 'ABCDEFGHJKLMNOPQRST';

/** Stone diameter as a fraction of the distance between two lines. */
const STONE_RATIO = 0.94;

/** The preview and aim stones: see-through enough to read as not yet played. */
const PREVIEW_OPACITY = 0.6;

export interface GoBoardProps {
  gameState: GoGameState;
  /** Called with the tapped intersection. */
  onMove: (position: string) => void;
  /** Whose legal points are shown and whose stone the ghost preview wears. */
  playerColor: GoColor;
  showCoordinates?: boolean;
  /** Ring the stone just played. */
  highlightPos?: string | null;
  /** Training hint — outlines the point the engine would play. */
  hintPos?: string | null;
  /**
   * Coached annotations, drawn per intersection — see `BoardMark`.
   *
   * `highlightPos` and `hintPos` above are singular; a lesson about liberties
   * or eye shape has to number several points at once, which is exactly what
   * the static `GoDiagram.labels` already does on the rules page.
   */
  highlightSquares?: LessonMark[];
  /**
   * Board is inert. Real inertness, not a swallowed `onMove`: an inert board
   * must not offer a ghost stone or a pointer cursor either.
   */
  interactive?: boolean;
  /**
   * Points agreed dead in the end-of-game review. Drawn as ghosts of themselves
   * — still visible, because the player is being asked to check them, but
   * plainly no longer on the board.
   */
  deadStones?: readonly string[];
  /**
   * Who each empty point will count for. Drawn as small squares, which is how
   * every Go client shows a finished count.
   */
  ownership?: ReadonlyMap<string, GoColor | null> | null;
  /**
   * Review mode: tapping a stone toggles its whole chain dead or alive. Its
   * presence is what switches the board out of placement mode — legal points
   * stop being offered, and every stone becomes the target instead.
   */
  onMarkToggle?: (position: string) => void;
}

function positionAt(row: number, col: number): string {
  return String.fromCharCode(97 + col) + (row + 1);
}

/**
 * The Go board.
 *
 * Structurally unlike the app's other three: there are no cells to paint, and a
 * stone sits **on a line crossing** rather than inside a square. So the grid is
 * one SVG of ruled lines, and the stones are an absolutely-positioned layer over
 * it — which is also how web's chess and checkers boards ended up after the
 * board-responsiveness pass, for the unrelated reason that a piece parented to a
 * grid cell cannot travel out of it.
 *
 * The geometry is the whole trick: an N-line board is inset by half a cell all
 * round, so line `i` sits at `(i + 0.5) / N` of the edge and the outermost lines
 * have a margin to breathe in — which is exactly where the coordinates go.
 *
 * Stones never move, so there is no `useBoardMotion` here (see ReversiBoard for
 * the same note about discs). Captures are a removal, and they fade.
 */
export const GoBoard = React.memo(function GoBoard({
  gameState,
  onMove,
  playerColor,
  showCoordinates = true,
  highlightPos,
  hintPos,
  highlightSquares,
  interactive = true,
  deadStones,
  ownership,
  onMarkToggle,
}: GoBoardProps) {
  const { size } = gameState;
  const [hovered, setHovered] = useState<string | null>(null);
  const [captured, setCaptured] = useState<string[]>([]);
  const sfx = useGameSfx();
  const { settings, reducedMotion } = useSettings();
  const coordsOn = showCoordinates && settings.showCoordinates;
  const coarse = useCoarsePointer();
  // A captured stone fades out only when pieces animate on this device.
  const animates = boardAnimMs(settings, reducedMotion) > 0;

  // Sound + the fading ghosts of stones that just came off.
  const historyLength = gameState.moveHistory.length;
  const lastMoveRef = useRef(historyLength);
  useEffect(() => {
    if (historyLength === 0 || historyLength === lastMoveRef.current) {
      lastMoveRef.current = historyLength;
      return;
    }
    lastMoveRef.current = historyLength;

    const latest = gameState.moveHistory[historyLength - 1];
    if (!latest.position) return; // a pass has nothing to draw or play

    sfx.play(latest.captures.length > 0 ? 'capture' : 'move');
    if (latest.captures.length === 0) return;

    setCaptured(latest.captures);
    const timer = setTimeout(() => setCaptured([]), 320);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historyLength]);

  const marking = !!onMarkToggle;
  const isPlayerTurn = gameState.currentTurn === playerColor && !gameState.isGameOver;

  /**
   * Aim-then-confirm, for a finger. A mouse can hit a 19×19 intersection that a
   * fingertip cannot — a point there is about 19px across on a phone, under
   * WCAG's 24px floor — so a phone browser gets the native board's rule: above
   * 9×9, or whenever the player asks, the first tap aims (a see-through stone
   * with crosshairs) and a second tap on the same point plays it. The rule and
   * its bounce guard are shared with the native board (`goPlacement` in
   * shared). Marking is exempt: toggling a chain dead is reversible.
   */
  const confirmMode = coarse && confirmPlacementFor(size, settings) && !marking;
  // The aim remembers the position it was made in: a move landing (ours or the
  // opponent's) makes it stale, and it simply stops being drawn.
  const [aimed, setAimed] = useState<{ position: string; at: number; ply: number } | null>(null);
  const aim = confirmMode && aimed?.ply === historyLength ? aimed.position : null;

  const place = (position: string) => {
    if (!confirmMode) {
      onMove(position);
      return;
    }
    const now = Date.now();
    const outcome = placementOnRelease({
      confirm: true,
      released: position,
      aimAtPress: aim,
      msSinceAim: aimed ? now - aimed.at : undefined,
    });
    if (outcome === 'commit') {
      setAimed(null);
      onMove(position);
    } else if (position !== aim) {
      setAimed({ position, at: now, ply: historyLength });
    }
  };

  /**
   * Is a mouse too near the edge of this point's box to claim it (OGS's dead
   * zone)? A click there is not a stone: the preview was withheld, so nothing
   * was offered. A finger has no preview to withhold, so this is mouse-only.
   */
  const mouseInDeadZone = (e: React.PointerEvent | React.MouseEvent): boolean => {
    const pointerType = (e.nativeEvent as PointerEvent).pointerType;
    if (pointerType !== 'mouse') return false;
    const r = e.currentTarget.getBoundingClientRect();
    return inGoPointDeadZone((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
  };

  // Legal-move generation walks every empty point and floods each one, so it is
  // by far the most expensive thing here — keep it off every unrelated re-render
  // (a clock tick, a hover) and off the opponent's turn, when nothing shows it.
  // During the review there are no legal points at all: the question has stopped
  // being "where may I play" and become "which of these are dead".
  const legalMoves = useMemo(
    () =>
      interactive && isPlayerTurn && !marking
        ? new Set(GoEngine.getAllLegalMoves(gameState))
        : new Set<string>(),
    [gameState, interactive, isPlayerTurn, marking],
  );

  const dead = useMemo(() => new Set(deadStones ?? []), [deadStones]);

  const cell = 100 / size;
  const at = (index: number) => (index + 0.5) * cell;

  // `goStarPoints(size)`, not `size === 9 ? … : []`. The old form drew no star
  // points at all on any other board and could not fail a typecheck — the
  // silent-empty fallback this repo has shipped six times.
  const stars = goStarPoints(size);

  const lines = [];
  for (let i = 0; i < size; i++) {
    const edge = i === 0 || i === size - 1;
    const p = at(i);
    lines.push(
      <line
        key={`h${i}`}
        x1={at(0)} y1={p} x2={at(size - 1)} y2={p}
        stroke={edge ? WOOD.lineStrong : WOOD.line}
        strokeWidth={edge ? 0.45 : 0.28}
        vectorEffect="non-scaling-stroke"
      />,
      <line
        key={`v${i}`}
        x1={p} y1={at(0)} x2={p} y2={at(size - 1)}
        stroke={edge ? WOOD.lineStrong : WOOD.line}
        strokeWidth={edge ? 0.45 : 0.28}
        vectorEffect="non-scaling-stroke"
      />,
    );
  }

  const points = [];
  const marks = markMap(highlightSquares);
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      // Row 0 is rank 1, which is drawn at the BOTTOM — so screen y inverts.
      const position = positionAt(row, col);
      const x = at(col);
      const y = at(size - 1 - row);
      const stone = gameState.board[row][col];
      const isLegal = legalMoves.has(position);
      // The hover preview is a mouse's alone — see the pointer handlers below.
      const isGhost = isLegal && !confirmMode && hovered === position;
      const isAim = isLegal && aim === position;
      const isDead = dead.has(position);
      // A dead stone's point already belongs to the other side, so it is shaded
      // like any other empty point rather than left blank.
      const owner = ownership && (stone === null || isDead) ? ownership.get(position) ?? null : null;
      const markable = marking && stone !== null;

      points.push(
        <div
          key={position}
          data-pos={position}
          data-stone={stone ?? undefined}
          data-legal={isLegal || undefined}
          data-dead={isDead || undefined}
          data-territory={owner ?? undefined}
          onClick={(e) => {
            if (!interactive) return;
            if (markable) onMarkToggle!(position);
            else if (isLegal && !mouseInDeadZone(e)) place(position);
          }}
          // A preview only where a pointer can hover without pressing: a
          // finger's emulated hover would leave a ghost stone stuck on the last
          // point tapped. Withheld near the point's edge, where the pointer is
          // between two intersections rather than on one.
          onPointerMove={(e) => {
            if (e.pointerType !== 'mouse') return;
            const next = mouseInDeadZone(e) ? null : position;
            setHovered(prev => (prev === next ? prev : next));
          }}
          onPointerLeave={() => setHovered(prev => (prev === position ? null : prev))}
          className={`absolute flex items-center justify-center ${
            isLegal || markable ? 'cursor-pointer' : 'cursor-default'
          }`}
          style={{
            left: `${x}%`,
            top: `${y}%`,
            width: `${cell}%`,
            height: `${cell}%`,
            transform: 'translate(-50%, -50%)',
          }}
        >
          {stone && (
            <div
              className="pointer-events-none flex items-center justify-center transition-opacity"
              style={{
                width: `${(isDead ? STONE_RATIO * 0.7 : STONE_RATIO) * 100}%`,
                height: `${(isDead ? STONE_RATIO * 0.7 : STONE_RATIO) * 100}%`,
                // A dead black stone at 0.3 on dark wood is simply not there,
                // and the player is being asked to *check* these. Half opacity
                // plus the ring below keeps them findable while still reading
                // as removed.
                opacity: isDead ? 0.5 : 1,
              }}
            >
              <GoStone color={stone} size="100%" />
            </div>
          )}

          {/* A dashed ring around a dead stone. The ghost alone is ambiguous —
              a faint stone could be a rendering artefact — and this says "this
              one is coming off" in a way that survives either theme. */}
          {isDead && (
            <div
              className="pointer-events-none absolute rounded-full"
              style={{
                width: `${STONE_RATIO * 100}%`,
                height: `${STONE_RATIO * 100}%`,
                border: `1.5px dashed ${WOOD.coordinate}`,
              }}
            />
          )}

          {/* Territory marker. Squares, not dots — a dot at this size reads as
              a stone, which is the one thing it must not be mistaken for. */}
          {owner && (
            <div
              className="pointer-events-none absolute"
              style={{
                width: '21%',
                height: '21%',
                background: owner === 'black' ? WOOD.territoryBlack : WOOD.territoryWhite,
                border: `1px solid ${WOOD.territoryEdge}`,
              }}
            />
          )}

          {/* A stone that just came off, fading out where it stood. The colour
              is `currentTurn` because the side to move after a capture is
              exactly the side whose stones were taken. */}
          {animates && !stone && captured.includes(position) && (
            <div
              className="pointer-events-none flex items-center justify-center motion-safe:[animation:gx-stone-captured_300ms_ease-out_forwards] motion-reduce:opacity-0"
              style={{ width: `${STONE_RATIO * 100}%`, height: `${STONE_RATIO * 100}%` }}
            >
              <GoStone color={gameState.currentTurn} size="100%" />
            </div>
          )}

          {/* Ghost stone under the cursor — Go's equivalent of a legal-move dot,
              and better than one: where the stone would land is the question. */}
          {!stone && (isGhost || isAim) && (
            <div
              className="pointer-events-none flex items-center justify-center"
              style={{
                width: `${STONE_RATIO * 100}%`,
                height: `${STONE_RATIO * 100}%`,
                opacity: PREVIEW_OPACITY,
              }}
              data-aim={isAim || undefined}
            >
              <GoStone color={playerColor} size="100%" />
            </div>
          )}

          {/* Last move — a ring in the other stone's colour, about 7.5% of a
              point wide, so it reads on its own stone without an accent hue. */}
          {stone && highlightPos === position && (
            // In the point's own 100-unit box, so the ring's width scales with
            // the board: 7.5 units is 7.5% of a point.
            <svg
              className="pointer-events-none absolute inset-0 h-full w-full"
              viewBox="0 0 100 100"
              aria-hidden="true"
            >
              <circle
                cx={50}
                cy={50}
                r={19.75}
                fill="none"
                strokeWidth={7.5}
                stroke={stone === 'black' ? WOOD.lastMoveOnBlack : WOOD.lastMoveOnWhite}
              />
            </svg>
          )}

          {marks.has(position) && <BoardMark mark={marks.get(position)!} round />}

          {/* Training hint — still: the player asked for it, so it does not
              need to call attention to itself. */}
          {hintPos === position && (
            <div
              className="pointer-events-none absolute rounded-full"
              style={{
                width: `${STONE_RATIO * 100}%`,
                height: `${STONE_RATIO * 100}%`,
                border: `2px solid ${WOOD.hintRing}`,
              }}
            />
          )}
        </div>,
      );
    }
  }

  return (
    <BoardFrame className="select-none">
      <div
        className="relative h-full w-full overflow-hidden rounded-lg shadow-lg"
        style={{
          background: `radial-gradient(circle at 30% 20%, ${WOOD.surface}, ${WOOD.surfaceEdge})`,
          border: `2px solid ${WOOD.border}`,
        }}
      >
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="pointer-events-none absolute inset-0 h-full w-full"
          aria-hidden="true"
        >
          {lines}
          {stars.map(([row, col]) => (
            <circle
              key={`star-${row}-${col}`}
              cx={at(col)}
              cy={at(size - 1 - row)}
              r={0.7}
              fill={WOOD.hoshi}
            />
          ))}
        </svg>

        {coordsOn && (
          <div className="pointer-events-none absolute inset-0" aria-hidden="true">
            {Array.from({ length: size }, (_, i) => (
              <React.Fragment key={`coord-${i}`}>
                {/* Files along the bottom margin, ranks up the left one. */}
                <span
                  className="absolute -translate-x-1/2 text-2xs font-semibold leading-none"
                  style={{ left: `${at(i)}%`, bottom: '1%', color: WOOD.coordinate }}
                >
                  {LETTERS[i]}
                </span>
                <span
                  className="absolute -translate-y-1/2 text-2xs font-semibold leading-none"
                  style={{ top: `${at(size - 1 - i)}%`, left: '1%', color: WOOD.coordinate }}
                >
                  {i + 1}
                </span>
              </React.Fragment>
            ))}
          </div>
        )}

        {/* Crosshairs through an aimed point, so the aim reads at 19×19,
            where the stone is barely bigger than the finger hiding it. */}
        {aim && (
          <div className="pointer-events-none absolute inset-0" aria-hidden="true">
            <div
              className="absolute inset-x-0 h-px"
              style={{ top: `${at(size - parseInt(aim.slice(1), 10))}%`, background: WOOD.aimLine }}
            />
            <div
              className="absolute inset-y-0 w-px"
              style={{ left: `${at(aim.charCodeAt(0) - 97)}%`, background: WOOD.aimLine }}
            />
          </div>
        )}

        {points}
      </div>
    </BoardFrame>
  );
});
