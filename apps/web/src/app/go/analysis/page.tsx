'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  createGoAnalysis,
  goOwnershipMap,
  goTimelineToPoints,
  type GoGameState,
} from '@gameexplorer/shared';
import { goRulesetSummary } from '@gameexplorer/client/game/goSetup';
import { useGameAnalysis } from '@gameexplorer/client/hooks/useGameAnalysis';
import { GoBoard } from '@/components/go/GoBoard';
import { GoSgfLoad } from '@/components/go/GoSgfLoad';
import { ReviewPanel } from '@/components/game/ReviewPanel';
import { GradientText, Reveal } from '@/components/visual';

/**
 * Go's analysis page.
 *
 * The counterpart to `/chess/analysis`, and deliberately a different shape.
 * Chess's is a position editor: a FEN describes a position, so the useful thing
 * to do with one is set it up and ask the engine. Go's interchange unit is an
 * SGF, which is a **whole game** — every Go program on the reference list reads
 * and writes them — so the useful thing to do with one is walk it, and the page
 * hands the file straight to the same review machinery the other three games
 * use after a game ends.
 *
 * Mobile's `/analysis/go` is the same flow with the same parts underneath
 * (`createGoAnalysis`, `useGameAnalysis`, the ownership overlay), so a game
 * looked at here and the same game looked at on a phone give the same verdicts.
 */
export default function GoAnalysisPage() {
  const [timeline, setTimeline] = useState<GoGameState[] | null>(null);

  return (
    <div className="relative min-h-screen pt-16">
      <div className="container mx-auto px-4 pt-8">
        <Link
          href="/go"
          className="group inline-flex items-center text-fg-muted transition-colors hover:text-fg"
        >
          <svg className="mr-2 h-5 w-5 transition-transform group-hover:-translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Back to Go
        </Link>
      </div>

      {timeline ? (
        // Keyed on the loaded game: a second file is a new review, and the
        // scan, the evaluations and the scrub position all have to start over.
        <SgfAnalysis
          key={timeline.length + ':' + timeline[0].size}
          timeline={timeline}
          onExit={() => setTimeline(null)}
        />
      ) : (
        <div className="container mx-auto px-4 py-12">
          <div className="mb-10 text-center">
            <Reveal as="h1" className="mb-3 text-4xl font-bold tracking-tight md:text-5xl">
              <GradientText>Go Analysis</GradientText>
            </Reveal>
            <Reveal as="p" delay={80} className="mx-auto max-w-2xl text-lg text-fg-muted">
              Bring a game in from anywhere and have the engine grade every move
            </Reveal>
          </div>
          <Reveal delay={160}>
            <GoSgfLoad onLoad={setTimeline} />
          </Reveal>
        </div>
      )}
    </div>
  );
}

/**
 * Split out so the analysis hooks only ever run once there is a game.
 *
 * `useGameAnalysis` starts scoring the position it is pointed at as soon as it
 * mounts; mounting it against an empty timeline and letting the file arrive
 * later would start a scan of nothing and then restart it.
 */
function SgfAnalysis({ timeline, onExit }: { timeline: GoGameState[]; onExit: () => void }) {
  const start = timeline[0];
  const moves = useMemo(() => goTimelineToPoints(timeline), [timeline]);

  // `null` means "follow the end of the game", so the board opens on the final
  // position without pinning the index at mount — the reseed trap the mobile
  // boards hit, where a state initializer keeps a value the props have moved on
  // from.
  const [seekedIndex, setSeekedIndex] = useState<number | null>(null);
  const viewIndex = seekedIndex ?? timeline.length - 1;

  const adapter = useMemo(() => createGoAnalysis(start.size), [start.size]);
  const analysis = useGameAnalysis<GoGameState>({
    adapter,
    timeline,
    viewIndex,
    enabled: true,
  });

  const displayState = timeline[viewIndex];
  const best = analysis.current?.bestMove ?? null;

  return (
    <ReviewPanel
      variant="page"
      title={goRulesetSummary(start.size, start.komi, start.scoring)}
      exitLabel="Load another game"
      adapter={adapter}
      moves={moves}
      viewIndex={viewIndex}
      onSeek={setSeekedIndex}
      total={timeline.length}
      // A file from elsewhere has no "you" in it, so both sides are summarised
      // equally — the same choice pass-and-play makes.
      playerColor="black"
      showBothSides
      board={
        <GoBoard
          gameState={displayState}
          onMove={() => {}}
          playerColor="black"
          hintPos={best?.to ?? null}
          ownership={goOwnershipMap(displayState.board, start.size)}
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
