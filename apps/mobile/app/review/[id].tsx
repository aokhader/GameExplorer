import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  checkersAnalysis,
  moveHistoryToOthello,
  moveHistoryToPdn,
  replayCheckersMoves,
  replayChessMoves,
  replayReversiMoves,
  reversiAnalysis,
  timelineToSan,
  type AnalysisAdapter,
  type CheckersGameState,
  type ChessGameState,
  type Color,
  type ReversiGameState,
} from '@gameexplorer/shared';
import { getGameById, type GameType, type SavedGame } from '@gameexplorer/db';
import { COLORS } from '@gameexplorer/ui';
import { useGameAnalysis } from '@/analysis/useGameAnalysis';
import { ReviewScreen } from '@/analysis/ReviewScreen';
import { chessAnalysis } from '@/analysis/adapters';
import { useEngineNative } from '@/engine/useEngineNative';
import { ChessBoard } from '@/board/ChessBoard';
import { CheckersBoard } from '@/board/CheckersBoard';
import { ReversiBoard } from '@/board/ReversiBoard';
import { Screen } from '@/components/ui';
import { FONTS } from '@/theme/typography';

/**
 * Review a game that was played earlier, loaded from its stored move list.
 *
 * The in-game review reads the timeline `useLocalGame` already holds; a saved
 * game has only its moves, so the timeline is rebuilt by replaying them through
 * the same engines (`replay*Moves` in `packages/shared`). Everything after that
 * — grading, the eval bar, the scan — is the identical layer.
 */
export default function PastGameReviewScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [game, setGame] = useState<SavedGame | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Derived, not tracked: a `loading` flag would have to be set synchronously
  // inside the effect, which is the cascading-render pattern the lint rule
  // (rightly) rejects. Either the row or an error arriving ends the wait.
  const loading = !game && !loadError;

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    getGameById(id)
      .then((row) => {
        if (cancelled) return;
        if (row) setGame(row);
        else setLoadError('That game could not be found.');
      })
      .catch(() => {
        if (!cancelled) setLoadError('Could not load that game.');
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const gameType: GameType = game?.game_type ?? 'chess';

  // Types with a replayer + analysis adapter below. Everything else would fall
  // through to the chess pair and replay foreign move objects as chess, so it is
  // refused outright instead. Go is the current absentee (no v1 review).
  const reviewSupported = gameType === 'chess' || gameType === 'checkers' || gameType === 'reversi';

  // Rebuild every position from the stored moves. `replay*Moves` stops at the
  // first move the engine rejects, so a row written by an older version reviews
  // as far as it is valid rather than failing outright.
  const timeline = useMemo(() => {
    if (!game || !reviewSupported) return [];
    // The column is typed for chess; `game_type` is what discriminates it.
    const moves = game.moves as unknown[];
    if (gameType === 'checkers') {
      return replayCheckersMoves(moves as { from: string; to: string }[]);
    }
    if (gameType === 'reversi') {
      return replayReversiMoves(moves as { position: string | null }[]);
    }
    return replayChessMoves(moves as { from: string; to: string; promotion?: never }[]);
  }, [game, gameType, reviewSupported]);

  const moves = useMemo(() => {
    if (timeline.length === 0) return [];
    if (gameType === 'checkers') {
      const last = timeline[timeline.length - 1] as CheckersGameState;
      return moveHistoryToPdn(last.moveHistory);
    }
    if (gameType === 'reversi') {
      const last = timeline[timeline.length - 1] as ReversiGameState;
      return moveHistoryToOthello(last.moveHistory);
    }
    return timelineToSan(timeline as ChessGameState[]);
  }, [timeline, gameType]);

  // Land on the final position — what a player wants to see first is how it
  // ended. Held as "not yet seeked" rather than synced from the timeline in an
  // effect, so the default follows the (asynchronously loaded) game without a
  // cascading render, and the first seek takes over permanently.
  const [seekedIndex, setSeekedIndex] = useState<number | null>(null);
  const viewIndex = seekedIndex ?? Math.max(0, timeline.length - 1);
  const setViewIndex = setSeekedIndex;

  // Chess needs the native engine; the other two are scored by the shared TS
  // engines and work on any build.
  const engine = useEngineNative({ enabled: gameType === 'chess' });
  const adapter = (
    gameType === 'checkers' ? checkersAnalysis
    : gameType === 'reversi' ? reversiAnalysis
    : chessAnalysis
  ) as AnalysisAdapter<unknown>;

  const analysis = useGameAnalysis<unknown>({
    adapter,
    timeline: timeline as unknown[],
    viewIndex,
    enabled: timeline.length > 0 && (gameType !== 'chess' || engine.isReady),
  });

  const exit = useCallback(() => router.back(), [router]);

  if (loading) {
    return (
      <Screen>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
          <ActivityIndicator color={COLORS.accent} />
          <Text style={{ color: COLORS.fgMuted, fontFamily: FONTS.body, fontSize: 14 }}>
            Loading game…
          </Text>
        </View>
      </Screen>
    );
  }

  if (loadError || !game || timeline.length === 0) {
    return (
      <Screen>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <Text
            style={{ color: COLORS.fgMuted, fontFamily: FONTS.body, fontSize: 15, textAlign: 'center' }}
          >
            {loadError ??
              (!reviewSupported
                ? 'Review is not available for this game yet.'
                : 'That game has no moves to review.')}
          </Text>
        </View>
      </Screen>
    );
  }

  const displayState = timeline[viewIndex];
  const playerColor = game.player_color as Color;
  const best = analysis.current?.bestMove ?? null;

  const board =
    gameType === 'checkers' ? (
      <CheckersBoard
        gameState={displayState as CheckersGameState}
        onMove={() => {}}
        playerColor={playerColor}
        hintMove={best}
        interactive={false}
      />
    ) : gameType === 'reversi' ? (
      <ReversiBoard
        gameState={displayState as ReversiGameState}
        onMove={() => {}}
        playerColor={playerColor}
        interactive={false}
      />
    ) : (
      <ChessBoard
        gameState={displayState as ChessGameState}
        onMove={() => {}}
        playerColor={playerColor}
        // The engine's choice reuses the training hint's rings — same meaning
        // ("play this move"), so it should look the same.
        hintMove={best}
        interactive={false}
      />
    );

  return (
    <ReviewScreen
      accent={gameType}
      title="Game review"
      adapter={adapter}
      moves={moves}
      viewIndex={viewIndex}
      onSeek={setViewIndex}
      total={timeline.length}
      playerColor={playerColor}
      evaluation={analysis.current}
      grades={analysis.grades}
      summary={analysis.summary}
      scanning={analysis.scanning}
      progress={analysis.progress}
      complete={analysis.complete}
      liveBusy={analysis.liveBusy || (gameType === 'chess' && !engine.isReady)}
      error={
        gameType === 'chess' && !engine.isAvailable
          ? 'Review needs the chess engine, which this build does not include.'
          : analysis.error
      }
      onScan={analysis.scan}
      onStopScan={analysis.stopScan}
      onExit={exit}
      board={board}
    />
  );
}
