'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { MODE_COPY, type GameId } from '@gameexplorer/shared';
import { setupSummary } from '@gameexplorer/client/game/localSetup';
import type { SavedLiquidateGame } from '@gameexplorer/client/liquidate/saveStore';
import type { UnfinishedGameType } from '@gameexplorer/client/game/unfinishedGame';
import { useRememberedSetup } from '@gameexplorer/client/hooks/useRememberedSetup';
import { useAuth } from '@/hooks/useAuth';
import { resumeHref, useUnfinishedGame } from '@/hooks/useUnfinishedGame';
import { ContinueCard } from '@/components/game/ContinueCard';
import { Button } from '@/components/ui';
import { webLocalStore } from '@/lib/localStore';
import { webLiquidateStore } from '@/lib/liquidateStore';
import { modeHref, startHref } from '@/lib/gameRoutes';
import { cn } from '@/lib/utils';

const PRIMARY_LINK =
  'inline-flex min-h-12 flex-1 items-center justify-center rounded-lg bg-accent px-6 font-semibold text-on-accent motion-control motion-safe:active:scale-[0.98] hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-surface';
const SECONDARY_LINK =
  'inline-flex min-h-12 items-center justify-center rounded-lg border border-border-strong px-5 font-semibold text-fg motion-control motion-safe:active:scale-[0.98] hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus';

/**
 * The top of a game's page (`ux-fix-ideas.md` §2.3, §3.2): the game left
 * unfinished, or one line naming the bot game this player would get — the
 * strength, side and rated choice remembered from last time — and one Start.
 *
 * Start is a link to the bot's setup screen with `?start=1`, so it opens
 * straight onto a board; *Change* opens the same screen's form. A link cannot
 * ask the questions Start sometimes has to, so the setup screen starts only when
 * no unfinished game is waiting (`useStartLink`).
 */
export function PlayPanel({ game, lastPlayed }: { game: GameId; lastPlayed: boolean }) {
  return game === 'liquidate' ? (
    <LiquidatePlayPanel lastPlayed={lastPlayed} />
  ) : (
    <BoardPlayPanel game={game} lastPlayed={lastPlayed} />
  );
}

function BoardPlayPanel({ game, lastPlayed }: { game: UnfinishedGameType; lastPlayed: boolean }) {
  const router = useRouter();
  const { user } = useAuth();
  const unfinished = useUnfinishedGame(game);
  const { setup } = useRememberedSetup({ store: webLocalStore, game, mode: 'bot' });

  if (unfinished.saved) {
    const saved = unfinished.saved;
    return (
      <ContinueCard
        saved={saved}
        className=""
        onResume={() => router.push(resumeHref(saved))}
        onSettle={unfinished.settle}
        settling={unfinished.settling}
      />
    );
  }

  // A guest never plays rated, whatever the remembered toggle says.
  const summary = setupSummary(game, 'bot', user ? setup : { ...setup, rated: false });
  return (
    <StartPanel
      title={MODE_COPY.bot.label}
      summary={summary}
      startHref={startHref(game, 'bot')}
      changeHref={modeHref(game, 'bot')}
      lastPlayed={lastPlayed}
    />
  );
}

function LiquidatePlayPanel({ lastPlayed }: { lastPlayed: boolean }) {
  const { setup } = useRememberedSetup({ store: webLocalStore, game: 'liquidate', mode: 'bot' });
  const [saved, setSaved] = useState<{ slot: 'bot' | 'local'; save: SavedLiquidateGame } | null>(null);
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    let active = true;
    void Promise.all([webLiquidateStore.read('bot'), webLiquidateStore.read('local')]).then(([bot, local]) => {
      if (!active) return;
      const open = [
        bot && !bot.state.isGameOver ? { slot: 'bot' as const, save: bot } : null,
        local && !local.state.isGameOver ? { slot: 'local' as const, save: local } : null,
      ].filter((s): s is { slot: 'bot' | 'local'; save: SavedLiquidateGame } => !!s);
      open.sort((a, b) => b.save.savedAt - a.save.savedAt);
      setSaved(open[0] ?? null);
    });
    return () => {
      active = false;
    };
  }, [generation]);

  if (saved) {
    const { state } = saved.save;
    return (
      <section aria-label="Unfinished game" className="rounded-2xl border border-border bg-surface-alt p-6">
        <h2 className="text-lg font-semibold text-fg">Game in progress</h2>
        <p className="mt-1 text-sm text-fg-muted">
          {saved.slot === 'local' ? `${MODE_COPY.local.label} · ` : ''}
          {state.players.length} players · round {state.round}
        </p>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <Link href={`/liquidate/${saved.slot}?resume=1`} className={PRIMARY_LINK}>
            Resume
          </Link>
          <Button
            size="lg"
            variant="secondary"
            onClick={() => {
              webLiquidateStore.clear(saved.slot);
              setGeneration((g) => g + 1);
            }}
          >
            Discard
          </Button>
        </div>
      </section>
    );
  }

  return (
    <StartPanel
      title="Play the bots"
      summary={setupSummary('liquidate', 'bot', setup)}
      startHref={startHref('liquidate', 'bot')}
      changeHref={modeHref('liquidate', 'bot')}
      lastPlayed={lastPlayed}
    />
  );
}

function StartPanel({
  title,
  summary,
  startHref: href,
  changeHref,
  lastPlayed,
}: {
  title: string;
  summary: string;
  startHref: string;
  changeHref: string;
  lastPlayed: boolean;
}) {
  return (
    <section aria-labelledby="play-panel-heading" className="rounded-2xl border border-border bg-surface-alt p-4" data-testid="play-panel">
      <h2 id="play-panel-heading" className="text-lg font-semibold text-fg">
        {title}
        {lastPlayed && <LastPlayed inline />}
      </h2>
      <p className="mt-0.5 text-sm text-fg-muted" data-testid="play-panel-summary">
        {summary}
      </p>
      <div className="mt-3 flex gap-3">
        {/* The page's one gold element. */}
        <Link href={href} className={PRIMARY_LINK}>
          Start
        </Link>
        <Link href={changeHref} className={SECONDARY_LINK}>
          Change
        </Link>
      </div>
    </section>
  );
}

/** What the player did last on this game — said once, quietly. */
export function LastPlayed({ inline = false }: { inline?: boolean }) {
  return (
    <span
      className={cn('text-caption font-semibold text-fg-muted', inline ? 'ml-2 align-middle' : 'block')}
      data-testid="last-played"
    >
      Last played
    </span>
  );
}
