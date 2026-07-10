import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { CheckersEngine } from '@gameexplorer/shared';
import type { CheckersGameState } from '@gameexplorer/shared';
import {
  CheckersPiece,
  CHECKERS_BOARD_COLORS,
  COLORS,
  SHADOWS_NATIVE,
} from '@gameexplorer/ui';
import { BoardFrame } from './BoardFrame';
import { useGameSfx } from '@/audio/useGameSfx.native';
import { useSettings } from '@/providers/SettingsProvider';

interface CheckersBoardProps {
  gameState: CheckersGameState;
  onMove: (from: string, to: string) => void;
  playerColor?: 'white' | 'black';
  showCoordinates?: boolean;
  /** Board is inert while reviewing history / after game end. */
  interactive?: boolean;
}

const PIECE_RATIO = 0.86;

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

/** On-screen px → board position (clamped to the 8×8 grid). `size` is the full
 *  board edge length; squares are `size / 8`. */
function squareAt(x: number, y: number, isFlipped: boolean, size: number): string {
  const sq = size / 8;
  const clamp = (n: number) => Math.max(0, Math.min(7, Math.floor(n / sq)));
  const screenCol = clamp(x);
  const screenRow = clamp(y);
  const boardRow = isFlipped ? screenRow : 7 - screenRow;
  const boardCol = isFlipped ? 7 - screenCol : screenCol;
  return posFromCoords(boardRow, boardCol);
}

/**
 * A single piece, absolutely positioned, with a reanimated "arrive" pop when it
 * lands (mirrors web's `scale-110` transition on the just-moved square). The
 * origin piece dims while its owner drags it (the "lifted" look).
 */
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
  type: 'man' | 'king';
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
    // Only re-run when the pop trigger flips on.
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
      <CheckersPiece type={type} color={color} size={sq * PIECE_RATIO} />
    </Animated.View>
  );
}

/**
 * Native checkers board — the interaction/animation port of web's
 * `CheckersBoard.tsx`. One `Pan` gesture over the whole board serves both
 * tap-to-move and drag-to-move: `onBegin` picks up an own piece (selecting it and
 * lighting its legal destinations), `onUpdate` glides a floating copy on the UI
 * thread (60fps), and `onEnd` classifies the gesture as a tap or a drop by the
 * travelled distance. Legal moves come from the shared `CheckersEngine`, so the
 * board never encodes rules.
 */
function CheckersBoardInner({
  gameState,
  onMove,
  playerColor = 'white',
  showCoordinates = true,
  interactive = true,
}: CheckersBoardProps) {
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null);
  const [validMoves, setValidMoves] = useState<string[]>([]);
  const [lastMove, setLastMove] = useState<{ from: string; to: string } | null>(null);
  const [lastMoveTo, setLastMoveTo] = useState<string | null>(null);
  const [draggingFrom, setDraggingFrom] = useState<string | null>(null);

  const sfx = useGameSfx();
  const { settings, reducedMotion } = useSettings();
  const coordsOn = showCoordinates && settings.showCoordinates;
  const isFlipped = playerColor === 'black';
  const isMyTurn = !gameState.isGameOver && gameState.currentTurn === playerColor;

  // Full move generation is expensive — recompute only when the state changes.
  const legalMoves = useMemo(() => CheckersEngine.getAllLegalMoves(gameState), [gameState]);

  // Drag translation (UI thread) + pickup lift.
  const dragTX = useSharedValue(0);
  const dragTY = useSharedValue(0);
  const dragScale = useSharedValue(1);

  // Props/derived refs — safe to mirror render state every render. These let the
  // gesture (built once, memoized) read fresh values without re-registering.
  const stateRef = useRef(gameState);
  stateRef.current = gameState;
  const legalRef = useRef(legalMoves);
  legalRef.current = legalMoves;
  const flipRef = useRef(isFlipped);
  flipRef.current = isFlipped;
  const sizeRef = useRef(0);
  const interactiveRef = useRef(interactive);
  interactiveRef.current = interactive;

  // Interaction refs — the source of truth for selection/drag DURING a gesture.
  // Critically these are updated SYNCHRONOUSLY by the mutators below (not from
  // render), because a gesture's onEnd/onDrop can fire before React has flushed
  // the setState from its onBegin/onStart — reading render-synced refs there
  // would see stale nulls and no move would ever commit.
  const selectedRef = useRef<string | null>(null);
  const validRef = useRef<string[]>([]);
  const draggingRef = useRef<string | null>(null);

  // Announce the latest move (highlight + haptic + arrival pop), like web.
  useEffect(() => {
    if (gameState.moveHistory.length === 0) {
      setLastMove(null);
      setLastMoveTo(null);
      return;
    }
    const latest = gameState.moveHistory[gameState.moveHistory.length - 1];
    setLastMove({ from: latest.from, to: latest.to });
    setLastMoveTo(latest.to);
    const isJump = Math.abs(rowOf(latest.to) - rowOf(latest.from)) >= 2;
    sfx.play(isJump ? 'jump' : 'move');
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
  const clearSelection = () => setSelection(null, []);
  const selectSquare = (pos: string) =>
    setSelection(pos, legalRef.current.filter((m) => m.from === pos).map((m) => m.to));
  const commitMove = (from: string, to: string) => {
    setDrag(null);
    clearSelection();
    onMove(from, to);
  };

  // Clear selection whenever the turn flips (e.g. after the bot replies). Uses the
  // synchronous mutators so the refs don't lag a render behind the reset.
  useEffect(() => {
    setSelection(null, []);
    setDrag(null);
  }, [gameState.currentTurn]);

  // ── Gesture → JS handlers ─────────────────────────────────────────────────────
  // Tap-to-move: mirrors web's handleSquareClick. Runs from a dedicated Tap
  // gesture (a Pan never fires onEnd for a motionless tap, so tap-to-move must
  // not depend on the Pan lifecycle).
  const handleTap = (x: number, y: number) => {
    if (!interactiveRef.current) return;
    const s = stateRef.current;
    if (s.isGameOver) return;
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

  // Drag pickup — fires only once the Pan actually activates (real movement), so
  // taps are left entirely to the Tap gesture. `x,y` are the touch-DOWN point
  // (current point minus translation so far).
  const handleDragStart = (x: number, y: number) => {
    if (!interactiveRef.current) return;
    const s = stateRef.current;
    if (s.isGameOver) return;
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
      // Released off a legal square — drop the piece back, keep it selected so a
      // follow-up tap can still move it.
      setDrag(null);
      if (endSq !== dragging) sfx.play('illegal');
    }
  };

  // Handler refs so the memoized gesture always calls the latest closures (fresh
  // Settings: haptics / reduced-motion).
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
    const tap = Gesture.Tap()
      .maxDuration(400)
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

    // A motionless touch → Tap wins; movement past 8px → Pan activates and wins.
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
    <BoardFrame>
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
            const isLastMoveSquare =
              !!lastMove && (lastMove.from === pos || lastMove.to === pos);

            let bg = dark ? CHECKERS_BOARD_COLORS.darkSquare : CHECKERS_BOARD_COLORS.lightSquare;
            if (isSelected) bg = CHECKERS_BOARD_COLORS.selectedSquare;
            else if (isLastMoveSquare)
              bg = dark ? CHECKERS_BOARD_COLORS.lastMoveDark : CHECKERS_BOARD_COLORS.lastMoveLight;

            const showRank = coordsOn && screenCol === 0;
            const showFile = coordsOn && screenRow === 7;
            const labelColor = dark
              ? CHECKERS_BOARD_COLORS.lightSquare
              : CHECKERS_BOARD_COLORS.darkSquare;

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
                  <Text
                    style={{
                      position: 'absolute',
                      top: 2,
                      left: 3,
                      fontSize: 9,
                      fontWeight: '700',
                      color: labelColor,
                      opacity: 0.75,
                    }}
                  >
                    {boardRow + 1}
                  </Text>
                )}
                {showFile && (
                  <Text
                    style={{
                      position: 'absolute',
                      bottom: 2,
                      right: 3,
                      fontSize: 9,
                      fontWeight: '700',
                      color: labelColor,
                      opacity: 0.75,
                    }}
                  >
                    {String.fromCharCode(97 + boardCol)}
                  </Text>
                )}
                {/* Legal-move dot on an empty destination. */}
                {dark && isValidDest && !piece && (
                  <View
                    style={{
                      width: sq * 0.28,
                      height: sq * 0.28,
                      borderRadius: sq * 0.14,
                      backgroundColor: CHECKERS_BOARD_COLORS.moveIndicator,
                    }}
                  />
                )}
                {/* Capture ring (defensive — checkers lands on empty squares). */}
                {dark && isValidDest && piece && (
                  <View
                    style={{
                      position: 'absolute',
                      left: sq * 0.08,
                      top: sq * 0.08,
                      right: sq * 0.08,
                      bottom: sq * 0.08,
                      borderRadius: sq,
                      borderWidth: 3,
                      borderColor: CHECKERS_BOARD_COLORS.captureIndicator,
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

        // Floating copy of the piece being dragged (drawn above everything).
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
                <CheckersPiece type={dragPiece.type} color={dragPiece.color} size={sq * PIECE_RATIO} />
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
                  backgroundColor: CHECKERS_BOARD_COLORS.darkSquare,
                },
                isMyTurn && SHADOWS_NATIVE.glowCheckers,
              ]}
            >
              {squares}
              {pieces}
              {floating}
            </View>
          </GestureDetector>
        );
      }}
    </BoardFrame>
  );
}

// Memoized like web — skip the play screen's clock/re-render churn when
// gameState / onMove are stable.
export const CheckersBoard = React.memo(CheckersBoardInner);
