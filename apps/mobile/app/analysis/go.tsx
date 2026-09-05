import { useCallback, useMemo, useState } from 'react';
import { ScrollView, Text } from 'react-native';
import { useRouter } from 'expo-router';
import {
  createGoAnalysis,
  goOwnershipMap,
  goTimelineToPoints,
  sgfToTimeline,
  type Color,
  type GoGameState,
} from '@gameexplorer/shared';
import { goRulesetSummary } from '@gameexplorer/client/game/goSetup';
import { COLORS } from '@gameexplorer/ui';
import { useGameAnalysis } from '@/analysis/useGameAnalysis';
import { ReviewScreen } from '@/analysis/ReviewScreen';
import { GoBoard } from '@/board/GoBoard';
import { Button, Screen, TextField } from '@/components/ui';
import { FONTS } from '@/theme/typography';

/**
 * Go's analysis screen — the counterpart to `/analysis/chess`, and deliberately
 * a different shape.
 *
 * Chess's is a position editor, because a FEN is a position. Go's interchange
 * unit is an SGF, which is a **whole game** — it is what OGS, Sabaki, KaTrain,
 * GoQuest and every tsumego app read and write — so the useful thing to do with
 * one is walk it, and this hands the file straight to the review machinery: full
 * grading, the eval bar, the engine's move, and the territory shading.
 *
 * Web's `/go/analysis` is the same flow over the same parts, so a game looked at
 * there and the same game looked at here give the same verdicts.
 */
export default function GoAnalysisScreen() {
  const router = useRouter();
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [timeline, setTimeline] = useState<GoGameState[] | null>(null);

  const load = useCallback(() => {
    try {
      // The file is played out once, here: review grades a move by comparing the
      // position before it with the position after, so what it needs is every
      // position, not the final one.
      const positions = sgfToTimeline(text);
      if (positions.length < 2) {
        setError('That file has no moves to review.');
        return;
      }
      setError(null);
      setTimeline(positions);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not read that SGF');
    }
  }, [text]);

  if (!timeline) {
    return (
      <Screen>
        <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
          <Text style={{ color: COLORS.fg, fontFamily: FONTS.display, fontSize: 26 }}>
            Go analysis
          </Text>
          <Text style={{ color: COLORS.fgMuted, fontFamily: FONTS.body, fontSize: 14, lineHeight: 20 }}>
            Paste a game from any Go program — OGS, Sabaki, KaTrain, a tsumego
            app. The board size, komi and scoring rule come from the file, and
            every move gets graded by the engine.
          </Text>

          <TextField
            value={text}
            onChangeText={setText}
            multiline
            numberOfLines={5}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="(;FF[4]GM[1]SZ[19]KM[6.5]…)"
            accessibilityLabel="SGF"
          />

          {error && (
            <Text
              accessibilityLiveRegion="polite"
              style={{ color: COLORS.dangerHover, fontFamily: FONTS.body, fontSize: 13 }}
            >
              {error}
            </Text>
          )}

          <Button label="Analyse game" onPress={load} glow disabled={text.trim().length === 0} />
          <Button label="Back" variant="secondary" onPress={() => router.back()} />
        </ScrollView>
      </Screen>
    );
  }

  return <SgfAnalysis timeline={timeline} onExit={() => setTimeline(null)} />;
}

/**
 * Split out so the analysis hooks only ever run once there is a game.
 *
 * `useGameAnalysis` scans a timeline on mount; mounting it against an empty one
 * and letting the SGF arrive later would start a scan of nothing and then
 * restart it, which shows up as a progress bar that jumps backwards.
 */
function SgfAnalysis({ timeline, onExit }: { timeline: GoGameState[]; onExit: () => void }) {
  const start = timeline[0];
  const size = start.size;
  const moves = useMemo(() => goTimelineToPoints(timeline), [timeline]);

  // `null` means "follow the end of the game", so the board opens on the final
  // position without pinning an index at mount.
  const [seekedIndex, setSeekedIndex] = useState<number | null>(null);
  const viewIndex = seekedIndex ?? timeline.length - 1;

  const adapter = useMemo(() => createGoAnalysis(size), [size]);
  const analysis = useGameAnalysis<GoGameState>({
    adapter,
    timeline,
    viewIndex,
    enabled: true,
  });

  const displayState = timeline[viewIndex];
  const best = analysis.current?.bestMove ?? null;

  return (
    <ReviewScreen
      accent="go"
      title={goRulesetSummary(size, start.komi, start.scoring)}
      adapter={adapter}
      moves={moves}
      viewIndex={viewIndex}
      onSeek={setSeekedIndex}
      total={timeline.length}
      // A file from elsewhere has no "you" in it, so both sides are summarised
      // equally — the same choice pass-and-play makes.
      playerColor={'black' as Color}
      showBothSides
      board={
        <GoBoard
          gameState={displayState}
          onMove={() => {}}
          playerColor="black"
          hintPos={best?.to ?? null}
          ownership={goOwnershipMap(displayState.board, size)}
          interactive={false}
        />
      }
      evaluation={analysis.current}
      grades={analysis.grades}
      summary={analysis.summary}
      scanning={analysis.scanning}
      progress={analysis.progress}
      complete={analysis.complete}
      liveBusy={analysis.liveBusy}
      error={analysis.error}
      onScan={analysis.scan}
      onStopScan={analysis.stopScan}
      onExit={onExit}
    />
  );
}
