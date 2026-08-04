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
import {
  ChessEngine,
  getChessPremoveDestinations,
  isChessPremoveLegal,
} from '@gameexplorer/shared';
import type { ChessGameState, ChessPremove, PieceType } from '@gameexplorer/shared';
import { ChessPiece, BOARD_COLORS, COLORS, SHADOWS_NATIVE, useThemeName } from '@gameexplorer/ui';
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
  /**
   * Training hint — rings the piece to move and the square to move it to. Web
   * draws an arrow here; two rings read better at phone scale, and they're the
   * same treatment all three boards use.
   */
  hintMove?: { from: string; to: string } | null;
  /**
   * The side allowed to queue premoves — a move picked during the opponent's
   * turn and played the moment the turn comes back. Omit to switch premoves off
   * (pass-and-play, review): note this is NOT `playerColor`, which on these
   * screens is board orientation and inverts with the "Flip board" setting.
   */
  premoveColor?: 'white' | 'black';
}

// The vector piece art fills ~89% of its viewBox; 0.9 seats it at play scale with
// a small margin off the square edges (matches the web board's .piece sizing).
const PIECE_RATIO = 0.9;
const CHECK_RING = 'rgba(244,63,94,0.9)';
/**
 * Beat between the opponent's move landing and a queued premove firing — long
 * enough for the arriving move to paint, short enough to still read as instant.
 * Mirrors web's board.
 */
const PREMOVE_FIRE_DELAY_MS = 90;
// Amber, matching the warning treatment web's hint UI uses.
const HINT_RING = 'rgba(245,158,11,0.95)';
const HINT_FILL = 'rgba(245,158,11,0.28)';

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
  // Repaint when the theme changes; the tokens below are live views.
  useThemeName();

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
  hintMove,
  premoveColor,
}: ChessBoardProps) {
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null);
  const [validMoves, setValidMoves] = useState<string[]>([]);
  const [lastMoveTo, setLastMoveTo] = useState<string | null>(null);
  const [draggingFrom, setDraggingFrom] = useState<string | null>(null);
  const [pending, setPendingState] = useState<
    { from: string; to: string; isPremove?: boolean } | null
  >(null);
  // Move queued during the opponent's turn, waiting for the turn to come back.
  const [premove, setPremoveState] = useState<ChessPremove | null>(null);

  const sfx = useGameSfx();
  const { settings, reducedMotion } = useSettings();
  const coordsOn = showCoordinates && settings.showCoordinates;
  const isFlipped = playerColor === 'black';
  const gameOver = gameState.isCheckmate || gameState.isStalemate || gameState.isDraw;
  const isMyTurn = !gameOver && gameState.currentTurn === playerColor;
  // Premove mode: the opponent is on the clock, so picking a piece queues a
  // move instead of playing one.
  const premoveMode =
    !!premoveColor && interactive && !gameOver && gameState.currentTurn !== premoveColor;

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
  const premoveModeRef = useRef(premoveMode);
  premoveModeRef.current = premoveMode;
  const premoveColorRef = useRef(premoveColor);
  premoveColorRef.current = premoveColor;
  // Read at fire time, not closure time: the queued move is released a tick
  // after the opponent's move landed, by which point the parent has re-rendered.
  const onMoveRef = useRef(onMove);
  onMoveRef.current = onMove;

  // Interaction refs — source of truth during a gesture (see CheckersBoard for why
  // these must be written synchronously, not from render).
  const selectedRef = useRef<string | null>(null);
  const validRef = useRef<string[]>([]);
  const draggingRef = useRef<string | null>(null);
  const pendingRef = useRef<{ from: string; to: string; isPremove?: boolean } | null>(null);
  const premoveRef = useRef<ChessPremove | null>(null);

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
  const setPending = (p: { from: string; to: string; isPremove?: boolean } | null) => {
    pendingRef.current = p;
    setPendingState(p);
  };
  const setPremove = (p: ChessPremove | null) => {
    premoveRef.current = p;
    setPremoveState(p);
  };
  const clearSelection = () => setSelection(null, []);
  /**
   * Show where the piece on `pos` may go. Out of turn those are premove
   * candidates for a position that doesn't exist yet, not legal moves — see the
   * premove module in @gameexplorer/shared.
   */
  const selectSquare = (pos: string) =>
    setSelection(
      pos,
      premoveModeRef.current
        ? getChessPremoveDestinations(stateRef.current, pos)
        : legalRef.current.filter((m) => m.from === pos).map((m) => m.to),
    );

  const commitMove = (from: string, to: string) => {
    setDrag(null);
    clearSelection();
    const queueing = premoveModeRef.current;
    // Pawn promotion → resolve the picker before notifying the parent. A queued
    // premove settles it now too: a picker mid-flight would cost the player the
    // time the premove was meant to save.
    if (isPromotion(stateRef.current, from, to)) {
      setPending({ from, to, isPremove: queueing });
      return;
    }
    if (queueing) {
      setPremove({ from, to });
      sfx.play('select');
      return;
    }
    onMoveRef.current(from, to);
  };

  const handlePromotion = (piece: PieceType) => {
    const p = pendingRef.current;
    if (!p) return;
    setPending(null);
    sfx.play('promote');
    if (p.isPremove) setPremove({ from: p.from, to: p.to, promotion: piece });
    else onMoveRef.current(p.from, p.to, piece);
  };

  // Clear selection whenever the turn flips (e.g. after the bot replies). A
  // selection made under one turn means something different under the next
  // (premove candidates vs legal moves), so it never carries over.
  useEffect(() => {
    setSelection(null, []);
    setDrag(null);
  }, [gameState.currentTurn]);

  // ── Premove firing ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!premoveRef.current) return;

    if (!premoveColor) { setPremove(null); return; }
    // Still the opponent's move — keep waiting.
    if (gameState.currentTurn !== premoveColor) return;

    const t = setTimeout(() => {
      const pm = premoveRef.current;
      if (!pm) return;
      setPremove(null);
      // The opponent's move may have made it impossible; say so and hand the
      // turn back rather than silently swallowing the player's intent.
      if (isChessPremoveLegal(gameState, pm)) onMoveRef.current(pm.from, pm.to, pm.promotion);
      else sfx.play('illegal');
    }, PREMOVE_FIRE_DELAY_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState, premoveColor]);

  // Drop a stale queue when the board stops being a premove surface (game over,
  // review, mode switch).
  useEffect(() => {
    if (!premoveRef.current) return;
    if (!premoveColor || !interactive || gameOver) setPremove(null);
  }, [premoveColor, interactive, gameOver]);

  // ── Gesture → JS handlers ─────────────────────────────────────────────────────

  /**
   * May the piece on `pos` be picked up right now? Out of turn that's the
   * premoving side's own pieces; in turn, the side to move.
   */
  const canGrab = (pos: string): boolean => {
    const s = stateRef.current;
    const piece = s.board[rowOf(pos)][colOf(pos)];
    if (!piece) return false;
    return premoveModeRef.current
      ? piece.color === premoveColorRef.current
      : piece.color === s.currentTurn;
  };

  const handleTap = (x: number, y: number) => {
    if (!interactiveRef.current || pendingRef.current) return;
    const s = stateRef.current;
    if (s.isCheckmate || s.isStalemate || s.isDraw) return;
    const pos = squareAt(x, y, flipRef.current, sizeRef.current);

    if (selectedRef.current) {
      if (validRef.current.includes(pos)) commitMove(selectedRef.current, pos);
      else if (canGrab(pos)) selectSquare(pos);
      else {
        clearSelection();
        // A tap that neither aims nor re-picks takes a queued premove back —
        // the only cancel gesture a touch screen has.
        if (premoveRef.current) setPremove(null);
      }
    } else if (canGrab(pos)) {
      selectSquare(pos);
    } else if (premoveRef.current) {
      setPremove(null);
    }
  };

  const handleDragStart = (x: number, y: number) => {
    if (!interactiveRef.current || pendingRef.current) return;
    const s = stateRef.current;
    if (s.isCheckmate || s.isStalemate || s.isDraw) return;
    const pos = squareAt(x, y, flipRef.current, sizeRef.current);
    if (canGrab(pos)) {
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
            const isHintSquare = !!hintMove && (hintMove.from === pos || hintMove.to === pos);
            const isPremoveSquare = !!premove && (premove.from === pos || premove.to === pos);

            let bg: string = dark ? BOARD_COLORS.darkSquare : BOARD_COLORS.lightSquare;
            if (isSelected) bg = BOARD_COLORS.selectedSquare;
            // The queued move outranks the last move: the opponent's reply
            // often lands on one of these two squares, and the pending intent
            // is what the player needs to see there.
            else if (isPremoveSquare) bg = BOARD_COLORS.premove;
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
                {/* Premove candidates — dimmer than the legal-move dots,
                    because these are squares the move may be aimed at, not
                    moves known to be playable. */}
                {isValidDest && premoveMode && (
                  <View
                    style={{
                      width: sq * 0.22,
                      height: sq * 0.22,
                      borderRadius: sq * 0.11,
                      opacity: 0.55,
                      backgroundColor: BOARD_COLORS.premoveHint,
                    }}
                  />
                )}
                {/* Legal-move dot on an empty destination. */}
                {isValidDest && !premoveMode && !piece && (
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
                {isValidDest && !premoveMode && piece && (
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
                {/* Training hint — square outline on both ends of the suggested
                    move. Drawn last so it reads over the other cues. */}
                {isHintSquare && (
                  <View
                    style={{
                      position: 'absolute',
                      left: 0,
                      top: 0,
                      right: 0,
                      bottom: 0,
                      borderWidth: 3,
                      borderColor: HINT_RING,
                      backgroundColor: HINT_FILL,
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
