import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { ChessEngine } from '@gameexplorer/shared';
import type { ChessGameState, PieceType } from '@gameexplorer/shared';
import { ChessPiece, BOARD_COLORS, COLORS, SHADOWS_NATIVE } from '@gameexplorer/ui';
import { BoardFrame } from './BoardFrame';
import { useGameSfx } from '@/audio/useGameSfx.native';
import { useSettings } from '@/providers/SettingsProvider';

interface ChessBoardProps {
  gameState: ChessGameState;
  onMove: (from: string, to: string, promotion?: PieceType) => void;
  playerColor?: 'white' | 'black';
  showCoordinates?: boolean;
  /** Board is inert while reviewing history / after game end. */
  interactive?: boolean;
}

// The vector piece art fills ~89% of its viewBox; 0.9 seats it at play scale with
// a small margin off the square edges (matches the web board's .piece sizing).
const PIECE_RATIO = 0.9;
const CHECK_RING = 'rgba(244,63,94,0.9)';

function isDark(row: number, col: number): boolean {
  return (row + col) % 2 === 1;
}
function posFromCoords(row: number, col: number): string {
  return String.fromCharCode(97 + col) + (row + 1);
}
function rowOf(pos: string): number {
  return parseInt(pos[1], 10) - 1;
}
function colOf(pos: string): number {
  return pos.charCodeAt(0) - 97;
}

/** Board coords → on-screen top-left px for the given orientation. */
function screenXY(pos: string, isFlipped: boolean, sq: number): { x: number; y: number } {
  const boardRow = rowOf(pos);
  const boardCol = colOf(pos);
  const screenRow = isFlipped ? boardRow : 7 - boardRow;
  const screenCol = isFlipped ? 7 - boardCol : boardCol;
  return { x: screenCol * sq, y: screenRow * sq };
}

/** On-screen px → board position. `size` is the full board edge length. */
function squareAt(x: number, y: number, isFlipped: boolean, size: number): string {
  const sq = size / 8;
  const clamp = (n: number) => Math.max(0, Math.min(7, Math.floor(n / sq)));
  const screenCol = clamp(x);
  const screenRow = clamp(y);
  const boardRow = isFlipped ? screenRow : 7 - screenRow;
  const boardCol = isFlipped ? 7 - screenCol : screenCol;
  return posFromCoords(boardRow, boardCol);
}

/** Find the given color's king square, or null. Called only when in check. */
function findKing(board: ChessGameState['board'], color: 'white' | 'black'): string | null {
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const p = board[row][col];
      if (p && p.type === 'king' && p.color === color) return posFromCoords(row, col);
    }
  }
  return null;
}

/** True if moving the pawn at `from` to `to` reaches the back rank. */
function isPromotion(state: ChessGameState, from: string, to: string): boolean {
  const piece = state.board[rowOf(from)][colOf(from)];
  if (!piece || piece.type !== 'pawn') return false;
  const toRow = rowOf(to);
  return (piece.color === 'white' && toRow === 7) || (piece.color === 'black' && toRow === 0);
}

/** A single piece, absolutely positioned, with an "arrive" pop on the last move. */
function BoardPiece({
  x,
  y,
  sq,
  type,
  color,
  dimmed,
  pop,
  reduceMotion,
}: {
  x: number;
  y: number;
  sq: number;
  type: PieceType;
  color: 'white' | 'black';
  dimmed: boolean;
  pop: boolean;
  reduceMotion: boolean;
}) {
  const scale = useSharedValue(1);

  useEffect(() => {
    if (pop && !reduceMotion) {
      scale.value = 0.75;
      scale.value = withSequence(
        withTiming(1.1, { duration: 130 }),
        withTiming(1, { duration: 120 }),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pop]);

  const anim = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          left: x,
          top: y,
          width: sq,
          height: sq,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: dimmed ? 0.35 : 1,
        },
        anim,
      ]}
    >
      <ChessPiece type={type} color={color} size={sq * PIECE_RATIO} />
    </Animated.View>
  );
}

/** Promotion picker overlay — shown when a pawn reaches the back rank. */
function PromotionPicker({
  color,
  size,
  onSelect,
}: {
  color: 'white' | 'black';
  size: number;
  onSelect: (piece: PieceType) => void;
}) {
  const pieces: PieceType[] = ['queen', 'rook', 'bishop', 'knight'];
  return (
    <View
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        width: size,
        height: size,
        zIndex: 50,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0,0,0,0.6)',
      }}
    >
      <View
        style={{
          backgroundColor: COLORS.surfaceAlt,
          borderRadius: 16,
          borderWidth: 1,
          borderColor: COLORS.border,
          padding: 14,
          alignItems: 'center',
        }}
      >
        <Text style={{ color: COLORS.fg, fontSize: 14, fontWeight: '700', marginBottom: 10 }}>
          Promote pawn to:
        </Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {pieces.map((type) => (
            <Pressable
              key={type}
              onPress={() => onSelect(type)}
              style={{
                width: 56,
                height: 56,
                borderRadius: 12,
                backgroundColor: COLORS.surfaceMuted,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <ChessPiece type={type} color={color} size={44} />
            </Pressable>
          ))}
        </View>
      </View>
    </View>
  );
}

/**
 * Native chess board — the interaction/animation port of web's `ChessBoard.tsx`.
 * One `Pan`+`Tap` race serves both tap-to-move and drag-to-move (identical to the
 * checkers board): `Pan.onStart` picks up an own piece, `onUpdate` glides a
 * floating copy on the UI thread, `onEnd` drops it; `Tap` handles click-to-move.
 * Legal moves come from the shared `ChessEngine`. Pawn promotions surface a picker
 * before committing; the king's square rings red while in check.
 */
function ChessBoardInner({
  gameState,
  onMove,
  playerColor = 'white',
  showCoordinates = true,
  interactive = true,
}: ChessBoardProps) {
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null);
  const [validMoves, setValidMoves] = useState<string[]>([]);
  const [lastMoveTo, setLastMoveTo] = useState<string | null>(null);
  const [draggingFrom, setDraggingFrom] = useState<string | null>(null);
  const [pending, setPendingState] = useState<{ from: string; to: string } | null>(null);

  const sfx = useGameSfx();
  const { settings, reducedMotion } = useSettings();
  const coordsOn = showCoordinates && settings.showCoordinates;
  const isFlipped = playerColor === 'black';
  const gameOver = gameState.isCheckmate || gameState.isStalemate || gameState.isDraw;
  const isMyTurn = !gameOver && gameState.currentTurn === playerColor;

  const lastMoveEntry = gameState.moveHistory[gameState.moveHistory.length - 1] ?? null;
  const lastMove = lastMoveEntry ? { from: lastMoveEntry.from, to: lastMoveEntry.to } : null;
  const kingInCheckPos = gameState.isCheck ? findKing(gameState.board, gameState.currentTurn) : null;

  // Full move generation is expensive — recompute only when the state changes.
  const legalMoves = useMemo(() => ChessEngine.getAllLegalMoves(gameState), [gameState]);

  const dragTX = useSharedValue(0);
  const dragTY = useSharedValue(0);
  const dragScale = useSharedValue(1);

  // Props/derived refs — mirror render every render (read by the memoized gesture).
  const stateRef = useRef(gameState);
  stateRef.current = gameState;
  const legalRef = useRef(legalMoves);
  legalRef.current = legalMoves;
  const flipRef = useRef(isFlipped);
  flipRef.current = isFlipped;
  const sizeRef = useRef(0);
  const interactiveRef = useRef(interactive);
  interactiveRef.current = interactive;

  // Interaction refs — source of truth during a gesture (see CheckersBoard for why
  // these must be written synchronously, not from render).
  const selectedRef = useRef<string | null>(null);
  const validRef = useRef<string[]>([]);
  const draggingRef = useRef<string | null>(null);
  const pendingRef = useRef<{ from: string; to: string } | null>(null);

  // Announce the latest move (highlight + sound + arrival pop), like web.
  useEffect(() => {
    if (gameState.moveHistory.length === 0) {
      setLastMoveTo(null);
      return;
    }
    const latest = gameState.moveHistory[gameState.moveHistory.length - 1];
    setLastMoveTo(latest.to);
    if (!gameState.isCheckmate) {
      if (gameState.isCheck) sfx.play('check');
      else if (latest.capturedPiece) sfx.play('capture');
      else sfx.play('move');
    }
    const t = setTimeout(() => setLastMoveTo(null), 320);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState.moveHistory.length]);

  // ── Selection mutators — update ref (synchronous) AND state (for render) ──────
  const setSelection = (pos: string | null, dests: string[]) => {
    selectedRef.current = pos;
    validRef.current = dests;
    setSelectedSquare(pos);
    setValidMoves(dests);
  };
  const setDrag = (pos: string | null) => {
    draggingRef.current = pos;
    setDraggingFrom(pos);
  };
  const setPending = (p: { from: string; to: string } | null) => {
    pendingRef.current = p;
    setPendingState(p);
  };
  const clearSelection = () => setSelection(null, []);
  const selectSquare = (pos: string) =>
    setSelection(pos, legalRef.current.filter((m) => m.from === pos).map((m) => m.to));

  const commitMove = (from: string, to: string) => {
    setDrag(null);
    clearSelection();
    // Pawn promotion → resolve the picker before notifying the parent.
    if (isPromotion(stateRef.current, from, to)) {
      setPending({ from, to });
      return;
    }
    onMove(from, to);
  };

  const handlePromotion = (piece: PieceType) => {
    const p = pendingRef.current;
    if (!p) return;
    setPending(null);
    sfx.play('promote');
    onMove(p.from, p.to, piece);
  };

  // Clear selection whenever the turn flips (e.g. after the bot replies).
  useEffect(() => {
    setSelection(null, []);
    setDrag(null);
  }, [gameState.currentTurn]);

  // ── Gesture → JS handlers ─────────────────────────────────────────────────────
  const handleTap = (x: number, y: number) => {
    if (!interactiveRef.current || pendingRef.current) return;
    const s = stateRef.current;
    if (s.isCheckmate || s.isStalemate || s.isDraw) return;
    const pos = squareAt(x, y, flipRef.current, sizeRef.current);
    const piece = s.board[rowOf(pos)][colOf(pos)];

    if (selectedRef.current) {
      if (validRef.current.includes(pos)) commitMove(selectedRef.current, pos);
      else if (piece && piece.color === s.currentTurn) selectSquare(pos);
      else clearSelection();
    } else if (piece && piece.color === s.currentTurn) {
      selectSquare(pos);
    }
  };

  const handleDragStart = (x: number, y: number) => {
    if (!interactiveRef.current || pendingRef.current) return;
    const s = stateRef.current;
    if (s.isCheckmate || s.isStalemate || s.isDraw) return;
    const pos = squareAt(x, y, flipRef.current, sizeRef.current);
    const piece = s.board[rowOf(pos)][colOf(pos)];
    if (piece && piece.color === s.currentTurn) {
      setDrag(pos);
      selectSquare(pos);
      sfx.play('select');
      if (!reducedMotion) dragScale.value = withTiming(1.1, { duration: 90 });
    }
  };

  const handleDragEnd = (x: number, y: number) => {
    const dragging = draggingRef.current;
    if (!dragging) return;
    const endSq = squareAt(x, y, flipRef.current, sizeRef.current);
    if (endSq !== dragging && validRef.current.includes(endSq)) {
      commitMove(dragging, endSq);
    } else {
      setDrag(null);
      if (endSq !== dragging) sfx.play('illegal');
    }
  };

  const tapRef = useRef(handleTap);
  tapRef.current = handleTap;
  const dragStartRef = useRef(handleDragStart);
  dragStartRef.current = handleDragStart;
  const dragEndRef = useRef(handleDragEnd);
  dragEndRef.current = handleDragEnd;
  const callTap = (x: number, y: number) => tapRef.current(x, y);
  const callDragStart = (x: number, y: number) => dragStartRef.current(x, y);
  const callDragEnd = (x: number, y: number) => dragEndRef.current(x, y);

  const gesture = useMemo(() => {
    // maxDistance keeps a real tap a tap: without it, a slow finger drag travels
    // far while still registering as a Tap (winning the race over Pan), so the
    // piece only ever gets "selected", never dragged. Capping the tap's travel
    // lets Pan.minDistance take the drag once the finger moves past it.
    const tap = Gesture.Tap()
      .maxDuration(400)
      .maxDistance(10)
      .onEnd((e) => {
        'worklet';
        runOnJS(callTap)(e.x, e.y);
      });

    const pan = Gesture.Pan()
      .maxPointers(1)
      .minDistance(8)
      .onStart((e) => {
        'worklet';
        runOnJS(callDragStart)(e.x - e.translationX, e.y - e.translationY);
      })
      .onUpdate((e) => {
        'worklet';
        dragTX.value = e.translationX;
        dragTY.value = e.translationY;
      })
      .onEnd((e) => {
        'worklet';
        runOnJS(callDragEnd)(e.x, e.y);
      })
      .onFinalize(() => {
        'worklet';
        dragTX.value = 0;
        dragTY.value = 0;
        dragScale.value = withTiming(1, { duration: 110 });
      });

    return Gesture.Race(pan, tap);
    // Gesture is stable; all mutable state is read through refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const floatStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: dragTX.value },
      { translateY: dragTY.value },
      { scale: dragScale.value },
    ],
  }));

  return (
    <BoardFrame maxPx={520} vhCap={70} accessibilityLabel="Chess board">
      {(size) => {
        sizeRef.current = size;
        const sq = size / 8;

        const squares: React.ReactNode[] = [];
        const pieces: React.ReactNode[] = [];

        for (let screenRow = 0; screenRow < 8; screenRow++) {
          for (let screenCol = 0; screenCol < 8; screenCol++) {
            const boardRow = isFlipped ? screenRow : 7 - screenRow;
            const boardCol = isFlipped ? 7 - screenCol : screenCol;
            const pos = posFromCoords(boardRow, boardCol);
            const piece = gameState.board[boardRow][boardCol];
            const dark = isDark(boardRow, boardCol);

            const isSelected = selectedSquare === pos;
            const isValidDest = validMoves.includes(pos);
            const isLastMoveSquare = !!lastMove && (lastMove.from === pos || lastMove.to === pos);
            const isCheckKing = kingInCheckPos === pos;

            let bg: string = dark ? BOARD_COLORS.darkSquare : BOARD_COLORS.lightSquare;
            if (isSelected) bg = BOARD_COLORS.selectedSquare;
            else if (isLastMoveSquare) bg = dark ? BOARD_COLORS.lastMoveDark : BOARD_COLORS.lastMoveLight;

            const showRank = coordsOn && screenCol === 0;
            const showFile = coordsOn && screenRow === 7;
            const labelColor = dark ? BOARD_COLORS.lightSquare : BOARD_COLORS.darkSquare;

            squares.push(
              <View
                key={pos}
                pointerEvents="none"
                style={{
                  position: 'absolute',
                  left: screenCol * sq,
                  top: screenRow * sq,
                  width: sq,
                  height: sq,
                  backgroundColor: bg,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {showRank && (
                  <Text style={{ position: 'absolute', top: 2, left: 3, fontSize: 9, fontWeight: '700', color: labelColor, opacity: 0.75 }}>
                    {boardRow + 1}
                  </Text>
                )}
                {showFile && (
                  <Text style={{ position: 'absolute', bottom: 2, right: 3, fontSize: 9, fontWeight: '700', color: labelColor, opacity: 0.75 }}>
                    {String.fromCharCode(97 + boardCol)}
                  </Text>
                )}
                {/* King-in-check ring. */}
                {isCheckKing && (
                  <View
                    style={{
                      position: 'absolute',
                      left: sq * 0.06,
                      top: sq * 0.06,
                      right: sq * 0.06,
                      bottom: sq * 0.06,
                      borderRadius: sq,
                      borderWidth: 3,
                      borderColor: CHECK_RING,
                    }}
                  />
                )}
                {/* Legal-move dot on an empty destination. */}
                {isValidDest && !piece && (
                  <View
                    style={{
                      width: sq * 0.28,
                      height: sq * 0.28,
                      borderRadius: sq * 0.14,
                      backgroundColor: BOARD_COLORS.moveIndicator,
                    }}
                  />
                )}
                {/* Capture ring on an occupied legal destination. */}
                {isValidDest && piece && (
                  <View
                    style={{
                      position: 'absolute',
                      left: sq * 0.06,
                      top: sq * 0.06,
                      right: sq * 0.06,
                      bottom: sq * 0.06,
                      borderRadius: sq,
                      borderWidth: 3,
                      borderColor: BOARD_COLORS.moveIndicatorCapture,
                    }}
                  />
                )}
              </View>,
            );

            if (piece) {
              const { x, y } = screenXY(pos, isFlipped, sq);
              pieces.push(
                <BoardPiece
                  key={`p-${pos}`}
                  x={x}
                  y={y}
                  sq={sq}
                  type={piece.type}
                  color={piece.color}
                  dimmed={draggingFrom === pos}
                  pop={lastMoveTo === pos}
                  reduceMotion={reducedMotion}
                />,
              );
            }
          }
        }

        // Floating copy of the piece being dragged (above everything).
        let floating: React.ReactNode = null;
        if (draggingFrom) {
          const dragPiece = gameState.board[rowOf(draggingFrom)][colOf(draggingFrom)];
          if (dragPiece) {
            const { x, y } = screenXY(draggingFrom, isFlipped, sq);
            floating = (
              <Animated.View
                pointerEvents="none"
                style={[
                  {
                    position: 'absolute',
                    left: x,
                    top: y,
                    width: sq,
                    height: sq,
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 30,
                  },
                  floatStyle,
                ]}
              >
                <ChessPiece type={dragPiece.type} color={dragPiece.color} size={sq * PIECE_RATIO} />
              </Animated.View>
            );
          }
        }

        return (
          <GestureDetector gesture={gesture}>
            <View
              style={[
                {
                  width: size,
                  height: size,
                  borderRadius: 10,
                  overflow: 'hidden',
                  borderWidth: 2,
                  borderColor: COLORS.borderStrong,
                  backgroundColor: BOARD_COLORS.darkSquare,
                },
                isMyTurn && SHADOWS_NATIVE.glowChess,
              ]}
            >
              {squares}
              {pieces}
              {floating}
              {pending && (
                <PromotionPicker
                  // The promoting pawn's own color — not `playerColor`, which in
                  // pass-and-play is the board orientation, not the mover.
                  color={
                    gameState.board[rowOf(pending.from)][colOf(pending.from)]?.color ?? playerColor
                  }
                  size={size}
                  onSelect={handlePromotion}
                />
              )}
            </View>
          </GestureDetector>
        );
      }}
    </BoardFrame>
  );
}

export const ChessBoard = React.memo(ChessBoardInner);
