import type { Metadata } from 'next';
import Link from 'next/link';
import { GAME_LIST, LESSONS, type GameId } from '@gameexplorer/shared';
import { Icon } from '@gameexplorer/ui';
import { GameIcon } from '@/components/game/GameIcon';

export const metadata: Metadata = {
  title: 'Learn — GameExplorer',
  description: 'The rules of chess, checkers, reversi, Go and Liquidate, and short lessons you play through on a board.',
};

function lessonCount(game: GameId): number {
  return game === 'liquidate' ? 0 : LESSONS[game].lessons.length;
}

/**
 * Learn, one of the navigation's two secondary places (`ux-fix-ideas.md` §3.1):
 * each game's rules and its coached lessons, one row per game.
 */
export default function LearnPage() {
  return (
    <div className="min-h-svh pt-16">
      <div className="container mx-auto max-w-2xl px-4 pt-6 pb-12">
        <h1 className="text-3xl font-bold tracking-tight text-fg">Learn</h1>
        <p className="mt-1 text-fg-muted">
          The rules of each game, and short lessons you play through on a board.
        </p>
        <ul className="mt-6 space-y-3">
          {GAME_LIST.map((game) => {
            const lessons = lessonCount(game.id);
            return (
              <li key={game.id}>
                <Link
                  href={`/${game.slug}/learn`}
                  className="group flex min-h-16 items-center gap-4 rounded-xl border border-border bg-surface-alt px-4 py-3 motion-control motion-safe:active:scale-[0.98] hover:border-border-strong hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                >
                  <span className="inline-flex text-3xl" aria-hidden="true">
                    <GameIcon game={game.id} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-lg font-semibold text-fg">{game.name}</span>
                    <span className="block text-sm text-fg-muted">
                      {lessons > 0 ? `The rules · ${lessons} lessons` : 'The rules'}
                    </span>
                  </span>
                  <Icon name="caret-right" className="shrink-0 text-xl text-fg-subtle group-hover:text-fg" />
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
