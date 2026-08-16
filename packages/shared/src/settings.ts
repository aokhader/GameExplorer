/**
 * Device preferences — the model both platforms store, in one place.
 *
 * These are *device* settings, not account settings: sound, haptics, motion,
 * board niceties and the visual theme. They lived twice, as near-identical
 * providers on each platform, and the shape drifted in exactly the way that
 * matters least to spot and most to fix — web's `flipBoardPassAndPlay` was
 * missing entirely until parity Phase 2 needed it, so the mobile setting had no
 * counterpart to honour.
 *
 * Only the *model* lives here. Storage, hydration and the theme side-effect are
 * per-platform and stay in the app (localStorage + `[data-theme]` on web,
 * AsyncStorage + the token runtime on native), driven by the shared hook in
 * `@gameexplorer/client`.
 */

/**
 * Visual themes. `dark` is Arcade Glow (the default identity); `cozy` is Cozy
 * Tabletop.
 *
 * This union is deliberately re-declared rather than imported from
 * `@gameexplorer/ui`'s `ThemeName`: `packages/shared` has no dependencies at
 * all, and taking one on the UI package to borrow a two-member union would
 * invert the dependency direction of the whole workspace. Each app asserts the
 * two agree at compile time where it imports both.
 */
export type ThemeChoice = 'dark' | 'cozy';

export interface Settings {
  /** Play game sound effects (default off — opt-in). */
  sound: boolean;
  /** Vibrate on key events where supported (default off — opt-in). */
  haptics: boolean;
  /** User override that forces reduced motion regardless of the OS setting. */
  reduceMotion: boolean;
  /** Show rank/file coordinate labels on boards. */
  showCoordinates: boolean;
  /**
   * Pass-and-play: turn the board around between turns so the player to move is
   * always at the bottom. Defaults ON — two people sharing one screen expect the
   * board to face whoever is thinking.
   */
  flipBoardPassAndPlay: boolean;
  /** Active visual theme. */
  theme: ThemeChoice;
}

export const SETTINGS_DEFAULTS: Settings = {
  sound: false,
  haptics: false,
  reduceMotion: false,
  showCoordinates: true,
  flipBoardPassAndPlay: true,
  theme: 'dark',
};

/** Both platforms already used this key; changing it would reset every install. */
export const SETTINGS_STORAGE_KEY = 'gx:settings';

/**
 * Turn whatever is in storage into a usable `Settings`. Never throws.
 *
 * Two hazards, both real:
 *  - the stored blob predates a setting, so it is merged over the defaults
 *    rather than used as-is;
 *  - the stored theme was written by a newer build (or hand-edited), which on
 *    web sets an unknown `data-theme` and renders an unstyled page, and on
 *    native leaves every token resolving to undefined. Falling back beats
 *    painting nothing.
 */
export function parseSettings(raw: string | null | undefined): Settings {
  if (!raw) return { ...SETTINGS_DEFAULTS };
  try {
    const stored = { ...SETTINGS_DEFAULTS, ...(JSON.parse(raw) as Partial<Settings>) };
    if (stored.theme !== 'cozy') stored.theme = 'dark';
    return stored;
  } catch {
    return { ...SETTINGS_DEFAULTS };
  }
}

export function serializeSettings(settings: Settings): string {
  return JSON.stringify(settings);
}
