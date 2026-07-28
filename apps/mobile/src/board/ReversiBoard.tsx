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
import { ReversiEngine } from '@gameexplorer/shared';
import type { ReversiGameState, ReversiColor } from '@gameexplorer/shared';
import { ReversiDisc, REVERSI_BOARD_COLORS, SHADOWS_NATIVE } from '@gameexplorer/ui';
import { BoardFrame } from './BoardFrame';
import { useGameSfx } from '@/audio/useGameSfx.native';
import { useSettings } from '@/providers/SettingsProvider';

interface ReversiBoardProps {
  gameState: ReversiGameState;
  /** Called with the tapped placement square. */
  onMove: (position: string) => void;
  playerColor: ReversiColor;
  showCoordinates?: boolean;
  /** Ring the last-placed disc (only while at the live position). */
  highlightPos?: string | null;
  /** Board is inert while reviewing history / after game end. */
  interactive?: boolean;
  /** Training hint — outlines the square the engine would play. */
  hintPos?: string | null;
}

const DISC_RATIO = 0.86;
// Amber, matching the warning treatment web's hint UI uses.
const HINT_RING = 'rgba(245,158,11,0.95)';
const HINT_FILL = 'rgba(245,158,11,0.28)';

function posFromCoords(row: number, col: number): string {
  return String.fromCharCode(97 + col) + (row + 1);
}

/** On-screen px → board position. Reversi never flips the board. */
function squareAt(x: number, y: number, size: number): string {
  const sq = size / 8;
  const clamp = (n: number) => Math.max(0, Math.min(7, Math.floor(n / sq)));
  const screenCol = clamp(x);
  const screenRow = clamp(y);
  return posFromCoords(7 - screenRow, screenCol);
}

/**
 * A single disc, absolutely positioned, with a reanimated cue on the latest move:
 * a pop when just placed (scale 1.1) and a quick dip when just flipped (scale
 * 0.9 → 1) — the native mirror of web's `scale-110` / `scale-90` transitions.
 */
function DiscView({
  x,
  y,
  sq,
  color,
  placed,
  flipped,
  reduceMotion,
}: {
  x: number;
  y: number;
  sq: number;
  color: ReversiColor;
  placed: boolean;
  flipped: boolean;
  reduceMotion: boolean;
}) {
  const scale = useSharedValue(1);

  useEffect(() => {
    if (reduceMotion) return;
    if (placed) {
      scale.value = 0.6;
      scale.value = withSequence(
        withTiming(1.1, { duration: 150 }),
        withTiming(1, { duration: 130 }),
      );
    } else if (flipped) {
      scale.value = withSequence(
        withTiming(0.9, { duration: 130 }),
        withTiming(1, { duration: 160 }),
      );
    }
    // Re-run only when the move cue for this square changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placed, flipped]);

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
        },
        anim,
      ]}
    >
      <ReversiDisc color={color} size={sq * DISC_RATIO} />
    </Animated.View>
  );
}

/**
 * Native reversi board — the interaction/animation port of web's
 * `ReversiBoard.tsx`. Placement-only (no drag, no board flip): one `Tap` gesture
 * over the whole board maps the touch to a square and commits it if it's a legal
 * placement for the current player. Legal squares come from the shared
 * `ReversiEngine`, so the board never encodes rules.
 */
function ReversiBoardInner({
  gameState,
  onMove,
  playerColor,
  showCoordinates = true,
  highlightPos,
  interactive = true,
  hintPos,
}: ReversiBoardProps) {
  const [justPlaced, setJustPlaced] = useState<string | null>(null);
  const [justFlipped, setJustFlipped] = useState<Set<string>>(() => new Set());

  const sfx = useGameSfx();
  const { settings, reducedMotion } = useSettings();
  const coordsOn = showCoordinates && settings.showCoordinates;
  const isPlayerTurn = !gameState.isGameOver && gameState.currentTurn === playerColor;

  // Full move generation is expensive — recompute only when the state changes.
  const legalMoves = useMemo(() => ReversiEngine.getAllLegalMoves(gameState), [gameState]);

  // Refs so the memoized gesture reads fresh values without re-registering.
  const stateRef = useRef(gameState);
  stateRef.current = gameState;
  const legalRef = useRef(legalMoves);
  legalRef.current = legalMoves;
  const playerColorRef = useRef(playerColor);
  playerColorRef.current = playerColor;
  const interactiveRef = useRef(interactive);
  interactiveRef.current = interactive;
  const sizeRef = useRef(0);

  // Announce the latest move (placement pop + flip cue + sound), like web.
  useEffect(() => {
    const history = gameState.moveHistory;
    const latest = history[history.length - 1];
    if (!latest || !latest.position) {
      // No move yet, or a pass — nothing to animate.
      setJustPlaced(null);
      setJustFlipped(new Set());
      return;
    }
    setJustPlaced(latest.position);
    setJustFlipped(new Set(latest.flipped));
    sfx.play(latest.flipped.length > 0 ? 'flip' : 'move');
    const t = setTimeout(() => {
      setJustPlaced(null);
      setJustFlipped(new Set());
    }, 360);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState.moveHistory.length]);

  const handleTap = (x: number, y: number) => {
    if (!interactiveRef.current) return;
    const s = stateRef.current;
    if (s.isGameOver) return;
    if (s.currentTurn !== playerColorRef.current) return;
    const pos = squareAt(x, y, sizeRef.current);
    if (legalRef.current.includes(pos)) onMove(pos);
    else sfx.play('illegal');
  };

  // Handler ref so the memoized gesture always calls the latest closure.
  const tapRef = useRef(handleTap);
  tapRef.current = handleTap;
  const callTap = (x: number, y: number) => tapRef.current(x, y);

  const gesture = useMemo(() => {
    return Gesture.Tap()
      .maxDuration(400)
      .onEnd((e) => {
        'worklet';
        runOnJS(callTap)(e.x, e.y);
      });
  }, []);

  return (
    <BoardFrame accessibilityLabel="Reversi board">
      {(size) => {
        sizeRef.current = size;
        const sq = size / 8;

        const squares: React.ReactNode[] = [];
        const discs: React.ReactNode[] = [];

        for (let screenRow = 0; screenRow < 8; screenRow++) {
          for (let screenCol = 0; screenCol < 8; screenCol++) {
            const boardRow = 7 - screenRow;
            const boardCol = screenCol;
            const pos = posFromCoords(boardRow, boardCol);
            const disc = gameState.board[boardRow][boardCol];
            const isLegal = isPlayerTurn && legalMoves.includes(pos);
            const isHighlighted = highlightPos === pos;
            const isHint = hintPos === pos;

            const showRank = coordsOn && screenCol === 0;
            const showFile = coordsOn && screenRow === 7;

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
                  backgroundColor: REVERSI_BOARD_COLORS.cell,
                  borderWidth: 1,
                  borderColor: REVERSI_BOARD_COLORS.cellBorder,
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
                      color: 'rgba(255,255,255,0.7)',
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
                      color: 'rgba(255,255,255,0.7)',
                    }}
                  >
                    {String.fromCharCode(97 + boardCol)}
                  </Text>
                )}
                {/* Legal-move ghost dot on an empty square. */}
                {isLegal && !disc && (
                  <View
                    style={{
                      width: sq * 0.28,
                      height: sq * 0.28,
                      borderRadius: sq * 0.14,
                      backgroundColor:
                        gameState.currentTurn === 'black'
                          ? REVERSI_BOARD_COLORS.validMoveBlack
                          : REVERSI_BOARD_COLORS.validMoveWhite,
                    }}
                  />
                )}
                {/* Last-move ring on the most recently placed disc. */}
                {isHighlighted && disc && (
                  <View
                    style={{
                      position: 'absolute',
                      left: sq * 0.06,
                      top: sq * 0.06,
                      right: sq * 0.06,
                      bottom: sq * 0.06,
                      borderRadius: sq,
                      borderWidth: 2,
                      borderColor: REVERSI_BOARD_COLORS.lastMoveRing,
                    }}
                  />
                )}
                {/* Training hint — the square the engine would play. Drawn last
                    so it reads over the legal-move dot underneath it. */}
                {isHint && (
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

            if (disc) {
              discs.push(
                <DiscView
                  key={`d-${pos}`}
                  x={screenCol * sq}
                  y={screenRow * sq}
                  sq={sq}
                  color={disc.color}
                  placed={justPlaced === pos}
                  flipped={justFlipped.has(pos)}
                  reduceMotion={reducedMotion}
                />,
              );
            }
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
                  borderColor: REVERSI_BOARD_COLORS.boardBorder,
                  backgroundColor: REVERSI_BOARD_COLORS.cell,
                },
                isPlayerTurn && SHADOWS_NATIVE.glowReversi,
              ]}
            >
              {squares}
              {discs}
            </View>
          </GestureDetector>
        );
      }}
    </BoardFrame>
  );
}

// Memoized like web — skip the play screen's re-render churn when props are stable.
export const ReversiBoard = React.memo(ReversiBoardInner);
