/**
 * The two numbers training mode is defined by. They live apart from
 * `useLocalGame` because the UI that quotes them (the setup panel, the result
 * screen) has no business pulling in the loop — and with it the db client — just
 * to render a price.
 */

/** How much rating each hint costs, mirroring web's training pages. */
export const HINT_PENALTY = 2;

/** How long a revealed hint stays on the board (ms). */
export const HINT_VISIBLE_MS = 3500;
