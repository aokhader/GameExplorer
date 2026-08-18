import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Polygon } from 'react-native-svg';
import type { DiagramArrow, DiagramHighlight, TutorialDiagram } from '@gameexplorer/shared';
import { ChessPiece, CheckersPiece, ReversiDisc, GoStone, BOARD_COLORS, CHECKERS_BOARD_COLORS, REVERSI_BOARD_COLORS, GO_BOARD_COLORS, GO_STAR_POINTS_9, COLORS, useThemeName } from '@gameexplorer/ui';
import { BoardFrame } from '@/board/BoardFrame';
import { FONTS } from '@/theme/typography';

/**
 * Static board diagram for the "How to play" screens. Pure presentation — no
 * gestures, engines, or sfx (that's why the interactive boards in src/board
 * aren't reused). Mirrors their square conventions: white at bottom,
 * (row + col) even = light square.
 */

/** SVG center coords in the boards' 0-800 arrow space (one square = 100 units). */
function posToSvgCenter(pos: string): { x: number; y: number } {
  const col = pos.charCodeAt(0) - 'a'.charCodeAt(0);
  const row = parseInt(pos[1], 10) - 1;
  return { x: col * 100 + 50, y: (7 - row) * 100 + 50 };
}

// Same polygon geometry as web's ArrowOverlay (ChessBoard.tsx), no flip branch.
function arrowPoints(arrow: DiagramArrow): string | null {
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

  const hx2 = endX + px * headSize * 0.9;
  const hy2 = endY + py * headSize * 0.9;
  const hx3 = endX - px * headSize * 0.9;
  const hy3 = endY - py * headSize * 0.9;

  return `${x1},${y1} ${x2},${y2} ${x3},${y3} ${hx3},${hy3} ${to.x},${to.y} ${hx2},${hy2} ${x4},${y4}`;
}

interface SquarePalette {
  light: string;
  dark: string;
  lastMoveLight: string;
  lastMoveDark: string;
  move: string;
  capture: string;
}

// Colors are looked up during render, never captured here — the token objects
// are live views, so a module-scope read freezes them at import (see themeRuntime).
const chessPalette = (): SquarePalette => ({
  light: BOARD_COLORS.lightSquare,
  dark: BOARD_COLORS.darkSquare,
  lastMoveLight: BOARD_COLORS.lastMoveLight,
  lastMoveDark: BOARD_COLORS.lastMoveDark,
  move: BOARD_COLORS.moveIndicator,
  capture: BOARD_COLORS.moveIndicatorCapture,
});

const checkersPalette = (): SquarePalette => ({
  light: CHECKERS_BOARD_COLORS.lightSquare,
  dark: CHECKERS_BOARD_COLORS.darkSquare,
  lastMoveLight: CHECKERS_BOARD_COLORS.lastMoveLight,
  lastMoveDark: CHECKERS_BOARD_COLORS.lastMoveDark,
  move: CHECKERS_BOARD_COLORS.moveIndicator,
  capture: CHECKERS_BOARD_COLORS.captureIndicator,
});

function pieceFor(diagram: TutorialDiagram, square: string, size: number) {
  if (diagram.game === 'chess') {
    const p = diagram.pieces.find(pc => pc.square === square);
    return p ? <ChessPiece type={p.piece} color={p.color} size={size} /> : null;
  }
  if (diagram.game === 'checkers') {
    const p = diagram.pieces.find(pc => pc.square === square);
    return p ? <CheckersPiece type={p.piece} color={p.color} size={size} /> : null;
  }
  const p = diagram.pieces.find(pc => pc.square === square);
  return p ? <ReversiDisc color={p.color} size={size} /> : null;
}

/** Go's display files skip I — see the shared notation module. */
const GO_FILE_LETTERS = 'ABCDEFGHJKLMNOPQRST';

/**
 * Go takes its own renderer rather than a branch in the 8×8 grid below: its
 * board has no cells to colour and its stones sit on the lines' crossings, so
 * none of the square conventions apply. Static like the rest of this file.
 */
function GoTutorialBoard({ diagram }: { diagram: Extract<TutorialDiagram, { game: 'go' }> }) {
  // Repaint when the theme changes; the tokens below are live views.
  useThemeName();

  const { size } = diagram;
  const highlights = new Map<string, DiagramHighlight['kind'][]>();
  for (const h of diagram.highlights ?? []) {
    highlights.set(h.square, [...(highlights.get(h.square) ?? []), h.kind]);
  }

  return (
    <View style={{ marginTop: 16, marginBottom: 6 }}>
      <BoardFrame maxPx={340} vhCap={60} accessibilityLabel={diagram.caption}>
        {(px) => {
          const cell = px / size;
          const at = (index: number) => (index + 0.5) * cell;
          const stoneSize = cell * 0.94;

          const lines = [];
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

          const marks = [];
          for (let row = 0; row < size; row++) {
            for (let col = 0; col < size; col++) {
              const pos = `${String.fromCharCode(97 + col)}${row + 1}`;
              const stone = diagram.pieces.find((p) => p.square === pos);
              const kinds = highlights.get(pos) ?? [];
              if (!stone && kinds.length === 0) continue;

              const cx = at(col);
              const cy = at(size - 1 - row);
              marks.push(
                <View
                  key={pos}
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
                  {stone && <GoStone color={stone.color} size={stoneSize} />}
                  {!stone && kinds.includes('move') && (
                    <View
                      style={{
                        width: stoneSize * 0.3,
                        height: stoneSize * 0.3,
                        borderRadius: stoneSize * 0.15,
                        backgroundColor: GO_BOARD_COLORS.ghost,
                      }}
                    />
                  )}
                  {(kinds.includes('capture') || kinds.includes('target')) && (
                    <View
                      style={{
                        position: 'absolute',
                        width: stoneSize * 0.9,
                        height: stoneSize * 0.9,
                        borderRadius: stoneSize * 0.45,
                        borderWidth: 2,
                        borderColor: GO_BOARD_COLORS.lastMoveRing,
                      }}
                    />
                  )}
                </View>,
              );
            }
          }

          return (
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
              <Svg width={px} height={px} style={StyleSheet.absoluteFill}>
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

              {diagram.coordinates &&
                Array.from({ length: size }, (_, i) => (
                  <View key={`coord-${i}`}>
                    <Text
                      style={{
                        position: 'absolute',
                        left: at(i) - cell / 2,
                        top: px - 12,
                        width: cell,
                        textAlign: 'center',
                        fontSize: 8,
                        fontFamily: FONTS.bodyBold,
                        color: GO_BOARD_COLORS.coordinate,
                      }}
                    >
                      {GO_FILE_LETTERS[i]}
                    </Text>
                    <Text
                      style={{
                        position: 'absolute',
                        top: at(size - 1 - i) - 5,
                        left: 2,
                        fontSize: 8,
                        fontFamily: FONTS.bodyBold,
                        color: GO_BOARD_COLORS.coordinate,
                      }}
                    >
                      {i + 1}
                    </Text>
                  </View>
                ))}

              {marks}
            </View>
          );
        }}
      </BoardFrame>
      <Text
        style={{
          fontFamily: FONTS.body,
          fontSize: 13,
          lineHeight: 19,
          color: COLORS.fgMuted,
          textAlign: 'center',
          marginTop: 10,
          paddingHorizontal: 8,
        }}
      >
        {diagram.caption}
      </Text>
    </View>
  );
}

export function TutorialBoard({ diagram }: { diagram: TutorialDiagram }) {
  // Repaint when the theme changes; the tokens below are live views.
  useThemeName();

  if (diagram.game === 'go') return <GoTutorialBoard diagram={diagram} />;

  const isReversi = diagram.game === 'reversi';
  const palette = diagram.game === 'chess' ? chessPalette() : checkersPalette();

  const highlightsBySquare = new Map<string, DiagramHighlight['kind'][]>();
  for (const h of diagram.highlights ?? []) {
    highlightsBySquare.set(h.square, [...(highlightsBySquare.get(h.square) ?? []), h.kind]);
  }

  return (
    <View style={{ marginTop: 16, marginBottom: 6 }}>
      <BoardFrame maxPx={340} vhCap={60} accessibilityLabel={diagram.caption}>
        {(size) => {
          const cell = size / 8;
          const pieceSize = cell * 0.84;
          const rows = [];
          for (let screenRow = 0; screenRow < 8; screenRow++) {
            const cells = [];
            for (let col = 0; col < 8; col++) {
              const row = 7 - screenRow;
              const pos = `${String.fromCharCode(97 + col)}${row + 1}`;
              const isLight = (row + col) % 2 === 0;
              const kinds = highlightsBySquare.get(pos) ?? [];
              const piece = pieceFor(diagram, pos, pieceSize);

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

              cells.push(
                <View
                  key={pos}
                  style={{
                    flex: 1,
                    backgroundColor: bg,
                    alignItems: 'center',
                    justifyContent: 'center',
                    ...(isReversi && {
                      borderWidth: StyleSheet.hairlineWidth,
                      borderColor: REVERSI_BOARD_COLORS.cellBorder,
                    }),
                  }}
                >
                  {showRank && (
                    <Text
                      style={{
                        position: 'absolute',
                        top: 1,
                        left: 3,
                        fontFamily: FONTS.bodySemi,
                        fontSize: 9,
                        color: labelColor,
                        opacity: 0.75,
                      }}
                    >
                      {row + 1}
                    </Text>
                  )}
                  {showFile && (
                    <Text
                      style={{
                        position: 'absolute',
                        bottom: 1,
                        right: 3,
                        fontFamily: FONTS.bodySemi,
                        fontSize: 9,
                        color: labelColor,
                        opacity: 0.75,
                      }}
                    >
                      {String.fromCharCode(97 + col)}
                    </Text>
                  )}

                  {/* Legal-move dot */}
                  {kinds.includes('move') && !piece && (
                    <View
                      style={{
                        width: cell * 0.3,
                        height: cell * 0.3,
                        borderRadius: cell * 0.15,
                        backgroundColor: isReversi
                          ? REVERSI_BOARD_COLORS.lastMoveRing
                          : palette.move,
                      }}
                    />
                  )}

                  {/* Capture ring */}
                  {kinds.includes('capture') && (
                    <View
                      style={{
                        position: 'absolute',
                        top: '8%',
                        left: '8%',
                        right: '8%',
                        bottom: '8%',
                        borderRadius: cell,
                        borderWidth: 3,
                        borderColor: isReversi ? COLORS.danger : palette.capture,
                      }}
                    />
                  )}

                  {/* Reversi flip ring — a disc about to change color */}
                  {isReversi && (kinds.includes('origin') || kinds.includes('target')) && (
                    <View
                      style={{
                        position: 'absolute',
                        top: '6%',
                        left: '6%',
                        right: '6%',
                        bottom: '6%',
                        borderRadius: cell,
                        borderWidth: 3,
                        borderColor: REVERSI_BOARD_COLORS.lastMoveRing,
                      }}
                    />
                  )}

                  {piece}
                </View>,
              );
            }
            rows.push(
              <View key={screenRow} style={{ flex: 1, flexDirection: 'row' }}>
                {cells}
              </View>,
            );
          }

          return (
            <View
              style={{
                flex: 1,
                borderRadius: 12,
                overflow: 'hidden',
                ...(isReversi && { borderWidth: 2, borderColor: REVERSI_BOARD_COLORS.boardBorder }),
              }}
            >
              {rows}
              {diagram.arrows && diagram.arrows.length > 0 && (
                <Svg
                  pointerEvents="none"
                  style={StyleSheet.absoluteFill}
                  viewBox="0 0 800 800"
                >
                  {diagram.arrows.map((arrow, i) => {
                    const points = arrowPoints(arrow);
                    return points ? (
                      <Polygon key={i} points={points} fill="rgba(255, 170, 0, 0.82)" />
                    ) : null;
                  })}
                </Svg>
              )}
            </View>
          );
        }}
      </BoardFrame>
      <Text
        style={{
          fontFamily: FONTS.body,
          fontSize: 13,
          lineHeight: 19,
          color: COLORS.fgMuted,
          textAlign: 'center',
          marginTop: 10,
          paddingHorizontal: 8,
        }}
      >
        {diagram.caption}
      </Text>
    </View>
  );
}
