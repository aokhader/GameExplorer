'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { GAME_CATALOG, GAME_LIST, MODE_COPY, type GameId } from '@gameexplorer/shared';
import {
  lastModeStorageKey,
  parseLastMode,
  type LastSetupMode,
  type SetupMode,
} from '@gameexplorer/client/game/localSetup';
import { setupFields } from '@gameexplorer/client/game/setupFields';
import { useRememberedSetup } from '@gameexplorer/client/hooks/useRememberedSetup';
import { readContinueItems, type ContinueItem } from '@gameexplorer/client/game/launcher';
import { Icon } from '@gameexplorer/ui';
import { useAuth } from '@/hooks/useAuth';
import { useIsomorphicLayoutEffect } from '@/hooks/useIsomorphicLayoutEffect';
import { webLocalStore } from '@/lib/localStore';
import { webLiquidateStore } from '@/lib/liquidateStore';
import { continueHref, modeHref, startHref } from '@/lib/gameRoutes';
import { GameIcon } from '@/components/game/GameIcon';
import { SetupChips } from '@/components/game/SetupChips';
import { cn } from '@/lib/utils';

const PRIMARY =
  'inline-flex min-h-12 flex-1 items-center justify-center rounded-lg bg-accent px-6 font-semibold text-on-accent motion-control motion-safe:active:scale-[0.98] hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-surface';

/** The modes this page can set up. Online picks its own terms on its own screen. */
const SETUP_MODES: { value: SetupMode; label: string }[] = [
  { value: 'bot', label: MODE_COPY.bot.label },
  { value: 'pass-and-play', label: MODE_COPY.local.label },
];

/**
 * *Play* — pick a game, see exactly what you would be playing, and start it.
 *
 * Play used to be a link that worked out a different destination on every
 * navigation: the unfinished game, else the last game's setup screen, else
 * chess. That is a fine shortcut and a poor navigation item — the one thing a
 * tab should promise is where it goes — and Home had meanwhile become able to
 * start a game on its own, so the shortcut was the third way to do the same
 * thing rather than the only one.
 *
 * So it is a page. The unfinished game is still one click from it, at the top,
 * where it cannot be missed.
 */
export function PlayPicker() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [game, setGame] = useState<GameId>('chess');
  const [mode, setMode] = useState<SetupMode>('bot');
  const [continueItems, setContinueItems] = useState<ContinueItem[] | null>(null);
  const [lastMode, setLastMode] = useState<LastSetupMode | null>(null);
  const [touched, setTouched] = useState(false);

  const { setup, update } = useRememberedSetup({ store: webLocalStore, game, mode });

  // A link may name the game (`/play?game=go`). Read after paint rather than
  // on the server: this page is prerendered, and taking the query string in
  // the server component is enough on its own to make the route dynamic.
  useIsomorphicLayoutEffect(() => {
    const asked = new URLSearchParams(window.location.search).get('game');
    if (asked && GAME_LIST.some((entry) => entry.id === asked)) {
      setGame(asked as GameId);
      setTouched(true);
    }
  }, []);

  // Otherwise open on the game played last — until the visitor picks one
  // themselves, after which the page is theirs.
  useEffect(() => {
    if (touched) return;
    let active = true;
    void webLocalStore.get('gx:lastGame').then((raw) => {
      if (active && !touched && raw && GAME_LIST.some((entry) => entry.id === raw)) {
        setGame(raw as GameId);
      }
    });
    return () => {
      active = false;
    };
  }, [touched]);

  useEffect(() => {
    if (loading) return;
    let active = true;
    void readContinueItems(webLocalStore, webLiquidateStore, user?.id ?? null).then((items) => {
      if (active) setContinueItems(items);
    });
    return () => {
      active = false;
    };
  }, [loading, user?.id]);

  useEffect(() => {
    let active = true;
    void webLocalStore.get(lastModeStorageKey(game)).then((raw) => {
      if (active) setLastMode(parseLastMode(raw));
    });
    return () => {
      active = false;
    };
  }, [game]);

  const entry = GAME_CATALOG[game];
  const offersLocal = entry.modes.includes('local');
  const modes = SETUP_MODES.filter((m) => m.value === 'bot' || offersLocal);
  const activeMode: SetupMode = modes.some((m) => m.value === mode) ? mode : 'bot';
  const fields = setupFields(game, activeMode, user ? setup : { ...setup, rated: false }, {
    signedIn: !!user,
  });
  const waiting = continueItems?.find((item) => itemGame(item) === game);

  return (
    <div className="space-y-6">
      {continueItems && continueItems.length > 0 && (
        <section aria-label="Carry on" className="rounded-2xl border border-border bg-surface-alt p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-fg-muted">Carry on</h2>
          <ul className="mt-2 space-y-2">
            {continueItems.slice(0, 3).map((item) => (
              <li key={`${itemGame(item)}-${item.kind}`}>
                <Link
                  href={continueHref(item)}
                  className="group flex min-h-12 items-center gap-3 rounded-lg px-2 py-2 motion-control hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                >
                  <span className="text-2xl" aria-hidden="true">
                    <GameIcon game={itemGame(item)} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold text-fg">
                      {GAME_CATALOG[itemGame(item)].name}
                    </span>
                    <span className="block text-sm text-fg-muted">Unfinished game</span>
                  </span>
                  <Icon name="caret-right" className="shrink-0 text-lg text-fg-subtle group-hover:text-fg" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="play-game-heading">
        <h2 id="play-game-heading" className="text-sm font-semibold uppercase tracking-wide text-fg-muted">
          Choose a game
        </h2>
        <ul className="mt-2 grid grid-cols-5 gap-2">
          {GAME_LIST.map(({ id }) => (
            <li key={id}>
              <button
                type="button"
                onClick={() => {
                  setTouched(true);
                  setGame(id);
                }}
                aria-pressed={id === game}
                className={cn(
                  'flex h-full w-full flex-col items-center justify-center gap-1 rounded-xl border px-1 py-3 text-center motion-control',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus',
                  id === game
                    ? 'border-accent bg-accent-muted'
                    : 'border-border bg-surface-alt hover:border-border-strong hover:bg-surface-muted',
                )}
              >
                <span className="text-2xl" aria-hidden="true">
                  <GameIcon game={id} />
                </span>
                <span className="text-caption font-semibold text-fg">{GAME_CATALOG[id].name}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="play-setup-heading" className="rounded-2xl border border-border bg-surface-alt p-4">
        <h2 id="play-setup-heading" className="sr-only">
          {entry.name} setup
        </h2>

        {modes.length > 1 && (
          <div className="flex gap-2" role="radiogroup" aria-label="How to play">
            {modes.map((m) => (
              <button
                key={m.value}
                type="button"
                role="radio"
                aria-checked={m.value === activeMode}
                onClick={() => setMode(m.value)}
                className={cn(
                  'touch-target flex-1 rounded-lg border px-3 py-2 text-sm font-semibold motion-control',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus',
                  m.value === activeMode
                    ? 'border-accent bg-accent-muted text-fg'
                    : 'border-border text-fg-muted hover:bg-surface-muted hover:text-fg',
                )}
              >
                {m.label}
              </button>
            ))}
          </div>
        )}

        <SetupChips fields={fields} onChange={update} className={modes.length > 1 ? 'mt-3' : ''} />

        {waiting && (
          // Start would otherwise ask the question a link cannot, and the
          // answer matters most when the waiting game is rated.
          <p className="mt-3 text-sm text-fg-muted">
            {entry.name} has an unfinished game. Start opens it first.
          </p>
        )}

        <div className="mt-3 flex items-center gap-3">
          {/* The page's one gold element. */}
          <button
            type="button"
            onClick={() => router.push(waiting ? continueHref(waiting) : startHref(game, activeMode))}
            className={PRIMARY}
          >
            {waiting ? 'Continue' : 'Start'}
          </button>
          <Link
            href={modeHref(game, activeMode)}
            className="shrink-0 rounded text-sm font-semibold text-fg-muted underline-offset-2 hover:text-fg hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            All options
          </Link>
        </div>
      </section>

      <p className="text-sm text-fg-muted">
        {lastMode === 'online' ? 'You played online last. ' : ''}
        <Link href={`/${game}`} className="font-semibold text-fg underline-offset-2 hover:underline">
          Everything about {entry.name}
        </Link>{' '}
        — puzzles, lessons, online play and your games.
      </p>
    </div>
  );
}

function itemGame(item: ContinueItem): GameId {
  return item.kind === 'liquidate' ? 'liquidate' : item.saved.game;
}
