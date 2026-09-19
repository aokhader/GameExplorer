'use client';

import Link from 'next/link';
import { useState } from 'react';
import { GAME_CATALOG, GAME_LIST, type GameId } from '@gameexplorer/shared';
import { GameIcon } from '@/components/game/GameIcon';
import { firstGameHref, firstLessonHref } from '@/lib/gameRoutes';
import { cn } from '@/lib/utils';

/**
 * A first visit's one question (`project-docs/ux-fix-ideas.md` §4.4): which
 * game, and whether the player already knows it.
 *
 * It replaces a four-step tour that ended in a bot game at a fixed strength and
 * cost a stranger six clicks to a first move. *Play* starts a game at once, at
 * the middle of the game's ladder, and that setup is remembered from then on;
 * *I'm new* opens the game's first coached lesson. The tour is still a link.
 *
 * All five games are offered. The tour could only offer rated games because
 * it ended on a rating ladder; a picker has no such limit.
 */
export function FirstRunPicker({
  headingId = 'first-run-heading',
  heading = 'Pick a game',
}: {
  headingId?: string;
  heading?: string;
}) {
  const [game, setGame] = useState<GameId>('chess');
  const name = GAME_CATALOG[game].name;

  return (
    <section aria-labelledby={headingId}>
      <h2 id={headingId} className="text-lg font-semibold text-fg">
        {heading}
      </h2>
      <div role="group" aria-labelledby={headingId} className="mt-3 grid grid-cols-5 gap-2">
        {GAME_LIST.map((entry) => {
          const selected = entry.id === game;
          return (
            <button
              key={entry.id}
              type="button"
              aria-pressed={selected}
              onClick={() => setGame(entry.id)}
              className={cn(
                'flex min-h-11 flex-col items-center gap-1 rounded-xl border px-1 py-2.5 motion-control motion-safe:active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus',
                selected
                  ? 'border-accent bg-accent-muted text-fg'
                  : 'border-border bg-surface-alt text-fg-muted hover:bg-surface-muted hover:text-fg',
              )}
            >
              <span className="inline-flex text-3xl" aria-hidden="true">
                <GameIcon game={entry.id} />
              </span>
              <span className="text-caption font-semibold">{entry.name}</span>
            </button>
          );
        })}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {/* The screen's one gold element. */}
        <Link
          href={firstGameHref(game)}
          className="inline-flex min-h-12 items-center justify-center rounded-lg bg-accent px-6 font-semibold text-on-accent motion-control motion-safe:active:scale-[0.98] hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
        >
          Play {name}
        </Link>
        <Link
          href={firstLessonHref(game)}
          // A quiet second answer: the gold Play is the page's one strong element.
          className="inline-flex min-h-12 items-center justify-center rounded-lg px-6 font-semibold text-fg-muted motion-control motion-safe:active:scale-[0.98] hover:bg-surface-muted hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          I’m new to {name}
        </Link>
      </div>
      <p className="mt-2 text-sm text-fg-muted">
        {game === 'liquidate'
          ? 'Play starts a game against two bots. New? The rules take two minutes.'
          : 'Play starts a game against a Club-strength bot. New? Start with a short lesson.'}
      </p>
    </section>
  );
}
