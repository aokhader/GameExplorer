import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import type { LocalStore } from '../storage';
import {
  lastModeStorageKey,
  parseLastMode,
  parseSetup,
  serializeSetup,
  setupDefaults,
  setupStorageKey,
  type LastSetupMode,
  type SetupFor,
  type SetupGame,
  type SetupMode,
} from '../game/localSetup';

export interface UseRememberedSetupOptions<G extends SetupGame> {
  store: LocalStore;
  game: G;
  mode: SetupMode;
  /**
   * Choices a link carries — the tour's `?elo=` — which win over what was
   * remembered and are then remembered themselves, as lichess treats presets in
   * a URL. Read once, on the first load.
   */
  override?: Partial<SetupFor[G]>;
}

export interface UseRememberedSetupResult<G extends SetupGame> {
  setup: SetupFor[G];
  /** Change some choices; the whole setup is written back. */
  update: (patch: Partial<SetupFor[G]>) => void;
  /**
   * False until the stored setup for this mode has been read. A screen should not
   * start a game before then: the colour or strength would change under it.
   */
  hydrated: boolean;
}

/**
 * The setup a player chose last time, for this game and mode, kept as they
 * change it (`project-docs/ux-fix-ideas.md` §2.1).
 *
 * Written on every change rather than only on Start. A player who picks a
 * strength and then leaves has still told us which strength they want, and a
 * write on Start alone would lose that to a screen they never finished.
 *
 * **Read in a layout effect**, so that on web — whose store can read
 * synchronously — the remembered choices replace the defaults before the first
 * paint rather than a frame after it. Native's read is asynchronous and lands a
 * frame later; its screens wait on `hydrated` instead of painting the defaults.
 * Reading in `useState`'s initializer would be simpler and wrong on web: the
 * server has no store, so the server's HTML and the client's first render would
 * disagree.
 */
export function useRememberedSetup<G extends SetupGame>({
  store,
  game,
  mode,
  override,
}: UseRememberedSetupOptions<G>): UseRememberedSetupResult<G> {
  const key = setupStorageKey(game, mode);
  const [loaded, setLoaded] = useState<{ key: string; setup: SetupFor[G] } | null>(null);

  const storeRef = useRef(store);
  storeRef.current = store;
  // The link's choices apply to the first load only. Switching modes afterwards
  // is the player's own doing and must not re-apply them.
  const overrideRef = useRef(override);

  useLayoutEffect(() => {
    let cancelled = false;
    const apply = (raw: string | null) => {
      if (cancelled) return;
      let setup = parseSetup(game, mode, raw);
      const link = overrideRef.current;
      if (link) {
        overrideRef.current = undefined;
        // Re-parsed so a link can never smuggle in a value the form does not offer.
        setup = parseSetup(game, mode, serializeSetup({ ...setup, ...link }));
        void storeRef.current.set(key, serializeSetup(setup)).catch(() => {});
      }
      setLoaded({ key, setup });
    };

    const s = storeRef.current;
    if (s.getSync) {
      let raw: string | null = null;
      try {
        raw = s.getSync(key);
      } catch {
        /* unavailable store — defaults */
      }
      apply(raw);
    } else {
      s.get(key)
        .catch(() => null)
        .then(apply);
    }
    return () => {
      cancelled = true;
    };
    // `game` and `mode` are folded into `key`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const hydrated = loaded?.key === key;
  const setup = hydrated ? loaded.setup : setupDefaults(game, mode);
  const setupRef = useRef(setup);
  setupRef.current = setup;

  const update = useCallback(
    (patch: Partial<SetupFor[G]>) => {
      const next = { ...setupRef.current, ...patch } as SetupFor[G];
      setupRef.current = next;
      setLoaded({ key, setup: next });
      void storeRef.current.set(key, serializeSetup(next)).catch(() => {});
    },
    [key],
  );

  return { setup, update, hydrated };
}

/**
 * The mode a game's setup screen should open on — native only, where one screen
 * holds every mode. Null until read, and null when nothing was remembered.
 */
export function useLastSetupMode(
  store: LocalStore,
  game: SetupGame,
): { mode: LastSetupMode | null; hydrated: boolean; remember: (mode: LastSetupMode) => void } {
  const key = lastModeStorageKey(game);
  const [state, setState] = useState<{ key: string; mode: LastSetupMode | null } | null>(null);
  const storeRef = useRef(store);
  storeRef.current = store;

  useLayoutEffect(() => {
    let cancelled = false;
    const apply = (raw: string | null) => {
      if (!cancelled) setState({ key, mode: parseLastMode(raw) });
    };
    const s = storeRef.current;
    if (s.getSync) {
      let raw: string | null = null;
      try {
        raw = s.getSync(key);
      } catch {
        /* unavailable store */
      }
      apply(raw);
    } else {
      s.get(key)
        .catch(() => null)
        .then(apply);
    }
    return () => {
      cancelled = true;
    };
  }, [key]);

  const remember = useCallback(
    (mode: LastSetupMode) => {
      setState({ key, mode });
      void storeRef.current.set(key, mode).catch(() => {});
    },
    [key],
  );

  const hydrated = state?.key === key;
  return { mode: hydrated ? state.mode : null, hydrated, remember };
}
