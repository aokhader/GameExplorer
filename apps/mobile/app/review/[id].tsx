import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  checkersAnalysis,
  createGoAnalysis,
  goOwnershipMap,
  goTimelineToPoints,
  moveHistoryToReversi,
  moveHistoryToPdn,
  replayCheckersMoves,
  replayChessMoves,
  replayGoMoves,
  replayReversiMoves,
  reversiAnalysis,
  timelineToSan,
  type AnalysisAdapter,
  type CheckersGameState,
  type ChessGameState,
  type Color,
  type GoGameState,
  type ReversiGameState,
} from '@gameexplorer/shared';
import { getGameById, type GameType, type SavedGame } from '@gameexplorer/db';
import { COLORS } from '@gameexplorer/ui';
import { useGameAnalysis } from '@/analysis/useGameAnalysis';
import { isReviewable } from '@/analysis/reviewable';
import { ReviewScreen } from '@/analysis/ReviewScreen';
import { chessAnalysis } from '@/analysis/adapters';
import { useEngineNative } from '@/engine/useEngineNative';
import { ChessBoard } from '@/board/ChessBoard';
import { CheckersBoard } from '@/board/CheckersBoard';
import { ReversiBoard } from '@/board/ReversiBoard';
import { GoBoard } from '@/board/GoBoard';
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

  // Everything not on this list would fall through to the chess pair below and
  // replay foreign move objects as chess, so it is refused outright instead.
  // The list is shared with the profile's history rows — see
  // `analysis/reviewable.ts` for why it is not declared twice.
  const reviewSupported = isReviewable(gameType);

  /**
   * Go's ruleset, which a move list cannot carry.
   *
   * Board size, komi and the scoring method are columns on the row (added by
   * `supabase-add-go-rules.sql`). A row written before that migration — or on a
   * database where it has not been run — has null for all three, and reads back
   * as the 9×9 / 7.5 / area game it actually was. That is why every reader here
   * defaults rather than asserting.
   */
  const goRules = useMemo(
    () => ({
      size: game?.board_size ?? 9,
      komi: game?.komi ?? 7.5,
      scoring: game?.scoring ?? 'area',
    }),
    [game],
  );

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
    if (gameType === 'go') {
      return replayGoMoves(moves as { position: string | null }[], goRules);
    }
    return replayChessMoves(moves as { from: string; to: string; promotion?: never }[]);
  }, [game, gameType, reviewSupported, goRules]);

  const moves = useMemo(() => {
    if (timeline.length === 0) return [];
    if (gameType === 'checkers') {
      const last = timeline[timeline.length - 1] as CheckersGameState;
      return moveHistoryToPdn(last.moveHistory);
    }
    if (gameType === 'reversi') {
      const last = timeline[timeline.length - 1] as ReversiGameState;
      return moveHistoryToReversi(last.moveHistory);
    }
    if (gameType === 'go') {
      return goTimelineToPoints(timeline as GoGameState[]);
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
  // Go's adapter is built per board size: its grade bands and eval-bar squash
  // both scale with the board, because a ten-point swing is most of a 9×9 game
  // and a detail on 19×19.
  const goAdapterForSize = useMemo(() => createGoAnalysis(goRules.size), [goRules.size]);

  const adapter = (
    gameType === 'checkers' ? checkersAnalysis
    : gameType === 'reversi' ? reversiAnalysis
    : gameType === 'go' ? goAdapterForSize
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
  const goOwnership =
    gameType === 'go'
      ? goOwnershipMap((displayState as GoGameState).board, goRules.size)
      : null;

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
    ) : gameType === 'go' ? (
      <GoBoard
        gameState={displayState as GoGameState}
        onMove={() => {}}
        playerColor={playerColor}
        // The engine's choice reuses the training hint's outline — same meaning.
        hintPos={best?.to ?? null}
        // Who each empty point counts for, from the same `ownershipMap` the
        // end-of-game review and the tutorial's shaded diagram read. Territory
        // is what a Go player reviews with; a bare eval number is not.
        ownership={goOwnership}
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
