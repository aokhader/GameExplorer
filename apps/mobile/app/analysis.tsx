import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import {
  ChessEngine,
  fenToState,
  stateToFen,
  type ChessGameState,
  type Color,
  type PieceType,
} from '@gameexplorer/shared';
import { COLORS, ChessPiece, GAME_ACCENTS, useThemeName } from '@gameexplorer/ui';
import { ChessBoard } from '@/board/ChessBoard';
import { EvalBar } from '@/analysis/EvalBar';
import { chessPositionAnalysis } from '@/analysis/adapters';
import { useEngineNative } from '@/engine/useEngineNative';
import { GameScreenLayout } from '@/game/GameScreenLayout';
import { Button, TextField } from '@/components/ui';
import { FONTS } from '@/theme/typography';

// The panels below are plain Views, not ScrollViews: `GameScreenLayout` already
// wraps its whole column in one, and a vertical ScrollView nested in another
// collapses to zero height — which renders the editor invisible, board and all.
const EMPTY_FEN = '8/8/8/8/8/8/8/8 w - - 0 1';
/** Palette order — royalty first, then the rest, mirroring web's row. */
const PALETTE: PieceType[] = ['king', 'queen', 'rook', 'bishop', 'knight', 'pawn'];

type Tool = { kind: 'place'; piece: { type: PieceType; color: Color } } | { kind: 'erase' } | null;

/**
 * The analysis board — set up any position and ask the engine about it.
 *
 * This is the counterpart to web's `/chess/analysis`, and the one place where a
 * phone genuinely needs a different shape: web puts the palette, FEN box and
 * engine lines around the board at once, which does not fit. Here the board
 * keeps the screen and the editor lives in the sidebar slot beneath it, with
 * Edit and Analyse as two states of the same screen rather than two routes.
 *
 * Every hard part already existed: `fenToState`/`stateToFen`, the both-kings
 * guard in `ChessEngine.withStatusFlags`, and the native engine's
 * `getEngineEvaluation` behind the shared `chessPositionAnalysis` adapter.
 */
export default function AnalysisScreen() {
  // Repaint when the theme changes; the tokens below are live views.
  useThemeName();

  const [mode, setMode] = useState<'edit' | 'analyze'>('edit');
  const [state, setState] = useState<ChessGameState>(() => ChessEngine.newGame());
  const [tool, setTool] = useState<Tool>(null);
  const [fenInput, setFenInput] = useState(() => stateToFen(ChessEngine.newGame()));
  const [fenError, setFenError] = useState<string | null>(null);
  const [flipped, setFlipped] = useState(false);

  const engine = useEngineNative({ enabled: mode === 'analyze' });

  // ── Evaluation ──────────────────────────────────────────────────────────────
  // One position at a time, unlike review's timeline, so this owns its own small
  // request loop instead of `useGameAnalysis`.
  const [evaluation, setEvaluation] = useState<Awaited<
    ReturnType<typeof chessPositionAnalysis.evaluate>
  > | null>(null);
  const [busy, setBusy] = useState(false);
  const [engineError, setEngineError] = useState<string | null>(null);
  // Bumped per request so a stale answer can never overwrite a newer one.
  const runIdRef = useRef(0);

  // The position to score, as a FEN. Keyed on the string rather than the state
  // object because editing produces a new object on every render.
  const fen = useMemo(() => stateToFen(state), [state]);

  /**
   * Score the position whenever there is one to score and the engine can answer.
   *
   * Driven by an effect rather than by the button, because the native engine
   * finishes its UCI handshake *after* the screen mounts: firing on press alone
   * meant the first request was rejected with "Engine not ready" and nothing
   * ever retried, so the bar sat at 50% forever.
   */
  useEffect(() => {
    if (mode !== 'analyze' || !engine.isReady) return;
    const runId = ++runIdRef.current;
    let cancelled = false;

    void (async () => {
      // Leave the synchronous effect body before touching state — a setState
      // here is the cascading-render pattern the lint rule guards against.
      await Promise.resolve();
      if (cancelled) return;
      setBusy(true);
      setEngineError(null);
      try {
        const result = await chessPositionAnalysis.evaluate(state, chessPositionAnalysis.liveBudgetMs);
        if (cancelled || runId !== runIdRef.current) return;
        setEvaluation(result);
      } catch (err) {
        if (cancelled || runId !== runIdRef.current) return;
        if ((err as Error)?.name === 'AbortError') return;
        setEngineError((err as Error)?.message ?? 'Analysis failed');
      } finally {
        if (!cancelled && runId === runIdRef.current) setBusy(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // `state` is intentionally tracked through `fen`: the object identity changes
    // on every edit, but only a different position is worth a new search.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, engine.isReady, fen]);

  // ── Editing ─────────────────────────────────────────────────────────────────

  const applyState = useCallback((next: ChessGameState) => {
    setState(next);
    setFenInput(stateToFen(next));
    setFenError(null);
  }, []);

  const handleSquarePress = useCallback(
    (pos: string) => {
      if (!tool) return;
      const col = pos.charCodeAt(0) - 97;
      const row = parseInt(pos[1], 10) - 1;

      setState((prev) => {
        const board = prev.board.map((r) => [...r]);
        const existing = board[row][col];
        if (tool.kind === 'erase') {
          board[row][col] = null;
        } else if (
          existing?.type === tool.piece.type &&
          existing?.color === tool.piece.color
        ) {
          // Tapping the same piece again takes it off — otherwise clearing a
          // square you just filled would mean switching to the eraser.
          board[row][col] = null;
        } else {
          board[row][col] = { ...tool.piece };
        }
        const next = { ...prev, board };
        setFenInput(stateToFen(next));
        return next;
      });
    },
    [tool],
  );

  const handleFenInput = (raw: string) => {
    setFenInput(raw);
    try {
      setState(fenToState(raw));
      setFenError(null);
    } catch {
      setFenError('Not a valid FEN');
    }
  };

  const setSideToMove = (color: Color) => {
    // Re-derive through FEN so the status flags follow the side to move: the
    // same position is check for one player and nothing for the other.
    const swapped = stateToFen({ ...state, currentTurn: color });
    try {
      applyState(fenToState(swapped));
    } catch {
      applyState({ ...state, currentTurn: color });
    }
  };

  const startAnalysis = () => {
    // The evaluation effect picks this up — including the case where the engine
    // is still handshaking, which is the common one on the first analysis.
    setMode('analyze');
  };

  const backToEdit = () => {
    runIdRef.current++;
    setMode('edit');
    setEvaluation(null);
    setEngineError(null);
    setBusy(false);
  };

  // ── Derived ─────────────────────────────────────────────────────────────────

  const kingCount = useMemo(() => {
    let white = 0;
    let black = 0;
    for (const row of state.board) {
      for (const piece of row) {
        if (piece?.type === 'king') {
          if (piece.color === 'white') white++;
          else black++;
        }
      }
    }
    return { white, black };
  }, [state]);

  /**
   * A position without both kings is not legal chess, so the engine has nothing
   * meaningful to say and the terminal flags are deliberately all false (the
   * both-kings guard in `withStatusFlags`). Say so rather than showing 0.00.
   */
  const positionUsable = kingCount.white === 1 && kingCount.black === 1;

  const accent = GAME_ACCENTS.chess.base;
  const share = evaluation ? chessPositionAnalysis.whiteShare(evaluation) : 0.5;
  const label = evaluation ? chessPositionAnalysis.formatScore(evaluation) : '';

  return (
    <GameScreenLayout
      accent="chess"
      backHref="/"
      title="Analysis"
      headerActions={
        <Pressable
          onPress={() => setFlipped((f) => !f)}
          accessibilityRole="button"
          accessibilityLabel="Flip board"
          hitSlop={8}
          style={{
            paddingHorizontal: 12,
            paddingVertical: 6,
            borderRadius: 10,
            borderWidth: 1,
            borderColor: COLORS.border,
            backgroundColor: COLORS.surfaceMuted,
          }}
        >
          <Text style={{ color: COLORS.fg, fontFamily: FONTS.bodySemi, fontSize: 13 }}>Flip</Text>
        </Pressable>
      }
      topCard={
        mode === 'analyze' ? (
          // "Busy" covers the handshake too: on the first analysis of a session
          // the engine is still loading, and an idle-looking bar would read as a
          // finished search that came back level.
          <EvalBar share={share} label={label} busy={busy || !engine.isReady} />
        ) : undefined
      }
      board={
        <ChessBoard
          gameState={state}
          onMove={(from, to, promotion) => {
            // Analyse mode plays moves out on the board so a line can be walked.
            const result = ChessEngine.validateMove(state, from, to, false, promotion);
            if (result.valid && result.resultingState) {
              applyState(result.resultingState);
            }
          }}
          playerColor={flipped ? 'black' : 'white'}
          // Edit mode routes taps to the palette; analyse mode plays real moves.
          onSquarePress={mode === 'edit' ? handleSquarePress : undefined}
          hintMove={mode === 'analyze' ? evaluation?.bestMove ?? null : null}
          interactive
        />
      }
      sidebar={
        mode === 'edit' ? (
          <EditPanel
            tool={tool}
            setTool={setTool}
            fenInput={fenInput}
            fenError={fenError}
            onFenInput={handleFenInput}
            sideToMove={state.currentTurn}
            setSideToMove={setSideToMove}
            onReset={() => {
              applyState(ChessEngine.newGame());
              setTool(null);
            }}
            onClear={() => {
              applyState(fenToState(EMPTY_FEN));
              setTool(null);
            }}
            onAnalyze={startAnalysis}
            positionUsable={positionUsable}
            kingCount={kingCount}
          />
        ) : (
          <AnalyzePanel
            accent={accent}
            evaluation={evaluation}
            busy={busy}
            error={
              !engine.isAvailable
                ? 'Analysis needs the chess engine, which this build does not include.'
                : engineError
            }
            fen={fenInput}
            onEdit={backToEdit}
          />
        )
      }
    />
  );
}

// ── Edit ──────────────────────────────────────────────────────────────────────

function EditPanel({
  tool,
  setTool,
  fenInput,
  fenError,
  onFenInput,
  sideToMove,
  setSideToMove,
  onReset,
  onClear,
  onAnalyze,
  positionUsable,
  kingCount,
}: {
  tool: Tool;
  setTool: (t: Tool) => void;
  fenInput: string;
  fenError: string | null;
  onFenInput: (raw: string) => void;
  sideToMove: Color;
  setSideToMove: (c: Color) => void;
  onReset: () => void;
  onClear: () => void;
  onAnalyze: () => void;
  positionUsable: boolean;
  kingCount: { white: number; black: number };
}) {
  useThemeName();

  return (
    <View style={{ gap: 12 }}>
      <Section title="PIECES">
        {(['white', 'black'] as const).map((color) => (
          <View key={color} style={{ flexDirection: 'row', gap: 6, marginTop: 6 }}>
            {PALETTE.map((type) => {
              const active =
                tool?.kind === 'place' && tool.piece.type === type && tool.piece.color === color;
              return (
                <Pressable
                  key={`${color}-${type}`}
                  onPress={() => setTool(active ? null : { kind: 'place', piece: { type, color } })}
                  accessibilityRole="button"
                  accessibilityLabel={`${color} ${type}`}
                  accessibilityState={{ selected: active }}
                  style={{
                    flex: 1,
                    aspectRatio: 1,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: 8,
                    borderWidth: 1,
                    borderColor: active ? COLORS.accent : COLORS.border,
                    backgroundColor: active ? COLORS.accentMuted : COLORS.surfaceMuted,
                  }}
                >
                  <ChessPiece type={type} color={color} size={26} />
                </Pressable>
              );
            })}
          </View>
        ))}
        <Pressable
          onPress={() => setTool(tool?.kind === 'erase' ? null : { kind: 'erase' })}
          accessibilityRole="button"
          accessibilityLabel="Eraser"
          accessibilityState={{ selected: tool?.kind === 'erase' }}
          style={{
            marginTop: 8,
            paddingVertical: 8,
            alignItems: 'center',
            borderRadius: 8,
            borderWidth: 1,
            borderColor: tool?.kind === 'erase' ? COLORS.accent : COLORS.border,
            backgroundColor: tool?.kind === 'erase' ? COLORS.accentMuted : COLORS.surfaceMuted,
          }}
        >
          <Text style={{ color: COLORS.fg, fontFamily: FONTS.bodySemi, fontSize: 13 }}>
            Eraser
          </Text>
        </Pressable>
        <Text
          style={{
            color: COLORS.fgMuted,
            fontFamily: FONTS.body,
            fontSize: 12,
            marginTop: 6,
            lineHeight: 17,
          }}
        >
          {tool
            ? 'Tap a square to place or remove.'
            : 'Pick a piece or the eraser, then tap the board.'}
        </Text>
      </Section>

      <Section title="SIDE TO MOVE">
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
          {(['white', 'black'] as const).map((color) => (
            <Pressable
              key={color}
              onPress={() => setSideToMove(color)}
              accessibilityRole="button"
              accessibilityState={{ selected: sideToMove === color }}
              style={{
                flex: 1,
                paddingVertical: 8,
                alignItems: 'center',
                borderRadius: 8,
                borderWidth: 1,
                borderColor: sideToMove === color ? COLORS.accent : COLORS.border,
                backgroundColor: sideToMove === color ? COLORS.accentMuted : COLORS.surfaceMuted,
              }}
            >
              <Text
                style={{ color: COLORS.fg, fontFamily: FONTS.bodySemi, fontSize: 13, textTransform: 'capitalize' }}
              >
                {color}
              </Text>
            </Pressable>
          ))}
        </View>
      </Section>

      <Section title="FEN">
        <TextField
          value={fenInput}
          onChangeText={onFenInput}
          autoCapitalize="none"
          autoCorrect={false}
          accessibilityLabel="FEN"
        />
        {fenError && (
          <Text
            accessibilityLiveRegion="polite"
            style={{ color: COLORS.dangerHover, fontFamily: FONTS.body, fontSize: 12, marginTop: 4 }}
          >
            {fenError}
          </Text>
        )}
      </Section>

      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={{ flex: 1 }}>
          <Button label="Start position" variant="secondary" onPress={onReset} />
        </View>
        <View style={{ flex: 1 }}>
          <Button label="Clear" variant="secondary" onPress={onClear} />
        </View>
      </View>

      {!positionUsable && (
        <Text style={{ color: COLORS.warningHover, fontFamily: FONTS.body, fontSize: 12, lineHeight: 17 }}>
          {kingCount.white === 0 || kingCount.black === 0
            ? 'Both sides need a king before this is a chess position.'
            : 'Each side may have only one king.'}
        </Text>
      )}
      <Button label="Analyse position" onPress={onAnalyze} disabled={!positionUsable} />
    </View>
  );
}

// ── Analyse ───────────────────────────────────────────────────────────────────

function AnalyzePanel({
  accent,
  evaluation,
  busy,
  error,
  fen,
  onEdit,
}: {
  accent: string;
  evaluation: { score: number; mate: number | null; bestMove: { from: string; to: string } | null; terminal: boolean } | null;
  busy: boolean;
  error: string | null;
  fen: string;
  onEdit: () => void;
}) {
  useThemeName();

  return (
    <View style={{ gap: 12 }}>
      <Section title="ENGINE">
        {evaluation?.bestMove ? (
          <Text style={{ color: COLORS.fgMuted, fontFamily: FONTS.body, fontSize: 13, marginTop: 4 }}>
            Best move{' '}
            <Text style={{ color: accent, fontFamily: FONTS.bodyBold }}>
              {evaluation.bestMove.from}→{evaluation.bestMove.to}
            </Text>
          </Text>
        ) : (
          <Text style={{ color: COLORS.fgMuted, fontFamily: FONTS.body, fontSize: 13, marginTop: 4 }}>
            {busy
              ? 'Thinking…'
              : evaluation?.terminal
                ? 'The game is already decided here.'
                : 'No move to suggest.'}
          </Text>
        )}
        <Text style={{ color: COLORS.fgSubtle, fontFamily: FONTS.body, fontSize: 12, marginTop: 8, lineHeight: 17 }}>
          Play moves on the board to walk a line; each one is scored as you go.
        </Text>
        {error && (
          <Text
            accessibilityLiveRegion="polite"
            style={{ color: COLORS.dangerHover, fontFamily: FONTS.body, fontSize: 12, marginTop: 8 }}
          >
            {error}
          </Text>
        )}
      </Section>

      <Section title="POSITION">
        <Text
          selectable
          style={{ color: COLORS.fgMuted, fontFamily: FONTS.body, fontSize: 11, marginTop: 4, lineHeight: 16 }}
        >
          {fen}
        </Text>
      </Section>

      <Button label="Edit position" variant="secondary" onPress={onEdit} />
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  useThemeName();
  return (
    <View
      style={{
        borderRadius: 12,
        borderWidth: 1,
        borderColor: COLORS.border,
        backgroundColor: COLORS.surfaceAlt,
        padding: 12,
      }}
    >
      <Text
        style={{ color: COLORS.fgMuted, fontSize: 12, fontFamily: FONTS.displaySemi, letterSpacing: 0.8 }}
      >
        {title}
      </Text>
      {children}
    </View>
  );
}
