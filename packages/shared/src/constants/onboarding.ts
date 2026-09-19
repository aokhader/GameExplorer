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
 *
 * The tour is optional now. Nothing redirects into it: a first visit gets one
 * question on Home instead — which game, and whether the player knows it
 * (`project-docs/ux-fix-ideas.md` §4.4) — and the tour is a link beside it.
 */

import { BOT_TIERS, type RatedGameId } from './botTiers';

export type OnboardingGame = 'chess' | 'checkers' | 'reversi';
export type OnboardingDifficulty = 'relaxed' | 'balanced' | 'sharp';

/**
 * Storage keys for the two first-run flags, and what each one means.
 *
 * - **onboarded** — set the moment the tour is seen (or the visitor is already
 *   signed in). It used to gate a home → tour redirect; that redirect is gone,
 *   and the flag now only records that the tour was seen.
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
 * `AsyncStorage` is not, and a shared wrapper would force every read through a
 * promise for the sake of four one-line functions.
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

/**
 * The strength a first game starts at when the player says they know the game
 * (`project-docs/ux-fix-ideas.md` §4.4): the middle of the game's six tiers,
 * Club on every ladder. Read from the tiers rather than restated, so a ladder
 * that changes takes its first game with it.
 */
export function firstGameElo(game: RatedGameId): number {
  const tiers = BOT_TIERS[game];
  return tiers[Math.floor((tiers.length - 1) / 2)].elo;
}

/**
 * One-time tips, shown where the thing they explain happens rather than in a
 * tour up front (§4.4; NN/g's pull-not-push finding, P5). Each shows once per
 * device, and dismissing it or seeing it counts.
 *
 * - **check** — the first time the player's king is in check.
 * - **illegal-move** — the first move the board refuses, with the reason.
 * - **review** — on the first finished game, that the game can be stepped
 *   through move by move.
 */
export type TipId = 'check' | 'illegal-move' | 'review';

export const TIP_IDS: readonly TipId[] = ['check', 'illegal-move', 'review'];

/** Beside the platform's other first-run flags, with the platform's prefix (see above). */
export function tipStorageKey(platform: 'web' | 'native', id: TipId): string {
  return `${platform === 'web' ? 'ge' : 'gx'}:tip:${id}`;
}

export const TIP_COPY: Record<TipId, string> = {
  check: 'Your king is in check. Only a move that ends the check is allowed.',
  'illegal-move': 'That move isn’t allowed.',
  review: 'You can step back through any finished game with Review, and see where it turned.',
};

/**
 * Why a chess move was refused, in words a newcomer can act on. The board knows
 * which of these applies; the sentence lives here so both platforms say it the
 * same way.
 */
export const ILLEGAL_MOVE_COPY = {
  inCheck: 'You’re in check, so your move has to end it.',
  pinned: 'That piece is pinned: moving it would leave your king in check.',
  intoCheck: 'Your king can’t move onto a square that’s under attack.',
  cantReach: 'That piece can’t move there.',
} as const;

export type IllegalMoveReason = keyof typeof ILLEGAL_MOVE_COPY;
