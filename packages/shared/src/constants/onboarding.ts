/**
 * First-run tour constants, shared by web's `/welcome` and mobile's
 * `app/welcome.tsx`.
 *
 * The two tours were written independently and drifted: web mapped the chosen
 * "vibe" to a per-game bot ELO and deep-linked into a game at that strength,
 * while mobile collected the same choice and then dropped it on the floor —
 * every tour on mobile started the default bot regardless of what was picked.
 * Keeping the mapping here means a change to one platform's ladder cannot
 * silently leave the other behind.
 */

export type OnboardingGame = 'chess' | 'checkers' | 'reversi';
export type OnboardingDifficulty = 'relaxed' | 'balanced' | 'sharp';

/**
 * Storage keys for the two first-run flags, and what each one means.
 *
 * - **onboarded** — set the moment the tour is seen (or the visitor is already
 *   signed in). Gates the home → tour redirect so it fires exactly once.
 * - **saveProgressPending** — set when a signed-out visitor starts their first
 *   game from the tour. The result screen consumes it to show the one-time
 *   "save your progress" sign-up ask. The account request comes *after* they
 *   have played, and only once; any choice consumes the flag, so it never nags.
 *
 * **The prefixes differ, and that is not a bug to fix.** Web has been writing
 * `ge:` since before the app existed and native writes `gx:`. They address
 * different stores on different devices, so nothing reads across — but unifying
 * them would make every existing install on the losing platform look brand new
 * and bounce a returning player back into the first-run tour. The mismatch is
 * only dangerous while it is undocumented, which is what this block fixes.
 *
 * The accessors stay per-platform on purpose: `localStorage` is synchronous and
 * `AsyncStorage` is not, and web's home-page redirect reads the flag during the
 * mount effect. Forcing that read through a promise to share four one-line
 * wrappers would put a frame of the home page in front of every brand-new
 * visitor before the tour replaced it.
 */
export const ONBOARDING_KEYS = {
  web: {
    onboarded: 'ge:onboarded',
    saveProgressPending: 'ge:save-progress-pending',
  },
  native: {
    onboarded: 'gx:onboarded',
    saveProgressPending: 'gx:save-progress-pending',
  },
} as const;

/**
 * Bot strength each vibe maps to, on each game's own ELO scale. The bot setup
 * screens clamp and snap these, so they need to be sensible presets rather than
 * exact values.
 */
export const DIFFICULTY_ELO: Record<OnboardingGame, Record<OnboardingDifficulty, number>> = {
  chess: { relaxed: 600, balanced: 1200, sharp: 2000 },
  checkers: { relaxed: 500, balanced: 1100, sharp: 1700 },
  reversi: { relaxed: 500, balanced: 1100, sharp: 1700 },
};
