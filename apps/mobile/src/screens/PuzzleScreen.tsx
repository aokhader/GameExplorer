import { ActivityIndicator, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
// Deep import, not the package barrel. The barrel re-exports `useSocket`, which
// pulls in `@gameexplorer/db` — and that module builds a Supabase client at
// import time from env that a puzzle never needs. Reaching straight for the hook
// keeps supabase and socket.io out of this screen's graph entirely, which is
// also what lets it be tested without standing up either.
import { usePuzzle } from '@gameexplorer/client/hooks/usePuzzle';
import { mobilePuzzleProgressStore } from '@/lib/puzzleProgress';
import { staticPuzzleSource } from '@gameexplorer/shared';
import type { PuzzleGame, PuzzlePhase } from '@gameexplorer/shared';
import { COLORS, GAME_ACCENTS, useThemeName } from '@gameexplorer/ui';
import { Screen, BackHeader, Button } from '@/components/ui';
import { GameScreenLayout } from '@/game/GameScreenLayout';
import { StatusBanner } from '@/game/StatusBanner';
import { PuzzleBoard } from '@/puzzles/PuzzleBoard';
import { PuzzleBar } from '@/puzzles/PuzzleBar';
import { FONTS } from '@/theme/typography';

const GAME_LABEL: Record<PuzzleGame, string> = {
  chess: 'Chess',
  checkers: 'Checkers',
  reversi: 'Reversi',
};

/**
 * Headline + supporting line for each phase of the run — same copy as web,
 * including the refutation sentence, which comes from the shared runtime so the
 * two platforms cannot describe the same mistake differently.
 */
function statusFor(
  phase: PuzzlePhase | null,
  refutationText: string | null,
): { title: string; description: string } {
  switch (phase) {
    case 'replying':
      return { title: 'Correct', description: 'Watch the reply…' };
    case 'wrong':
      return {
        title: 'Not quite',
        description: refutationText ?? 'Looking at what your opponent does about that…',
      };
    case 'solved':
      return { title: 'Solved', description: 'Read why below, then take the next one.' };
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
export function PuzzleScreen({ game }: PuzzleScreenProps) {
  // Repaint when the theme changes; the tokens below are live views.
  useThemeName();

  const {
    puzzle,
    run,
    phase,
    loading,
    error,
    exhausted,
    progress,
    solved,
    total,
    hint,
    board,
    viewIndex,
    timelineLength,
    atLive,
    refutation,
    refutationText,
    playMove,
    seek,
    retry,
    next,
    showHint,
    startOver,
  } = usePuzzle<unknown>({
    game,
    source: staticPuzzleSource,
    progress: mobilePuzzleProgressStore,
  });

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
    return (
      <EmptyState
        title={`You've solved every ${GAME_LABEL[game]} puzzle`}
        body={`That's all ${total} of them. More are coming — or start the set again from the beginning.`}
        action={<Button label="Start over" onPress={startOver} glow />}
      />
    );
  }

  const status = statusFor(phase, refutationText);
  const accent = GAME_ACCENTS[game];

  return (
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
                fontWeight: '800',
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
          interactive={phase === 'playing' && atLive}
          onMove={playMove}
          hint={hint}
          refutation={refutation?.reply ?? null}
        />
      }
      sidebar={
        <>
          <StatusBanner accent={game} title={status.title} description={status.description} />

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
                  fontWeight: '800',
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

  const router = useRouter();

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
          <Button label="Back to Home" variant="secondary" onPress={() => router.replace('/' as never)} />
        </View>
      </View>
    </Screen>
  );
}
