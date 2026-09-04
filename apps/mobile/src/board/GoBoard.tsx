import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Svg, { Circle, Line } from 'react-native-svg';
import { GoEngine, goColumnLabel } from '@gameexplorer/shared';
import type { GoColor, GoGameState } from '@gameexplorer/shared';
import { GO_BOARD_COLORS, GO_STAR_POINTS_9, GoStone } from '@gameexplorer/ui';
import { BoardFrame } from './BoardFrame';
import { useGameSfx } from '@/audio/useGameSfx.native';
import { useSettings } from '@/providers/SettingsProvider';
import { FONTS } from '@/theme/typography';

interface GoBoardProps {
  gameState: GoGameState;
  /** Called with the tapped intersection. */
  onMove: (position: string) => void;
  playerColor: GoColor;
  showCoordinates?: boolean;
  /** Ring the stone just played (only while at the live position). */
  highlightPos?: string | null;
  /** Board is inert while reviewing history / after game end. */
  interactive?: boolean;
  /** Training hint — outlines the point the engine would play. */
  hintPos?: string | null;
  /**
   * Points agreed dead in the end-of-game review. Drawn as ghosts of themselves
   * inside a dashed ring — still visible, because the player is being asked to
   * check them, but plainly no longer on the board.
   */
  deadStones?: readonly string[];
  /** Who each empty point will count for, drawn as the small square Go uses. */
  ownership?: ReadonlyMap<string, GoColor | null> | null;
  /**
   * Review mode: tapping a stone toggles its whole chain dead or alive. Its
   * presence is what switches the board out of placement — legal points stop
   * being offered, and every stone becomes the target instead.
   */
  onMarkToggle?: (position: string) => void;
}

/** Stone diameter as a fraction of the gap between two lines. */
const STONE_RATIO = 0.94;
/** Shared empty result, so skipping generation doesn't allocate per render. */
const NO_MOVES: readonly string[] = [];

function posFromCoords(row: number, col: number): string {
  return String.fromCharCode(97 + col) + (row + 1);
}

/**
 * The native Go board.
 *
 * Two things separate it from the other three native boards. Stones sit **on
 * line crossings**, not in cells, so the grid is one SVG of ruled lines and the
 * board is inset by half a cell all round — line `i` lands at `(i + 0.5) × cell`,
 * and the margin that creates is where the coordinates go. And a tap resolves to
 * the NEAREST crossing rather than to the cell it fell in, which is what makes a
 * 9×9 board comfortable with a fingertip: the target is the full cell around
 * each point, ~40pt on a phone.
 *
 * No `useBoardMotion` here, for the same reason ReversiBoard skips it: a stone
 * never travels. Captures are removals, and they simply go.
 */
function GoBoardInner({
  gameState,
  onMove,
  playerColor,
  showCoordinates = true,
  highlightPos,
  interactive = true,
  hintPos,
  deadStones,
  ownership,
  onMarkToggle,
}: GoBoardProps) {
  const { size } = gameState;
  const [captured, setCaptured] = useState<string[]>([]);
  const marking = !!onMarkToggle;
  const dead = useMemo(() => new Set(deadStones ?? []), [deadStones]);

  const sfx = useGameSfx();
  const { settings } = useSettings();
  const coordsOn = showCoordinates && settings.showCoordinates;
  const isPlayerTurn = !gameState.isGameOver && gameState.currentTurn === playerColor;

  // Refs so the memoized gesture reads fresh values without re-registering.
  const stateRef = useRef(gameState);
  stateRef.current = gameState;
  const playerColorRef = useRef(playerColor);
  playerColorRef.current = playerColor;
  const interactiveRef = useRef(interactive);
  interactiveRef.current = interactive;
  const pxRef = useRef(0);

  /**
   * Legal-move generation, cached per position (the 0.39.1 pattern).
   *
   * Go follows reversi rather than chess here: the playable points ARE render
   * output, since an empty crossing has to be visibly playable or not. What it
   * can skip is the opponent's turn. That matters more in Go than anywhere else
   * — the generator walks all 81 points and floods a group at each one, which is
   * far more work than any other board asks for.
   */
  const legalCache = useRef<{ state: GoGameState; moves: string[] } | null>(null);
  const getLegalMoves = () => {
    const state = stateRef.current;
    if (legalCache.current?.state !== state) {
      legalCache.current = { state, moves: GoEngine.getAllLegalMoves(state) };
    }
    return legalCache.current.moves;
  };
  // No legal points during the review: the question has stopped being "where may
  // I play" and become "which of these are dead".
  const legalNow = isPlayerTurn && interactive && !marking ? getLegalMoves() : NO_MOVES;

  // Refs, for the same reason the others are: the gesture is memoized once.
  const markRef = useRef(onMarkToggle);
  markRef.current = onMarkToggle;

  // Sound, plus the stones that just came off (drawn one more frame so a capture
  // is visible rather than instantaneous).
  const historyLength = gameState.moveHistory.length;
  useEffect(() => {
    const latest = gameState.moveHistory[historyLength - 1];
    if (!latest || !latest.position) {
      setCaptured([]);
      return;
    }
    sfx.play(latest.captures.length > 0 ? 'capture' : 'move');
    if (latest.captures.length === 0) return;

    setCaptured(latest.captures);
    const timer = setTimeout(() => setCaptured([]), 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historyLength]);

  const handleTap = (x: number, y: number) => {
    if (!interactiveRef.current) return;
    const state = stateRef.current;
    if (state.isGameOver) return;

    const px = pxRef.current;
    if (px <= 0) return;

    // Nearest crossing, not the containing cell: the board is inset by half a
    // cell, so `round` is what maps a fingertip to the point under it.
    const cell = px / size;
    const clamp = (n: number) => Math.max(0, Math.min(size - 1, Math.round(n / cell - 0.5)));
    const col = clamp(x);
    const screenRow = clamp(y);
    const position = posFromCoords(size - 1 - screenRow, col);

    // The review is nobody's turn, and the target is a stone rather than an
    // empty point — so it runs before the turn gate rather than through it.
    const toggle = markRef.current;
    if (toggle) {
      if (state.board[size - 1 - screenRow][col] !== null) toggle(position);
      else sfx.play('illegal');
      return;
    }

    if (state.currentTurn !== playerColorRef.current) return;
    if (getLegalMoves().includes(position)) onMove(position);
    else sfx.play('illegal');
  };

  // Handler ref so the memoized gesture always calls the latest closure.
  const tapRef = useRef(handleTap);
  tapRef.current = handleTap;
  const callTap = (x: number, y: number) => tapRef.current(x, y);

  const gesture = useMemo(
    () =>
      Gesture.Tap()
        .maxDuration(400)
        .runOnJS(true)
        .onEnd((e) => {
          callTap(e.x, e.y);
        }),
    [],
  );

  return (
    <BoardFrame accessibilityLabel="Go board">
      {(px) => {
        pxRef.current = px;
        const cell = px / size;
        const at = (index: number) => (index + 0.5) * cell;
        const stoneSize = cell * STONE_RATIO;

        const lines: React.ReactNode[] = [];
        for (let i = 0; i < size; i++) {
          const edge = i === 0 || i === size - 1;
          const stroke = edge ? GO_BOARD_COLORS.lineStrong : GO_BOARD_COLORS.line;
          const width = edge ? 1.6 : 1;
          const p = at(i);
          lines.push(
            <Line key={`h${i}`} x1={at(0)} y1={p} x2={at(size - 1)} y2={p} stroke={stroke} strokeWidth={width} />,
            <Line key={`v${i}`} x1={p} y1={at(0)} x2={p} y2={at(size - 1)} stroke={stroke} strokeWidth={width} />,
          );
        }

        const overlays: React.ReactNode[] = [];
        const stones: React.ReactNode[] = [];

        for (let row = 0; row < size; row++) {
          for (let col = 0; col < size; col++) {
            const position = posFromCoords(row, col);
            const stone = gameState.board[row][col];
            // Row 0 is rank 1, drawn at the BOTTOM — so the screen row inverts.
            const cx = at(col);
            const cy = at(size - 1 - row);

            if (legalNow.includes(position) && !stone) {
              overlays.push(
                <View
                  key={`l-${position}`}
                  pointerEvents="none"
                  style={{
                    position: 'absolute',
                    left: cx - cell * 0.12,
                    top: cy - cell * 0.12,
                    width: cell * 0.24,
                    height: cell * 0.24,
                    borderRadius: cell * 0.12,
                    backgroundColor: GO_BOARD_COLORS.ghost,
                  }}
                />,
              );
            }

            if (hintPos === position) {
              overlays.push(
                <View
                  key={`hint-${position}`}
                  pointerEvents="none"
                  style={{
                    position: 'absolute',
                    left: cx - stoneSize / 2,
                    top: cy - stoneSize / 2,
                    width: stoneSize,
                    height: stoneSize,
                    borderRadius: stoneSize / 2,
                    borderWidth: 3,
                    borderColor: GO_BOARD_COLORS.hintRing,
                  }}
                />,
              );
            }

            const isDead = dead.has(position);
            // A dead stone's point already belongs to the other side, so it is
            // shaded like any other empty point rather than left blank.
            const owner =
              ownership && (stone === null || isDead) ? ownership.get(position) ?? null : null;

            if (owner) {
              const markSize = cell * 0.21;
              overlays.push(
                <View
                  key={`t-${position}`}
                  pointerEvents="none"
                  style={{
                    position: 'absolute',
                    left: cx - markSize / 2,
                    top: cy - markSize / 2,
                    width: markSize,
                    height: markSize,
                    borderWidth: 1,
                    borderColor: GO_BOARD_COLORS.territoryEdge,
                    backgroundColor:
                      owner === 'black'
                        ? GO_BOARD_COLORS.territoryBlack
                        : GO_BOARD_COLORS.territoryWhite,
                  }}
                />,
              );
            }

            if (stone) {
              stones.push(
                <View
                  key={`s-${position}`}
                  pointerEvents="none"
                  style={{
                    position: 'absolute',
                    left: cx - stoneSize / 2,
                    top: cy - stoneSize / 2,
                    width: stoneSize,
                    height: stoneSize,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {/* A dead stone at a third opacity is simply not there on a
                      dark board, and the player is being asked to check these —
                      so it keeps half its weight and gains a dashed ring. */}
                  <View style={{ opacity: isDead ? 0.5 : 1 }}>
                    <GoStone color={stone} size={isDead ? stoneSize * 0.7 : stoneSize} />
                  </View>
                  {isDead && (
                    <View
                      style={{
                        position: 'absolute',
                        width: stoneSize,
                        height: stoneSize,
                        borderRadius: stoneSize / 2,
                        borderWidth: 1.5,
                        borderStyle: 'dashed',
                        borderColor: GO_BOARD_COLORS.coordinate,
                      }}
                    />
                  )}
                  {highlightPos === position && (
                    <View
                      style={{
                        position: 'absolute',
                        width: stoneSize * 0.44,
                        height: stoneSize * 0.44,
                        borderRadius: stoneSize * 0.22,
                        borderWidth: 2,
                        borderColor: GO_BOARD_COLORS.lastMoveRing,
                      }}
                    />
                  )}
                </View>,
              );
            } else if (captured.includes(position)) {
              // The side to move after a capture is the side whose stones went.
              stones.push(
                <View
                  key={`c-${position}`}
                  pointerEvents="none"
                  style={{
                    position: 'absolute',
                    left: cx - stoneSize / 2,
                    top: cy - stoneSize / 2,
                    width: stoneSize,
                    height: stoneSize,
                    opacity: 0.35,
                  }}
                >
                  <GoStone color={gameState.currentTurn} size={stoneSize} />
                </View>,
              );
            }
          }
        }

        return (
          <GestureDetector gesture={gesture}>
            <View
              style={{
                width: px,
                height: px,
                borderRadius: 10,
                overflow: 'hidden',
                borderWidth: 2,
                borderColor: GO_BOARD_COLORS.boardBorder,
                backgroundColor: GO_BOARD_COLORS.surface,
              }}
            >
              <Svg width={px} height={px} style={{ position: 'absolute', left: 0, top: 0 }}>
                {lines}
                {size === 9 &&
                  GO_STAR_POINTS_9.map(([row, col]) => (
                    <Circle
                      key={`star-${row}-${col}`}
                      cx={at(col)}
                      cy={at(size - 1 - row)}
                      r={Math.max(2, cell * 0.08)}
                      fill={GO_BOARD_COLORS.hoshi}
                    />
                  ))}
              </Svg>

              {coordsOn &&
                Array.from({ length: size }, (_, i) => (
                  <React.Fragment key={`coord-${i}`}>
                    <Text
                      style={{
                        position: 'absolute',
                        left: at(i) - cell / 2,
                        bottom: 1,
                        width: cell,
                        textAlign: 'center',
                        fontSize: 9,
                        fontFamily: FONTS.bodyBold,
                        color: GO_BOARD_COLORS.coordinate,
                      }}
                    >
                      {goColumnLabel(i)}
                    </Text>
                    <Text
                      style={{
                        position: 'absolute',
                        top: at(size - 1 - i) - 6,
                        left: 2,
                        fontSize: 9,
                        fontFamily: FONTS.bodyBold,
                        color: GO_BOARD_COLORS.coordinate,
                      }}
                    >
                      {i + 1}
                    </Text>
                  </React.Fragment>
                ))}

              {overlays}
              {stones}
            </View>
          </GestureDetector>
        );
      }}
    </BoardFrame>
  );
}

// Memoized like the other boards — skip the play screen's re-render churn.
export const GoBoard = React.memo(GoBoardInner);
