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

/**
 * How pieces travel between squares. `normal` is the board's own tempo
 * (`BOARD_ANIM_MS`); the others are lichess's offer — its players asked for
 * speed control, not for colour pickers. Durations live beside the board's
 * tempo in `board/transition.ts`.
 */
export type PieceAnimation = 'none' | 'fast' | 'normal' | 'slow';

export const PIECE_ANIMATIONS: readonly PieceAnimation[] = ['none', 'fast', 'normal', 'slow'];

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
   * Go only: place a stone in two steps — press to aim, then confirm.
   *
   * Not a fussiness setting. Go stones sit on the LINES' crossings, and on a
   * 19×19 board on a phone a point is about 18pt across against a 44pt
   * guideline, so a single tap is a coin flip between two intersections. The
   * two-step form lets the player slide to the point they meant and commit
   * deliberately, which is how every serious Go app on a touch screen works.
   *
   * Default **off**, and forced on above 9×9 regardless — see
   * `confirmPlacementFor`. Off by default because 9×9 shipped with a single tap
   * and was device-verified that way; a point there is about 38pt, which is
   * close enough to the guideline to be honest. Changing the interaction under
   * every existing player to fix a problem they do not have would be the wrong
   * trade.
   *
   * Read by the mobile board, and by the web board **only on a touch screen**
   * (`pointer: coarse`). A mouse can hit a 19×19 intersection that a fingertip
   * cannot, so a mouse keeps click-to-place — the step would be friction there
   * rather than a fix — but a phone browser is a finger, not a mouse.
   */
  confirmMove: boolean;
  /**
   * Pass-and-play: turn the board around between turns so the player to move is
   * always at the bottom. Defaults ON — two people sharing one screen expect the
   * board to face whoever is thinking.
   */
  flipBoardPassAndPlay: boolean;
  /**
   * How pieces travel. `reduceMotion` still wins: under it nothing travels,
   * whatever this says — see `boardAnimMs`.
   */
  pieceAnimation: PieceAnimation;
  /**
   * Draw where the picked-up piece (or the side to move, in reversi and Go)
   * may go. On by default; some players find the dots a crutch.
   */
  showDestinations: boolean;
  /**
   * Resign, and agree or offer a draw, only on a second tap — the button
   * turns into its own confirmation for three seconds, so the board stays in
   * view. On by default: a mis-tap that throws a game costs far more than the
   * second tap.
   */
  confirmResign: boolean;
  /** Active visual theme. */
  theme: ThemeChoice;
}

export const SETTINGS_DEFAULTS: Settings = {
  sound: false,
  haptics: false,
  reduceMotion: false,
  showCoordinates: true,
  confirmMove: false,
  flipBoardPassAndPlay: true,
  pieceAnimation: 'normal',
  showDestinations: true,
  confirmResign: true,
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
    // Same hazard as the theme: an unknown value from a newer build would reach
    // a duration lookup and come back undefined.
    if (!PIECE_ANIMATIONS.includes(stored.pieceAnimation)) {
      stored.pieceAnimation = SETTINGS_DEFAULTS.pieceAnimation;
    }
    return stored;
  } catch {
    return { ...SETTINGS_DEFAULTS };
  }
}

export function serializeSettings(settings: Settings): string {
  return JSON.stringify(settings);
}

/**
 * Should this board ask for confirmation before placing a stone?
 *
 * The setting is the player's preference; the board size is a fact about
 * whether a fingertip can hit the point at all. On a phone a 19×19 point is
 * roughly 18pt across against a 44pt guideline, so above 9×9 the step is forced
 * on regardless of the preference — the alternative is a player losing a game to
 * a mis-tap they never made, in a game where a stone cannot be taken back.
 */
export function confirmPlacementFor(size: number, settings: Pick<Settings, 'confirmMove'>): boolean {
  return settings.confirmMove || size > 9;
}
