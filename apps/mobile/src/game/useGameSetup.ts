import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@gameexplorer/client';
import {
  parseSetup,
  type SetupFor,
  type SetupMode as RememberedMode,
} from '@gameexplorer/client/game/localSetup';
import type { UnfinishedGame, UnfinishedGameType } from '@gameexplorer/client/game/unfinishedGame';
import { useLastSetupMode, useRememberedSetup } from '@gameexplorer/client/hooks/useRememberedSetup';
import { useUnfinishedGames } from '@gameexplorer/client/hooks/useUnfinishedGames';
import { nativeLocalStore } from '@/lib/localStore';
import { markPlayed } from '@/lib/lastPlayed';
import type { SetupMode } from './OpponentPicker';
import type { SetupDeepLink } from './useSetupDeepLink';

export function isRememberedMode(mode: SetupMode): mode is RememberedMode {
  return mode === 'bot' || mode === 'training' || mode === 'pass-and-play';
}

/** A game in play: the mode and setup it started with, whatever the form says since. */
interface ActiveGame<G extends UnfinishedGameType> {
  mode: SetupMode;
  setup: SetupFor[G];
}

/**
 * A board game's setup form, remembered, and the game it starts.
 *
 * **Two setups, on purpose.** The *form* is what the player is choosing, and it
 * is remembered as they change it (`useRememberedSetup`). The *active* setup is
 * what the game in play was started with. They are the same thing at the moment
 * Start is pressed and differ afterwards: a resumed game brings its own colour,
 * strength, rules and rated status, and none of those should be written back
 * over what the player last chose on the form. Keeping them apart is also what
 * lets a resume apply everything in one render, rather than setting the mode,
 * waiting for that mode's remembered setup to load, and then overwriting it.
 *
 * **Nothing renders until the form is known.** Native storage answers a frame
 * late; painting the defaults first would flash the wrong tile selected, and a
 * tour link that starts straight away would start with the wrong colour.
 */
export function useGameSetup<G extends UnfinishedGameType>(game: G, deepLink: SetupDeepLink) {
  // A link decides the mode: an invite is online, and the tour's strength link
  // is a bot game whatever was played last.
  const linkMode: SetupMode | null = deepLink.online
    ? 'online'
    : deepLink.elo != null || deepLink.autoStart
      ? 'bot'
      : null;
  const [picked, setPicked] = useState<SetupMode | null>(linkMode);
  const last = useLastSetupMode(nativeLocalStore, game);
  const formMode: SetupMode = picked ?? last.mode ?? 'bot';
  // Puzzles and online configure nothing remembered; the bot form stands in.
  const rememberedMode: RememberedMode = isRememberedMode(formMode) ? formMode : 'bot';

  const [override] = useState(() =>
    deepLink.elo != null
      ? ({ elo: deepLink.elo, ...(game === 'chess' ? { custom: false } : {}) } as Partial<SetupFor[G]>)
      : undefined,
  );
  // All three modes are read up front. The picker switches between them in
  // place, and reading a mode's setup only when it is picked would blank the
  // form for a frame on every switch while storage answered.
  const bySetupMode = {
    bot: useRememberedSetup({ store: nativeLocalStore, game, mode: 'bot', override }),
    training: useRememberedSetup({ store: nativeLocalStore, game, mode: 'training' }),
    'pass-and-play': useRememberedSetup({ store: nativeLocalStore, game, mode: 'pass-and-play' }),
  };
  const remembered = bySetupMode[rememberedMode];

  const ready =
    (picked !== null || last.hydrated) &&
    bySetupMode.bot.hydrated &&
    bySetupMode.training.hydrated &&
    bySetupMode['pass-and-play'].hydrated;
  const [active, setActive] = useState<ActiveGame<G> | null>(null);
  // Tour links and invites skip the form. Cleared by the first start of any
  // kind, so returning to the form later does not start another game.
  const [autoStartPending, setAutoStartPending] = useState(
    deepLink.autoStart || deepLink.online || deepLink.repeat,
  );

  const rememberLastMode = last.remember;
  const setMode = useCallback(
    (mode: SetupMode) => {
      setPicked(mode);
      // Online is remembered — it is a choice made here — and puzzles are not:
      // they leave for their own screen.
      if (mode !== 'puzzles') rememberLastMode(mode);
    },
    [rememberLastMode],
  );

  const start = useCallback(() => {
    setAutoStartPending(false);
    setActive({ mode: formMode, setup: remembered.setup });
    if (isRememberedMode(formMode)) markPlayed(game);
  }, [formMode, remembered.setup, game]);

  const stop = useCallback(() => {
    setAutoStartPending(false);
    setActive(null);
  }, []);

  /**
   * Show a restored game. The caller has already put its moves on the board with
   * `useLocalGame().restore`, in the same event, so the first started render
   * holds the resumed position.
   */
  const resume = useCallback(
    (saved: UnfinishedGame) => {
      const setup = {
        ...parseSetup(game, saved.mode, JSON.stringify(saved.setup)),
        color: saved.playerColor,
        rated: saved.rated,
      } as SetupFor[G];
      setAutoStartPending(false);
      setActive({ mode: saved.mode, setup });
      markPlayed(game);
    },
    [game],
  );

  // A link's game is live as soon as it is known what the form says — derived
  // rather than started from an effect, so there is no render in between that
  // shows the form.
  // A casual link overrides only the game it starts, never the remembered
  // form: the player's own rated choice is still theirs next time they open
  // it. (`useSetupDeepLink.casual`.)
  const linkSetup =
    deepLink.casual && isRememberedMode(formMode)
      ? ({ ...remembered.setup, rated: false } as SetupFor[G])
      : remembered.setup;
  const linkGame: ActiveGame<G> | null =
    !active && autoStartPending && ready ? { mode: formMode, setup: linkSetup } : null;
  const current = active ?? linkGame;
  const linkGameLive = !!linkGame;
  useEffect(() => {
    if (linkGameLive && isRememberedMode(formMode)) markPlayed(game);
    // Once, when the link's game appears.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkGameLive]);

  return {
    /** False until the remembered mode and setup have been read. */
    ready,
    /** A link will start the game as soon as the form is ready; show nothing meanwhile. */
    awaitingAutoStart: autoStartPending && !ready,
    started: current !== null,
    mode: current?.mode ?? formMode,
    setMode,
    setup: current?.setup ?? remembered.setup,
    /** Change the form. Only meaningful before Start. */
    update: remembered.update,
    start,
    stop,
    resume,
  };
}

/**
 * This device's unfinished game of one kind, for the setup screen's Continue
 * card and its Start guard. Waits for auth, so a signed-in player never sees a
 * guest's game flash past.
 */
export function useUnfinishedGame(game: UnfinishedGameType) {
  const { user, loading } = useAuth();
  const slots = useUnfinishedGames({
    store: nativeLocalStore,
    userId: user?.id ?? null,
    games: [game],
    enabled: !loading,
  });
  return {
    saved: slots.saved[game] ?? null,
    hydrated: slots.hydrated,
    refresh: slots.refresh,
    settle: (options: { resign: boolean }) => slots.settle(game, options),
    settling: slots.settling === game,
  };
}
