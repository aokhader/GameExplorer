/**
 * The turn's choreography, in one place.
 *
 * A roll and the move it causes arrive in the SAME engine update, so nothing in
 * the state says "the dice are still in the air". The two animations are ordered
 * purely by these numbers, which is why they live together rather than as
 * separate constants in the two components — when they were apart (a 520ms
 * tumble and a 560ms walk delay) the piece set off while the dice were still
 * landing, and the two read as one simultaneous event.
 */

/** How long the faces tumble before showing the engine's result. */
export const DICE_TUMBLE_MS = 520;

/** The landing bounce, once the real faces are showing. */
export const DICE_SETTLE_MS = 260;

/** Total time the dice are in motion after a roll. */
export const DICE_ROLL_MS = DICE_TUMBLE_MS + DICE_SETTLE_MS;

/** A beat between the dice coming to rest and the piece setting off. */
export const POST_ROLL_BEAT_MS = 110;

/** Milliseconds per tile while a token walks the loop. */
export const STEP_MS = 150;

/** A glide, for moves that are not a walk (card teleports, going to Impound). */
export const JUMP_MS = 420;

/**
 * Lead-in for a move with no roll behind it — a card that moves you, or being
 * sent to Impound. There are no dice to wait for, so it starts almost at once.
 */
export const NO_ROLL_START_MS = 160;

/**
 * Above this many tiles a move is not a roll, so it is not walked.
 *
 * Two dice cap at 12. Anything further is a card effect — "advance to Home",
 * "go to Impound", or a backwards move, which as a forward distance is nearly a
 * full loop. Those are teleports in the rules, and walking them would both take
 * seconds and imply the player passed (and collected from) every tile between.
 */
export const WALK_MAX = 12;
