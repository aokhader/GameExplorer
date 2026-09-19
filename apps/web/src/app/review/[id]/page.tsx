'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  checkersAnalysis,
  createGoAnalysis,
  goReviewOwnership,
  goTimelineToPoints,
  moveHistoryToPdn,
  moveHistoryToReversi,
  replayCheckersMoves,
  replayGoMoves,
  replayReversiMoves,
  reversiAnalysis,
  type AnalysisAdapter,
  type CheckersGameState,
  type Color,
  type GoGameState,
  type ReversiGameState,
} from '@gameexplorer/shared';
import { getGameById, type SavedGame } from '@gameexplorer/db';
import { useGameAnalysis } from '@gameexplorer/client/hooks/useGameAnalysis';
import { CheckersBoard } from '@/components/checkers/CheckersBoard';
import { ReversiBoard } from '@/components/reversi/ReversiBoard';
import { GoBoard } from '@/components/go/GoBoard';
import { ReviewPanel } from '@/components/game/ReviewPanel';
import { ShellNav } from '@/components/game/ShellNav';
import { GameSkeleton } from '@/components/game/GameSkeleton';
import { EmptyState, ErrorState } from '@/components/ui';

type ReviewedGame = 'checkers' | 'reversi' | 'go';

/**
 * Review a saved checkers, reversi or Go game, move by move
 * (`project-docs/ux-fix-ideas.md` §3.4).
 *
 * Web could replay only chess (`/chess/replays/[id]`, which opens the analysis
 * board) while native reviewed all four from the You tab. A saved game has only
 * its moves, so the timeline is rebuilt by replaying them through the same
 * engines (`replay*Moves` in shared), and everything after that — grading,
 * the eval bar, the scan — is the review panel the game screens already open
 * after a game ends. A chess id is sent on to its own route.
 */
export default function PastGameReviewPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [game, setGame] = useState<SavedGame | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    getGameById(id)
      .then((row) => {
        if (cancelled) return;
        if (!row) setLoadError('That game could not be found.');
        else if ((row.game_type ?? 'chess') === 'chess') router.replace(`/chess/replays/${id}`);
        else setGame(row);
      })
      .catch(() => {
        if (!cancelled) setLoadError('Could not load that game.');
      });
    return () => {
      cancelled = true;
    };
  }, [id, router]);

  if (loadError) {
    return (
      <div className="min-h-svh">
        <div className="container mx-auto px-4 pt-4">
          <ShellNav backHref="/profile" backLabel="Your games" />
        </div>
        <ErrorState title={loadError} body="Your saved games are listed on your profile." />
      </div>
    );
  }
  if (!game) return <GameSkeleton />;
  return <SavedGameReview game={game} gameType={game.game_type as ReviewedGame} />;
}

/**
 * Split out so the analysis hook only ever runs once there is a game — mounted
 * against an empty timeline it would start a scan of nothing and restart it.
 */
function SavedGameReview({ game, gameType }: { game: SavedGame; gameType: ReviewedGame }) {
  const router = useRouter();

  // Go's ruleset lives in columns a move list cannot carry; rows from before
  // they existed read back as the 9×9 / 7.5 / area game they were.
  const goRules = useMemo(
    () => ({ size: game.board_size ?? 9, komi: game.komi ?? 7.5, scoring: game.scoring ?? 'area' }),
    [game],
  );

  // `replay*Moves` stops at the first move the engine rejects, so a row written
  // by an older version reviews as far as it is valid rather than failing.
  const timeline = useMemo((): unknown[] => {
    const moves = game.moves as unknown[];
    if (gameType === 'checkers') return replayCheckersMoves(moves as { from: string; to: string }[]);
    if (gameType === 'reversi') return replayReversiMoves(moves as { position: string | null }[]);
    return replayGoMoves(moves as { position: string | null }[], goRules);
  }, [game, gameType, goRules]);

  const moves = useMemo(() => {
    const last = timeline[timeline.length - 1];
    if (gameType === 'checkers') return moveHistoryToPdn((last as CheckersGameState).moveHistory);
    if (gameType === 'reversi') return moveHistoryToReversi((last as ReversiGameState).moveHistory);
    return goTimelineToPoints(timeline as GoGameState[]);
  }, [timeline, gameType]);

  // Opens on the final position — how it ended is what a player looks at first.
  const [seekedIndex, setSeekedIndex] = useState<number | null>(null);
  const viewIndex = seekedIndex ?? Math.max(0, timeline.length - 1);

  const goAdapter = useMemo(() => createGoAnalysis(goRules.size), [goRules.size]);
  const adapter = (
    gameType === 'checkers' ? checkersAnalysis : gameType === 'reversi' ? reversiAnalysis : goAdapter
  ) as AnalysisAdapter<unknown>;

  const analysis = useGameAnalysis<unknown>({
    adapter,
    timeline,
    viewIndex,
    enabled: timeline.length > 1,
  });

  if (timeline.length <= 1) {
    return (
      <div className="min-h-svh">
        <div className="container mx-auto px-4 pt-4">
          <ShellNav backHref="/profile" backLabel="Your games" />
        </div>
        <EmptyState icon="film-strip" title="Nothing to review" body="That game ended before a move was played." />
      </div>
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
        showCoordinates
        // The engine's choice, drawn the way a training hint is.
        arrows={best ? [{ from: best.from, to: best.to, color: 'rgba(251, 191, 36, 0.9)' }] : []}
        interactive={false}
      />
    ) : gameType === 'reversi' ? (
      <ReversiBoard
        gameState={displayState as ReversiGameState}
        onMove={() => {}}
        playerColor={playerColor}
        showCoordinates
        interactive={false}
      />
    ) : (
      <GoBoard
        gameState={displayState as GoGameState}
        onMove={() => {}}
        playerColor={playerColor}
        hintPos={best?.to ?? null}
        // Who each empty point counts for — territory is what a Go player
        // reviews with; a bare eval number is not.
        ownership={goReviewOwnership((displayState as GoGameState).board, goRules.size)}
        interactive={false}
      />
    );

  return (
    <div className="min-h-svh">
      <div className="container mx-auto px-4 pt-4">
        <ShellNav backHref="/profile" backLabel="Your games" />
      </div>
      <ReviewPanel
        variant="page"
        title="Game review"
        exitLabel="Back to your games"
        adapter={adapter}
        moves={moves}
        viewIndex={viewIndex}
        onSeek={setSeekedIndex}
        total={timeline.length}
        playerColor={playerColor}
        board={board}
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
        onExit={() => router.push('/profile')}
      />
    </div>
  );
}
