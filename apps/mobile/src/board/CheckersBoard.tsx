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
import {
  BOARD_ANIM_MS,
  CHECKERS_DIFF,
  CheckersEngine,
  getCheckersPremoveDestinations,
  isCheckersPremoveLegal,
} from '@gameexplorer/shared';
import type {
  CheckersGameState,
  CheckersPiece as CheckersPieceModel,
  CheckersPremove,
} from '@gameexplorer/shared';
// Deep import: the `@gameexplorer/client` barrel builds a Supabase client at
// import time, which a board has no business needing.
import {
  type PieceOffset,
  motionKey,
  useBoardMotion,
} from '@gameexplorer/client/hooks/useBoardMotion';
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
  /** Training hint — outlines the piece to move and where to move it. */
  hintMove?: { from: string; to: string } | null;
  /**
   * The side allowed to queue premoves — a move picked during the opponent's
   * turn and played the moment the turn comes back. Omit to switch premoves off
   * (pass-and-play, review): note this is NOT `playerColor`, which on these
   * screens is board orientation and inverts with the "Flip board" setting.
   */
  premoveColor?: 'white' | 'black';
}

const PIECE_RATIO = 0.86;
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
 * A single piece, absolutely positioned, travelling in from wherever it was.
 * It pops on arrival only when it did not slide. The origin piece dims while
 * its owner drags it (the "lifted" look).
 */
function BoardPiece({
  x,
  y,
  sq,
  type,
  color,
  dimmed,
  pop,
  offset,
  reduceMotion,
}: {
  x: number;
  y: number;
  sq: number;
  type: 'man' | 'king';
  color: 'white' | 'black';
  dimmed: boolean;
  pop: boolean;
  /** Where this piece came from, in squares. Null means it did not travel. */
  offset: PieceOffset | null;
  reduceMotion: boolean;
}) {
  const scale = useSharedValue(1);
  // Seeded at creation, not in an effect — see the note on chess's BoardPiece.
  const tx = useSharedValue(offset ? offset.dx * sq : 0);
  const ty = useSharedValue(offset ? offset.dy * sq : 0);

  useEffect(() => {
    if (!offset || reduceMotion) return;
    tx.value = withTiming(0, { duration: BOARD_ANIM_MS });
    ty.value = withTiming(0, { duration: BOARD_ANIM_MS });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (pop && !reduceMotion && !offset) {
      scale.value = 0.75;
      scale.value = withSequence(
        withTiming(1.1, { duration: 130 }),
        withTiming(1, { duration: 120 }),
      );
    }
    // Only re-run when the pop trigger flips on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pop]);

  const anim = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }, { translateY: ty.value }, { scale: scale.value }],
  }));

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
 * A jumped piece, still drawn where it stood while it fades. Multi-jumps remove
 * several at once, which is exactly when pieces vanishing instantly is most
 * jarring — the chain reads as one long slide past ghosts.
 */
function FadingPiece({
  x,
  y,
  sq,
  piece,
  reduceMotion,
}: {
  x: number;
  y: number;
  sq: number;
  piece: CheckersPieceModel;
  reduceMotion: boolean;
}) {
  const opacity = useSharedValue(reduceMotion ? 0 : 1);

  useEffect(() => {
    if (!reduceMotion) opacity.value = withTiming(0, { duration: BOARD_ANIM_MS });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const anim = useAnimatedStyle(() => ({ opacity: opacity.value }));

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
        },
        anim,
      ]}
    >
      <CheckersPiece type={piece.type} color={piece.color} size={sq * PIECE_RATIO} />
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
  hintMove,
  premoveColor,
}: CheckersBoardProps) {
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null);
  const [validMoves, setValidMoves] = useState<string[]>([]);
  const [lastMove, setLastMove] = useState<{ from: string; to: string } | null>(null);
  const [lastMoveTo, setLastMoveTo] = useState<string | null>(null);
  const [draggingFrom, setDraggingFrom] = useState<string | null>(null);
  // Move queued during the opponent's turn, waiting for the turn to come back.
  const [premove, setPremoveState] = useState<CheckersPremove | null>(null);

  const sfx = useGameSfx();
  const { settings, reducedMotion } = useSettings();
  const coordsOn = showCoordinates && settings.showCoordinates;
  const isFlipped = playerColor === 'black';
  const isMyTurn = !gameState.isGameOver && gameState.currentTurn === playerColor;
  // Premove mode: the opponent is on the clock, so picking a piece queues a
  // move instead of playing one.
  const premoveMode =
    !!premoveColor && interactive && !gameState.isGameOver &&
    gameState.currentTurn !== premoveColor;

  // Full move generation is expensive — recompute only when the state changes.
  const legalMoves = useMemo(() => CheckersEngine.getAllLegalMoves(gameState), [gameState]);

  // What travelled to get here. A multi-jump is one long slide with a fade per
  // victim, which is what makes a chain read as a chain.
  const motion = useBoardMotion(gameState.board, {
    ...CHECKERS_DIFF,
    historyLength: gameState.moveHistory.length,
    isFlipped,
    enabled: !reducedMotion,
  });

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
  const premoveModeRef = useRef(premoveMode);
  premoveModeRef.current = premoveMode;
  const premoveColorRef = useRef(premoveColor);
  premoveColorRef.current = premoveColor;
  // Read at fire time, not closure time: the queued move is released a tick
  // after the opponent's move landed, by which point the parent has re-rendered.
  const onMoveRef = useRef(onMove);
  onMoveRef.current = onMove;
  const premoveRef = useRef<CheckersPremove | null>(null);

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
  const setPremove = (p: CheckersPremove | null) => {
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
        ? getCheckersPremoveDestinations(stateRef.current, pos)
        : legalRef.current.filter((m) => m.from === pos).map((m) => m.to),
    );
  const commitMove = (from: string, to: string) => {
    setDrag(null);
    clearSelection();
    if (premoveModeRef.current) {
      setPremove({ from, to });
      sfx.play('select');
      return;
    }
    onMoveRef.current(from, to);
  };

  // Clear selection whenever the turn flips (e.g. after the bot replies). Uses the
  // synchronous mutators so the refs don't lag a render behind the reset. A
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
      // Mandatory capture makes this a real filter in checkers: the opponent's
      // move can turn any quiet premove into an illegal one.
      if (isCheckersPremoveLegal(gameState, pm)) onMoveRef.current(pm.from, pm.to);
      else sfx.play('illegal');
    }, PREMOVE_FIRE_DELAY_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState, premoveColor]);

  // Drop a stale queue when the board stops being a premove surface (game over,
  // review, mode switch).
  useEffect(() => {
    if (!premoveRef.current) return;
    if (!premoveColor || !interactive || gameState.isGameOver) setPremove(null);
  }, [premoveColor, interactive, gameState.isGameOver]);

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

  // Tap-to-move: mirrors web's handleSquareClick. Runs from a dedicated Tap
  // gesture (a Pan never fires onEnd for a motionless tap, so tap-to-move must
  // not depend on the Pan lifecycle).
  const handleTap = (x: number, y: number) => {
    if (!interactiveRef.current) return;
    const s = stateRef.current;
    if (s.isGameOver) return;
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

  // Drag pickup — fires only once the Pan actually activates (real movement), so
  // taps are left entirely to the Tap gesture. `x,y` are the touch-DOWN point
  // (current point minus translation so far).
  const handleDragStart = (x: number, y: number) => {
    if (!interactiveRef.current) return;
    const s = stateRef.current;
    if (s.isGameOver) return;
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
    <BoardFrame accessibilityLabel="Checkers board">
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
            const isHintSquare = !!hintMove && (hintMove.from === pos || hintMove.to === pos);
            const isPremoveSquare = !!premove && (premove.from === pos || premove.to === pos);

            let bg = dark ? CHECKERS_BOARD_COLORS.darkSquare : CHECKERS_BOARD_COLORS.lightSquare;
            if (isSelected) bg = CHECKERS_BOARD_COLORS.selectedSquare;
            // The queued move outranks the last move: the opponent's reply
            // often lands on one of these two squares, and the pending intent
            // is what the player needs to see there.
            else if (isPremoveSquare) bg = CHECKERS_BOARD_COLORS.premove;
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
                {/* Premove candidates — dimmer than the legal-move dots,
                    because these are squares the move may be aimed at, not
                    moves known to be playable. */}
                {dark && isValidDest && premoveMode && (
                  <View
                    style={{
                      width: sq * 0.22,
                      height: sq * 0.22,
                      borderRadius: sq * 0.11,
                      opacity: 0.55,
                      backgroundColor: CHECKERS_BOARD_COLORS.premoveHint,
                    }}
                  />
                )}
                {/* Legal-move dot on an empty destination. */}
                {dark && isValidDest && !premoveMode && !piece && (
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
                {dark && isValidDest && !premoveMode && piece && (
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
                  // The piece is part of the key so a capture mounts a fresh
                  // component — see the chess board for why.
                  key={`p-${pos}-${piece.color}-${piece.type}`}
                  x={x}
                  y={y}
                  sq={sq}
                  type={piece.type}
                  color={piece.color}
                  dimmed={draggingFrom === pos}
                  pop={lastMoveTo === pos}
                  offset={motion.offsets.get(motionKey(boardRow, boardCol)) ?? null}
                  reduceMotion={reducedMotion}
                />,
              );
            }
          }
        }

        // Jumped pieces, drawn under the live ones while they fade.
        const fading = motion.fades.map((fade) => {
          const pos = posFromCoords(fade.at.row, fade.at.col);
          const { x, y } = screenXY(pos, isFlipped, sq);
          return (
            <FadingPiece
              key={`f-${motion.epoch}-${pos}`}
              x={x}
              y={y}
              sq={sq}
              piece={fade.piece}
              reduceMotion={reducedMotion}
            />
          );
        });

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
              {fading}
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
