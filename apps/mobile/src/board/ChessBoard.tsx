import React, { useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import {
  CHESS_DIFF,
  ChessEngine,
  getChessPremoveDestinations,
  isChessPremoveLegal,
  boardAnimMs,
  // a1 dark, h1 light. One rule for every board in the app.
  isDarkSquare as isDark,
} from '@gameexplorer/shared';
import type {
  ChessGameState,
  ChessPremove,
  LessonMark,
  Piece,
  PieceType,
} from '@gameexplorer/shared';
// Deep import: the `@gameexplorer/client` barrel builds a Supabase client at
// import time, which a board has no business needing.
import {
  type PieceOffset,
  motionKey,
  useBoardMotion,
} from '@gameexplorer/client/hooks/useBoardMotion';
import { ChessPiece, BOARD_COLORS, COLORS, useThemeName, FONT_SIZES, RADIUS, SPACING } from '@gameexplorer/ui';
import { BoardFrame } from './BoardFrame';
import { BoardMark, BoardMarkLabel, markMap } from './BoardMark';
import { CaptureCorners, CheckMarker, SquareTint } from './SquareState';
import { DRAG_FEEDBACK_SCALE, DragGhost, DragTarget, isOnBoard } from './dragFeedback';
import { useBoardGesture, type BoardGestureHandlers } from './useBoardGesture';
import { useGameSfx } from '@/audio/useGameSfx.native';
import { useSettings } from '@/providers/SettingsProvider';
import { FONTS } from '@/theme/typography';
import { timing } from '@/theme/motion';

// Board motion from MOTION (project-docs/design/motion-spec.md §5.12). `base` is
// the board's own BOARD_ANIM_MS, held equal by a test in packages/ui; `move` is
// the travel curve web's PieceSlot uses, so a piece now glides identically on
// both platforms. The drag lift lives with the rest of the drag feedback, in
// `dragFeedback.tsx`. MOTION is not themed, so this is not the frozen-token trap.
const TRAVEL = timing('base', 'move');
const CAPTURE_FADE = timing('base', 'linear');
const LAND_POP = timing('micro', 'standard');

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
   * Coached annotations, drawn per square — see `BoardMark`.
   *
   * The hint props above name exactly one move or point; a lesson step marks
   * several squares at once and says different things about them.
   */
  highlightSquares?: LessonMark[];
  /**
   * The side allowed to queue premoves — a move picked during the opponent's
   * turn and played the moment the turn comes back. Omit to switch premoves off
   * (pass-and-play, review): note this is NOT `playerColor`, which on these
   * screens is board orientation and inverts with the "Flip board" setting.
   */
  premoveColor?: 'white' | 'black';
  /**
   * Position-editing hook for the analysis board: when set, a tap reports the
   * square and no move logic runs at all. A drag goes to `onPieceRelocate`, and
   * without one it does nothing — it never plays a move.
   */
  onSquarePress?: (position: string) => void;
  /**
   * Position editing by drag: any piece may be picked up — either colour,
   * whoever's turn it is, whatever the result — and dropping it on another
   * square reports both squares instead of playing a move. The parent does the
   * moving, with no rules applied. Released off the board, it stays put.
   */
  onPieceRelocate?: (from: string, to: string) => void;
}

/** The piece under drag, as it was when picked up. */
interface HeldPiece {
  from: string;
  piece: Piece;
}

/**
 * The destinations on show, and the position and mode they were worked out for.
 * A selection can outlive the position it was made in — the opponent's reply
 * lands while a piece is held — so "is this square a destination" is only ever
 * answered by a list known to describe the position on the board now.
 */
interface Dests {
  from: string;
  state: ChessGameState;
  premove: boolean;
  list: string[];
}

// The vector piece art fills ~89% of its viewBox; 0.9 seats it at play scale with
// a small margin off the square edges (matches the web board's .piece sizing).
const PIECE_RATIO = 0.9;
/**
 * Beat between the opponent's move landing and a queued premove firing — long
 * enough for the arriving move to paint, short enough to still read as instant.
 * Mirrors web's board.
 */
const PREMOVE_FIRE_DELAY_MS = 90;
// Amber, matching the warning treatment web's hint UI uses.
const HINT_RING = 'rgba(245,158,11,0.95)';
const HINT_FILL = 'rgba(245,158,11,0.28)';

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

/** A single piece, absolutely positioned, travelling in from wherever it was. */
function BoardPiece({
  x,
  y,
  sq,
  type,
  color,
  dimmed,
  pop,
  offset,
  animMs,
}: {
  x: number;
  y: number;
  sq: number;
  type: PieceType;
  color: 'white' | 'black';
  dimmed: boolean;
  pop: boolean;
  /** Where this piece came from, in squares. Null means it did not travel. */
  offset: PieceOffset | null;
  /** Travel time on this device; 0 means nothing moves. See `boardAnimMs`. */
  animMs: number;
}) {
  const reduceMotion = animMs <= 0;
  const scale = useSharedValue(1);
  // Seeded at creation rather than in an effect, because an effect runs after
  // paint: the piece would show for one frame at its destination, then snap
  // back to its origin to begin. Every piece that travels is newly mounted —
  // the key carries the square AND the piece, so a capture replaces the
  // component rather than reusing the captured piece's instance.
  const tx = useSharedValue(offset ? offset.dx * sq : 0);
  const ty = useSharedValue(offset ? offset.dy * sq : 0);

  useEffect(() => {
    if (!offset || reduceMotion) return;
    tx.value = withTiming(0, { ...TRAVEL, duration: animMs });
    ty.value = withTiming(0, { ...TRAVEL, duration: animMs });
    // Mount-only: `offset` describes the arrival that created this instance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // A piece that slid has already announced itself; popping it as well reads
    // as a stutter at the end of the travel.
    if (pop && !reduceMotion && !offset) {
      scale.value = 0.75;
      scale.value = withSequence(
        withTiming(1.1, LAND_POP),
        withTiming(1, LAND_POP),
      );
    }
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
      <ChessPiece type={type} color={color} size={sq * PIECE_RATIO} />
    </Animated.View>
  );
}

/**
 * A captured piece, still drawn where it stood while it fades.
 *
 * Without this a capture is instantaneous in a way nothing else on the board
 * is: the taking piece glides over for 200ms towards a square that emptied the
 * moment the move was made.
 */
function FadingPiece({
  x,
  y,
  sq,
  piece,
  animMs,
}: {
  x: number;
  y: number;
  sq: number;
  piece: Piece;
  animMs: number;
}) {
  const opacity = useSharedValue(animMs > 0 ? 1 : 0);

  useEffect(() => {
    if (animMs > 0) opacity.value = withTiming(0, { ...CAPTURE_FADE, duration: animMs });
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
      <ChessPiece type={piece.type} color={piece.color} size={sq * PIECE_RATIO} />
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
          borderRadius: RADIUS['2xl'],
          borderWidth: 1,
          borderColor: COLORS.border,
          padding: 14,
          alignItems: 'center',
        }}
      >
        <Text style={{ color: COLORS.fg, fontSize: FONT_SIZES.sm, fontFamily: FONTS.bodyBold, marginBottom: 10 }}>
          Promote pawn to:
        </Text>
        <View style={{ flexDirection: 'row', gap: SPACING[2] }}>
          {pieces.map((type) => (
            <Pressable
              key={type}
              onPress={() => onSelect(type)}
              style={{
                width: 56,
                height: 56,
                borderRadius: RADIUS.xl,
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
 * Touch handling is `useBoardGesture` (shared with checkers): a `Tap` selects and
 * taps a destination; a `Pan` picks up an own piece, carries it at 2× one square
 * above the finger with a disc under the square it is over (`dragFeedback.tsx`),
 * and drops it where the finger lifts.
 *
 * A held piece survives the opponent's move landing: the selection is
 * reconciled against the new position rather than thrown away, so a drag begun
 * as a premove becomes a real move if the reply lands first. It is dropped only
 * if the piece itself was taken, or the board goes inert.
 *
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
  highlightSquares,
  premoveColor,
  onSquarePress,
  onPieceRelocate,
}: ChessBoardProps) {
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null);
  const [validMoves, setValidMoves] = useState<string[]>([]);
  const [lastMoveTo, setLastMoveTo] = useState<string | null>(null);
  // The piece under drag, captured at pick-up — never re-read from the live
  // board, which the opponent's move may change while it is held.
  const [held, setHeldState] = useState<HeldPiece | null>(null);
  // A move just played by dropping the piece where it lands. That piece is
  // already on its square, so it must not slide in again from its origin.
  const [dropped, setDropped] = useState<{ to: string; historyLength: number } | null>(null);
  const [pending, setPendingState] = useState<
    { from: string; to: string; isPremove?: boolean } | null
  >(null);
  // Move queued during the opponent's turn, waiting for the turn to come back.
  const [premove, setPremoveState] = useState<ChessPremove | null>(null);

  const sfx = useGameSfx();
  const { settings, reducedMotion } = useSettings();
  // Travel time on this device: the speed setting, or 0 under reduced motion.
  const animMs = boardAnimMs(settings, reducedMotion);
  const showDests = settings.showDestinations;
  const coordsOn = showCoordinates && settings.showCoordinates;
  const isFlipped = playerColor === 'black';
  const gameOver = gameState.isCheckmate || gameState.isStalemate || gameState.isDraw;
  // Premove mode: the opponent is on the clock, so picking a piece queues a
  // move instead of playing one.
  const premoveMode =
    !!premoveColor && interactive && !gameOver && gameState.currentTurn !== premoveColor;
  // Position editing: taps go to `onSquarePress`, drags to `onPieceRelocate`,
  // and neither is a move.
  const editing = !!onSquarePress || !!onPieceRelocate;

  const lastMoveEntry = gameState.moveHistory[gameState.moveHistory.length - 1] ?? null;
  const lastMove = lastMoveEntry ? { from: lastMoveEntry.from, to: lastMoveEntry.to } : null;
  const kingInCheckPos = gameState.isCheck ? findKing(gameState.board, gameState.currentTurn) : null;

  // What travelled to get to this position, so pieces slide rather than blink
  // into place. Animates only between consecutive positions — seeking through
  // a puzzle line or loading a new game snaps, as it should.
  const motion = useBoardMotion(gameState.board, {
    ...CHESS_DIFF,
    historyLength: gameState.moveHistory.length,
    isFlipped,
    enabled: animMs > 0,
  });

  // Touch handling. The handlers are defined below and handed over through a
  // ref, because they need `active`, which the hook creates.
  const gestureHandlers = useRef<BoardGestureHandlers | null>(null);
  const { gesture, fingerX, fingerY, lift, active } = useBoardGesture(gestureHandlers, {
    // An editor with nowhere to report a drag has nothing for one to do; left
    // on, it would pick up a piece and play it as a move.
    interactive: interactive && (!onSquarePress || !!onPieceRelocate),
    reducedMotion,
  });

  // Props/derived refs — mirror render every render (read by the memoized gesture).
  const stateRef = useRef(gameState);
  stateRef.current = gameState;
  const flipRef = useRef(isFlipped);
  flipRef.current = isFlipped;
  const sizeRef = useRef(0);
  const interactiveRef = useRef(interactive);
  interactiveRef.current = interactive;
  const premoveModeRef = useRef(premoveMode);
  premoveModeRef.current = premoveMode;
  const premoveColorRef = useRef(premoveColor);
  premoveColorRef.current = premoveColor;
  const onSquarePressRef = useRef(onSquarePress);
  onSquarePressRef.current = onSquarePress;
  const onPieceRelocateRef = useRef(onPieceRelocate);
  onPieceRelocateRef.current = onPieceRelocate;
  // Read at fire time, not closure time: the queued move is released a tick
  // after the opponent's move landed, by which point the parent has re-rendered.
  const onMoveRef = useRef(onMove);
  onMoveRef.current = onMove;

  // Full move generation is expensive, and computing it during render put it on
  // the paint path of the very frame that shows the move which caused it.
  // Nothing in render needs it — the legal-move dots come from `validMoves`
  // state — so it is deferred to the first pick-up and cached against the
  // position, which is a lazy `useMemo` in all but name.
  //
  // It reads `stateRef`, not the render-scope `gameState`, for the same reason
  // the rest of `selectSquare` does: everything a gesture handler decides from
  // is read at fire time, so one source keeps the cache key and the moves it
  // holds from ever describing different positions.
  const legalCache = useRef<{
    state: ChessGameState;
    moves: ReturnType<typeof ChessEngine.getAllLegalMoves>;
  } | null>(null);
  const getLegalMoves = () => {
    const state = stateRef.current;
    if (legalCache.current?.state !== state) {
      legalCache.current = { state, moves: ChessEngine.getAllLegalMoves(state) };
    }
    return legalCache.current.moves;
  };

  // Interaction refs — source of truth during a gesture (see CheckersBoard for why
  // these must be written synchronously, not from render).
  const selectedRef = useRef<string | null>(null);
  const destsRef = useRef<Dests | null>(null);
  const heldRef = useRef<HeldPiece | null>(null);
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
    destsRef.current = pos
      ? { from: pos, state: stateRef.current, premove: premoveModeRef.current, list: dests }
      : null;
    setSelectedSquare(pos);
    setValidMoves(dests);
  };
  const setHeld = (h: HeldPiece | null) => {
    heldRef.current = h;
    setHeldState(h);
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
        : getLegalMoves()
            .filter((m) => m.from === pos)
            .map((m) => m.to),
    );
  /**
   * Where the selected piece may go in the position on the board NOW. Empty if
   * the list on show was worked out for an earlier position or the other mode —
   * `reconcile` refreshes it first wherever that can have happened.
   */
  const currentDests = (): string[] => {
    const d = destsRef.current;
    return d && d.state === stateRef.current && d.premove === premoveModeRef.current ? d.list : [];
  };
  /** Let go of everything: the held piece, the selection and the hover disc. */
  const releaseAll = () => {
    setHeld(null);
    clearSelection();
    active.value = 0;
  };

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

  /**
   * Bring whatever the player is holding up to date with the position on the
   * board. This replaces "clear the selection whenever the turn flips", which
   * threw away a drag in progress the moment the opponent's reply landed — the
   * player's move silently vanished on release.
   *
   * Now a held piece survives the position changing. If the same
   * piece still stands where it was picked up and may still be moved, it stays
   * held and its destinations are recomputed for the new position — premove
   * candidates become legal moves when the turn comes back, so the drop plays at
   * once. If the piece was taken (or is no longer the side's to move), it is let
   * go. A premove promotion whose pawn was taken while the picker was open is
   * withdrawn the same way.
   */
  const reconcile = () => {
    const p = pendingRef.current;
    if (p?.isPremove) {
      const pawn = stateRef.current.board[rowOf(p.from)][colOf(p.from)];
      if (!pawn || pawn.type !== 'pawn' || pawn.color !== premoveColorRef.current) {
        setPending(null);
        sfx.play('illegal');
      }
    }

    const h = heldRef.current;
    if (h) {
      const now = stateRef.current.board[rowOf(h.from)][colOf(h.from)];
      if (!now || now.color !== h.piece.color || now.type !== h.piece.type) {
        releaseAll();
        return;
      }
    }
    const sel = selectedRef.current;
    if (!sel) return;
    if (!canGrab(sel)) {
      releaseAll();
      return;
    }
    const d = destsRef.current;
    if (!d || d.state !== stateRef.current || d.premove !== premoveModeRef.current) {
      selectSquare(sel);
    }
  };

  const commitMove = (from: string, to: string, byDrop: boolean) => {
    setHeld(null);
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
    // A dropped piece is already standing on `to`; sliding it in again from its
    // origin would show the move twice.
    if (byDrop) setDropped({ to, historyLength: stateRef.current.moveHistory.length + 1 });
    onMoveRef.current(from, to);
  };

  const handlePromotion = (piece: PieceType) => {
    const p = pendingRef.current;
    if (!p) return;
    setPending(null);
    sfx.play('promote');
    const move = { from: p.from, to: p.to, promotion: piece };
    // Queue or play is decided NOW, not when the picker opened: the reply may
    // have landed while the player chose, and a premove queued after that would
    // wait for a turn that has already come back.
    if (premoveModeRef.current) setPremove(move);
    else if (!p.isPremove || isChessPremoveLegal(stateRef.current, move)) {
      onMoveRef.current(p.from, p.to, piece);
    } else sfx.play('illegal');
  };

  // A held or selected piece outlives the opponent's move — see `reconcile`.
  useEffect(() => {
    reconcile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState, premoveMode]);

  // …but not the board going inert (game over, review, a puzzle's reply beat),
  // or becoming a position editor, where a selection's legal-move dots would
  // sit on the board with no tap left that could act on them.
  useEffect(() => {
    if (interactive && !gameOver && !editing) return;
    if (heldRef.current || selectedRef.current) releaseAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interactive, gameOver, editing]);

  // The no-slide for a dropped move applies only to the position that move
  // produced, and only if it arrived with the drop. A local game applies the
  // move in the same render; an online one waits for the server, and by then
  // the piece is visibly back on its square, so the echo should slide as usual.
  useEffect(() => {
    if (dropped && dropped.historyLength !== gameState.moveHistory.length) setDropped(null);
  }, [dropped, gameState.moveHistory.length]);

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

  const handleTap = (x: number, y: number) => {
    if (!interactiveRef.current || pendingRef.current) return;
    const s = stateRef.current;
    // Position editing takes the tap before any rules apply: the analysis board
    // places and erases pieces in positions that are not legal chess (and often
    // are not even a playable game), so turn order and terminal flags must not
    // gate it.
    if (onSquarePressRef.current) {
      onSquarePressRef.current(squareAt(x, y, flipRef.current, sizeRef.current));
      return;
    }
    if (s.isCheckmate || s.isStalemate || s.isDraw) return;
    // A tap can arrive after a new position rendered but before the effect that
    // reconciles the selection with it has run.
    reconcile();
    const pos = squareAt(x, y, flipRef.current, sizeRef.current);
    const from = selectedRef.current;

    if (from) {
      if (currentDests().includes(pos)) commitMove(from, pos, false);
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
    const pos = squareAt(x, y, flipRef.current, sizeRef.current);
    const piece = s.board[rowOf(pos)][colOf(pos)];
    // Position editing picks up anything, for the same reason a tap there
    // places anything: turn order and a finished position mean nothing to an
    // editor. No selection either — its dots would claim only some squares
    // can take the piece.
    if (onPieceRelocateRef.current) {
      if (!piece) return;
      setHeld({ from: pos, piece });
      active.value = 1;
      return;
    }
    if (s.isCheckmate || s.isStalemate || s.isDraw) return;
    if (!piece || !canGrab(pos)) return;
    // Deliberately silent. Tapping a piece already selects without a sound,
    // so only dragging made noise, and web stays quiet on pickup entirely —
    // the 'select' cue is reserved for queueing a premove (see commitMove).
    setHeld({ from: pos, piece });
    selectSquare(pos);
    active.value = 1;
  };

  const handleDrop = (x: number, y: number) => {
    active.value = 0;
    const h = heldRef.current;
    if (!h) return;
    const relocate = onPieceRelocateRef.current;
    if (relocate) {
      // Let go in the same render the parent moves the piece in: the ghost and
      // the dimmed original vanish together as it appears on `to`. Off the
      // board, or back on its own square, is a change of mind.
      setHeld(null);
      if (!interactiveRef.current || !isOnBoard(x, y, sizeRef.current)) return;
      const to = squareAt(x, y, flipRef.current, sizeRef.current);
      if (to !== h.from) relocate(h.from, to);
      return;
    }
    const s = stateRef.current;
    if (!interactiveRef.current || s.isCheckmate || s.isStalemate || s.isDraw) {
      releaseAll();
      return;
    }
    // Released off the board: the player changed their mind. The piece goes
    // back and stays selected, so a tap can still move it. (Clamping the point
    // to the nearest edge square, as a tap does, would play a move there.)
    if (!isOnBoard(x, y, sizeRef.current)) {
      setHeld(null);
      return;
    }
    // The opponent's reply may have landed while the piece was in the air.
    reconcile();
    if (!heldRef.current) return;
    const to = squareAt(x, y, flipRef.current, sizeRef.current);
    if (to !== h.from && currentDests().includes(to)) {
      commitMove(h.from, to, true);
    } else {
      setHeld(null);
      if (to !== h.from) sfx.play('illegal');
    }
  };

  // The system took the touch, or the board went inert mid-drag: no move.
  const handleDragCancel = () => {
    active.value = 0;
    setHeld(null);
  };

  gestureHandlers.current = {
    onTap: handleTap,
    onDragStart: handleDragStart,
    onDrop: handleDrop,
    onDragCancel: handleDragCancel,
  };

  // A dropped move's piece is already on its square — see `dropped`.
  const droppedTo =
    dropped && dropped.historyLength === gameState.moveHistory.length ? dropped.to : null;

  return (
    <BoardFrame maxPx={520} vhCap={70} accessibilityLabel="Chess board">
      {(size) => {
        sizeRef.current = size;
        const sq = size / 8;
        const marks = markMap(highlightSquares);
        // Written marks are collected here and drawn after the pieces —
        // inside the square they would sit under whatever is standing on it.
        const markLabels: React.ReactNode[] = [];

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

            const bg = dark ? BOARD_COLORS.darkSquare : BOARD_COLORS.lightSquare;
            // One tint over the square, as web's stylesheet does it: the
            // selection outranks the last move it stands on. A queued premove
            // stacks on top of either — the opponent's reply often lands on
            // one of its squares, and the pending intent is what the player
            // needs to see there.
            const tint = isSelected
              ? BOARD_COLORS.selectedSquare
              : isLastMoveSquare
                ? dark ? BOARD_COLORS.lastMoveDark : BOARD_COLORS.lastMoveLight
                : null;

            const showRank = coordsOn && screenCol === 0;
            const showFile = coordsOn && screenRow === 7;
            const labelColor = dark ? BOARD_COLORS.lightSquare : BOARD_COLORS.darkSquare;

            if (marks.get(pos)?.text) {
              markLabels.push(
                <BoardMarkLabel
                  key={`ml-${pos}`}
                  mark={marks.get(pos)!}
                  size={sq}
                  left={screenCol * sq}
                  top={screenRow * sq}
                />,
              );
            }

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
                {tint && <SquareTint size={sq} color={tint} />}
                {isPremoveSquare && <SquareTint size={sq} color={BOARD_COLORS.premove} />}
                {marks.has(pos) && <BoardMark mark={marks.get(pos)!} size={sq} />}

                {showRank && (
                  <Text style={{ position: 'absolute', top: 2, left: 3, fontSize: FONT_SIZES['3xs'], fontFamily: FONTS.bodyBold, color: labelColor, opacity: 0.75 }}>
                    {boardRow + 1}
                  </Text>
                )}
                {showFile && (
                  <Text style={{ position: 'absolute', bottom: 2, right: 3, fontSize: FONT_SIZES['3xs'], fontFamily: FONTS.bodyBold, color: labelColor, opacity: 0.75 }}>
                    {String.fromCharCode(97 + boardCol)}
                  </Text>
                )}
                {/* King in check — a still radial under the king. */}
                {isCheckKing && <CheckMarker id={`check-${pos}`} size={sq} color={BOARD_COLORS.check} />}
                {/* Premove candidates — dimmer than the legal-move dots,
                    because these are squares the move may be aimed at, not
                    moves known to be playable. */}
                {isValidDest && showDests && premoveMode && (
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
                {isValidDest && showDests && !premoveMode && !piece && (
                  <View
                    style={{
                      width: sq * 0.22,
                      height: sq * 0.22,
                      borderRadius: sq * 0.11,
                      backgroundColor: BOARD_COLORS.moveIndicator,
                    }}
                  />
                )}
                {/* Capture target — the square's corners, clear of the piece. */}
                {isValidDest && showDests && !premoveMode && piece && (
                  <CaptureCorners id={`cap-${pos}`} size={sq} color={BOARD_COLORS.moveIndicatorCapture} />
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
                  // The piece is part of the key, not just the square: a capture
                  // must mount a fresh component so the arriving piece can be
                  // seeded at its origin instead of inheriting the captured
                  // piece's already-settled position.
                  key={`p-${pos}-${piece.color}-${piece.type}`}
                  x={x}
                  y={y}
                  sq={sq}
                  type={piece.type}
                  color={piece.color}
                  dimmed={held?.from === pos}
                  // A dropped piece landed where the finger let go: no slide,
                  // and no landing pop either — the lift was its animation.
                  pop={lastMoveTo === pos && droppedTo !== pos}
                  offset={
                    droppedTo === pos
                      ? null
                      : motion.offsets.get(motionKey(boardRow, boardCol)) ?? null
                  }
                  animMs={animMs}
                />,
              );
            }
          }
        }

        // Captured pieces, drawn under the live ones while they fade out.
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
              animMs={animMs}
            />
          );
        });

        return (
          // Whose move it is lives on the player cards, not on the board — the
          // turn glow that used to ring it repeated the card.
          <GestureDetector gesture={gesture}>
            {/* Unclipped on purpose: the lifted piece rides a square above the
                finger, so near the far rank it has to be able to leave the
                board. Same origin as the board, so touch coordinates hold. */}
            <View style={{ width: size, height: size }}>
              <View
                style={{
                  width: size,
                  height: size,
                  borderRadius: RADIUS.xl,
                  overflow: 'hidden',
                  borderWidth: 2,
                  borderColor: COLORS.borderStrong,
                  backgroundColor: BOARD_COLORS.darkSquare,
                }}
              >
                {squares}
                {/* Over the square tints and dots, under the pieces. */}
                <DragTarget
                  sq={sq}
                  size={size}
                  color={BOARD_COLORS.dragTarget}
                  fingerX={fingerX}
                  fingerY={fingerY}
                  active={active}
                />
                {fading}
                {pieces}
                {markLabels}
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
              {held && (
                <DragGhost sq={sq} fingerX={fingerX} fingerY={fingerY} lift={lift}>
                  <ChessPiece
                    type={held.piece.type}
                    color={held.piece.color}
                    size={sq * DRAG_FEEDBACK_SCALE * PIECE_RATIO}
                  />
                </DragGhost>
              )}
            </View>
          </GestureDetector>
        );
      }}
    </BoardFrame>
  );
}

export const ChessBoard = React.memo(ChessBoardInner);
