/**
 * The turn's choreography, in one place.
 *
 * A roll and the move it causes arrive in the SAME engine update, so nothing in
 * the state says "the dice are still in the air". The two animations are ordered
 * purely by these numbers, which is why they live together rather than as
 * separate constants in the two components — when they were apart (a 520ms
 * tumble and a 560ms walk delay) the piece set off while the dice were still
 * landing, and the two read as one simultaneous event.
 *
 * Exported as a single frozen object rather than as loose constants: this
 * folder's barrel is re-exported with `export *` from the package root, so names
 * like `STEP_MS` and `WALK_MAX` would become top-level `@gameexplorer/shared`
 * exports — far too generic to own at that scope.
 */

/** How long the faces tumble before showing the engine's result. */
const DICE_TUMBLE_MS = 520;

/** The landing bounce, once the real faces are showing. */
const DICE_SETTLE_MS = 260;

/** A beat between the dice coming to rest and the piece setting off. */
const POST_ROLL_BEAT_MS = 110;

/** Milliseconds per tile while a token walks the loop. */
const STEP_MS = 150;

/** A glide, for moves that are not a walk (card teleports, going to Impound). */
const JUMP_MS = 420;

/**
 * Lead-in for a move with no roll behind it — a card that moves you, or being
 * sent to Impound. There are no dice to wait for, so it starts almost at once.
 */
const NO_ROLL_START_MS = 160;

/**
 * Above this many tiles a move is not a roll, so it is not walked.
 *
 * Two dice cap at 12. Anything further is a card effect — "advance to Home",
 * "go to Impound", or a backwards move, which as a forward distance is nearly a
 * full loop. Those are teleports in the rules, and walking them would both take
 * seconds and imply the player passed (and collected from) every tile between.
 */
const WALK_MAX = 12;

export const LIQUIDATE_TIMING = {
  diceTumbleMs: DICE_TUMBLE_MS,
  diceSettleMs: DICE_SETTLE_MS,
  /** Total time the dice are in motion after a roll. */
  diceRollMs: DICE_TUMBLE_MS + DICE_SETTLE_MS,
  postRollBeatMs: POST_ROLL_BEAT_MS,
  stepMs: STEP_MS,
  jumpMs: JUMP_MS,
  noRollStartMs: NO_ROLL_START_MS,
  walkMax: WALK_MAX,
} as const;
