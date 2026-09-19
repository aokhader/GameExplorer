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
import { ReversiEngine, boardAnimMs } from '@gameexplorer/shared';
import type { LessonMark, ReversiGameState, ReversiColor } from '@gameexplorer/shared';
import { ReversiDisc, REVERSI_BOARD_COLORS, FONT_SIZES, RADIUS } from '@gameexplorer/ui';
import { BoardFrame } from './BoardFrame';
import { BoardMark, BoardMarkLabel, markMap } from './BoardMark';
import { useGameSfx } from '@/audio/useGameSfx.native';
import { useSettings } from '@/providers/SettingsProvider';
import { FONTS } from '@/theme/typography';
import { timing } from '@/theme/motion';

// Disc motion from MOTION (project-docs/design/motion-spec.md §5.12). The
// placement pop is the same landing pop chess and checkers use — it used to run
// 80ms longer here for no recorded reason — and the flip keeps the board tempo.
const PLACE_POP = timing('micro', 'standard');
const FLIP = timing('base', 'standard');

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
  /**
   * Coached annotations, drawn per square — see `BoardMark`.
   *
   * The hint props above name exactly one move or point; a lesson step marks
   * several squares at once and says different things about them.
   */
  highlightSquares?: LessonMark[];
}

const DISC_RATIO = 0.86;
/** Shared empty result, so skipping generation doesn't allocate per render. */
const NO_MOVES: readonly string[] = [];

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
 * A single disc, absolutely positioned, with a reanimated cue on the latest
 * move: a pop when just placed, and a real turn-over when just flipped.
 *
 * The flip stacks both faces and narrows one while widening the other, which is
 * how a disc actually turns: the old colour collapses to an edge, then the new
 * colour opens out of it. A dip in scale — what this did before — reads as a
 * nudge, not a flip, and left the colour change itself instantaneous.
 *
 * Note this board does NOT use `useBoardMotion` like chess and checkers do. It
 * has no need to infer anything: a disc never travels, and the engine already
 * reports exactly which squares flipped in `moveHistory`. Diffing two positions
 * to rediscover that would be strictly worse information.
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
  // 1 is "settled, showing `color`". A flip drops it to 0 and plays it back.
  const turn = useSharedValue(1);

  useEffect(() => {
    if (reduceMotion) return;
    if (placed) {
      scale.value = 0.6;
      scale.value = withSequence(
        withTiming(1.1, PLACE_POP),
        withTiming(1, PLACE_POP),
      );
    } else if (flipped) {
      turn.value = 0;
      turn.value = withTiming(1, FLIP);
    }
    // Re-run only when the move cue for this square changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placed, flipped]);

  const anim = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  // The face being turned away. `color` is already the new one by the time a
  // flip is announced, so the outgoing face is simply its opposite.
  const outgoing = useAnimatedStyle(() => ({
    opacity: turn.value < 0.5 ? 1 : 0,
    transform: [{ scaleX: Math.max(0, 1 - turn.value * 2) }],
  }));
  const incoming = useAnimatedStyle(() => ({
    opacity: turn.value < 0.5 ? 0 : 1,
    transform: [{ scaleX: Math.max(0, turn.value * 2 - 1) }],
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
        },
        anim,
      ]}
    >
      <Animated.View style={[{ position: 'absolute' }, outgoing]}>
        <ReversiDisc color={color === 'black' ? 'white' : 'black'} size={sq * DISC_RATIO} />
      </Animated.View>
      <Animated.View style={incoming}>
        <ReversiDisc color={color} size={sq * DISC_RATIO} />
      </Animated.View>
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
  highlightSquares,
}: ReversiBoardProps) {
  const [justPlaced, setJustPlaced] = useState<string | null>(null);
  const [justFlipped, setJustFlipped] = useState<Set<string>>(() => new Set());

  const sfx = useGameSfx();
  const { settings, reducedMotion } = useSettings();
  const coordsOn = showCoordinates && settings.showCoordinates;
  const isPlayerTurn = !gameState.isGameOver && gameState.currentTurn === playerColor;

  // Refs so the memoized gesture reads fresh values without re-registering.
  const stateRef = useRef(gameState);
  stateRef.current = gameState;
  const playerColorRef = useRef(playerColor);
  playerColorRef.current = playerColor;
  const interactiveRef = useRef(interactive);
  interactiveRef.current = interactive;
  const sizeRef = useRef(0);

  // Unlike chess and checkers, reversi's dots ARE render output — every legal
  // placement is shown at once, not just the ones for a selected piece — so this
  // cannot be deferred to a touch. What it can skip is the opponent's turn, and
  // that is the frame that matters: the one right after the player places, where
  // the flips are animating and no dots are drawn anyway.
  //
  // Reads `stateRef` rather than the render-scope `gameState` so render and the
  // tap handler — which judges the tap off that same ref — can never disagree
  // about which position the cached list belongs to.
  const legalCache = useRef<{ state: ReversiGameState; moves: string[] } | null>(null);
  const getLegalMoves = () => {
    const state = stateRef.current;
    if (legalCache.current?.state !== state) {
      legalCache.current = { state, moves: ReversiEngine.getAllLegalMoves(state) };
    }
    return legalCache.current.moves;
  };
  const legalNow = isPlayerTurn ? getLegalMoves() : NO_MOVES;

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
    if (getLegalMoves().includes(pos)) onMove(pos);
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
        const marks = markMap(highlightSquares);
        // Written marks are drawn after the discs — inside the square they
        // would sit under whatever is standing on it.
        const markLabels: React.ReactNode[] = [];
        const discs: React.ReactNode[] = [];

        for (let screenRow = 0; screenRow < 8; screenRow++) {
          for (let screenCol = 0; screenCol < 8; screenCol++) {
            const boardRow = 7 - screenRow;
            const boardCol = screenCol;
            const pos = posFromCoords(boardRow, boardCol);
            const disc = gameState.board[boardRow][boardCol];
            const isLegal = legalNow.includes(pos);
            const isHighlighted = highlightPos === pos;
            const isHint = hintPos === pos;
            const mark = marks.get(pos);
            if (mark?.text) {
              markLabels.push(
                <BoardMarkLabel
                  key={`ml-${pos}`}
                  mark={mark}
                  size={sq}
                  left={screenCol * sq}
                  top={screenRow * sq}
                />,
              );
            }

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
                      fontSize: FONT_SIZES['3xs'],
                      fontFamily: FONTS.bodyBold,
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
                      fontSize: FONT_SIZES['3xs'],
                      fontFamily: FONTS.bodyBold,
                      color: 'rgba(255,255,255,0.7)',
                    }}
                  >
                    {String.fromCharCode(97 + boardCol)}
                  </Text>
                )}
                {mark && <BoardMark mark={mark} size={sq} round />}
                {/* Legal-move ghost dot on an empty square. */}
                {isLegal && !disc && settings.showDestinations && (
                  <View
                    style={{
                      width: sq * 0.22,
                      height: sq * 0.22,
                      borderRadius: sq * 0.11,
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
                      borderColor: REVERSI_BOARD_COLORS.hintRing,
                      backgroundColor: REVERSI_BOARD_COLORS.hintFill,
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
                  // The placement pop and flip are piece motion: off with
                  // piece animation set to none, as well as reduced motion.
                  reduceMotion={boardAnimMs(settings, reducedMotion) === 0}
                />,
              );
            }
          }
        }

        return (
          // No turn glow: the player cards say whose move it is.
          <GestureDetector gesture={gesture}>
            <View
              style={{
                width: size,
                height: size,
                borderRadius: RADIUS.xl,
                overflow: 'hidden',
                borderWidth: 2,
                borderColor: REVERSI_BOARD_COLORS.boardBorder,
                backgroundColor: REVERSI_BOARD_COLORS.cell,
              }}
            >
              {squares}
              {discs}
              {markLabels}
            </View>
          </GestureDetector>
        );
      }}
    </BoardFrame>
  );
}

// Memoized like web — skip the play screen's re-render churn when props are stable.
export const ReversiBoard = React.memo(ReversiBoardInner);
