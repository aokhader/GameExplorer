import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { COLORS, GAME_ACCENTS, useThemeName } from '@finesse/ui';
import { Button } from '@/components/ui';
import { GameScreenLayout, type GameAccent } from '@/game/GameScreenLayout';
import { MoveBand } from '@/game/MoveBand';
import { EvalBar } from './EvalBar';
import { GRADE_META, SUMMARY_ORDER } from './grades';
import type { GradedMove, ScanProgress } from './useGameAnalysis';
import type { AnalysisAdapter, MoveGrade, PositionEval } from './types';
import type { Color } from '@/engine/useLocalGame';
import { FONTS } from '@/theme/typography';

export interface ReviewScreenProps<S> {
  accent: GameAccent;
  title: string;
  adapter: AnalysisAdapter<S>;
  /** Moves in the game's own notation, aligned with `grades`. */
  moves: string[];
  /** Board for the position on screen — supplied by the game screen. */
  board: ReactNode;
  viewIndex: number;
  onSeek: (index: number) => void;
  /** Number of positions (`moves.length + 1`). */
  total: number;
  /** Which side the player was; the summary leads with their mistakes. */
  playerColor: Color;
  /** Pass-and-play has no "you", so the summary shows both sides equally. */
  showBothSides?: boolean;
  evaluation: PositionEval | null;
  grades: (GradedMove | null)[];
  summary: Record<Color, Record<MoveGrade, number>>;
  scanning: boolean;
  progress: ScanProgress;
  complete: boolean;
  liveBusy: boolean;
  error: string | null;
  onScan: () => void;
  onStopScan: () => void;
  /** Leave review and go back to the game. */
  onExit: () => void;
}

/**
 * Game review — the native counterpart to web's analysis board, reshaped for a
 * phone and for the case that actually matters here: the game you just finished.
 *
 * Web's version is a position editor (piece palette, FEN box, castling
 * checkboxes) that happens to run an engine. None of that fits a phone, and none
 * of it is what a player wants ten seconds after losing. This is a review: step
 * the game, see the eval move, and find the moves that cost you.
 */
export function ReviewScreen<S>({
  accent,
  title,
  adapter,
  moves,
  board,
  viewIndex,
  onSeek,
  total,
  playerColor,
  showBothSides = false,
  evaluation,
  grades,
  summary,
  scanning,
  progress,
  complete,
  liveBusy,
  error,
  onScan,
  onStopScan,
  onExit,
}: ReviewScreenProps<S>) {
  // Repaint when the theme changes; the tokens below are live views.
  useThemeName();

  const accentColor = GAME_ACCENTS[accent].base;
  // `viewIndex` is a position; the move that produced it is one lower.
  const currentGrade = viewIndex > 0 ? grades[viewIndex - 1] : null;
  const gradeList = grades.map((g) => g?.grade ?? null);

  const share = evaluation ? adapter.whiteShare(evaluation) : 0.5;
  const label = evaluation ? adapter.formatScore(evaluation) : '';

  return (
    <GameScreenLayout
      accent={accent}
      backHref="/"
      title={title}
      headerActions={
        <Pressable
          onPress={onExit}
          accessibilityRole="button"
          accessibilityLabel="Close review"
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
          <Text style={{ color: COLORS.fg, fontFamily: FONTS.bodySemi, fontSize: 13 }}>Done</Text>
        </Pressable>
      }
      topCard={<EvalBar share={share} label={label} busy={liveBusy} />}
      board={board}
      sidebar={
        <>
          {/* What the engine thinks of the position on screen. */}
          <View
            style={{
              borderRadius: 12,
              borderWidth: 1,
              borderColor: COLORS.border,
              backgroundColor: COLORS.surfaceAlt,
              padding: 12,
              gap: 4,
            }}
          >
            <Text style={{ color: COLORS.fgMuted, fontSize: 12, fontFamily: FONTS.displaySemi, letterSpacing: 0.8 }}>
              {viewIndex === 0 ? 'STARTING POSITION' : `AFTER MOVE ${viewIndex}`}
            </Text>
            {currentGrade ? (
              <MoveVerdict grade={currentGrade} />
            ) : (
              <Text style={{ color: COLORS.fgMuted, fontFamily: FONTS.body, fontSize: 13, lineHeight: 19 }}>
                {viewIndex === 0
                  ? 'Step forward to walk through the game.'
                  : scanning
                    ? 'Scoring this move…'
                    : 'Run the review to grade every move.'}
              </Text>
            )}
            {evaluation?.bestMove && (
              <Text style={{ color: COLORS.fgMuted, fontFamily: FONTS.body, fontSize: 13 }}>
                Engine plays{' '}
                <Text style={{ color: COLORS.fg, fontFamily: FONTS.bodyBold }}>
                  {formatMove(evaluation.bestMove)}
                </Text>
              </Text>
            )}
          </View>

          <MoveBand moves={moves} viewIndex={viewIndex} onSeek={onSeek} accent={accent} grades={gradeList} />

          {/* Scan control + per-side tallies. */}
          <View
            style={{
              borderRadius: 12,
              borderWidth: 1,
              borderColor: COLORS.border,
              backgroundColor: COLORS.surfaceAlt,
              padding: 12,
              gap: 10,
            }}
          >
            {scanning ? (
              <>
                <ScanProgressBar progress={progress} accentColor={accentColor} />
                <Button label="Stop" variant="secondary" onPress={onStopScan} />
              </>
            ) : complete ? (
              <>
                {showBothSides ? (
                  <>
                    <SummaryRow heading="White" counts={summary.white} />
                    <SummaryRow heading="Black" counts={summary.black} />
                  </>
                ) : (
                  <>
                    <SummaryRow heading="You" counts={summary[playerColor]} />
                    <SummaryRow
                      heading="Bot"
                      counts={summary[playerColor === 'white' ? 'black' : 'white']}
                    />
                  </>
                )}
              </>
            ) : (
              <>
                <Text style={{ color: COLORS.fgMuted, fontFamily: FONTS.body, fontSize: 13, lineHeight: 19 }}>
                  Score every move to find your blunders, mistakes, and best finds.
                </Text>
                <Button label="Review every move" onPress={onScan} />
              </>
            )}

            {error && (
              <Text
                accessibilityLiveRegion="polite"
                style={{ color: COLORS.dangerHover, fontFamily: FONTS.body, fontSize: 12 }}
              >
                {error}
              </Text>
            )}
          </View>
        </>
      }
      bottomBar={<ReviewBar viewIndex={viewIndex} total={total} onSeek={onSeek} />}
    />
  );
}

/** "e2→e4", or just the square for a placement game where from === to. */
function formatMove(move: { from: string; to: string }): string {
  return move.from === move.to ? move.to : `${move.from}→${move.to}`;
}

function MoveVerdict({ grade }: { grade: GradedMove }) {
  // Repaint when the theme changes; the tokens below are live views.
  useThemeName();

  const meta = GRADE_META[grade.grade];
  return (
    <View style={{ gap: 2 }}>
      <Text style={{ color: meta.color(), fontFamily: FONTS.displaySemi, fontSize: 16 }}>
        {meta.glyph ? `${meta.glyph} ` : ''}
        {meta.label}
      </Text>
      {grade.better && (
        <Text style={{ color: COLORS.fgMuted, fontFamily: FONTS.body, fontSize: 13 }}>
          Better was{' '}
          <Text style={{ color: COLORS.fg, fontFamily: FONTS.bodyBold }}>
            {formatMove(grade.better)}
          </Text>
        </Text>
      )}
    </View>
  );
}

function ScanProgressBar({ progress, accentColor }: { progress: ScanProgress; accentColor: string }) {
  // Repaint when the theme changes; the tokens below are live views.
  useThemeName();

  const pct = progress.total > 0 ? progress.done / progress.total : 0;
  return (
    <View style={{ gap: 6 }}>
      <Text
        accessibilityLiveRegion="polite"
        style={{ color: COLORS.fgMuted, fontFamily: FONTS.body, fontSize: 13 }}
      >
        Reviewing… {progress.done} of {progress.total} positions
      </Text>
      <View style={{ height: 6, borderRadius: 3, overflow: 'hidden', backgroundColor: COLORS.surfaceMuted }}>
        <View style={{ height: '100%', width: `${pct * 100}%`, backgroundColor: accentColor }} />
      </View>
    </View>
  );
}

function SummaryRow({ heading, counts }: { heading: string; counts: Record<MoveGrade, number> }) {
  // Repaint when the theme changes; the tokens below are live views.
  useThemeName();

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
      <Text style={{ color: COLORS.fg, fontFamily: FONTS.displaySemi, fontSize: 14, width: 52 }}>
        {heading}
      </Text>
      {SUMMARY_ORDER.map((grade) => {
        const meta = GRADE_META[grade];
        return (
          <View key={grade} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Text
              accessibilityLabel={`${counts[grade]} ${meta.label}`}
              style={{ color: meta.color(), fontFamily: FONTS.bodyBold, fontSize: 14 }}
            >
              {counts[grade]}
            </Text>
            <Text style={{ color: COLORS.fgMuted, fontFamily: FONTS.body, fontSize: 12 }}>
              {meta.label.toLowerCase()}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

/**
 * Review's bottom bar — stepping only. The play bar's resign flag, hint, and
 * game menu have nothing to do here, and a shorter bar means bigger targets.
 */
function ReviewBar({
  viewIndex,
  total,
  onSeek,
}: {
  viewIndex: number;
  total: number;
  onSeek: (index: number) => void;
}) {
  // Repaint when the theme changes; the tokens below are live views.
  useThemeName();

  const last = total - 1;
  const seek = (index: number) => onSeek(Math.max(0, Math.min(last, index)));

  const buttons: { glyph: string; label: string; to: number; disabled: boolean }[] = [
    { glyph: '⇤', label: 'First move', to: 0, disabled: viewIndex <= 0 },
    { glyph: '◀', label: 'Previous move', to: viewIndex - 1, disabled: viewIndex <= 0 },
    { glyph: '▶', label: 'Next move', to: viewIndex + 1, disabled: viewIndex >= last },
    { glyph: '⇥', label: 'Last move', to: last, disabled: viewIndex >= last },
  ];

  return (
    <View
      style={{
        flexDirection: 'row',
        gap: 6,
        paddingHorizontal: 8,
        paddingVertical: 8,
        borderTopWidth: 1,
        borderTopColor: COLORS.border,
        backgroundColor: COLORS.surfaceAlt,
      }}
    >
      {buttons.map((b) => (
        <Pressable
          key={b.label}
          onPress={() => seek(b.to)}
          disabled={b.disabled}
          accessibilityRole="button"
          accessibilityLabel={b.label}
          accessibilityState={{ disabled: b.disabled }}
          style={{ flex: 1 }}
        >
          {({ pressed }) => (
            <View
              style={{
                minHeight: 46,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: COLORS.border,
                backgroundColor: pressed ? COLORS.surfaceHover : COLORS.surfaceMuted,
                alignItems: 'center',
                justifyContent: 'center',
                opacity: b.disabled ? 0.35 : 1,
              }}
            >
              <Text style={{ color: COLORS.fg, fontSize: 16 }}>{b.glyph}</Text>
            </View>
          )}
        </Pressable>
      ))}
    </View>
  );
}
