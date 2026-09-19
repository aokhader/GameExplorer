'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { GAME_CATALOG } from '@gameexplorer/shared';
import { settleUnfinishedGame } from '@gameexplorer/client/game/settleUnfinishedGame';
import { unfinishedGameSummary } from '@gameexplorer/client/game/unfinishedGame';
import { useAuth } from '@/hooks/useAuth';
import { useLauncher } from '@/hooks/useLauncher';
import { webLocalStore } from '@/lib/localStore';
import { webLiquidateStore } from '@/lib/liquidateStore';
import { continueHref, modeHref, startHref } from '@/lib/gameRoutes';
import { authHref } from '@/components/auth/returnTo';
import { ContinueCard } from '@/components/game/ContinueCard';
import { Skeleton } from '@/components/ui';
import { FirstRunPicker } from './FirstRunPicker';
import {
  AlsoUnfinishedRow,
  GamesRow,
  LinkRow,
  LiquidateContinueCard,
  NumbersRow,
  PlayAgainCard,
  SectionLabel,
} from './LauncherParts';

/**
 * Home for anyone who has played here before — the returning launcher
 * (`project-docs/ux-fix-ideas.md` §4.3), web's twin of native's Home tab and
 * built on the same rules (`@gameexplorer/client/game/launcher`).
 *
 * In order: **Continue** the game left unfinished, or **Play again** with the
 * setup chosen last time, or — for a signed-in player with no history on this
 * browser — the first-run question; then the player's own numbers; their games,
 * the most recently played first; one game worth trying; and plain rows for
 * watching and learning.
 */
export function Launcher() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const userId = user?.id ?? null;
  const { local, stats, reload, tryNew } = useLauncher(userId, !loading);
  const [settling, setSettling] = useState(false);

  const [primary, ...others] = local?.continueItems ?? [];

  let top: ReactNode;
  if (!local) {
    top = <Skeleton className="h-36 w-full rounded-2xl" />;
  } else if (primary?.kind === 'board') {
    top = (
      <ContinueCard
        saved={primary.saved}
        showGame
        className=""
        onResume={() => router.push(continueHref(primary))}
        settling={settling}
        onSettle={async (options) => {
          setSettling(true);
          try {
            return await settleUnfinishedGame(webLocalStore, primary.saved, options);
          } finally {
            setSettling(false);
            reload();
          }
        }}
      />
    );
  } else if (primary?.kind === 'liquidate') {
    top = (
      <LiquidateContinueCard
        save={primary.save}
        resumeHref={continueHref(primary)}
        onDiscard={() => {
          webLiquidateStore.clear(primary.slot);
          reload();
        }}
      />
    );
  } else if (local.playAgain) {
    const { game, mode, summary, quick } = local.playAgain;
    top = (
      <PlayAgainCard
        game={game}
        summary={summary}
        playHref={quick && mode ? startHref(game, mode) : mode ? modeHref(game, mode) : `/${game}`}
        changeHref={quick && mode ? modeHref(game, mode) : undefined}
      />
    );
  } else {
    top = (
      <section className="rounded-2xl border border-border bg-surface-alt p-5">
        <FirstRunPicker heading="Start a game" />
      </section>
    );
  }

  const learnGame = local?.games[0] ?? 'chess';

  return (
    <div className="space-y-8">
      <h1 className="sr-only">Home</h1>
      <div className="space-y-2" data-testid="launcher-top">
        {top}
        {others.map((item) =>
          item.kind === 'board' ? (
            <AlsoUnfinishedRow
              key={item.saved.game}
              game={item.saved.game}
              detail={unfinishedGameSummary(item.saved)}
              href={continueHref(item)}
            />
          ) : (
            <AlsoUnfinishedRow
              key={`liquidate-${item.slot}`}
              game="liquidate"
              detail={`${item.save.state.players.length} players · round ${item.save.state.round}`}
              href={continueHref(item)}
            />
          ),
        )}
      </div>

      {local && (
        <NumbersRow
          signedIn={!!userId}
          stats={stats.stats}
          loading={stats.loading}
          error={stats.error}
          onRetry={stats.refresh}
          puzzlesSolved={local.puzzlesSolved}
          finishedGame={local.finishedGame}
          signInHref={authHref('/auth/signin', '/')}
        />
      )}

      <section className="space-y-3">
        <SectionLabel id="your-games">Your games</SectionLabel>
        <GamesRow games={local?.games ?? []} labelledBy="your-games" />
      </section>

      {tryNew && (
        <section className="space-y-3">
          <SectionLabel>Try something new</SectionLabel>
          <LinkRow
            game={tryNew.game}
            title={tryNew.fresh ? `New to ${GAME_CATALOG[tryNew.game].name}?` : `Back to ${GAME_CATALOG[tryNew.game].name}?`}
            detail={tryNew.action}
            href={tryNew.step.kind === 'lesson' ? `/${tryNew.game}/learn/${tryNew.step.id}` : `/${tryNew.game}/learn`}
          />
        </section>
      )}

      <section className="space-y-3">
        {/* The only way into the spectate lobby outside a shared link. */}
        <LinkRow icon="eye" title="Watch live games" detail="See what other players are up to" href="/spectate" />
        <LinkRow
          icon="graduation-cap"
          title="Learn a game"
          detail={`Rules and lessons for ${GAME_CATALOG[learnGame].name}`}
          href={`/${learnGame}/learn`}
        />
        <div className="text-center">
          <Link
            href="/welcome"
            className="touch-target inline-flex min-h-11 items-center px-3 text-sm font-medium text-fg-muted hover:text-fg"
          >
            Take a quick tour
          </Link>
        </div>
      </section>
    </div>
  );
}
