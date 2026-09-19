'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { GAME_CATALOG, LESSONS, MODE_COPY, type GameId } from '@gameexplorer/shared';
import { lastModeStorageKey, parseLastMode, type LastSetupMode } from '@gameexplorer/client/game/localSetup';
import { Icon, type IconName } from '@gameexplorer/ui';
import { GameIcon } from '@/components/game/GameIcon';
import { HowItWorks, type HowItWorksPoint } from '@/components/game/HowItWorks';
import { LastPlayed, PlayPanel } from '@/components/game/PlayPanel';
import { webLocalStore } from '@/lib/localStore';
import { modeHref } from '@/lib/gameRoutes';
import { cn } from '@/lib/utils';

export interface GameHubProps {
  game: GameId;
  /** One sentence under the heading. A rule or a fact, never a claim about the app. */
  summary?: string;
  howItWorks: HowItWorksPoint[];
}

interface HubLink {
  key: string;
  href: string;
  label: string;
  description: string;
  icon: IconName;
  /** The mode this link starts, for the "last played" marker. */
  mode?: LastSetupMode;
}

/** Where a game's analysis surface lives, for the two that have one. */
const ANALYSIS: Partial<Record<GameId, { href: string; detail: string }>> = {
  chess: { href: '/chess/analysis', detail: 'Set up any position and see what the engine makes of it' },
  go: { href: '/go/analysis', detail: 'Open a game record and step through it' },
};

/**
 * A game's page: one ranked list of the ways to play it
 * (`project-docs/ux-fix-ideas.md` §3.2).
 *
 * It used to be up to eight equal cards in a two-column grid — the same size,
 * the same treatment, in the same order on the first visit and the fiftieth —
 * so nothing said which one most people want. Now there are three tiers, in a
 * fixed order so a hand that has learned them keeps them:
 *
 * 1. **The Play panel**: the game left unfinished, or the bot with the setup
 *    chosen last time and one Start — the page's only gold element.
 * 2. **One row of equal buttons**: puzzles, online, pass & play — whichever of
 *    them this game has.
 * 3. **A plain list**: rated practice, analysis, your games, the rules and the
 *    lessons.
 *
 * A small "last played" marker says which way the player played last. Modes a
 * game lacks are simply absent. Everything comes from the game catalog, so a
 * mode that lands for one game appears here by existing.
 */
export function GameHub({ game, summary, howItWorks }: GameHubProps) {
  const entry = GAME_CATALOG[game];
  const modes = new Set(entry.modes);

  // Read after mount: the server has no storage, and the marker is a nicety
  // that can arrive a frame late.
  const [lastMode, setLastMode] = useState<LastSetupMode | null>(null);
  useEffect(() => {
    let active = true;
    void webLocalStore.get(lastModeStorageKey(game)).then((raw) => {
      if (active) setLastMode(parseLastMode(raw));
    });
    return () => {
      active = false;
    };
  }, [game]);

  const secondary: HubLink[] = [];
  if (modes.has('puzzles')) {
    secondary.push({ key: 'puzzles', href: `/${game}/puzzles`, icon: 'puzzle-piece', ...MODE_COPY.puzzles });
  }
  if (modes.has('online')) {
    secondary.push({ key: 'online', href: modeHref(game, 'online'), icon: 'globe', mode: 'online', ...MODE_COPY.online });
  }
  if (modes.has('local')) {
    secondary.push({
      key: 'local',
      href: modeHref(game, 'pass-and-play'),
      icon: 'users',
      mode: 'pass-and-play',
      ...MODE_COPY.local,
    });
  }

  const tertiary: HubLink[] = [];
  if (modes.has('training')) {
    tertiary.push({ key: 'training', href: modeHref(game, 'training'), icon: 'target', mode: 'training', ...MODE_COPY.training });
  }
  const analysis = ANALYSIS[game];
  if (analysis) {
    tertiary.push({ key: 'analysis', href: analysis.href, icon: 'magnifying-glass', label: 'Analysis board', description: analysis.detail });
  }
  if (entry.rated) {
    tertiary.push({
      key: 'review',
      href: game === 'chess' ? '/chess/replays' : `/profile?game=${game}`,
      icon: 'film-strip',
      label: 'Your games',
      description: 'Step back through a finished game, move by move',
    });
  }
  tertiary.push({ key: 'learn', href: `/${game}/learn`, icon: 'graduation-cap', ...MODE_COPY.learn });
  const lessons = game === 'liquidate' ? 0 : LESSONS[game].lessons.length;
  if (lessons > 0) {
    tertiary.push({
      key: 'lessons',
      href: `/${game}/learn#lessons`,
      icon: 'lightbulb',
      label: 'Lessons',
      description: `${lessons} short lessons, played on a board`,
    });
  }

  return (
    <div className="min-h-svh pt-16">
      <div className="container mx-auto max-w-3xl px-4 pt-4 pb-12">
        <header className="flex items-center gap-3">
          <span className="inline-flex text-4xl" aria-hidden="true">
            <GameIcon game={game} />
          </span>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight text-fg sm:text-3xl">{entry.name}</h1>
            {summary && <p className="text-fg-muted">{summary}</p>}
          </div>
        </header>

        {/* Close under the heading: Start belongs in the top quarter of a phone
            screen (ux-fix-ideas.md §11.4), and it measured 24px below it. */}
        <div className="mt-4">
          <PlayPanel game={game} lastPlayed={lastMode === 'bot'} />
        </div>

        {secondary.length > 0 && (
          <ul
            aria-label={`More ways to play ${entry.name}`}
            className={cn('mt-3 grid gap-3', secondary.length === 3 ? 'grid-cols-3' : secondary.length === 2 ? 'grid-cols-2' : 'grid-cols-1')}
          >
            {secondary.map((item) => (
              <li key={item.key}>
                <Link
                  href={item.href}
                  className="relative flex h-full min-h-16 flex-col items-center justify-center gap-1 rounded-xl border border-border bg-surface-alt px-2 py-3 text-center motion-control motion-safe:active:scale-[0.98] hover:border-border-strong hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                >
                  <Icon name={item.icon} className="text-xl text-fg-muted" />
                  <span className="text-sm font-semibold text-fg">{item.label}</span>
                  {item.mode && item.mode === lastMode && <LastPlayed />}
                </Link>
              </li>
            ))}
          </ul>
        )}

        <ul aria-label={`Everything else for ${entry.name}`} className="mt-6 divide-y divide-border border-y border-border">
          {tertiary.map((item) => (
            <li key={item.key}>
              <Link
                href={item.href}
                className="group flex min-h-14 items-center gap-3 px-1 py-2 motion-control hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
              >
                <Icon name={item.icon} className="text-lg text-fg-muted" />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium text-fg">
                    {item.label}
                    {item.mode && item.mode === lastMode && <LastPlayed inline />}
                  </span>
                  <span className="block text-sm text-fg-muted">{item.description}</span>
                </span>
                <Icon name="caret-right" className="shrink-0 text-lg text-fg-subtle group-hover:text-fg" />
              </Link>
            </li>
          ))}
        </ul>

        <HowItWorks learnHref={`/${game}/learn`} points={howItWorks} />
      </div>
    </div>
  );
}
