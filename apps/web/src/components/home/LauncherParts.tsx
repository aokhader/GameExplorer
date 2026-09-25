'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { GAME_CATALOG, RATING_COPY, type GameId } from '@gameexplorer/shared';
import type { PlayerStats } from '@gameexplorer/client/game/playerStats';
import { RATED_GAME_TYPES } from '@gameexplorer/client/game/playerStats';
import type { SavedLiquidateGame } from '@gameexplorer/client/liquidate/saveStore';
import { Icon, type IconName } from '@gameexplorer/ui';
import { Button, Skeleton } from '@/components/ui';
import { GameIcon } from '@/components/game/GameIcon';

/**
 * The launcher's pieces — web's twins of native's `home/LauncherParts.tsx`, in
 * the Quiet Arcade direction: flat surfaces and one-pixel borders, the piece art
 * as each game's identity, and one gold element on the screen, whichever
 * primary action the top card holds.
 */

const PRIMARY_LINK =
  'inline-flex min-h-12 flex-1 items-center justify-center rounded-lg bg-accent px-6 font-semibold text-on-accent motion-control motion-safe:active:scale-[0.98] hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-surface';
/** Sized to its label, so Play takes the rest of the row and nothing wraps on a phone. */
const SECONDARY_LINK =
  'inline-flex min-h-12 shrink-0 items-center justify-center whitespace-nowrap rounded-lg border border-border-strong px-4 font-semibold text-fg motion-control motion-safe:active:scale-[0.98] hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus';
const ROW =
  'group flex items-center gap-3 rounded-xl border border-border bg-surface-alt px-4 motion-control motion-safe:active:scale-[0.98] hover:border-border-strong hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus';

export function Panel({ children }: { children: ReactNode }) {
  return <section className="rounded-2xl border border-border bg-surface-alt p-5">{children}</section>;
}

export function PlayAgainCard({
  game,
  summary,
  playHref,
  changeHref,
}: {
  game: GameId;
  summary: string | null;
  playHref: string;
  /** The form, when Play would not open it anyway. */
  changeHref?: string;
}) {
  const name = GAME_CATALOG[game].name;
  return (
    <Panel>
      <div className="flex items-center gap-3">
        <span className="inline-flex shrink-0 text-3xl" aria-hidden="true">
          <GameIcon game={game} />
        </span>
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-fg">{changeHref ? `Play ${name} again` : `Play ${name}`}</h2>
          {summary && <p className="text-sm text-fg-muted">{summary}</p>}
        </div>
      </div>
      <div className="mt-4 flex gap-3">
        <Link href={playHref} className={PRIMARY_LINK}>
          Play
        </Link>
        {changeHref && (
          <Link href={changeHref} className={SECONDARY_LINK}>
            Change setup
          </Link>
        )}
      </div>
    </Panel>
  );
}

export function LiquidateContinueCard({
  save,
  resumeHref,
  onDiscard,
}: {
  save: SavedLiquidateGame;
  resumeHref: string;
  onDiscard: () => void;
}) {
  const { state } = save;
  return (
    <Panel>
      <div className="flex items-center gap-3">
        <span className="inline-flex shrink-0 text-3xl" aria-hidden="true">
          <GameIcon game="liquidate" />
        </span>
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-fg">Continue Liquidate</h2>
          <p className="text-sm text-fg-muted">
            {state.players.length} players · round {state.round} · {state.config.mode === 'quick' ? 'Quick' : 'Full'} board
          </p>
        </div>
      </div>
      <div className="mt-4 flex gap-3">
        <Link href={resumeHref} className={PRIMARY_LINK}>
          Resume
        </Link>
        <Button size="lg" variant="secondary" className="flex-1" onClick={onDiscard}>
          Discard
        </Button>
      </div>
    </Panel>
  );
}

/** One of the other unfinished games, under the main Continue card. */
export function AlsoUnfinishedRow({ game, detail, href }: { game: GameId; detail: string; href: string }) {
  const name = GAME_CATALOG[game].name;
  return (
    <Link href={href} className={`${ROW} min-h-12`} aria-label={`Continue ${name}: ${detail}`}>
      <span className="inline-flex text-xl" aria-hidden="true">
        <GameIcon game={game} />
      </span>
      <span className="min-w-0 flex-1 truncate text-sm font-semibold text-fg">
        {name} <span className="font-normal text-fg-muted">· {detail}</span>
      </span>
      <Icon name="caret-right" className="shrink-0 text-base text-fg-subtle group-hover:text-fg" />
    </Link>
  );
}

function Chip({
  icon,
  game,
  tag,
  label,
  sub,
  subClass,
  ariaLabel,
}: {
  icon?: IconName;
  game?: GameId;
  /** A muted word before the number, naming which number it is. */
  tag?: string;
  label: string;
  sub?: string;
  subClass?: string;
  /** The whole chip, spoken — for when the visible parts need their context. */
  ariaLabel?: string;
}) {
  return (
    <li aria-label={ariaLabel} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-alt px-3 py-2">
      {game ? (
        <span className="inline-flex text-lg" aria-hidden="true">
          <GameIcon game={game} />
        </span>
      ) : icon ? (
        <Icon name={icon} className="text-base text-fg-muted" />
      ) : null}
      {tag && <span className="text-label text-fg-muted">{tag}</span>}
      <span className="text-label font-bold tabular-nums text-fg">{label}</span>
      {sub && <span className={`text-label font-semibold ${subClass ?? 'text-fg-muted'}`}>{sub}</span>}
    </li>
  );
}

/**
 * The player's own numbers (`ux-fix-ideas.md` §4.3, P6): each game's Practice
 * level and its last change, then — only for a game played rated online — its
 * online Rating, tagged so, then the current win streak and puzzles solved.
 * Only numbers that exist are shown — an untouched 1200 is not a number anyone
 * earned. The two ladders are kept apart on purpose (`RATING_COPY`).
 */
/** A chip's last-change suffix, coloured by direction. */
function deltaSub(delta: number | null): { sub?: string; subClass?: string } {
  if (!delta) return {};
  return {
    sub: `${delta > 0 ? '+' : '−'}${Math.abs(delta)}`,
    subClass: delta > 0 ? 'text-success-hover' : 'text-danger-hover',
  };
}

/** "Chess practice level 1480, up 12" — what a number chip says aloud. */
function spokenNumber(what: string, value: number, delta: number | null): string {
  if (!delta) return `${what} ${value}`;
  return `${what} ${value}, ${delta > 0 ? 'up' : 'down'} ${Math.abs(delta)}`;
}

export function NumbersRow({
  signedIn,
  stats,
  loading,
  error,
  onRetry,
  puzzlesSolved,
  finishedGame,
  signInHref,
}: {
  signedIn: boolean;
  stats: PlayerStats | null;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  puzzlesSolved: number;
  finishedGame: boolean;
  signInHref: string;
}) {
  if (signedIn && loading && !stats) {
    return (
      <div aria-label="Loading your numbers" aria-busy="true" className="flex gap-2">
        <Skeleton className="h-9 w-28 rounded-full" />
        <Skeleton className="h-9 w-24 rounded-full" />
        <Skeleton className="h-9 w-24 rounded-full" />
      </div>
    );
  }

  const chips: ReactNode[] = [];
  if (stats) {
    for (const type of RATED_GAME_TYPES) {
      const g = stats.perGame[type];
      const name = GAME_CATALOG[type].name;
      if (g.practice.ratedGames > 0) {
        chips.push(
          <Chip
            key={type}
            game={type}
            label={String(g.practice.rating)}
            ariaLabel={spokenNumber(`${name} ${RATING_COPY.practice.inline}`, g.practice.rating, g.practice.lastDelta)}
            {...deltaSub(g.practice.lastDelta)}
          />,
        );
      }
      if (g.online.ratedGames > 0) {
        chips.push(
          <Chip
            key={`${type}-online`}
            game={type}
            tag={RATING_COPY.online.label}
            label={String(g.online.rating)}
            ariaLabel={spokenNumber(`${name} ${RATING_COPY.online.inline}`, g.online.rating, g.online.lastDelta)}
            {...deltaSub(g.online.lastDelta)}
          />,
        );
      }
    }
    if (stats.currentStreak >= 2) {
      chips.push(<Chip key="streak" icon="fire" label={`${stats.currentStreak} wins in a row`} />);
    }
  }
  if (puzzlesSolved > 0) {
    chips.push(
      <Chip key="puzzles" icon="puzzle-piece" label={String(puzzlesSolved)} sub={puzzlesSolved === 1 ? 'puzzle' : 'puzzles'} />,
    );
  }

  return (
    <div className="space-y-2" data-testid="launcher-numbers">
      {chips.length > 0 && (
        <ul aria-label="Your numbers" className="flex flex-wrap gap-2">
          {chips}
        </ul>
      )}
      {signedIn && error && (
        <button type="button" onClick={onRetry} className="touch-target text-sm text-fg-muted">
          Couldn’t load your numbers. <span className="font-semibold text-fg">Try again</span>
        </button>
      )}
      {!signedIn && finishedGame && (
        <Link href={signInHref} className="touch-target inline-block text-sm text-fg-muted hover:text-fg">
          A practice level needs an account. <span className="font-semibold text-fg">Sign in</span>
        </Link>
      )}
    </div>
  );
}

export function SectionLabel({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <h2 id={id} className="text-label font-semibold uppercase tracking-wider text-fg-subtle">
      {children}
    </h2>
  );
}

/** The five games in one compact row, the most recently played first. */
export function GamesRow({ games, labelledBy }: { games: readonly GameId[]; labelledBy: string }) {
  return (
    <ul aria-labelledby={labelledBy} className="grid grid-cols-5 gap-2">
      {games.map((game) => (
        <li key={game}>
          <Link
            href={`/${game}`}
            className="flex flex-col items-center gap-1.5 rounded-xl border border-border bg-surface-alt py-3 motion-control motion-safe:active:scale-[0.98] hover:border-border-strong hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            <span className="inline-flex text-3xl" aria-hidden="true">
              <GameIcon game={game} />
            </span>
            <span className="max-w-full truncate px-1 text-caption font-semibold text-fg">{GAME_CATALOG[game].name}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** A plain navigation row: icon, two lines, chevron. */
export function LinkRow({
  icon,
  game,
  title,
  detail,
  href,
}: {
  icon?: IconName;
  game?: GameId;
  title: string;
  detail: string;
  href: string;
}) {
  return (
    <Link href={href} className={`${ROW} min-h-14 py-2`}>
      {game ? (
        <span className="inline-flex text-2xl" aria-hidden="true">
          <GameIcon game={game} />
        </span>
      ) : icon ? (
        <Icon name={icon} className="text-xl text-fg-muted" />
      ) : null}
      <span className="min-w-0 flex-1">
        <span className="block font-semibold text-fg">{title}</span>
        <span className="block text-xs text-fg-muted">{detail}</span>
      </span>
      <Icon name="caret-right" className="shrink-0 text-lg text-fg-subtle group-hover:text-fg" />
    </Link>
  );
}
