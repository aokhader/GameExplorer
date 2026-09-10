import { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
// Deep import, not the package barrel. The barrel re-exports `useSocket`, which
// pulls in `@gameexplorer/db` — and that module builds a Supabase client at
// import time from env that a puzzle never needs. Reaching straight for the hook
// keeps supabase and socket.io out of this screen's graph entirely, which is
// also what lets it be tested without standing up either.
import { usePuzzle } from '@gameexplorer/client/hooks/usePuzzle';
import { mobilePuzzleProgressStore } from '@/lib/puzzleProgress';
import {
  createFetchPuzzleSource,
  createLayeredPuzzleSource,
  defaultBandFor,
  staticPuzzleSource,
} from '@gameexplorer/shared';
import { puzzleCorpusUrl } from '@/config/corpus';
import { mobilePuzzleChunkCache } from '@/lib/puzzleChunkCache';
import type { PuzzleGame, PuzzlePhase } from '@gameexplorer/shared';
import { COLORS, GAME_ACCENTS, useThemeName } from '@gameexplorer/ui';
import { Screen, BackHeader, Button } from '@/components/ui';
import { GameScreenLayout } from '@/game/GameScreenLayout';
import { StatusBanner } from '@/game/StatusBanner';
import { PuzzleBoard } from '@/puzzles/PuzzleBoard';
import { PuzzleBar } from '@/puzzles/PuzzleBar';
import { PuzzleBandPicker } from '@/puzzles/PuzzleBandPicker';
import { usePuzzleFeedback } from '@/puzzles/usePuzzleFeedback';
import { Confetti } from '@/game/Confetti';
import { BackToHomeButton } from '@/game/resultDismiss';
import { useSettings } from '@/providers/SettingsProvider';
import { FONTS } from '@/theme/typography';

const GAME_LABEL: Record<PuzzleGame, string> = {
  chess: 'Chess',
  checkers: 'Checkers',
  reversi: 'Reversi',
  go: 'Go',
};

/**
 * Headline + supporting line for each phase of the run — same copy as web,
 * including the refutation and alternate-move sentences, which come from the
 * shared runtime so the two platforms cannot describe the same move
 * differently.
 */
function statusFor(
  phase: PuzzlePhase | null,
  refutationText: string | null,
  alternateText: string | null,
): { title: string; description: string } {
  switch (phase) {
    case 'replying':
      return { title: 'Correct', description: alternateText ?? 'Watch the reply…' };
    case 'wrong':
      return {
        title: 'Not quite',
        description: refutationText ?? 'Looking at what your opponent does about that…',
      };
    case 'solved':
      return {
        title: 'Solved',
        description: alternateText ?? 'Read why below, then take the next one.',
      };
    default:
      return { title: 'Your move', description: 'Find the move the position is asking for.' };
  }
}

export interface PuzzleScreenProps {
  game: PuzzleGame;
}

/**
 * One puzzle at a time — the native twin of web's `PuzzleScreen`.
 *
 * Everything that decides anything (is this the move, is the line over, does
 * this solve extend the streak) is in the shared reducer, and the sequencing is
 * in `usePuzzle`, so this file is layout: it picks a board, names the phase, and
 * pins three buttons under it. Progress is device-local and works signed out.
 */
/**
 * The full corpus, with the bundled core behind it.
 *
 * Module scope so the in-flight map survives a remount — reopening the screen
 * must not refetch the index. Pages are cached to AsyncStorage, so a band the
 * player has worked through once keeps working with no signal; the layered
 * source falls back to the bundled ~100-per-band set when neither the network
 * nor the cache can answer.
 */
const puzzleSource = createLayeredPuzzleSource(
  createFetchPuzzleSource(puzzleCorpusUrl(), fetch, mobilePuzzleChunkCache),
  staticPuzzleSource,
);

export function PuzzleScreen({ game }: PuzzleScreenProps) {
  // Repaint when the theme changes; the tokens below are live views.
  useThemeName();

  // The player's own rating, which decides the band the picker opens on.
  //
  // Loaded through a **dynamic** import so nothing db-shaped is pulled at module
  // load: `@gameexplorer/db` builds a Supabase client the moment it is imported,
  // and this screen deep-imports `usePuzzle` precisely to keep that out of its
  // graph. `null` while unknown — a guest never leaves that state and gets the
  // middle band, matching web.
  const [rating, setRating] = useState<number | null>(null);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { getCurrentUser, getUserRating } = await import('@gameexplorer/db');
        const user = await getCurrentUser();
        if (!user || cancelled) return;
        const row = await getUserRating(user.id, game);
        if (!cancelled) setRating(row?.rating ?? null);
      } catch {
        // Signed out, offline, or no Supabase config — the picker simply opens
        // on the middle band. A rating is a nicety here, never a requirement.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [game]);

  const {
    puzzle,
    run,
    phase,
    loading,
    swapping,
    error,
    exhausted,
    progress,
    solved,
    total,
    band,
    bandCounts,
    bandSolved,
    setBand,
    hint,
    board,
    viewIndex,
    timelineLength,
    atLive,
    refutation,
    refutationText,
    alternateText,
    playMove,
    seek,
    retry,
    next,
    showHint,
    startOver,
  } = usePuzzle<unknown>({
    game,
    source: puzzleSource,
    progress: mobilePuzzleProgressStore,
    // Resolved on the platform, not in the hook — the rating lives behind the
    // Supabase client this screen keeps out of its graph.
    defaultBand: rating === null ? undefined : defaultBandFor(game, rating).id,
  });

  usePuzzleFeedback({ phase, attempts: run?.attempts ?? 0, puzzleId: puzzle?.id ?? null });
  const { reducedMotion } = useSettings();

  // Only when there is nothing to show. A Next press keeps the old board up —
  // see `swapping`, which makes it inert instead of replacing it.
  if (loading) {
    return (
      <Screen scroll={false}>
        <BackHeader title="Puzzles" fallbackHref="/" />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={GAME_ACCENTS[game].base} />
        </View>
      </Screen>
    );
  }

  if (error || (!puzzle && !exhausted)) {
    return (
      <EmptyState
        title="Could not load a puzzle"
        body={error ?? 'Something went wrong reading the puzzle set.'}
      />
    );
  }

  if (exhausted || !puzzle || !run) {
    // Exhaustion is per band, so the way out is usually another band — offering
    // only "Start over" would throw away a solved set to escape a finished one.
    const empty = total === 0;
    return (
      <EmptyState
        title={
          empty
            ? `No ${band.label} ${GAME_LABEL[game]} puzzles yet`
            : `You've solved every ${band.label} ${GAME_LABEL[game]} puzzle`
        }
        body={
          empty
            ? `The ${GAME_LABEL[game]} set doesn't reach this strength yet. Pick another band below.`
            : `That's all ${total} at ${band.label}. Try another band, or start this one again.`
        }
        action={
          <View style={{ width: '100%', gap: 12 }}>
            <PuzzleBandPicker
              game={game}
              band={band}
              counts={bandCounts}
              solved={bandSolved}
              onSelect={setBand}
              rating={rating}
            />
            {!empty && <Button label="Start over" onPress={startOver} glow />}
          </View>
        }
      />
    );
  }

  const status = statusFor(phase, refutationText, alternateText);
  const accent = GAME_ACCENTS[game];

  return (
    <>
    <GameScreenLayout
      accent={game}
      backHref="/"
      title="Puzzles"
      headerActions={
        <Text testID="puzzle-progress" style={{ color: COLORS.fgMuted, fontSize: 13 }}>
          {solved} / {total}
          {progress.streak > 0 ? ` · streak ${progress.streak}` : ''}
        </Text>
      }
      // Web deliberately keeps the prompt out of this slot, because its shell
      // budgets a fixed 58px for it and clips whatever overflows. The native
      // shell is a plain ScrollView with no height budget, so a prompt that
      // wraps to three lines just makes the column taller — and above the board
      // is where the task belongs, since it is what you read before you move.
      topCard={
        <View
          style={{
            borderRadius: 12,
            borderWidth: 1,
            borderColor: COLORS.border,
            backgroundColor: COLORS.surfaceAlt,
            padding: 12,
            gap: 8,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text
              style={{
                color: accent.base,
                borderColor: accent.tintBorder,
                backgroundColor: accent.tintBg,
                borderWidth: 1,
                borderRadius: 999,
                paddingHorizontal: 8,
                paddingVertical: 2,
                fontSize: 11,
                fontFamily: FONTS.bodyBold,
                textTransform: 'capitalize',
              }}
            >
              {puzzle.difficulty}
            </Text>
            <Text style={{ color: COLORS.fgMuted, fontSize: 12, textTransform: 'capitalize' }}>
              You play {puzzle.playerColor}
            </Text>
          </View>
          <Text
            testID="puzzle-prompt"
            style={{ color: COLORS.fg, fontFamily: FONTS.displaySemi, fontSize: 15 }}
          >
            {puzzle.prompt}
          </Text>
        </View>
      }
      board={
        <PuzzleBoard
          game={game}
          // `board`, not `run.state`: after a wrong move the board runs on past
          // the line to play out the refutation, and the nav controls can walk
          // it back through the history, while `run.state` stays on the position
          // the player still has to solve.
          state={board}
          playerColor={puzzle.playerColor}
          interactive={phase === 'playing' && atLive && !swapping}
          onMove={playMove}
          hint={hint}
          refutation={refutation?.reply ?? null}
        />
      }
      sidebar={
        <>
          <StatusBanner accent={game} title={status.title} description={status.description} />

          <PuzzleBandPicker
            game={game}
            band={band}
            counts={bandCounts}
            solved={bandSolved}
            onSelect={setBand}
            rating={rating}
          />

          {/* The hint is a visual ring on the board; spelling the move out here
              is what makes it reachable without sight — same reasoning as the
              training screens' Hints cell. */}
          {hint && (
            <Text style={{ color: COLORS.warningHover, fontSize: 13 }}>
              Play {hint.from === hint.to ? hint.to : `${hint.from} → ${hint.to}`}
            </Text>
          )}

          {phase === 'solved' && (
            <View
              style={{
                borderRadius: 12,
                borderWidth: 1,
                borderColor: COLORS.border,
                backgroundColor: COLORS.surfaceAlt,
                padding: 12,
                gap: 6,
              }}
            >
              <Text
                style={{
                  color: COLORS.fgMuted,
                  fontSize: 11,
                  fontFamily: FONTS.bodyBold,
                  letterSpacing: 0.6,
                }}
              >
                WHY IT WORKS
              </Text>
              <Text
                testID="puzzle-explanation"
                style={{ color: COLORS.fgMuted, fontSize: 14, lineHeight: 21 }}
              >
                {puzzle.explanation}
              </Text>
              {puzzle.source && (
                <Text style={{ color: COLORS.fgSubtle, fontSize: 11, fontStyle: 'italic' }}>
                  {puzzle.source}
                </Text>
              )}
            </View>
          )}

          {puzzle.themes.length > 0 && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {puzzle.themes.map((theme) => (
                <Text
                  key={theme}
                  style={{
                    color: COLORS.fgMuted,
                    fontSize: 11,
                    borderWidth: 1,
                    borderColor: COLORS.border,
                    borderRadius: 999,
                    paddingHorizontal: 8,
                    paddingVertical: 2,
                  }}
                >
                  {theme.replace(/-/g, ' ')}
                </Text>
              ))}
            </View>
          )}
        </>
      }
      bottomBar={
        <PuzzleBar
          accent={game}
          viewIndex={viewIndex}
          total={timelineLength}
          onSeek={seek}
          canHint={phase === 'playing' && atLive}
          wrong={phase === 'wrong'}
          solved={phase === 'solved'}
          onHint={showHint}
          onRetry={retry}
          onNext={next}
        />
      }
    />

      {/* Solving is the whole point of the screen, so it gets the same burst a
          won game does. Driven off `phase` rather than an event, matching
          `GameResultScreen` — 'solved' persists until Next is pressed, which is
          exactly how long the celebration should last. */}
      <Confetti active={phase === 'solved'} reducedMotion={reducedMotion} />
    </>
  );
}

function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  // Repaint when the theme changes; the tokens below are live views.
  useThemeName();

  return (
    <Screen scroll={false}>
      <BackHeader title="Puzzles" fallbackHref="/" />
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
        <Text
          style={{
            color: COLORS.fg,
            fontFamily: FONTS.displaySemi,
            fontSize: 20,
            textAlign: 'center',
          }}
        >
          {title}
        </Text>
        <Text
          style={{
            color: COLORS.fgMuted,
            fontSize: 15,
            textAlign: 'center',
            maxWidth: 300,
            lineHeight: 22,
          }}
        >
          {body}
        </Text>
        <View style={{ alignSelf: 'stretch', gap: 10, marginTop: 8 }}>
          {action}
          <BackToHomeButton />
        </View>
      </View>
    </Screen>
  );
}
